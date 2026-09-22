import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import type { DashboardService } from "../modules/dashboard/dashboard-service.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { ApiContext, Router } from "../router.js";
import { sendJson, withCamelCaseMirror } from "../utils/http-utils.js";

export function registerDashboardRoutes(
  router: Router,
  authService: AuthService,
  dashboardService: DashboardService,
  authPolicy: AuthorizationPolicy
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  // GET /dashboard
  router.get("/dashboard", auth, authz("dashboard:read"), async (ctx: ApiContext) => {
    const depotId = ctx.query.get("depot_id") ?? undefined;
    const fromRaw = ctx.query.get("from");
    const toRaw = ctx.query.get("to");

    const summary = await dashboardService.getSummary({
      depot_id: depotId,
      from: fromRaw ? new Date(fromRaw) : undefined,
      to: toRaw ? new Date(toRaw) : undefined
    });

    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(summary) });
  });
}
