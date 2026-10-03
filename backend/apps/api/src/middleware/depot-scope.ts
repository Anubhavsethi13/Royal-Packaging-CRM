import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";
import type { ApiContext, Middleware } from "../router.js";
import { HttpError, UnauthorizedError } from "./error-handler.js";

/**
 * Depot isolation (server-side only).
 *
 * The authorization policy decides each caller's depot reach from the
 * authenticated session; nothing in the request (body, query, URL) can widen it:
 * - "all":   organisation-wide roles (Super Admin, Main Admin, Admin, Accountant).
 * - "depot": depot-confined roles (Supervisor, Manager), limited to the depot of
 *            their own active employee profile (`employees.depot_id`).
 * - "self":  every other role (Others/Employee): no depot authority; the existing
 *            own-record rules apply (own tasks, own KPI, own employee profile).
 *
 * A supervisor without a depot assignment cannot touch depot data at all
 * (403 DEPOT_ASSIGNMENT_REQUIRED). Records with no depot (e.g. a task created
 * without depot_id) are outside every depot, so depot-confined callers are denied.
 */
export type DepotScope =
  | { readonly kind: "all" }
  | { readonly kind: "depot"; readonly depotId: string }
  | { readonly kind: "self" };

export const ALL_DEPOTS: DepotScope = { kind: "all" };
export const SELF_SCOPE: DepotScope = { kind: "self" };

export class DepotForbiddenError extends HttpError {
  public constructor(message = "This record belongs to another depot.") {
    super(403, "DEPOT_FORBIDDEN", message);
  }
}

export class DepotAssignmentRequiredError extends HttpError {
  public constructor() {
    super(403, "DEPOT_ASSIGNMENT_REQUIRED", "Your employee profile is not assigned to a depot, so you cannot access depot operational data.");
  }
}

/** Throws unless a depot-confined caller is looking at their own depot (null depot = outside every depot). */
export function assertDepotInScope(scope: DepotScope, depotId: string | null | undefined, message?: string): void {
  if (scope.kind === "depot" && depotId !== scope.depotId) {
    throw new DepotForbiddenError(message);
  }
}

/**
 * The depot filter to apply to a list: depot-confined callers always get their
 * own depot, and naming another depot is refused rather than silently ignored.
 */
export function depotFilterFor(scope: DepotScope, requestedDepotId: string | undefined): string | undefined {
  if (scope.kind !== "depot") {
    return requestedDepotId;
  }
  if (requestedDepotId && requestedDepotId !== scope.depotId) {
    throw new DepotForbiddenError("You can only view data for your own depot.");
  }
  return scope.depotId;
}

/** Look-ups used to check a resource against the caller's depot. */
export class DepotDirectory {
  private readonly database: DatabaseConnection;

  public constructor(database: DatabaseConnection) {
    this.database = database;
  }

  public async taskDepot(taskId: string): Promise<{ exists: boolean; depotId: string | null }> {
    const row = await this.database.selectFrom("tasks").select("depot_id").where("id", "=", taskId).executeTakeFirst();
    return { exists: !!row, depotId: row?.depot_id ?? null };
  }

  public async employeeDepot(employeeId: string): Promise<{ exists: boolean; depotId: string | null }> {
    const row = await this.database.selectFrom("employees").select("depot_id").where("id", "=", employeeId).executeTakeFirst();
    return { exists: !!row, depotId: row?.depot_id ?? null };
  }

  public async locationDepot(locationId: string): Promise<string | null> {
    const row = await this.database.selectFrom("locations").select("depot_id").where("id", "=", locationId).executeTakeFirst();
    return row?.depot_id ?? null;
  }

  public async depotIdByCode(code: string): Promise<string | null> {
    const row = await this.database.selectFrom("depots").select("id").where(sql<string>`upper(code)`, "=", code.toUpperCase()).executeTakeFirst();
    return row?.id ?? null;
  }

  public async activeEmployeeOfUser(userId: string): Promise<{ id: string; depotId: string | null } | null> {
    const row = await this.database.selectFrom("employees").select(["id", "depot_id"]).where("user_id", "=", userId).where("is_active", "=", true).executeTakeFirst();
    return row ? { id: row.id, depotId: row.depot_id } : null;
  }

  /** Whether the user's employee is (or, with `includePast`, ever was) assigned to the task. */
  public async isAssigned(userId: string, taskId: string, includePast: boolean): Promise<boolean> {
    let query = this.database
      .selectFrom("task_assignments")
      .innerJoin("employees", "employees.id", "task_assignments.employee_id")
      .select("task_assignments.id")
      .where("task_assignments.task_id", "=", taskId)
      .where("employees.user_id", "=", userId);
    if (!includePast) {
      query = query.where("task_assignments.unassigned_at", "is", null);
    }
    return !!(await query.executeTakeFirst());
  }

  /** Every given location must belong to the depot-confined caller's depot. */
  public async assertLocationsInScope(scope: DepotScope, locationIds: ReadonlyArray<string | null | undefined>): Promise<void> {
    if (scope.kind !== "depot") return;
    for (const locationId of locationIds) {
      if (!locationId) continue;
      if ((await this.locationDepot(locationId)) !== scope.depotId) {
        throw new DepotForbiddenError("Locations must belong to your own depot.");
      }
    }
  }

  /** Every given employee must belong to the depot-confined caller's depot. */
  public async assertEmployeesInScope(scope: DepotScope, employeeIds: ReadonlyArray<string | null | undefined>): Promise<void> {
    if (scope.kind !== "depot") return;
    for (const employeeId of employeeIds) {
      if (!employeeId) continue;
      const employee = await this.employeeDepot(employeeId);
      if (employee.exists && employee.depotId !== scope.depotId) {
        throw new DepotForbiddenError("You can only work with employees of your own depot.");
      }
    }
  }

  /** A warehouse_code filter may only name the caller's own depot. */
  public async assertWarehouseCodeInScope(scope: DepotScope, warehouseCode: string | undefined): Promise<void> {
    if (scope.kind !== "depot" || !warehouseCode) return;
    if ((await this.depotIdByCode(warehouseCode)) !== scope.depotId) {
      throw new DepotForbiddenError("You can only view data for your own depot.");
    }
  }
}

export interface DepotScopeSource {
  resolveDepotScope(ctx: ApiContext): Promise<DepotScope>;
}

/**
 * Guards every `/…/:id` task route: depot-confined callers may only touch tasks
 * of their depot; with `selfRequiresAssignment`, callers without depot authority
 * ("self") may only touch tasks they are or were assigned to. Missing tasks pass
 * through so the route answers 404 as before.
 */
export function requireTaskInScope(policy: DepotScopeSource, directory: DepotDirectory, options: { selfRequiresAssignment: boolean }): Middleware {
  return async (ctx: ApiContext, next: () => Promise<void>) => {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required.");
    }
    const taskId = ctx.params.id;
    if (taskId && /^[0-9a-f-]{36}$/i.test(taskId)) {
      const task = await directory.taskDepot(taskId);
      if (task.exists) {
        const scope = await policy.resolveDepotScope(ctx);
        assertDepotInScope(scope, task.depotId, "This task belongs to another depot.");
        if (scope.kind === "self" && options.selfRequiresAssignment && !(await directory.isAssigned(ctx.user.id, taskId, true))) {
          throw new HttpError(403, "FORBIDDEN", "This task is not assigned to you.");
        }
      }
    }
    await next();
  };
}
