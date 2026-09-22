export interface ApiSuccessResponse<T = unknown> {
  readonly success: true;
  readonly data: T;
  readonly meta?: Record<string, unknown>;
}

export interface ApiErrorDetail {
  readonly path?: string | (string | number)[];
  readonly message: string;
  readonly code?: string;
}

/**
 * Canonical per-field error description used by the flattened envelope
 * (Assumption #1, docs/integration/backend-frontend-reconciliation.md).
 */
export interface ApiErrorField {
  readonly field?: string;
  readonly code?: string;
  readonly message: string;
}

/**
 * Canonical API error envelope (Assumption #1).
 *
 * The top-level `code`/`message`/`errors`/`meta`/`requestId` fields are the
 * canonical shape new frontend code should read. The nested `error` object
 * is retained, additively, for backward compatibility with callers/tests
 * written against the original nested envelope - it is never removed, only
 * mirrored alongside the flattened fields.
 */
export interface ApiErrorResponse {
  readonly success: false;
  readonly code: string;
  readonly message: string;
  readonly errors?: readonly ApiErrorField[];
  readonly meta?: Record<string, unknown>;
  readonly requestId?: string;
  /** @deprecated retained for backward compatibility; prefer the flattened fields above. */
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly details?: readonly ApiErrorDetail[];
  };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface HealthCheckResponse {
  readonly status: "ok" | "degraded" | "error";
  readonly timestamp: string;
  readonly uptimeSeconds: number;
  readonly database: {
    readonly ready: boolean;
  };
}

export interface PageMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

export interface ListResponse<T> {
  readonly success: true;
  readonly data: readonly T[];
  readonly meta: PageMeta;
}

/** Builds pagination metadata for a list response from a 1-based page/pageSize/total. */
export function buildPageMeta(page: number, pageSize: number, total: number): PageMeta {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1
  };
}
