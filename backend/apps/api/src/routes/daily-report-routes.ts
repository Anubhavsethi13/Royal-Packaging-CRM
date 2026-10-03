import { z } from "zod";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { BadRequestError, UnauthorizedError } from "../middleware/error-handler.js";
import type { DailyReportAccess, DailyReportService } from "../modules/daily-reports/daily-report-service.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { ApiContext, Router } from "../router.js";
import { parsePagination, sendJson, sendList, withCamelCaseMirror } from "../utils/http-utils.js";

const uuidSchema = z.string().uuid({ message: "Must be a valid UUID" });

/**
 * Supervisor daily depot reports.
 *
 * Route-level authorization: `daily_report:read` / `daily_report:write`.
 * Depot reach is decided by the policy too (`daily_report:read_all`,
 * `daily_report:write_all`); callers without it are limited by the service
 * to the depot of their own employee profile. Nothing about identity, role or
 * depot authority is taken from the request.
 */
export function registerDailyReportRoutes(
  router: Router,
  authService: AuthService,
  dailyReportService: DailyReportService,
  authPolicy: AuthorizationPolicy
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  const access = async (ctx: ApiContext, allAction: string): Promise<DailyReportAccess> => {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required.");
    }
    return { userId: ctx.user.id, allDepots: await authPolicy.evaluate(ctx, allAction) };
  };

  // GET /daily-reports/options - depots the caller may report for, and vehicle types.
  router.get("/daily-reports/options", auth, authz("daily_report:write"), async (ctx: ApiContext) => {
    const options = await dailyReportService.listOptions(await access(ctx, "daily_report:write_all"));
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(options) });
  });

  router.get("/daily-reports", auth, authz("daily_report:read"), async (ctx: ApiContext) => {
    const pagination = parsePagination(ctx.query);
    const page = await dailyReportService.list(
      {
        depot_id: ctx.query.get("depot_id") ?? undefined,
        from: ctx.query.get("from") ?? undefined,
        to: ctx.query.get("to") ?? undefined,
        status: ctx.query.get("status") ?? undefined
      },
      await access(ctx, "daily_report:read_all"),
      { limit: pagination.pageSize, offset: pagination.offset }
    );
    sendList(ctx.res, withCamelCaseMirror(page.items), pagination, page.total);
  });

  router.get("/daily-reports/:id", auth, validateId, authz("daily_report:read"), async (ctx: ApiContext) => {
    const report = await dailyReportService.get(ctx.params.id as string, await access(ctx, "daily_report:read_all"));
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(report) });
  });

  router.post("/daily-reports", auth, authz("daily_report:write"), async (ctx: ApiContext) => {
    const report = await dailyReportService.create(ctx.body, await access(ctx, "daily_report:write_all"));
    sendJson(ctx.res, 201, { success: true, data: withCamelCaseMirror(report) });
  });

  router.patch("/daily-reports/:id", auth, validateId, authz("daily_report:write"), async (ctx: ApiContext) => {
    const report = await dailyReportService.update(ctx.params.id as string, ctx.body, await access(ctx, "daily_report:write_all"));
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(report) });
  });

  router.post("/daily-reports/:id/submit", auth, validateId, authz("daily_report:write"), async (ctx: ApiContext) => {
    const report = await dailyReportService.submit(ctx.params.id as string, ctx.body, await access(ctx, "daily_report:write_all"));
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(report) });
  });
}

async function validateId(ctx: ApiContext, next: () => Promise<void>): Promise<void> {
  const id = ctx.params.id;
  if (!id || !uuidSchema.safeParse(id).success) {
    throw new BadRequestError("Invalid daily report ID format");
  }
  await next();
}
