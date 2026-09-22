import {
  calculateGridRoute,
  scanBarcodeRequestSchema,
  type TaskRecord
} from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { BadRequestError } from "../middleware/error-handler.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { InventoryService } from "../modules/inventory/inventory-service.js";
import type { TaskService } from "../modules/warehouse/task-service.js";
import type { ApiContext, Router } from "../router.js";
import {
  pageItems,
  parsePagination,
  sendJson,
  sendList,
  sortByKey,
  sortDirection,
  withCamelCaseMirror
} from "../utils/http-utils.js";

const TASK_SORT_MAP: Record<string, keyof TaskRecord> = {
  id: "id",
  task_type: "task_type",
  taskType: "task_type",
  status: "status",
  depot_id: "depot_id",
  depotId: "depot_id",
  planned_box_quantity: "planned_box_quantity",
  plannedBoxQuantity: "planned_box_quantity",
  completed_box_quantity: "completed_box_quantity",
  completedBoxQuantity: "completed_box_quantity",
  started_at: "started_at",
  startedAt: "started_at",
  completed_at: "completed_at",
  completedAt: "completed_at",
  created_at: "created_at",
  createdAt: "created_at"
};

export function registerWarehouseRoutes(
  router: Router,
  authService: AuthService,
  inventoryService: InventoryService,
  taskService: TaskService,
  database: DatabaseConnection,
  authPolicy: AuthorizationPolicy
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  // POST /warehouse/scan - barcode/product/batch lookup
  router.post("/warehouse/scan", auth, authz("warehouse:scan"), async (ctx: ApiContext) => {
    const parseResult = scanBarcodeRequestSchema.safeParse(ctx.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    const result = await inventoryService.scanBarcode(parseResult.data.barcode);
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(result) });
  });

  // GET /warehouse/tasks - tasks scoped to the authenticated user's linked employee
  router.get("/warehouse/tasks", auth, authz("warehouse:read_tasks"), async (ctx: ApiContext) => {
    const pagination = parsePagination(ctx.query);

    const employee = await database
      .selectFrom("employees")
      .select("id")
      .where("user_id", "=", ctx.user!.id)
      .where("is_active", "=", true)
      .executeTakeFirst();

    // A user with no linked employee record simply has no personal task
    // queue - this is not an error, it's an empty list (e.g. an admin
    // account with no warehouse-floor identity).
    if (!employee) {
      sendList(ctx.res, [], pagination, 0);
      return;
    }

    const rawStatus = ctx.query.get("status");
    const status = rawStatus && rawStatus.toLowerCase() !== "all" ? rawStatus : undefined;
    const search = ctx.query.get("search")?.trim().toLowerCase();

    let allTasks = await taskService.listTasks({ employee_id: employee.id, status: status as never });

    if (search) {
      allTasks = allTasks.filter((t) =>
        (t.id && t.id.toLowerCase().includes(search)) ||
        (t.task_type && t.task_type.toLowerCase().includes(search)) ||
        (t.depot_id && t.depot_id.toLowerCase().includes(search)) ||
        (t.client_id && t.client_id.toLowerCase().includes(search)) ||
        (t.order_id && t.order_id.toLowerCase().includes(search))
      );
    }

    const sortBy = ctx.query.get("sortBy") ?? ctx.query.get("sort_by") ?? ctx.query.get("sort");
    const dir = sortDirection(ctx.query, "desc");
    const sortKey = sortBy ? TASK_SORT_MAP[sortBy] : undefined;
    const sorted = sortKey ? sortByKey(allTasks, sortKey, dir) : allTasks;
    const paged = pageItems(sorted, pagination);

    sendList(ctx.res, withCamelCaseMirror(paged), pagination, sorted.length);
  });

  // GET /warehouse/route?from=R1-A1&to=R3-A12
  router.get("/warehouse/route", auth, authz("warehouse:read_route"), (ctx: ApiContext) => {
    const from = ctx.query.get("from");
    const to = ctx.query.get("to");
    if (!from || !to) {
      throw new BadRequestError("Query parameters 'from' and 'to' are required");
    }

    try {
      const route = calculateGridRoute(from, to);
      sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(route) });
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : "Invalid grid location code");
    }
  });
}
