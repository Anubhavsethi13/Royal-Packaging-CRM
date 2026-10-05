import type { DatabaseConnection } from "@royal-packaging/db";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { RBACService } from "../modules/identity/rbac-service.js";
import { DEFAULT_SESSION_COOKIE_NAME } from "../modules/identity/session.js";
import type { ApiContext, Middleware } from "../router.js";
import { ForbiddenError, UnauthorizedError } from "./error-handler.js";
import { ALL_DEPOTS, SELF_SCOPE, type DepotScope } from "./depot-scope.js";

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
  /** The caller's depot reach, decided server-side from the session (see depot-scope.ts). */
  resolveDepotScope(ctx: ApiContext): Promise<DepotScope>;
}

/**
 * Default fail-closed authorization policy.
 * Strictly prevents the API layer from silently treating authentication as operational authorization.
 */
export class FailClosedAuthorizationPolicy implements AuthorizationPolicy {
  public evaluate(): boolean {
    return false;
  }

  public async resolveDepotScope(): Promise<DepotScope> {
    return SELF_SCOPE;
  }
}

/**
 * Permissive authorization policy for testing or explicit development mode.
 */
export class PermissiveAuthorizationPolicy implements AuthorizationPolicy {
  public evaluate(): boolean {
    return true;
  }

  public async resolveDepotScope(): Promise<DepotScope> {
    return ALL_DEPOTS;
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
 * - Roles (highest first): SUPER_ADMIN, MAIN_ADMIN, ADMIN, ACCOUNTANT, MANAGER/SUPERVISOR, EMPLOYEE ("Others").
 * - Incentives and payroll (every incentive:* and payroll:* action): ONLY Super Admin.
 *   Payroll entries are snapshots of approved incentive amounts, so they are incentive data.
 * - ACCOUNTANT: read-only reporting role (dashboard, reports, KPI results, warehouse and
 *   task reads, audit); no writes, no KPI configuration, no incentives or payroll.
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
    const isManager = roles.includes("MANAGER") || roles.includes("SUPERVISOR");
    const isEmployee = roles.includes("EMPLOYEE");
    const isAccountant = roles.includes("ACCOUNTANT");

    const isApprovedRole = isSuperAdmin || isMainAdmin || isAdmin || isManager || isEmployee;
    const isAdminTier = isSuperAdmin || isMainAdmin || isAdmin;
    const isManagementTier = isAdminTier || isManager;
    // Read-only reporting visibility across all depots: management plus Accountant.
    const isReportingReader = isManagementTier || isAccountant;

    switch (action) {
      // 1. Incentives and payroll are privileged: ONLY Super Admin, for reads and writes alike.
      case "incentive:read":
      case "incentive:approve":
      case "incentive:record_kot":
      case "incentive:record_penalty":
      case "incentive:calculate":
      case "payroll:read":
      case "payroll:write":
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
        return isApprovedRole || isAccountant;

      // 9. Commercial domain (Clients/Orders/Employees) - Assumption: read
      // access is open to every approved role (matches existing read
      // patterns above); write/cancel/assign-shift is conservatively
      // restricted to the management tier since none of this was specified
      // by the original requirements. Flagged in the reconciliation doc.
      case "client:read":
      case "order:read":
      case "employee:read":
        return isApprovedRole || isAccountant;

      case "client:write":
      case "order:write":
      case "order:cancel":
      case "employee:write":
      case "employee:assign_shift":
        return isManagementTier;

      // 10. Inventory catalog reads: same tier as other inventory reads.
      case "inventory:read_catalog":
        return isApprovedRole || isAccountant;

      // 11. Warehouse compat: scan barcode, list tasks, route lookup are
      // operational reads available to any approved role.
      case "warehouse:scan":
        return isApprovedRole;
      case "warehouse:read_tasks":
      case "warehouse:read_route":
        return isApprovedRole || isAccountant;

      // 12. Audit / KPI / Dashboard / Resync
      case "audit:read":
        return isReportingReader;
      case "kpi:read":
      case "dashboard:read":
        return isApprovedRole || isAccountant;
      case "resync:read":
        return isApprovedRole;

      // 13. Report domain
      case "report:read":
        return isApprovedRole || isAccountant;
      case "report:execute":
        return isReportingReader;

      // 14. Payroll domain: see rule 1 (Super Admin only).

      // 15. Daily shift entries (KPI_DAILY_SHIFT_TRACKING V1).
      // Creating and listing one's own entries is open to every approved
      // role (the service additionally requires an active employee profile).
      // Reading a specific entry: management tier may read any; anyone else
      // only their own. Supervisor team/depot scoping is an open business
      // decision, so management-tier reads are unscoped like other reads.
      case "shift:create":
      case "shift:read_own":
        return isApprovedRole;

      // Shift-entry KPI summaries: everyone with an approved role may read
      // their own (the service derives the employee from the session);
      // aggregated multi-employee performance is management tier only.
      case "kpi:read_own":
        return isApprovedRole;

      // 16. Warehouse operations read model and locations (read-only).
      // Every approved role may open the operations directory, but the
      // route narrows it to the caller's own assigned tasks unless the
      // caller also holds `warehouse:read_all_operations` (management tier;
      // depot/team scoping does not exist, so management sees all depots,
      // consistent with every other read in this policy).
      case "warehouse:read_operations":
      case "location:read":
        return isApprovedRole || isAccountant;
      case "warehouse:read_all_operations":
        return isReportingReader;
      case "kpi:read_all":
        return isReportingReader;
      // Depot KPI dashboard: management (Supervisor confined to own depot by the
      // depot scope) and Accountant (read-only). Others use their own KPI results.
      case "kpi:read_depot":
        return isReportingReader;
      // KPI configuration (definitions, targets, thresholds): Super Admin and
      // Admin only (product access matrix). Supervisor, Accountant and Others
      // have no KPI configuration access.
      case "kpi:read_config":
        return isAdminTier;
      // KPI results: every approved role may open them; the route narrows
      // callers without `kpi:read_all` to their own employee.
      case "kpi:read_results":
        return isApprovedRole || isAccountant;

      // 17. Supervisor daily depot reports.
      // - Write (create/update draft/submit): Supervisor/Manager and admin tier,
      //   for any depot (they name the depot; `daily_report:write_all`).
      //   Supervisors have organization-wide operational scope and no fixed depot
      //   (V1 business decision D5/D6, Docs/product/v1-business-decision-freeze.md).
      // - Read: management tier and Accountant, all depots (`daily_report:read_all`).
      // - Others (EMPLOYEE) have no daily report access.
      case "daily_report:read":
        return isReportingReader;
      case "daily_report:read_all":
        return isReportingReader;
      case "daily_report:write":
        return isManagementTier;
      case "daily_report:write_all":
        return isManagementTier;

      // 13. Attendance synchronized from e-Time Office. No client decision on attendance
      // visibility exists yet; this mirrors KPI results / shift entries: everyone may read their
      // own records, reporting readers read every employee, only the admin tier runs or
      // inspects synchronization.
      case "attendance:read":
        return isApprovedRole || isAccountant;
      case "attendance:read_all":
        return isReportingReader;
      case "attendance:sync":
        return isAdminTier;

      case "shift:read": {
        if (isManagementTier) {
          return true;
        }
        if (isEmployee && resourceId) {
          return this.isShiftEntryOwner(ctx.user.id, resourceId);
        }
        return false;
      }

      default:
        return false;
    }
  }

