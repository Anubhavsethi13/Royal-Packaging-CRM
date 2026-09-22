import { z } from "zod";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { BadRequestError, NotFoundError } from "../middleware/error-handler.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { KpiService } from "../modules/kpi/kpi-service.js";
import type { ApiContext, Router } from "../router.js";
import { sendJson, withCamelCaseMirror } from "../utils/http-utils.js";

const uuidSchema = z.string().uuid({ message: "Must be a valid UUID" });

export function registerKpiRoutes(
  router: Router,
  authService: AuthService,
  kpiService: KpiService,
  authPolicy: AuthorizationPolicy
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

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
