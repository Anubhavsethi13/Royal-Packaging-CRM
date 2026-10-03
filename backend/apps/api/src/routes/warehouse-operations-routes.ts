import { listLocationsFilterSchema, listWarehouseOperationsFilterSchema } from "@royal-packaging/contracts";
import { z } from "zod";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { assertDepotInScope, type DepotDirectory } from "../middleware/depot-scope.js";
import { BadRequestError, ForbiddenError, HttpError, NotFoundError } from "../middleware/error-handler.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { OperationScope, WarehouseReadService } from "../modules/warehouse/warehouse-read-service.js";
import type { ApiContext, Router } from "../router.js";
import { parsePagination, sendJson, sendList, withCamelCaseMirror } from "../utils/http-utils.js";

const uuidSchema = z.string().uuid({ message: "Must be a valid UUID" });

/**
 * Read-only warehouse operations and locations. Scope is decided server-side
 * by the policy: `warehouse:read_all_operations` (management tier) sees every
 * task; any other approved role sees only tasks actively assigned to their
 * own employee profile.
 */
export function registerWarehouseOperationsRoutes(
  router: Router,
  authService: AuthService,
  readService: WarehouseReadService,
  authPolicy: AuthorizationPolicy,
  directory: DepotDirectory
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  /** null => the caller has no personal queue (no active employee profile). */
  const resolveScope = async (ctx: ApiContext): Promise<OperationScope | null> => {
    if (await authPolicy.evaluate(ctx, "warehouse:read_all_operations")) {
      // Depot-confined management (Supervisor) sees every task of their own depot only.
      const depotScope = await authPolicy.resolveDepotScope(ctx);
      return depotScope.kind === "depot" ? { depotId: depotScope.depotId } : {};
    }
    const employeeId = await readService.findActiveEmployeeId(ctx.user!.id);
    return employeeId ? { employeeId } : null;
  };

  const assertWarehouse = async (code: string | undefined) => {
    if (code && !(await readService.warehouseExists(code))) {
      throw new HttpError(400, "INVALID_WAREHOUSE", `Warehouse '${code}' does not exist.`, [
        { field: "warehouse_code", code: "invalid_warehouse", message: `Warehouse '${code}' does not exist.` }
      ]);
    }
  };

  // GET /warehouse/operations
  router.get("/warehouse/operations", auth, authz("warehouse:read_operations"), async (ctx: ApiContext) => {
    const pagination = parsePagination(ctx.query);
    const filter = listWarehouseOperationsFilterSchema.parse({
      status: ctx.query.get("status") ?? undefined,
      operation_type: ctx.query.get("operation_type") ?? undefined,
      warehouse_code: ctx.query.get("warehouse_code") ?? undefined,
      employee_id: ctx.query.get("employee_id") ?? undefined,
      search: ctx.query.get("search") ?? undefined
    });

    await assertWarehouse(filter.warehouse_code);
    const depotScope = await authPolicy.resolveDepotScope(ctx);
    await directory.assertWarehouseCodeInScope(depotScope, filter.warehouse_code);
    await directory.assertEmployeesInScope(depotScope, [filter.employee_id]);
    if (filter.employee_id && !(await readService.employeeExists(filter.employee_id))) {
      throw new HttpError(400, "INVALID_EMPLOYEE", `Employee '${filter.employee_id}' does not exist.`, [
        { field: "employee_id", code: "invalid_employee", message: `Employee '${filter.employee_id}' does not exist.` }
      ]);
    }

    const scope = await resolveScope(ctx);
    // A scoped caller may only name themselves; asking for another employee's tasks is refused, not silently emptied.
    if (filter.employee_id && (!scope || (scope.employeeId && scope.employeeId !== filter.employee_id))) {
      throw new ForbiddenError("You may only view your own warehouse tasks.");
    }
    if (!scope) {
      sendList(ctx.res, [], pagination, 0);
      return;
    }

    const page = await readService.listOperations(filter, scope, { limit: pagination.pageSize, offset: pagination.offset });
    sendList(ctx.res, withCamelCaseMirror(page.items), pagination, page.total);
  });

  // GET /warehouse/operations/:id
  router.get("/warehouse/operations/:id", auth, authz("warehouse:read_operations"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id || !uuidSchema.safeParse(id).success) {
      throw new BadRequestError("Invalid task ID format");
    }

    const scope = await resolveScope(ctx);
    if (!scope) {
      throw new ForbiddenError("This task is not assigned to you.");
    }
    const task = await directory.taskDepot(id);
    if (task.exists) {
      assertDepotInScope(await authPolicy.resolveDepotScope(ctx), task.depotId, "This task belongs to another depot.");
    }

    const operation = await readService.getOperation(id, scope);
    if (operation) {
      sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(operation) });
      return;
    }
    // Out-of-scope and missing are indistinguishable for scoped callers (no id probing).
    if (scope.employeeId) {
      throw new ForbiddenError("This task is not assigned to you.");
    }
    throw new NotFoundError(`Task with ID '${id}' was not found`);
  });

  // GET /locations
  router.get("/locations", auth, authz("location:read"), async (ctx: ApiContext) => {
    const pagination = parsePagination(ctx.query);
    const filter = listLocationsFilterSchema.parse({
      warehouse_code: ctx.query.get("warehouse_code") ?? undefined,
      active: ctx.query.get("active") ?? undefined,
      search: ctx.query.get("search") ?? undefined
    });
    await assertWarehouse(filter.warehouse_code);
    const depotScope = await authPolicy.resolveDepotScope(ctx);
    await directory.assertWarehouseCodeInScope(depotScope, filter.warehouse_code);
    const page = await readService.listLocations(filter, { limit: pagination.pageSize, offset: pagination.offset }, depotScope.kind === "depot" ? depotScope.depotId : undefined);
    sendList(ctx.res, withCamelCaseMirror(page.items), pagination, page.total);
  });
}
