import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { DepotAssignmentRequiredError, depotFilterFor, type DepotDirectory } from "../middleware/depot-scope.js";
import type { DashboardService } from "../modules/dashboard/dashboard-service.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { ApiContext, Router } from "../router.js";
import { sendJson, withCamelCaseMirror } from "../utils/http-utils.js";

export function registerDashboardRoutes(
  router: Router,
  authService: AuthService,
  dashboardService: DashboardService,
  authPolicy: AuthorizationPolicy,
  directory: DepotDirectory
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  // GET /dashboard
  router.get("/dashboard", auth, authz("dashboard:read"), async (ctx: ApiContext) => {
    // Depot isolation: Supervisors see their depot; Others the depot of their own employee profile.
    const depotScope = await authPolicy.resolveDepotScope(ctx);
    let depotId = depotFilterFor(depotScope, ctx.query.get("depot_id") ?? undefined);
    if (depotScope.kind === "self") {
      const ownDepotId = (await directory.activeEmployeeOfUser(ctx.user!.id))?.depotId;
      if (!ownDepotId) {
        throw new DepotAssignmentRequiredError();
      }
      depotFilterFor({ kind: "depot", depotId: ownDepotId }, depotId);
      depotId = ownDepotId;
    }
    const fromRaw = ctx.query.get("from");
    const toRaw = ctx.query.get("to");

    // Incentive totals are privileged: included only when the server-side
    // policy grants incentive:read to the authenticated caller.
    const includeIncentives = await authPolicy.evaluate(ctx, "incentive:read");
    const summary = await dashboardService.getSummary({
      depot_id: depotId,
      from: fromRaw ? new Date(fromRaw) : undefined,
      to: toRaw ? new Date(toRaw) : undefined
    }, { includeIncentives });

    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(summary) });
  });
}
