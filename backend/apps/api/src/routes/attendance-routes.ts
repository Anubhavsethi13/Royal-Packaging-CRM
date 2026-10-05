import { z } from "zod";

import { EtimeOfficeError } from "../integrations/etime-office/etime-office-errors.js";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { BadRequestError, ConflictError, HttpError, UnauthorizedError } from "../middleware/error-handler.js";
import type { AttendanceAccess, AttendanceReadService } from "../modules/attendance/attendance-read-service.js";
import type { AttendanceSyncService, SyncOutcome } from "../modules/attendance/attendance-sync-service.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { ApiContext, Router } from "../router.js";
import { parsePagination, sendJson, sendList, withCamelCaseMirror } from "../utils/http-utils.js";

const importSchema = z.strictObject({
  from: z.string(),
  to: z.string(),
  empcode: z.string().trim().min(1).optional()
});

/** API responses use snake_case keys (with the usual camelCase mirror), like every other DTO. */
function outcomeDto(outcome: SyncOutcome): Record<string, unknown> {
  return {
    run_id: outcome.runId,
    status: outcome.status,
    request_last_record: outcome.requestLastRecord,
    max_record: outcome.maxRecord,
    records_received: outcome.recordsReceived,
    records_inserted: outcome.recordsInserted,
    duplicates: outcome.duplicates,
    unmapped: outcome.unmapped,
    error_code: outcome.errorCode,
    error_message: outcome.errorMessage
  };
}

/** A failed provider sync is an upstream problem: 503 when not configured, 502 otherwise. */
function syncFailure(outcome: Pick<SyncOutcome, "errorCode" | "errorMessage">): HttpError {
  if (outcome.errorCode === "NOT_CONFIGURED") {
    return new HttpError(503, "ATTENDANCE_SYNC_NOT_CONFIGURED", outcome.errorMessage ?? "Attendance synchronization is not configured.");
  }
  return new HttpError(502, "ATTENDANCE_SYNC_FAILED", outcome.errorMessage ?? "Attendance synchronization failed.", { providerError: outcome.errorCode });
}

/**
 * Attendance synchronized from e-Time Office (read-only provider → CRM).
 *
 * - `attendance:read` lets a caller read attendance; `attendance:read_all` (decided by the
 *   policy) widens it from the caller's own employee profile to every employee.
 * - `attendance:sync` (admin tier) triggers synchronization and reads its status/exceptions.
 * Identity, role and employee scope are always derived from the session.
 */
export function registerAttendanceRoutes(
  router: Router,
  authService: AuthService,
  readService: AttendanceReadService,
  syncService: AttendanceSyncService,
  authPolicy: AuthorizationPolicy
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  const access = async (ctx: ApiContext): Promise<AttendanceAccess> => {
    if (!ctx.user) throw new UnauthorizedError("Authentication required.");
    return { userId: ctx.user.id, allEmployees: await authPolicy.evaluate(ctx, "attendance:read_all") };
  };
  const filter = (ctx: ApiContext) => ({
    employee_id: ctx.query.get("employee_id") ?? undefined,
    from: ctx.query.get("from") ?? undefined,
    to: ctx.query.get("to") ?? undefined
  });

  // GET /attendance/punches - raw punches (DownloadLastPunchData).
  router.get("/attendance/punches", auth, authz("attendance:read"), async (ctx: ApiContext) => {
    const pagination = parsePagination(ctx.query);
    const page = await readService.listPunches(filter(ctx), await access(ctx), { limit: pagination.pageSize, offset: pagination.offset });
    sendList(ctx.res, withCamelCaseMirror(page.items), pagination, page.total);
  });

  // GET /attendance/daily - calculated daily attendance (DownloadInOutPunchData).
  router.get("/attendance/daily", auth, authz("attendance:read"), async (ctx: ApiContext) => {
    const pagination = parsePagination(ctx.query);
    const page = await readService.listDaily(filter(ctx), await access(ctx), { limit: pagination.pageSize, offset: pagination.offset });
    sendList(ctx.res, withCamelCaseMirror(page.items), pagination, page.total);
  });

  // GET /attendance/sync/status - checkpoint, recent runs, open exceptions. No credentials.
  router.get("/attendance/sync/status", auth, authz("attendance:sync"), async (ctx: ApiContext) => {
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(await readService.syncStatus()) });
  });

  // GET /attendance/sync/exceptions - records that could not be attributed (e.g. EMPLOYEE_NOT_FOUND).
  router.get("/attendance/sync/exceptions", auth, authz("attendance:sync"), async (ctx: ApiContext) => {
    const pagination = parsePagination(ctx.query);
    const page = await readService.listExceptions({ limit: pagination.pageSize, offset: pagination.offset });
    sendList(ctx.res, withCamelCaseMirror(page.items), pagination, page.total);
  });

  // POST /attendance/sync - run the incremental DownloadLastPunchData sync now.
  router.post("/attendance/sync", auth, authz("attendance:sync"), async (ctx: ApiContext) => {
    const outcome = await syncService.syncLastPunchData("MANUAL", ctx.user?.id ?? null);
    if (outcome.status === "SKIPPED") throw new ConflictError(outcome.errorMessage ?? "A synchronization is already running.");
    if (outcome.status === "FAILED") throw syncFailure(outcome);
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(outcomeDto(outcome)) });
  });

  // POST /attendance/daily/import - DownloadInOutPunchData for a date range (no incremental API exists for it).
  router.post("/attendance/daily/import", auth, authz("attendance:sync"), async (ctx: ApiContext) => {
    const parsed = importSchema.safeParse(ctx.body);
    if (!parsed.success) {
      throw new BadRequestError("from and to (YYYY-MM-DD) are required.", parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
    }
    let outcome: SyncOutcome;
    try {
      outcome = await syncService.importInOutRange(parsed.data, "MANUAL", ctx.user?.id ?? null);
    } catch (error) {
      if (error instanceof EtimeOfficeError && error.code === "INVALID_REQUEST") throw new BadRequestError(error.message);
      if (error instanceof EtimeOfficeError && error.code === "NOT_CONFIGURED") throw syncFailure({ errorCode: error.code, errorMessage: error.message });
      throw error;
    }
    if (outcome.status === "FAILED") throw syncFailure(outcome);
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(outcomeDto(outcome)) });
  });
}
