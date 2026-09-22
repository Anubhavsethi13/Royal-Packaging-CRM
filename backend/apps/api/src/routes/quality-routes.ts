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
import { BadRequestError, NotFoundError } from "../middleware/error-handler.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { QualityService } from "../modules/quality/quality-service.js";
import type { ApiContext, Router } from "../router.js";
import { sendJson, withCamelCaseMirror } from "../utils/http-utils.js";

const uuidSchema = z.string().uuid({ message: "Must be a valid UUID" });

export function registerQualityRoutes(
  router: Router,
  authService: AuthService,
  qualityService: QualityService,
  authPolicy: AuthorizationPolicy
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  // POST /tasks/:id/quality-inspections - Record task inspection
  router.post("/tasks/:id/quality-inspections", auth, authz("quality:inspect"), async (ctx: ApiContext) => {
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
  router.get("/tasks/:id/quality-inspections", auth, authz("quality:read_history"), async (ctx: ApiContext) => {
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

    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(record)
    });
  });

  // POST /tasks/:id/photos - Record task photo metadata
  router.post("/tasks/:id/photos", auth, authz("quality:record_photo"), async (ctx: ApiContext) => {
    const payload = (typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {}) as Record<string, unknown>;
    const parseResult = recordTaskPhotoRequestSchema.safeParse({
      ...payload,
      task_id: ctx.params.id,
      correlation_id: payload.correlation_id ?? ctx.correlationId
    });
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const photo = await qualityService.recordTaskPhoto(
      parseResult.data,
      parseResult.data.captured_by_employee_id
    );

    sendJson(ctx.res, 201, {
      success: true,
      data: withCamelCaseMirror(photo)
    });
  });

  // GET /tasks/:id/photos - Retrieve all photos recorded for a task
  router.get("/tasks/:id/photos", auth, authz("quality:read_photos"), async (ctx: ApiContext) => {
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
