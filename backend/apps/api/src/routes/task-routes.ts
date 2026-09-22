import {
  assignTaskRequestSchema,
  cancelTaskRequestSchema,
  completeTaskRequestSchema,
  createTaskRequestSchema,
  executeTaskMovementRequestSchema,
  initializeTaskFromOrderRequestSchema,
  multiEmployeeSchema,
  reassignTaskRequestSchema,
  reopenTaskRequestSchema,
  unassignTaskRequestSchema,
  type TaskRecord
} from "@royal-packaging/contracts";
import { z } from "zod";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { BadRequestError, NotFoundError } from "../middleware/error-handler.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { TaskService } from "../modules/warehouse/task-service.js";
import type { WarehouseOrchestrator } from "../modules/warehouse/warehouse-orchestrator.js";
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

const uuidParamSchema = z.string().uuid({ message: "Invalid ID format: must be a valid UUID" });

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

export function registerTaskRoutes(
  router: Router,
  authService: AuthService,
  taskService: TaskService,
  orchestrator: WarehouseOrchestrator,
  authPolicy: AuthorizationPolicy
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  // POST /tasks - Create a new warehouse task
  router.post("/tasks", auth, authz("task:create"), async (ctx: ApiContext) => {
    const parseResult = createTaskRequestSchema.safeParse(ctx.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const task = await taskService.createTask(
      parseResult.data,
      ctx.user!.id,
      { correlation_id: ctx.correlationId }
    );

    sendJson(ctx.res, 201, {
      success: true,
      data: withCamelCaseMirror(task)
    });
  });

  // POST /tasks/initialize-from-order - Initialize task linked to commercial order
  router.post("/tasks/initialize-from-order", auth, authz("task:initialize_from_order"), async (ctx: ApiContext) => {
    const parseResult = initializeTaskFromOrderRequestSchema.safeParse(ctx.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const task = await orchestrator.initializeTaskFromOrder(
      parseResult.data,
      ctx.user!.id
    );

    sendJson(ctx.res, 201, {
      success: true,
      data: withCamelCaseMirror(task)
    });
  });

  // GET /tasks/:id - Retrieve task details
  router.get("/tasks/:id", auth, authz("task:read"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id) {
      throw new BadRequestError("Task ID parameter is required");
    }

    const idValidation = uuidParamSchema.safeParse(id);
    if (!idValidation.success) {
      throw new BadRequestError("Invalid task ID format");
    }

    const task = await taskService.getTask(id);
    if (!task) {
      throw new NotFoundError(`Task with ID '${id}' was not found`);
    }

    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(task)
    });
  });

  // GET /tasks - List tasks with filters
  router.get("/tasks", auth, authz("task:read"), async (ctx: ApiContext) => {
    const pagination = parsePagination(ctx.query);
    const rawStatus = ctx.query.get("status");
    const status = rawStatus && rawStatus.toLowerCase() !== "all" ? rawStatus : undefined;
    const employeeId = ctx.query.get("employee_id") ?? ctx.query.get("employeeId") ?? undefined;
    const depotId = ctx.query.get("depot_id") ?? ctx.query.get("depotId") ?? undefined;
    const taskType = ctx.query.get("task_type") ?? ctx.query.get("taskType") ?? undefined;
    const clientId = ctx.query.get("client_id") ?? ctx.query.get("clientId") ?? undefined;
    const orderId = ctx.query.get("order_id") ?? ctx.query.get("orderId") ?? undefined;
    const search = ctx.query.get("search")?.trim().toLowerCase();

    let allTasks = await taskService.listTasks({
      status: status as never,
      employee_id: employeeId,
      depot_id: depotId,
      task_type: taskType,
      client_id: clientId,
      order_id: orderId
    });

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

  // POST /tasks/:id/assignments - Assign employee(s) to task.
  // Tries the multi-employee shape ({employeeIds: string[], reason?})
  // first, falling back to the native single-employee schema. Multi-
  // employee assignment is composed from repeated single assignTask calls
  // and is NOT atomic across employees - see multiEmployeeSchema doc.
  router.post("/tasks/:id/assignments", auth, authz("task:assign"), async (ctx: ApiContext) => {
    const payload = (typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {}) as Record<string, unknown>;
    const taskId = ctx.params.id;
    if (!taskId) {
      throw new BadRequestError("Task ID parameter is required");
    }

    const multiResult = multiEmployeeSchema.safeParse(payload);
    if (multiResult.success) {
      let updatedTask;
      for (const employeeId of multiResult.data.employeeIds) {
        updatedTask = await taskService.assignTask(
          { task_id: taskId, employee_id: employeeId, correlation_id: multiResult.data.correlation_id },
          ctx.user!.id
        );
      }
      sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(updatedTask) });
      return;
    }

    const parseResult = assignTaskRequestSchema.safeParse({
      ...payload,
      task_id: taskId
    });
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const updatedTask = await taskService.assignTask(parseResult.data, ctx.user!.id);
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(updatedTask)
    });
  });

  // POST /tasks/:id/reassign - Move a task from one employee to another.
  // Composed from unassignTask + assignTask - documented as NOT atomic
  // across the two calls for a task supporting multi-employee assignment
  // (if unassign succeeds but assign then fails, the task is left with one
  // fewer assignee rather than rolled back).
  router.post("/tasks/:id/reassign", auth, authz("task:assign"), async (ctx: ApiContext) => {
    const taskId = ctx.params.id;
    if (!taskId) {
      throw new BadRequestError("Task ID parameter is required");
    }

    const payload = (typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {}) as Record<string, unknown>;
    const parseResult = reassignTaskRequestSchema.safeParse(payload);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    await taskService.unassignTask(
      {
        task_id: taskId,
        employee_id: parseResult.data.from_employee_id,
        correlation_id: parseResult.data.correlation_id
      },
      ctx.user!.id
    );

    const updatedTask = await taskService.assignTask(
      {
        task_id: taskId,
        employee_id: parseResult.data.to_employee_id,
        correlation_id: parseResult.data.correlation_id
      },
      ctx.user!.id
    );

    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(updatedTask) });
  });

  // POST /tasks/:id/unassign - Remove employee assignment
  router.post("/tasks/:id/unassign", auth, authz("task:unassign"), async (ctx: ApiContext) => {
    const payload = (typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {}) as Record<string, unknown>;
    const parseResult = unassignTaskRequestSchema.safeParse({
      ...payload,
      task_id: ctx.params.id
    });
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const updatedTask = await taskService.unassignTask(parseResult.data, ctx.user!.id);
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(updatedTask)
    });
  });

  // POST /tasks/:id/start - Transition task to IN_PROGRESS
  router.post("/tasks/:id/start", auth, authz("task:start"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id) {
      throw new BadRequestError("Task ID parameter is required");
    }

    const idValidation = uuidParamSchema.safeParse(id);
    if (!idValidation.success) {
      throw new BadRequestError("Invalid task ID format");
    }

    const updatedTask = await taskService.startTask(id, ctx.user!.id, {
      correlation_id: ctx.correlationId
    });

    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(updatedTask)
    });
  });

  // POST /tasks/:id/pause - Pause active task
  router.post("/tasks/:id/pause", auth, authz("task:pause"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id) {
      throw new BadRequestError("Task ID parameter is required");
    }

    const idValidation = uuidParamSchema.safeParse(id);
    if (!idValidation.success) {
      throw new BadRequestError("Invalid task ID format");
    }

    const updatedTask = await taskService.pauseTask(id, ctx.user!.id, {
      correlation_id: ctx.correlationId
    });

    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(updatedTask)
    });
  });

  // POST /tasks/:id/resume - Resume paused task
  router.post("/tasks/:id/resume", auth, authz("task:resume"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id) {
      throw new BadRequestError("Task ID parameter is required");
    }

    const idValidation = uuidParamSchema.safeParse(id);
    if (!idValidation.success) {
      throw new BadRequestError("Invalid task ID format");
    }

    const updatedTask = await taskService.resumeTask(id, ctx.user!.id, {
      correlation_id: ctx.correlationId
    });

    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(updatedTask)
    });
  });

  // POST /tasks/:id/complete - Complete task
  router.post("/tasks/:id/complete", auth, authz("task:complete"), async (ctx: ApiContext) => {
    const payload = (typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {}) as Record<string, unknown>;
    const parseResult = completeTaskRequestSchema.safeParse({
      ...payload,
      task_id: ctx.params.id
    });
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const updatedTask = await taskService.completeTask(parseResult.data, ctx.user!.id);
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(updatedTask)
    });
  });

  // POST /tasks/:id/cancel - Cancel task
  router.post("/tasks/:id/cancel", auth, authz("task:cancel"), async (ctx: ApiContext) => {
    const payload = (typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {}) as Record<string, unknown>;
    const parseResult = cancelTaskRequestSchema.safeParse({
      ...payload,
      task_id: ctx.params.id
    });
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const updatedTask = await taskService.cancelTask(parseResult.data, ctx.user!.id);
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(updatedTask)
    });
  });

  // POST /tasks/:id/reopen - Reopen task
  router.post("/tasks/:id/reopen", auth, authz("task:reopen"), async (ctx: ApiContext) => {
    const payload = (typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {}) as Record<string, unknown>;
    const parseResult = reopenTaskRequestSchema.safeParse({
      ...payload,
      task_id: ctx.params.id
    });
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const updatedTask = await taskService.reopenTask(parseResult.data, ctx.user!.id);
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(updatedTask)
    });
  });

  // POST /tasks/:id/movement - Atomic task inventory movement execution
  router.post("/tasks/:id/movement", auth, authz("task:execute_movement"), async (ctx: ApiContext) => {
    const payload = (typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {}) as Record<string, unknown>;
    const parseResult = executeTaskMovementRequestSchema.safeParse({
      ...payload,
      task_id: ctx.params.id,
      idempotency_key: payload.idempotency_key ?? ctx.idempotencyKey ?? undefined,
      correlation_id: payload.correlation_id ?? ctx.correlationId
    });
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const result = await orchestrator.executeTaskMovement(parseResult.data, ctx.user!.id);
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(result)
    });
  });

  // GET /tasks/:id/summary - Closed-loop consolidated summary
  router.get("/tasks/:id/summary", auth, authz("task:read_summary"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id) {
      throw new BadRequestError("Task ID parameter is required");
    }

    const idValidation = uuidParamSchema.safeParse(id);
    if (!idValidation.success) {
      throw new BadRequestError("Invalid task ID format");
    }

    const summary = await orchestrator.getClosedLoopTaskSummary(id);
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(summary)
    });
  });

  // GET /tasks/:id/assignments - Task assignment history
  router.get("/tasks/:id/assignments", auth, authz("task:read_assignments"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id) {
      throw new BadRequestError("Task ID parameter is required");
    }

    const idValidation = uuidParamSchema.safeParse(id);
    if (!idValidation.success) {
      throw new BadRequestError("Invalid task ID format");
    }

    const assignments = await taskService.getTaskAssignments(id);
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(assignments)
    });
  });

  // GET /tasks/:id/events - Task event history
  router.get("/tasks/:id/events", auth, authz("task:read_events"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id) {
      throw new BadRequestError("Task ID parameter is required");
    }

    const idValidation = uuidParamSchema.safeParse(id);
    if (!idValidation.success) {
      throw new BadRequestError("Invalid task ID format");
    }

    const events = await taskService.getTaskEvents(id);
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(events)
    });
  });
}
