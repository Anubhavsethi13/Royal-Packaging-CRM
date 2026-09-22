import {
  approveIncentiveRequestSchema,
  calculateMonthlyIncentiveRequestSchema,
  calculateTaskIncentiveRequestSchema,
  recordManualPenaltyRequestSchema,
  recordMonthlyKotRequestSchema
} from "@royal-packaging/contracts";
import { z } from "zod";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { BadRequestError, NotFoundError } from "../middleware/error-handler.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { IncentiveService } from "../modules/incentives/incentive-service.js";
import type { ApiContext, Router } from "../router.js";
import { sendJson, withCamelCaseMirror } from "../utils/http-utils.js";

const uuidSchema = z.string().uuid({ message: "Must be a valid UUID" });

export function registerIncentiveRoutes(
  router: Router,
  authService: AuthService,
  incentiveService: IncentiveService,
  authPolicy: AuthorizationPolicy
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  // POST /incentives/kot - Record monthly KOT (Super Admin only)
  router.post("/incentives/kot", auth, authz("incentive:record_kot"), async (ctx: ApiContext) => {
    const payload = (typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {}) as Record<string, unknown>;
    const parseResult = recordMonthlyKotRequestSchema.safeParse({
      ...payload,
      correlation_id: payload.correlation_id ?? ctx.correlationId
    });
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const result = await incentiveService.recordMonthlyKot(parseResult.data, ctx.user!.id);
    sendJson(ctx.res, 201, {
      success: true,
      data: withCamelCaseMirror(result)
    });
  });

  // GET /incentives/kot/:month - Retrieve monthly KOT value
  router.get("/incentives/kot/:month", auth, authz("incentive:read"), async (ctx: ApiContext) => {
    const month = ctx.params.month;
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestError("Effective month must be in YYYY-MM format (e.g. 2026-09)");
    }

    const result = await incentiveService.getMonthlyKot(month);
    if (!result) {
      throw new NotFoundError(`No KOT record found for effective month '${month}'`);
    }

    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(result)
    });
  });

  // POST /incentives/penalties - Record manual penalty
  router.post("/incentives/penalties", auth, authz("incentive:record_penalty"), async (ctx: ApiContext) => {
    const payload = (typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {}) as Record<string, unknown>;
    const parseResult = recordManualPenaltyRequestSchema.safeParse({
      ...payload,
      correlation_id: payload.correlation_id ?? ctx.correlationId
    });
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const result = await incentiveService.recordManualPenalty(parseResult.data, ctx.user!.id);
    sendJson(ctx.res, 201, {
      success: true,
      data: withCamelCaseMirror(result)
    });
  });

  // GET /incentives/penalties - List manual penalties
  router.get("/incentives/penalties", auth, authz("incentive:read"), async (ctx: ApiContext) => {
    const effectiveMonth = ctx.query.get("effective_month") ?? undefined;
    const employeeId = ctx.query.get("employee_id") ?? undefined;
    const taskId = ctx.query.get("task_id") ?? undefined;

    const penalties = await incentiveService.getManualPenalties({
      effectiveMonth,
      employeeId,
      taskId
    });

    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(penalties)
    });
  });

  // POST /incentives/monthly/calculate - Calculate monthly incentive pool
  router.post("/incentives/monthly/calculate", auth, authz("incentive:calculate"), async (ctx: ApiContext) => {
    const payload = (typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {}) as Record<string, unknown>;
    const parseResult = calculateMonthlyIncentiveRequestSchema.safeParse({
      ...payload,
      correlation_id: payload.correlation_id ?? ctx.correlationId
    });
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const result = await incentiveService.calculateMonthlyIncentive(parseResult.data);
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(result)
    });
  });

  // POST /tasks/:id/incentives/calculate - Calculate task equal incentive shares
  router.post("/tasks/:id/incentives/calculate", auth, authz("incentive:calculate"), async (ctx: ApiContext) => {
    const taskId = ctx.params.id;
    if (!taskId) {
      throw new BadRequestError("Task ID parameter is required");
    }

    const idValidation = uuidSchema.safeParse(taskId);
    if (!idValidation.success) {
      throw new BadRequestError("Invalid task ID format");
    }

    const payload = (typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {}) as Record<string, unknown>;
    const parseResult = calculateTaskIncentiveRequestSchema.safeParse({
      ...payload,
      task_id: taskId,
      idempotency_key: ctx.idempotencyKey ?? payload.idempotency_key,
      correlation_id: payload.correlation_id ?? ctx.correlationId
    });
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const result = await incentiveService.calculateTaskIncentive(parseResult.data, ctx.user!.id);
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(result)
    });
  });

  // POST /incentives/approve - Approve pending incentive ledger entries (Super Admin only)
  router.post("/incentives/approve", auth, authz("incentive:approve"), async (ctx: ApiContext) => {
    const payload = (typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {}) as Record<string, unknown>;
    const parseResult = approveIncentiveRequestSchema.safeParse({
      ...payload,
      correlation_id: payload.correlation_id ?? ctx.correlationId
    });
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const result = await incentiveService.approveIncentiveLedger(parseResult.data, ctx.user!.id);
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(result)
    });
  });

  // GET /incentives/ledger - Retrieve incentive ledger entries
  router.get("/incentives/ledger", auth, authz("incentive:read"), async (ctx: ApiContext) => {
    const taskId = ctx.query.get("task_id") ?? undefined;
    const employeeId = ctx.query.get("employee_id") ?? undefined;
    const status = ctx.query.get("status") ?? undefined;

    const entries = await incentiveService.getIncentiveLedger({
      taskId,
      employeeId,
      status
    });

    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(entries)
    });
  });
}