  /**
   * Depot reach for this request (memoised per request):
   * - Super Admin, Main Admin, Admin, Accountant: all depots.
   * - Supervisor/Manager: all depots. Supervisors are not assigned to a fixed
   *   depot; they work across the organization's operational tasks and each
   *   task carries its own depot context (V1 business decision D5/D6).
   * - Everyone else: "self" (own-record rules).
   */
  public resolveDepotScope(ctx: ApiContext): Promise<DepotScope> {
    const cached = this.depotScopes.get(ctx);
    if (cached) return cached;
    const resolved = this.computeDepotScope(ctx);
    this.depotScopes.set(ctx, resolved);
    return resolved;
  }

  private readonly depotScopes = new WeakMap<ApiContext, Promise<DepotScope>>();

  private async computeDepotScope(ctx: ApiContext): Promise<DepotScope> {
    if (!ctx.user?.id) {
      throw new UnauthorizedError("Authentication required.");
    }
    const roles = (await this.rbacService.getUserRoles(ctx.user.id)).map((role) => role.toUpperCase());
    if (["SUPER_ADMIN", "MAIN_ADMIN", "ADMIN", "ACCOUNTANT", "SUPERVISOR", "MANAGER"].some((role) => roles.includes(role))) {
      return ALL_DEPOTS;
    }
    return SELF_SCOPE;
  }

  private async isShiftEntryOwner(userId: string, shiftEntryId: string): Promise<boolean> {
    const owned = await this.database
      .selectFrom("shift_entries")
      .innerJoin("employees", "employees.id", "shift_entries.employee_id")
      .select("shift_entries.id")
      .where("shift_entries.id", "=", shiftEntryId)
      .where("employees.user_id", "=", userId)
      .where("employees.is_active", "=", true)
      .executeTakeFirst();

    return !!owned;
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
