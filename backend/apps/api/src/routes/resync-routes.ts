import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { depotFilterFor, type DepotDirectory } from "../middleware/depot-scope.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { InventoryService } from "../modules/inventory/inventory-service.js";
import type { KpiService } from "../modules/kpi/kpi-service.js";
import type { TaskService } from "../modules/warehouse/task-service.js";
import type { ApiContext, Router } from "../router.js";
import { sendJson, withCamelCaseMirror } from "../utils/http-utils.js";

/**
 * Bulk/full-refresh endpoints for the offline-first frontend to resync its
 * local state after a reconnect. There is deliberately no /resync/payroll:
 * payroll has no "paid"/terminal state yet (see payroll module docs), so
 * there is nothing coherent to bulk-resync - this is a documented 404-by-
 * design gap, not an oversight.
 */
export function registerResyncRoutes(
  router: Router,
  authService: AuthService,
  taskService: TaskService,
  inventoryService: InventoryService,
  kpiService: KpiService,
  authPolicy: AuthorizationPolicy,
  directory: DepotDirectory
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  // GET /resync/tasks
  router.get("/resync/tasks", auth, authz("resync:read"), async (ctx: ApiContext) => {
    // Same reach as GET /tasks: own depot for Supervisors, own assignments for Others.
    const scope = await authPolicy.resolveDepotScope(ctx);
    let tasks: Awaited<ReturnType<TaskService["listTasks"]>> = [];
    if (scope.kind === "self") {
      const own = await directory.activeEmployeeOfUser(ctx.user!.id);
      tasks = own ? await taskService.listTasks({ employee_id: own.id }) : [];
    } else {
      const depotId = depotFilterFor(scope, undefined);
      tasks = await taskService.listTasks(depotId ? { depot_id: depotId } : {});
    }
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(tasks) });
  });

  // GET /resync/inventory
  router.get("/resync/inventory", auth, authz("resync:read"), async (ctx: ApiContext) => {
    const items = await inventoryService.listItems({});
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(items) });
  });

  // GET /resync/kpis
  router.get("/resync/kpis", auth, authz("resync:read"), async (ctx: ApiContext) => {
    const scope = await authPolicy.resolveDepotScope(ctx);
    let snapshots: Awaited<ReturnType<KpiService["list"]>> = [];
    if (scope.kind === "self") {
      const own = await directory.activeEmployeeOfUser(ctx.user!.id);
      snapshots = own ? await kpiService.list({ employee_id: own.id }) : [];
    } else {
      const depotId = depotFilterFor(scope, undefined);
      snapshots = await kpiService.list(depotId ? { depot_id: depotId } : {});
    }
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(snapshots) });
  });
}
