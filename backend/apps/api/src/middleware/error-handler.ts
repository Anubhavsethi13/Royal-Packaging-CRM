import type { ServerResponse } from "node:http";
import {
  CommercialDomainError,
  IncentiveDomainError,
  InventoryDomainError,
  OrchestrationDomainError,
  PayrollDomainError,
  QualityDomainError,
  ReportDomainError,
  TaskDomainError
} from "@royal-packaging/contracts";
import { ZodError } from "zod";
import { InvalidPaginationError, sendError } from "../utils/http-utils.js";

export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  public constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnauthorizedError extends HttpError {
  public constructor(message: string = "Authentication required to access this resource.") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends HttpError {
  public constructor(message: string = "You do not have permission to perform this action.") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends HttpError {
  public constructor(message: string = "The requested resource was not found.") {
    super(404, "NOT_FOUND", message);
  }
}

export class BadRequestError extends HttpError {
  public constructor(message: string = "Invalid request payload or parameters.", details?: unknown) {
    super(400, "BAD_REQUEST", message, details);
  }
}

export class ConflictError extends HttpError {
  public constructor(message: string = "The requested operation conflicts with current state.", details?: unknown) {
    super(409, "CONFLICT", message, details);
  }
}

/**
 * Global HTTP error handler mapping domain errors, validation errors, and runtime exceptions
 * to consistent, structured HTTP error responses.
 *
 * `requestId` (correlation ID) is threaded into every `sendError` call so the
 * canonical envelope's `requestId` field is populated end-to-end.
 */
export function handleApiError(err: unknown, res: ServerResponse, requestId?: string | null): void {
  // If headers already sent, do nothing
  if (res.headersSent) {
    return;
  }

  // 1. Explicit HTTP Errors
  if (err instanceof InvalidPaginationError) {
    sendError(res, 400, "VALIDATION_FAILED", err.message, err.details, {}, requestId);
    return;
  }

  if (err instanceof HttpError) {
    sendError(res, err.statusCode, err.code, err.message, err.details, {}, requestId);
    return;
  }

  // 2. Zod Validation Errors
  if (err instanceof ZodError) {
    const formattedDetails = err.issues.map((issue) => ({
      field: issue.path.join("."),
      path: issue.path.join("."),
      message: issue.message,
      code: issue.code
    }));
    sendError(
      res,
      400,
      "VALIDATION_FAILED",
      err.issues[0]?.message ?? "Validation failed",
      formattedDetails,
      {},
      requestId
    );
    return;
  }

  // 3. Inventory Domain Errors
  if (err instanceof InventoryDomainError) {
    const statusCode = mapInventoryErrorCodeToStatus(err.code);
    sendError(res, statusCode, err.code, err.message, undefined, {}, requestId);
    return;
  }

  // 4. Task Domain Errors
  if (err instanceof TaskDomainError) {
    const statusCode = mapTaskErrorCodeToStatus(err.code);
    sendError(res, statusCode, err.code, err.message, undefined, {}, requestId);
    return;
  }

  // 5. Orchestration Domain Errors
  if (err instanceof OrchestrationDomainError) {
    const statusCode = mapOrchestrationErrorCodeToStatus(err.code);
    sendError(res, statusCode, err.code, err.message, undefined, {}, requestId);
    return;
  }

  // 6. Quality Domain Errors
  if (err instanceof QualityDomainError) {
    const statusCode = mapQualityErrorCodeToStatus(err.code);
    sendError(res, statusCode, err.code, err.message, undefined, {}, requestId);
    return;
  }

  // 7. Incentive Domain Errors
  if (err instanceof IncentiveDomainError) {
    const statusCode = mapIncentiveErrorCodeToStatus(err.code);
    sendError(res, statusCode, err.code, err.message, undefined, {}, requestId);
    return;
  }

  // 8. Commercial (Clients/Orders/Employees) Domain Errors
  if (err instanceof CommercialDomainError) {
    const statusCode = mapCommercialErrorCodeToStatus(err.code);
    sendError(res, statusCode, err.code, err.message, undefined, {}, requestId);
    return;
  }

  // 9. Payroll Domain Errors
  if (err instanceof PayrollDomainError) {
    const statusCode = mapPayrollErrorCodeToStatus(err.code);
    sendError(res, statusCode, err.code, err.message, undefined, {}, requestId);
    return;
  }

  // 10. Report Domain Errors
  if (err instanceof ReportDomainError) {
    const statusCode = mapReportErrorCodeToStatus(err.code);
    sendError(res, statusCode, err.code, err.message, undefined, {}, requestId);
    return;
  }

  // 11. Generic / Unexpected Internal Errors
  // Never leak internal database query or stack trace to client. Still log
  // server-side (with the correlation ID) so failures are never silently
  // swallowed.
  console.error(`[UNHANDLED_ERROR] requestId=${requestId ?? "unknown"}`, err);
  const fallbackMessage = "An unexpected internal server error occurred.";
  sendError(res, 500, "INTERNAL_SERVER_ERROR", fallbackMessage, undefined, {}, requestId);
}

function mapInventoryErrorCodeToStatus(code: string): number {
  switch (code) {
    case "BATCH_NOT_FOUND":
    case "SOURCE_LOCATION_NOT_FOUND":
    case "DESTINATION_LOCATION_NOT_FOUND":
    case "TASK_NOT_FOUND":
      return 404;
    case "IDEMPOTENT_RETRY_MISMATCH":
      return 409;
    case "INVALID_QUANTITY":
    case "INSUFFICIENT_STOCK":
    case "MISSING_SOURCE_BALANCE":
    case "SAME_LOCATION_UNSUPPORTED":
    case "INVALID_LOCATIONS":
    case "VALIDATION_FAILED":
    default:
      return 400;
  }
}

function mapTaskErrorCodeToStatus(code: string): number {
  switch (code) {
    case "TASK_NOT_FOUND":
    case "EMPLOYEE_NOT_FOUND":
    case "ASSIGNMENT_NOT_FOUND":
      return 404;
    case "UNAUTHORIZED_ACTOR":
      return 403;
    case "INVALID_TASK_STATE":
    case "UNSUPPORTED_TRANSITION":
    case "DUPLICATE_ACTIVE_ASSIGNMENT":
      return 409;
    case "INVALID_QUANTITY":
    case "VALIDATION_FAILED":
    default:
      return 400;
  }
}

function mapOrchestrationErrorCodeToStatus(code: string): number {
  switch (code) {
    case "TASK_NOT_FOUND":
    case "ORDER_NOT_FOUND":
    case "ORDER_ITEM_NOT_FOUND":
      return 404;
    case "UNAUTHORIZED_ACTOR":
      return 403;
    case "INVALID_TASK_STATE":
    case "INVALID_ORDER_LINKAGE":
    case "COORDINATION_FAILED":
      return 409;
    case "VALIDATION_FAILED":
    default:
      return 400;
  }
}

function mapQualityErrorCodeToStatus(code: string): number {
  switch (code) {
    case "TASK_NOT_FOUND":
    case "QUALITY_RECORD_NOT_FOUND":
    case "PHOTO_NOT_FOUND":
    case "EMPLOYEE_NOT_FOUND":
      return 404;
    case "UNAUTHORIZED_ACTOR":
      return 403;
    case "INVALID_DAMAGE_RATE":
    case "INVALID_QUALITY_SCORE":
    case "INVALID_TASK_ACCURACY":
    case "INVALID_PHOTO_LAYER":
    case "INVALID_BOX_QUANTITY":
    case "INVALID_STORAGE_KEY":
    case "VALIDATION_FAILED":
    default:
      return 400;
  }
}

function mapIncentiveErrorCodeToStatus(code: string): number {
  switch (code) {
    case "KOT_NOT_FOUND":
    case "TASK_NOT_FOUND":
    case "EMPLOYEE_NOT_FOUND":
    case "RULE_NOT_FOUND":
      return 404;
    case "UNAUTHORIZED_ACTOR":
      return 403;
    case "DUPLICATE_MONTHLY_KOT":
    case "TASK_NOT_COMPLETED":
    case "QUALITY_GATE_FAILED":
    case "NO_PARTICIPATING_EMPLOYEES":
    case "UNRESOLVED_REMAINDER":
    case "ALREADY_APPROVED":
    case "IDEMPOTENT_RETRY_MISMATCH":
      return 409;
    case "INVALID_KOT_VALUE":
    case "INVALID_PENALTY_AMOUNT":
    case "INVALID_INCENTIVE_AMOUNT":
    case "VALIDATION_FAILED":
    default:
      return 400;
  }
}

function mapCommercialErrorCodeToStatus(code: string): number {
  switch (code) {
    case "CLIENT_NOT_FOUND":
    case "ORDER_NOT_FOUND":
    case "EMPLOYEE_NOT_FOUND":
    case "SHIFT_NOT_FOUND":
      return 404;
    case "DUPLICATE_ACCOUNT_CODE":
    case "DUPLICATE_ORDER_CODE":
    case "DUPLICATE_EMPLOYEE_CODE":
    case "INVALID_STATUS_TRANSITION":
    case "ORDER_NOT_CANCELLABLE":
      return 409;
    case "VALIDATION_FAILED":
    default:
      return 400;
  }
}

function mapPayrollErrorCodeToStatus(code: string): number {
  switch (code) {
    case "INCENTIVE_NOT_FOUND":
    case "PAYROLL_ENTRY_NOT_FOUND":
      return 404;
    case "UNAUTHORIZED_ACTOR":
      return 403;
    case "INCENTIVE_NOT_APPROVED":
    case "DUPLICATE_PAYROLL_ENTRY":
    case "APPROVAL_ALREADY_DECIDED":
      return 409;
    case "VALIDATION_FAILED":
    default:
      return 400;
  }
}

function mapReportErrorCodeToStatus(code: string): number {
  switch (code) {
    case "REPORT_DEFINITION_NOT_FOUND":
    case "REPORT_EXECUTION_NOT_FOUND":
      return 404;
    case "UNSUPPORTED_EXPORT_FORMAT":
      return 400;
    case "VALIDATION_FAILED":
    default:
      return 400;
  }
}
