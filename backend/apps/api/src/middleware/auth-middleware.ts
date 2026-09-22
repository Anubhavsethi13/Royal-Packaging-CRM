import type { DatabaseConnection } from "@royal-packaging/db";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { RBACService } from "../modules/identity/rbac-service.js";
import { DEFAULT_SESSION_COOKIE_NAME } from "../modules/identity/session.js";
import type { ApiContext, Middleware } from "../router.js";
import { ForbiddenError, UnauthorizedError } from "./error-handler.js";

/**
 * Extracts session token from HTTP cookie or Authorization header.
 */
export function extractSessionToken(ctx: ApiContext): string | null {
  // 1. Check HTTP-only cookie first
  const cookieToken = ctx.cookies[DEFAULT_SESSION_COOKIE_NAME];
  if (cookieToken && cookieToken.trim().length > 0) {
    return cookieToken.trim();
  }

  // 2. Fallback to Authorization: Bearer <token>
  const authHeader = ctx.req.headers.authorization;
  if (authHeader && typeof authHeader === "string") {
    const parts = authHeader.split(" ");
    const scheme = parts[0];
    const tokenPart = parts[1];
    if (scheme?.toLowerCase() === "bearer" && tokenPart && tokenPart.trim().length > 0) {
      return tokenPart.trim();
    }
  }

  return null;
}

/**
 * Middleware that strictly enforces authenticated session on protected routes.
 * Populates ctx.user and ctx.sessionToken from validated server-side session.
 */
export function requireAuth(authService: AuthService): Middleware {
  return async (ctx: ApiContext, next: () => Promise<void>) => {
    const token = extractSessionToken(ctx);
    if (!token) {
      throw new UnauthorizedError("Authentication required. Please provide a valid session cookie or token.");
    }

    const user = await authService.validateSession(token);
    if (!user) {
      throw new UnauthorizedError("Session is invalid or expired. Please log in again.");
    }

    ctx.user = user;
    ctx.sessionToken = token;

    await next();
  };
}

/**
 * Optional authentication middleware that populates ctx.user if valid session exists,
 * but allows unauthenticated access if not present.
 */
export function optionalAuth(authService: AuthService): Middleware {
  return async (ctx: ApiContext, next: () => Promise<void>) => {
    const token = extractSessionToken(ctx);
    if (token) {
      const user = await authService.validateSession(token);
      if (user) {
        ctx.user = user;
        ctx.sessionToken = token;
      }
    }
    await next();
  };
}

/**
 * Pluggable authorization evaluator contract.
 */
export type AuthorizationEvaluator = (
  ctx: ApiContext,
  action: string,
  resourceId?: string
) => Promise<boolean> | boolean;

export interface AuthorizationPolicy {
  readonly evaluate: AuthorizationEvaluator;
}

/**
 * Default fail-closed authorization policy.
 * Strictly prevents the API layer from silently treating authentication as operational authorization.
 */
export class FailClosedAuthorizationPolicy implements AuthorizationPolicy {
  public evaluate(): boolean {
    return false;
  }
}

/**
 * Permissive authorization policy for testing or explicit development mode.
 */
export class PermissiveAuthorizationPolicy implements AuthorizationPolicy {
  public evaluate(): boolean {
    return true;
  }
}

export interface DatabaseRBACPolicyConfig {
  readonly database: DatabaseConnection;
  readonly rbacService: RBACService;
}

/**
 * Authoritative Server-Side RBAC Authorization Policy (B-01, B-02).
 *
 * Rules:
 * - Roles: SUPER_ADMIN, MAIN_ADMIN, ADMIN, MANAGER, EMPLOYEE.
 * - Task Assignment (task:assign, task:unassign): Super Admin, Main Admin, Admin, Manager. (Employee NOT allowed)
 * - Task Cancellation (task:cancel): Super Admin, Main Admin, Admin, Manager. (Employee NOT allowed)
 * - Task Reopen (task:reopen): Super Admin, Main Admin, Admin. (Manager, Employee NOT allowed)
 * - Quality Inspection (quality:inspect): Super Admin, Main Admin, Admin, Manager. (Employee NOT allowed)
 * - Incentive / Payroll Approval (incentive:approve, payroll:approve, financial:approve): ONLY Super Admin.
 * - Task Pause / Resume (task:pause, task:resume):
 *     - Super Admin, Main Admin, Admin, Manager (manager override on any task)
 *     - Employee: permitted ONLY for their own task where employee_id is actively assigned.
 * - Layer photo capture (quality:record_photo): Super Admin, Main Admin, Admin, Manager, Employee.
 * - Depot Access: All approved roles can access all depots.
 */
export class DatabaseRBACAuthorizationPolicy implements AuthorizationPolicy {
  private readonly database: DatabaseConnection;
  private readonly rbacService: RBACService;

  public constructor(config: DatabaseRBACPolicyConfig) {
    this.database = config.database;
    this.rbacService = config.rbacService;
  }

