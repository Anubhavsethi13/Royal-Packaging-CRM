import { z } from "zod";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { BadRequestError, NotFoundError } from "../middleware/error-handler.js";
import type { AuditService } from "../modules/audit/audit-service.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { ApiContext, Router } from "../router.js";
import { sendJson, withCamelCaseMirror } from "../utils/http-utils.js";

const uuidSchema = z.string().uuid({ message: "Must be a valid UUID" });

export function registerAuditRoutes(
  router: Router,
  authService: AuthService,
  auditService: AuditService,
  authPolicy: AuthorizationPolicy
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  // GET /audit-logs
  router.get("/audit-logs", auth, authz("audit:read"), async (ctx: ApiContext) => {
    const taskId = ctx.query.get("task_id") ?? undefined;
    const actorUserId = ctx.query.get("actor_user_id") ?? undefined;
    const eventType = ctx.query.get("event_type") ?? undefined;
    const entries = await auditService.list({ task_id: taskId, actor_user_id: actorUserId, event_type: eventType });
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(entries) });
  });

  // GET /audit-logs/:id
  router.get("/audit-logs/:id", auth, authz("audit:read"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id || !uuidSchema.safeParse(id).success) {
      throw new BadRequestError("Invalid audit log ID format");
    }
    const entry = await auditService.getById(id);
    if (!entry) {
      throw new NotFoundError(`Audit log entry with ID '${id}' was not found`);
    }
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(entry) });
  });
}
