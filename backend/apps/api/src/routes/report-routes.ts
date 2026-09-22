import { createReportExecutionRequestSchema } from "@royal-packaging/contracts";
import { z } from "zod";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { BadRequestError, NotFoundError } from "../middleware/error-handler.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { ReportService } from "../modules/reports/report-service.js";
import type { ApiContext, Router } from "../router.js";
import { sendJson, withCamelCaseMirror } from "../utils/http-utils.js";

const uuidSchema = z.string().uuid({ message: "Must be a valid UUID" });

export function registerReportRoutes(
  router: Router,
  authService: AuthService,
  reportService: ReportService,
  authPolicy: AuthorizationPolicy
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  // GET /reports
  router.get("/reports", auth, authz("report:read"), async (ctx: ApiContext) => {
    const definitions = await reportService.listDefinitions();
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(definitions) });
  });

  // POST /reports/:code/executions
  router.post("/reports/:code/executions", auth, authz("report:execute"), async (ctx: ApiContext) => {
    const code = ctx.params.code;
    if (!code) {
      throw new BadRequestError("Report code parameter is required");
    }
    const parseResult = createReportExecutionRequestSchema.safeParse(ctx.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    const execution = await reportService.requestExecution(code, ctx.user!.id, parseResult.data);
    sendJson(ctx.res, 201, { success: true, data: withCamelCaseMirror(execution) });
  });

  // GET /report-executions/:id
  router.get("/report-executions/:id", auth, authz("report:read"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id || !uuidSchema.safeParse(id).success) {
      throw new BadRequestError("Invalid report execution ID format");
    }
    const execution = await reportService.getExecutionById(id);
    if (!execution) {
      throw new NotFoundError(`Report execution with ID '${id}' was not found`);
    }
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(execution) });
  });
}