  public async evaluate(
    ctx: ApiContext,
    action: string,
    resourceId?: string
  ): Promise<boolean> {
    if (!ctx.user || !ctx.user.id) {
      return false;
    }

    const rawRoles = await this.rbacService.getUserRoles(ctx.user.id);
    const roles = rawRoles.map((r) => r.toUpperCase());

    const isSuperAdmin = roles.includes("SUPER_ADMIN");
    const isMainAdmin = roles.includes("MAIN_ADMIN");
    const isAdmin = roles.includes("ADMIN");
    const isManager = roles.includes("MANAGER");
    const isEmployee = roles.includes("EMPLOYEE");

    const isApprovedRole = isSuperAdmin || isMainAdmin || isAdmin || isManager || isEmployee;
    const isAdminTier = isSuperAdmin || isMainAdmin || isAdmin;
    const isManagementTier = isAdminTier || isManager;

    switch (action) {
      // 1. Incentive / Payroll Approval & Operations Authority: ONLY Super Admin (FND-18A)
      case "incentive:approve":
      case "incentive:record_kot":
      case "incentive:record_penalty":
      case "incentive:calculate":
      case "payroll:approve":
      case "financial:approve":
        return isSuperAdmin;

      // 2. Task Reopen Authority: Super Admin, Main Admin, Admin. (Manager & Employee blocked)
      case "task:reopen":
        return isAdminTier;

      // 3. Task Assignment & Cancellation Authority: Super Admin, Main Admin, Admin, Manager. (Employee blocked)
      case "task:assign":
      case "task:unassign":
      case "task:cancel":
      case "task:create":
      case "task:initialize_from_order":
        return isManagementTier;

      // 4. Quality Inspection Authority: Super Admin, Main Admin, Admin, Manager. (Employee blocked)
      case "quality:inspect":
        return isManagementTier;

      // 5. Task Pause / Resume:
      // - Manager: can override on any task (explicitly approved override authority)
      // - Super Admin, Main Admin, Admin, Employee: may pause/resume ONLY their own assigned task
      case "task:pause":
      case "task:resume": {
        if (isManager) {
          return true;
        }
        if (isApprovedRole && resourceId) {
          return this.isEmployeeAssignedToTask(ctx.user.id, resourceId);
        }
        return false;
      }

      // 6. Operational Task Execution (Start, Complete, Movement):
      case "task:start":
      case "task:complete":
      case "task:execute_movement": {
        if (isManagementTier) {
          return true;
        }
        if (isEmployee && resourceId) {
          return this.isEmployeeAssignedToTask(ctx.user.id, resourceId);
        }
        return false;
      }

      case "inventory:move": {
        if (isManagementTier) {
          return true;
        }
        if (isEmployee) {
          if (resourceId) {
            return this.isEmployeeAssignedToTask(ctx.user.id, resourceId);
          }
          return true;
        }
        return false;
      }

      // 7. Layer photo capture:
      case "quality:record_photo":
        return isApprovedRole;

      // 8. Read / Queries: All approved roles across all depots
      case "task:read":
      case "task:read_summary":
      case "task:read_assignments":
      case "task:read_events":
      case "inventory:read_balances":
      case "inventory:read_movement":
      case "quality:read_history":
      case "quality:read_record":
      case "quality:read_photos":
      case "incentive:read":
        return isApprovedRole;

      // 9. Commercial domain (Clients/Orders/Employees) - Assumption: read
      // access is open to every approved role (matches existing read
      // patterns above); write/cancel/assign-shift is conservatively
      // restricted to the management tier since none of this was specified
      // by the original requirements. Flagged in the reconciliation doc.
      case "client:read":
      case "order:read":
      case "employee:read":
        return isApprovedRole;

      case "client:write":
      case "order:write":
      case "order:cancel":
      case "employee:write":
      case "employee:assign_shift":
        return isManagementTier;

      // 10. Inventory catalog reads: same tier as other inventory reads.
      case "inventory:read_catalog":
        return isApprovedRole;

      // 11. Warehouse compat: scan barcode, list tasks, route lookup are
      // operational reads available to any approved role.
      case "warehouse:scan":
      case "warehouse:read_tasks":
      case "warehouse:read_route":
        return isApprovedRole;

      // 12. Audit / KPI / Dashboard / Resync
      case "audit:read":
        return isManagementTier;
      case "kpi:read":
      case "dashboard:read":
      case "resync:read":
        return isApprovedRole;

      // 13. Report domain
      case "report:read":
        return isApprovedRole;
      case "report:execute":
        return isManagementTier;

      // 14. Payroll domain (payroll:approve already exists above -
      // Super Admin only). Read access mirrors other financial reads,
      // and creating entries/decisions is a management-tier operation.
      case "payroll:read":
        return isApprovedRole;
      case "payroll:write":
        return isManagementTier;

      default:
        return false;
    }
  }

  private async isEmployeeAssignedToTask(
    userId: string,
    taskId: string
  ): Promise<boolean> {
    const employee = await this.database
      .selectFrom("employees")
      .select("id")
      .where("user_id", "=", userId)
      .where("is_active", "=", true)
      .executeTakeFirst();

    if (!employee) {
      return false;
    }

    const assignment = await this.database
      .selectFrom("task_assignments")
      .select("id")
      .where("task_id", "=", taskId)
      .where("employee_id", "=", employee.id)
      .where("unassigned_at", "is", null)
      .executeTakeFirst();

    return !!assignment;
  }
}

/**
 * Middleware that enforces authorization policy on operational endpoints.
 * Fails closed with HTTP 403 Forbidden if the policy does not explicitly permit the action.
 */
export function requireAuthorization(
  policy: AuthorizationPolicy,
  action: string
): Middleware {
  return async (ctx: ApiContext, next: () => Promise<void>) => {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required before authorization evaluation.");
    }

    const isPermitted = await policy.evaluate(ctx, action, ctx.params.id);
    if (!isPermitted) {
      throw new ForbiddenError(
        `Operation '${action}' is not authorized for the authenticated user.`
      );
    }

    await next();
  };
}
