import {
  buildPageMeta,
  employeeKpiSummaryFilterSchema,
  managementKpiSummaryFilterSchema
} from "@royal-packaging/contracts";
import { z } from "zod";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { BadRequestError, NotFoundError, UnauthorizedError } from "../middleware/error-handler.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { KpiService } from "../modules/kpi/kpi-service.js";
import type { ApiContext, Router } from "../router.js";
import { parsePagination, sendJson, withCamelCaseMirror } from "../utils/http-utils.js";

const uuidSchema = z.string().uuid({ message: "Must be a valid UUID" });

export function registerKpiRoutes(
  router: Router,
  authService: AuthService,
  kpiService: KpiService,
  authPolicy: AuthorizationPolicy
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  // GET /kpi/me/summary - shift-entry KPIs for the session's own employee only.
  router.get("/kpi/me/summary", auth, authz("kpi:read_own"), async (ctx: ApiContext) => {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required.");
    }
    if (ctx.query.has("employee_id") || ctx.query.has("employeeId")) {
      throw new BadRequestError("employee_id is not accepted here; the employee is derived from the session.");
    }
    const filter = employeeKpiSummaryFilterSchema.parse({
      from: ctx.query.get("from") ?? undefined,
      to: ctx.query.get("to") ?? undefined,
      warehouse_code: ctx.query.get("warehouse_code") ?? undefined,
      truck_type: ctx.query.get("truck_type") ?? undefined
    });
    const summary = await kpiService.getEmployeeSummary(ctx.user.id, filter);
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(summary) });
  });

  // GET /kpi/summary - management aggregate plus a paginated per-employee breakdown.
  router.get("/kpi/summary", auth, authz("kpi:read_all"), async (ctx: ApiContext) => {
    const pagination = parsePagination(ctx.query);
    const filter = managementKpiSummaryFilterSchema.parse({
      from: ctx.query.get("from") ?? undefined,
      to: ctx.query.get("to") ?? undefined,
      warehouse_code: ctx.query.get("warehouse_code") ?? undefined,
      truck_type: ctx.query.get("truck_type") ?? undefined,
      employee_id: ctx.query.get("employee_id") ?? undefined
    });
    const result = await kpiService.getManagementSummary(filter, {
      limit: pagination.pageSize,
      offset: pagination.offset
    });
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(result.summary),
      meta: buildPageMeta(pagination.page, pagination.pageSize, result.totalEmployees)
    });
  });

  // GET /kpis
  router.get("/kpis", auth, authz("kpi:read"), async (ctx: ApiContext) => {
    const kpiCode = ctx.query.get("kpi_code") ?? undefined;
    const depotId = ctx.query.get("depot_id") ?? undefined;
    const employeeId = ctx.query.get("employee_id") ?? undefined;
    const snapshots = await kpiService.list({ kpi_code: kpiCode, depot_id: depotId, employee_id: employeeId });
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(snapshots) });
  });

  // GET /kpis/:id
  router.get("/kpis/:id", auth, authz("kpi:read"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id || !uuidSchema.safeParse(id).success) {
      throw new BadRequestError("Invalid KPI snapshot ID format");
    }
    const snapshot = await kpiService.getById(id);
    if (!snapshot) {
      throw new NotFoundError(`KPI snapshot with ID '${id}' was not found`);
    }
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(snapshot) });
  });

  // GET /kpis/:code/drill-down
  router.get("/kpis/:code/drill-down", auth, authz("kpi:read"), async (ctx: ApiContext) => {
    const code = ctx.params.code;
    if (!code) {
      throw new BadRequestError("KPI code parameter is required");
    }
    const drillDown = await kpiService.drillDown(code);
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(drillDown) });
  });
}
