import {
  inspectTaskRequestSchema,
  recordTaskPhotoRequestSchema
} from "@royal-packaging/contracts";
import { z } from "zod";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { assertDepotInScope, requireTaskInScope, type DepotDirectory } from "../middleware/depot-scope.js";
import { BadRequestError, HttpError, NotFoundError } from "../middleware/error-handler.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { QualityService } from "../modules/quality/quality-service.js";
import type { ApiContext, Router } from "../router.js";
import { sendJson, withCamelCaseMirror } from "../utils/http-utils.js";

const uuidSchema = z.string().uuid({ message: "Must be a valid UUID" });

export function registerQualityRoutes(
  router: Router,
  authService: AuthService,
  qualityService: QualityService,
  authPolicy: AuthorizationPolicy,
  directory: DepotDirectory
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);
  // Depot isolation for task quality data; callers without depot authority only for tasks they are/were assigned to.
  const inScope = requireTaskInScope(authPolicy, directory, { selfRequiresAssignment: true });

  // POST /tasks/:id/quality-inspections - Record task inspection
  router.post("/tasks/:id/quality-inspections", auth, authz("quality:inspect"), inScope, async (ctx: ApiContext) => {
    const payload = (typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {}) as Record<string, unknown>;
    const parseResult = inspectTaskRequestSchema.safeParse({
      ...payload,
      task_id: ctx.params.id,
      correlation_id: payload.correlation_id ?? ctx.correlationId
    });
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const result = await qualityService.inspectTask(parseResult.data, ctx.user!.id);
    sendJson(ctx.res, 201, {
      success: true,
      data: withCamelCaseMirror(result)
    });
  });

  // GET /tasks/:id/quality-inspections - Retrieve inspection history for a task
  router.get("/tasks/:id/quality-inspections", auth, authz("quality:read_history"), inScope, async (ctx: ApiContext) => {
    const taskId = ctx.params.id;
    if (!taskId) {
      throw new BadRequestError("Task ID parameter is required");
    }

    const idValidation = uuidSchema.safeParse(taskId);
    if (!idValidation.success) {
      throw new BadRequestError("Invalid task ID format");
    }

    const history = await qualityService.getTaskQualityHistory(taskId);
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(history)
    });
  });

  // GET /quality-records/:id - Retrieve individual quality record
  router.get("/quality-records/:id", auth, authz("quality:read_record"), async (ctx: ApiContext) => {
    const recordId = ctx.params.id;
    if (!recordId) {
      throw new BadRequestError("Quality record ID parameter is required");
    }

    const idValidation = uuidSchema.safeParse(recordId);
    if (!idValidation.success) {
      throw new BadRequestError("Invalid quality record ID format");
    }

    const record = await qualityService.getQualityRecord(recordId);
    if (!record) {
      throw new NotFoundError(`Quality record with ID '${recordId}' was not found`);
    }
    const taskId = (record as { task_id?: string | null }).task_id ?? null;
    const scope = await authPolicy.resolveDepotScope(ctx);
    assertDepotInScope(scope, taskId ? (await directory.taskDepot(taskId)).depotId : null, "This quality record belongs to another depot.");
    if (scope.kind === "self" && (!taskId || !(await directory.isAssigned(ctx.user!.id, taskId, true)))) {
      throw new HttpError(403, "FORBIDDEN", "This quality record is not for one of your tasks.");
    }

    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(record)
    });
  });

  // POST /tasks/:id/photos - Record task photo metadata
  router.post("/tasks/:id/photos", auth, authz("quality:record_photo"), inScope, async (ctx: ApiContext) => {
    const payload = (typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {}) as Record<string, unknown>;
    const parseResult = recordTaskPhotoRequestSchema.safeParse({
      ...payload,
      task_id: ctx.params.id,
      correlation_id: payload.correlation_id ?? ctx.correlationId
    });
    if (!parseResult.success) {
      throw parseResult.error;
    }

    // The capturer is always the authenticated user's own active employee profile
    // (session → user → employee). No contract allows capturing on behalf of someone
    // else, so a body-supplied captured_by_employee_id naming anyone else is refused.
    const capturer = await directory.activeEmployeeOfUser(ctx.user!.id);
    if (!capturer) {
      throw new HttpError(403, "EMPLOYEE_PROFILE_REQUIRED", "Layer photos are recorded against your employee profile, and your account is not linked to an active one.");
    }
    if (parseResult.data.captured_by_employee_id !== undefined && parseResult.data.captured_by_employee_id !== capturer.id) {
      throw new HttpError(403, "FORBIDDEN", "captured_by_employee_id must be your own employee profile; photos cannot be recorded for another employee.");
    }
    await directory.assertEmployeesInScope(await authPolicy.resolveDepotScope(ctx), [capturer.id]);

    const photo = await qualityService.recordTaskPhoto(parseResult.data, capturer.id);

    sendJson(ctx.res, 201, {
      success: true,
      data: withCamelCaseMirror(photo)
    });
  });

  // GET /tasks/:id/photos - Retrieve all photos recorded for a task
  router.get("/tasks/:id/photos", auth, authz("quality:read_photos"), inScope, async (ctx: ApiContext) => {
    const taskId = ctx.params.id;
    if (!taskId) {
      throw new BadRequestError("Task ID parameter is required");
    }

    const idValidation = uuidSchema.safeParse(taskId);
    if (!idValidation.success) {
      throw new BadRequestError("Invalid task ID format");
    }

    const photos = await qualityService.getTaskPhotos(taskId);
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(photos)
    });
  });
}
