import type { IncomingMessage, ServerResponse } from "node:http";
import type { PageMeta, SessionCookieOptions } from "@royal-packaging/contracts";
import { buildPageMeta } from "@royal-packaging/contracts";

const MAX_BODY_SIZE_BYTES = 1024 * 1024; // 1 MB limit

/** A single field-level error entry in the canonical error envelope. */
export interface CanonicalErrorField {
  readonly field?: string;
  readonly code?: string;
  readonly message: string;
}

/**
 * Safely parses cookie header string into key-value pairs.
 */
export function parseCookies(cookieHeader?: string | null): Record<string, string> {
  if (!cookieHeader || typeof cookieHeader !== "string") {
    return {};
  }

  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(";");

  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(val);
    }
  }

  return cookies;
}

/**
 * Reads and parses JSON body from an IncomingMessage stream.
 */
export async function parseJsonBody<T = unknown>(
  req: IncomingMessage,
  maxBytes: number = MAX_BODY_SIZE_BYTES
): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = "";
    let receivedBytes = 0;

    req.setEncoding("utf8");

    req.on("data", (chunk: string) => {
      receivedBytes += Buffer.byteLength(chunk, "utf8");
      if (receivedBytes > maxBytes) {
        req.destroy();
        reject(new Error(`Payload too large. Maximum size is ${maxBytes} bytes.`));
        return;
      }
      raw += chunk;
    });

    req.on("end", () => {
      if (!raw || raw.trim() === "") {
        resolve({} as T);
        return;
      }
      try {
        const parsed = JSON.parse(raw) as T;
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Invalid JSON in request body: ${err instanceof Error ? err.message : String(err)}`));
      }
    });

    req.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Custom JSON serializer that handles BigInt, Date, and Map/Set objects cleanly.
 */
export function serializeJson(data: unknown): string {
  return JSON.stringify(data, (_key, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  });
}

/**
 * Sends a structured JSON success response.
 */
export function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: unknown,
  headers: Record<string, string> = {}
): void {
  const json = serializeJson(data);
  const responseHeaders: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json, "utf8").toString(),
    ...headers
  };

  res.writeHead(statusCode, responseHeaders);
  res.end(json);
}

/**
 * Sends a structured JSON error response.
 *
 * Assumption #1 (docs/integration/backend-frontend-reconciliation.md): the
 * canonical envelope is flattened (`success`, `code`, `message`, `errors?`,
 * `meta?`, `requestId?`) to match the frontend contract, but the original
 * nested `error: { code, message, details }` shape is kept alongside it,
 * additively, so pre-existing callers/tests reading `body.error.code` keep
 * working unchanged.
 *
 * `errorsOrMeta` accepts either an array of field-level errors (mapped to
 * the canonical `errors` array) or a plain object (mapped to `meta`), to
 * stay compatible with existing call sites that pass free-form `details`.
 */
export function sendError(
  res: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  errorsOrMeta?: readonly CanonicalErrorField[] | Record<string, unknown> | unknown,
  headers: Record<string, string> = {},
  requestId?: string | null
): void {
  const isErrorsArray = Array.isArray(errorsOrMeta);
  const errors = isErrorsArray ? (errorsOrMeta as readonly CanonicalErrorField[]) : undefined;
  const meta =
    !isErrorsArray && errorsOrMeta !== undefined && errorsOrMeta !== null
      ? (errorsOrMeta as Record<string, unknown>)
      : undefined;

  const payload = {
    success: false as const,
    code,
    message,
    ...(errors !== undefined ? { errors } : {}),
    ...(meta !== undefined ? { meta } : {}),
    ...(requestId ? { requestId } : {}),
    // Backward-compat nested shape - see Assumption #1.
    error: {
      code,
      message,
      ...(errorsOrMeta !== undefined ? { details: errorsOrMeta } : {})
    }
  };

  sendJson(res, statusCode, payload, headers);
}

/**
 * Converts a snake_case string to camelCase. Leaves already-camel strings unchanged.
 */
export function snakeToCamel(input: string): string {
  return input.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

/**
 * Recursively adds camelCase mirror keys alongside existing snake_case keys.
 *
 * This is purely additive: existing snake_case keys are never renamed or
 * removed, arrays are mapped element-wise, and Date/bigint/null values pass
 * through unchanged (they are not plain objects to recurse into).
 */
export function withCamelCaseMirror<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => withCamelCaseMirror(item)) as unknown as T;
  }

  if (value instanceof Date || typeof value === "bigint") {
    return value;
  }

  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(source)) {
      const mirroredVal = withCamelCaseMirror(val);
      result[key] = mirroredVal;

      const camelKey = snakeToCamel(key);
      if (camelKey !== key && !(camelKey in source)) {
        result[camelKey] = mirroredVal;
      }
    }

    return result as unknown as T;
  }

  return value;
}

export interface PaginationParams {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

export class InvalidPaginationError extends Error {
  public readonly details: readonly CanonicalErrorField[];

  public constructor(details: readonly CanonicalErrorField[]) {
    super(details[0]?.message ?? "Invalid pagination parameters.");
    this.name = "InvalidPaginationError";
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Parses `page`/`pageSize` query parameters into normalized pagination
 * parameters. Defaults to page=1, pageSize=25, capped at 200.
 */
export function parsePagination(query: URLSearchParams): PaginationParams {
  const pageValue = query.get("page");
  const pageSizeValue = query.get("pageSize") ?? query.get("page_size");
  const rawPage = Number.parseInt(pageValue ?? "1", 10);
  const rawPageSize = Number.parseInt(pageSizeValue ?? String(DEFAULT_PAGE_SIZE), 10);
  const errors: CanonicalErrorField[] = [];

  if (pageValue !== null && (!/^\d+$/.test(pageValue) || rawPage < 1)) {
    errors.push({ field: "page", code: "invalid", message: "page must be a positive integer." });
  }

  if (pageSizeValue !== null && (!/^\d+$/.test(pageSizeValue) || rawPageSize < 1)) {
    errors.push({ field: "pageSize", code: "invalid", message: "pageSize must be a positive integer." });
  }

  if (errors.length > 0) {
    throw new InvalidPaginationError(errors);
  }

  const page = rawPage;
  const pageSizeCandidate = rawPageSize;
  const pageSize = Math.min(pageSizeCandidate, MAX_PAGE_SIZE);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

/**
 * Sends a paginated list success response with canonical page metadata.
 */
export function sendList<T>(
  res: ServerResponse,
  items: readonly T[],
  pagination: Pick<PaginationParams, "page" | "pageSize">,
  total: number
): void {
  const meta: PageMeta = buildPageMeta(pagination.page, pagination.pageSize, total);
  sendJson(res, 200, {
    success: true,
    data: items,
    meta
  });
}

export function pageItems<T>(items: readonly T[], pagination: PaginationParams): readonly T[] {
  return items.slice(pagination.offset, pagination.offset + pagination.pageSize);
}

export function sortDirection(
  query: URLSearchParams,
  defaultDirection: "asc" | "desc" = "desc"
): "asc" | "desc" {
  const dir = query.get("sortDirection") ?? query.get("sort_direction");
  if (dir === "asc") return "asc";
  if (dir === "desc") return "desc";
  return defaultDirection;
}

export function sortByKey<T>(
  items: readonly T[],
  key: keyof T | undefined,
  direction: "asc" | "desc"
): T[] {
  if (!key) {
    return [...items];
  }

  return [...items].sort((a, b) => {
    const left = sortableValue(a[key]);
    const right = sortableValue(b[key]);
    const comparison = left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
    return direction === "asc" ? comparison : -comparison;
  });
}

function sortableValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return String(value);
}

/**
 * Generates a Set-Cookie header string from SessionCookieOptions.
 */
export function formatSetCookie(cookie: SessionCookieOptions): string {
  const parts: string[] = [
    `${cookie.name}=${encodeURIComponent(cookie.value)}`,
    `Path=${cookie.path}`,
    `SameSite=${cookie.sameSite.charAt(0).toUpperCase() + cookie.sameSite.slice(1)}`
  ];

  if (cookie.httpOnly) {
    parts.push("HttpOnly");
  }

  if (cookie.secure) {
    parts.push("Secure");
  }

  if (cookie.expires) {
    parts.push(`Expires=${cookie.expires.toUTCString()}`);
  }

  if (typeof cookie.maxAge === "number") {
    parts.push(`Max-Age=${cookie.maxAge}`);
  }

  return parts.join("; ");
}

/**
 * Generates a Set-Cookie header to clear/expire a session cookie.
 */
export function formatClearCookie(
  name: string,
  isProduction: boolean = false,
  path: string = "/"
): string {
  const parts: string[] = [
    `${name}=`,
    `Path=${path}`,
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax"
  ];

  if (isProduction) {
    parts.push("Secure");
  }

  return parts.join("; ");
}
