import {
  buildPageMeta,
  depotDashboardQuerySchema,
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
import { assertDepotInScope, depotFilterFor, type DepotDirectory } from "../middleware/depot-scope.js";
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
  authPolicy: AuthorizationPolicy,
  directory: DepotDirectory
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
    // Depot isolation: a Supervisor aggregates only employees of their own depot.
    const depotScope = await authPolicy.resolveDepotScope(ctx);
    await directory.assertWarehouseCodeInScope(depotScope, filter.warehouse_code);
    await directory.assertEmployeesInScope(depotScope, [filter.employee_id]);
    const result = await kpiService.getManagementSummary(
      filter,
      { limit: pagination.pageSize, offset: pagination.offset },
      depotScope.kind === "depot" ? { employeeDepotId: depotScope.depotId } : {}
    );
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(result.summary),
      meta: buildPageMeta(pagination.page, pagination.pageSize, result.totalEmployees)
    });
  });

  // GET /kpi/depot-dashboard - depot KPIs with their source records (Supervisor: own depot only).
  router.get("/kpi/depot-dashboard", auth, authz("kpi:read_depot"), async (ctx: ApiContext) => {
    const query = depotDashboardQuerySchema.parse({
      depot_id: ctx.query.get("depot_id") ?? undefined,
      from: ctx.query.get("from") ?? ctx.query.get("date") ?? undefined,
      to: ctx.query.get("to") ?? ctx.query.get("date") ?? undefined
    });
    // The depot comes from the session for depot-confined callers; naming another one is refused.
    const depotScope = await authPolicy.resolveDepotScope(ctx);
    const depotId = depotFilterFor(depotScope, query.depot_id);
    const dashboard = await kpiService.getDepotDashboard(query, depotId, depotScope.kind === "all");
    if (!dashboard) {
      throw new NotFoundError(`Depot '${depotId}' was not found`);
    }
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(dashboard) });
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

  /**
   * `kpi:read_all` sees every employee in its depot reach (Supervisor: own depot
   * only, applied in the query); anyone else only themselves (null = no employee profile).
   */
  const resolveResultScope = async (ctx: ApiContext): Promise<KpiResultScope | null> => {
    if (await authPolicy.evaluate(ctx, "kpi:read_all")) {
      const depotScope = await authPolicy.resolveDepotScope(ctx);
      return depotScope.kind === "depot" ? { depotId: depotScope.depotId } : {};
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
    if (scope?.depotId) {
      const depotScope = { kind: "depot" as const, depotId: scope.depotId };
      await directory.assertEmployeesInScope(depotScope, [filter.employee_id]);
      await directory.assertWarehouseCodeInScope(depotScope, filter.warehouse_code);
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
    if (scope.depotId) {
      await directory.assertEmployeesInScope({ kind: "depot", depotId: scope.depotId }, [parsed.employeeId]);
    }
    const result = await kpiService.getResult(parsed, new Date(), scope);
    if (!result) {
      throw new NotFoundError(`KPI result '${ctx.params.id}' was not found`);
    }
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(result) });
  });

  /** Snapshot filters within the caller's reach (null = nothing visible). */
  const snapshotScope = async (ctx: ApiContext, depotId: string | undefined, employeeId: string | undefined): Promise<{ depot_id?: string; employee_id?: string } | null> => {
    const depotScope = await authPolicy.resolveDepotScope(ctx);
    if (depotScope.kind === "self") {
      const own = await directory.activeEmployeeOfUser(ctx.user!.id);
      if (employeeId && employeeId !== own?.id) {
        throw new ForbiddenError("You may only view your own KPI snapshots.");
      }
      return own ? { employee_id: own.id, ...(depotId ? { depot_id: depotId } : {}) } : null;
    }
    await directory.assertEmployeesInScope(depotScope, [employeeId]);
    const scopedDepotId = depotFilterFor(depotScope, depotId);
    return { ...(scopedDepotId ? { depot_id: scopedDepotId } : {}), ...(employeeId ? { employee_id: employeeId } : {}) };
  };

  // GET /kpis
  router.get("/kpis", auth, authz("kpi:read"), async (ctx: ApiContext) => {
    const kpiCode = ctx.query.get("kpi_code") ?? undefined;
    const scoped = await snapshotScope(ctx, ctx.query.get("depot_id") ?? undefined, ctx.query.get("employee_id") ?? undefined);
    if (!scoped) {
      sendJson(ctx.res, 200, { success: true, data: [] });
      return;
    }
    const snapshots = await kpiService.list({ kpi_code: kpiCode, ...scoped });
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
    const depotScope = await authPolicy.resolveDepotScope(ctx);
    assertDepotInScope(depotScope, snapshot.depot_id, "This KPI snapshot belongs to another depot.");
    if (depotScope.kind === "self" && (await directory.activeEmployeeOfUser(ctx.user!.id))?.id !== snapshot.employee_id) {
      throw new ForbiddenError("You may only view your own KPI snapshots.");
    }
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(snapshot) });
  });

  // GET /kpis/:code/drill-down
  router.get("/kpis/:code/drill-down", auth, authz("kpi:read"), async (ctx: ApiContext) => {
    const code = ctx.params.code;
    if (!code) {
      throw new BadRequestError("KPI code parameter is required");
    }
    const scoped = await snapshotScope(ctx, undefined, undefined);
    const drillDown = scoped ? await kpiService.drillDown(code, scoped) : { kpi_code: code, snapshots: [] };
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(drillDown) });
  });
}
