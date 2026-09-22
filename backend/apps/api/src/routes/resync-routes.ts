import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
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
  authPolicy: AuthorizationPolicy
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  // GET /resync/tasks
  router.get("/resync/tasks", auth, authz("resync:read"), async (ctx: ApiContext) => {
    const tasks = await taskService.listTasks({});
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(tasks) });
  });

  // GET /resync/inventory
  router.get("/resync/inventory", auth, authz("resync:read"), async (ctx: ApiContext) => {
    const items = await inventoryService.listItems({});
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(items) });
  });

  // GET /resync/kpis
  router.get("/resync/kpis", auth, authz("resync:read"), async (ctx: ApiContext) => {
    const snapshots = await kpiService.list({});
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(snapshots) });
  });
}
