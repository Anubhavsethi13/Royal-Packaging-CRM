import {
  buildPageMeta,
  employeeKpiSummaryFilterSchema,
  listKpiDefinitionsFilterSchema,
  listKpiResultsFilterSchema,
  parseKpiResultId,
  managementKpiSummaryFilterSchema
} from "@royal-packaging/contracts";
import { z } from "zod";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { BadRequestError, ForbiddenError, HttpError, NotFoundError, UnauthorizedError } from "../middleware/error-handler.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import { KpiResultRequestError, type KpiResultScope } from "../modules/kpi/kpi-result-calculator.js";
import type { KpiService } from "../modules/kpi/kpi-service.js";
import type { ApiContext, Router } from "../router.js";
import { pageItems, parsePagination, sendJson, sendList, withCamelCaseMirror } from "../utils/http-utils.js";

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

  // GET /kpi/definitions - read-only KPI configuration (definitions + current targets).
  router.get("/kpi/definitions", auth, authz("kpi:read_config"), async (ctx: ApiContext) => {
    const pagination = parsePagination(ctx.query);
    const filter = listKpiDefinitionsFilterSchema.parse({
      search: ctx.query.get("search") ?? undefined,
      pillar: ctx.query.get("pillar") ?? undefined,
      status: ctx.query.get("status") ?? undefined
    });
    const page = await kpiService.listDefinitions(filter, { limit: pagination.pageSize, offset: pagination.offset });
    sendList(ctx.res, withCamelCaseMirror(page.items), pagination, page.total);
  });

  // GET /kpi/definitions/:id - one definition with its target/threshold history.
  router.get("/kpi/definitions/:id", auth, authz("kpi:read_config"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id || !uuidSchema.safeParse(id).success) {
      throw new BadRequestError("Invalid KPI definition ID format");
    }
    const definition = await kpiService.getDefinition(id);
    if (!definition) {
      throw new NotFoundError(`KPI definition with ID '${id}' was not found`);
    }
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(definition) });
  });

  /** `kpi:read_all` (management tier) sees every employee; anyone else only themselves (null = no employee profile). */
  const resolveResultScope = async (ctx: ApiContext): Promise<KpiResultScope | null> => {
    if (await authPolicy.evaluate(ctx, "kpi:read_all")) {
      return {};
    }
    const employeeId = await kpiService.findActiveEmployeeId(ctx.user!.id);
    return employeeId ? { employeeId } : null;
  };
  const asHttpError = (err: unknown): unknown =>
    err instanceof KpiResultRequestError ? new HttpError(400, err.code, err.message, [{ field: err.field, code: err.code.toLowerCase(), message: err.message }]) : err;

  // GET /kpi/results - KPI results calculated on demand from completed tasks.
  router.get("/kpi/results", auth, authz("kpi:read_results"), async (ctx: ApiContext) => {
    const pagination = parsePagination(ctx.query);
    const query = (snake: string, camel?: string) => ctx.query.get(snake) ?? (camel ? ctx.query.get(camel) : null) ?? undefined;
    const filter = listKpiResultsFilterSchema.parse({
      period: query("period"),
      from: query("from", "periodStart"),
      to: query("to", "periodEnd"),
      employee_id: query("employee_id", "employeeId"),
      kpi_id: query("kpi_id", "kpiId"),
      metric: query("metric"),
      operation: query("operation"),
      status: query("status"),
      warehouse_code: query("warehouse_code", "warehouseCode"),
      search: query("search")
    });

    if (filter.employee_id && !(await kpiService.employeeExists(filter.employee_id))) {
      throw new HttpError(400, "INVALID_EMPLOYEE", `Employee '${filter.employee_id}' does not exist.`, [
        { field: "employee_id", code: "invalid_employee", message: `Employee '${filter.employee_id}' does not exist.` }
      ]);
    }
    const scope = await resolveResultScope(ctx);
    if (filter.employee_id && (!scope || (scope.employeeId && scope.employeeId !== filter.employee_id))) {
      throw new ForbiddenError("You may only view your own KPI results.");
    }
    if (!scope) {
      sendList(ctx.res, [], pagination, 0);
      return;
    }

    try {
      const results = await kpiService.listResults(filter, scope);
      sendList(ctx.res, withCamelCaseMirror(pageItems(results, pagination)), pagination, results.length);
    } catch (err) {
      throw asHttpError(err);
    }
  });

  // GET /kpi/results/:id - one result with its source task references.
  router.get("/kpi/results/:id", auth, authz("kpi:read_results"), async (ctx: ApiContext) => {
    const parsed = parseKpiResultId(ctx.params.id ?? "");
    if (!parsed) {
      throw new BadRequestError("Invalid KPI result ID format");
    }
    const scope = await resolveResultScope(ctx);
    if (!scope || (scope.employeeId && scope.employeeId !== parsed.employeeId)) {
      throw new ForbiddenError("You may only view your own KPI results.");
    }
    const result = await kpiService.getResult(parsed);
    if (!result) {
      throw new NotFoundError(`KPI result '${ctx.params.id}' was not found`);
    }
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(result) });
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
