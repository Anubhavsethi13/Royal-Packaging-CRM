import type { z } from "zod";

import { buildEtimeOfficeHeaders, type EtimeOfficeCredentials } from "./etime-office-auth.js";
import { formatProviderDate, isProviderDate, isProviderDateTime, type InOutDateFormat } from "./etime-office-dates.js";
import { errorForStatus, EtimeOfficeError } from "./etime-office-errors.js";
import {
  downloadInOutPunchDataResponseSchema,
  downloadLastPunchDataResponseSchema,
  downloadPunchDataMcidResponseSchema,
  downloadPunchDataResponseSchema,
  lastRecordSchema,
  type DownloadInOutPunchDataResponse,
  type DownloadLastPunchDataResponse,
  type DownloadPunchDataMcidResponse,
  type DownloadPunchDataResponse
} from "./etime-office-schemas.js";

export const ETIME_ENDPOINTS = {
  punchData: "DownloadPunchData",
  punchDataMcid: "DownloadPunchDataMCID",
  inOutPunchData: "DownloadInOutPunchData",
  lastPunchData: "DownloadLastPunchData"
} as const;

export type EtimeOfficeEndpoint = (typeof ETIME_ENDPOINTS)[keyof typeof ETIME_ENDPOINTS];

/** Exponential backoff for transient failures (HTTP 5xx, timeout, network): 2s, 4s, 8s, 16s. */
export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [2_000, 4_000, 8_000, 16_000];

export interface EtimeOfficeClientOptions {
  readonly baseUrl: string;
  readonly credentials: EtimeOfficeCredentials;
  readonly timeoutMs: number;
  readonly inOutDateFormat?: InOutDateFormat;
  readonly retryDelaysMs?: readonly number[];
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Safe operational log (endpoint, status, attempt); never receives credentials or headers. */
  readonly log?: (message: string) => void;
}

export interface PunchRangeQuery {
  /** Employee code, or `ALL`. */
  readonly empcode: string;
  /** `dd/MM/yyyy_HH:mm`. */
  readonly fromDate: string;
  /** `dd/MM/yyyy_HH:mm`. */
  readonly toDate: string;
}

export interface InOutRangeQuery {
  readonly empcode: string;
  /** `dd/MM/yyyy` or `dd/MM/yyyy_HH:mm`, per `inOutDateFormat`. */
  readonly fromDate: string;
  readonly toDate: string;
}

/**
 * Query values are percent-encoded except `/`, `:` and `$`, which are valid in a query
 * component (RFC 3986) and appear unencoded in every documented example request.
 */
export function encodeQueryValue(value: string): string {
  return encodeURIComponent(value).replace(/%2F/gi, "/").replace(/%3A/gi, ":").replace(/%24/g, "$");
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Read-only e-Time Office client: the four documented GET endpoints. There is no
 * write-back, webhook or event API in the provider documentation, so none exists here.
 */
export class EtimeOfficeClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly inOutDateFormat: InOutDateFormat;
  private readonly retryDelaysMs: readonly number[];
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly log: (message: string) => void;

  public constructor(options: EtimeOfficeClientOptions) {
    const base = new URL(options.baseUrl);
    if (base.protocol !== "https:") {
      throw new EtimeOfficeError("NOT_CONFIGURED", "client", "e-Time Office base URL must use https.");
    }
    this.baseUrl = base.href.endsWith("/") ? base.href : `${base.href}/`;
    this.headers = buildEtimeOfficeHeaders(options.credentials);
    this.timeoutMs = options.timeoutMs;
    this.inOutDateFormat = options.inOutDateFormat ?? "date";
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.log = options.log ?? ((message) => console.log(message));
  }

  /** API 1 — raw punches without IN/OUT flag. */
  public async downloadPunchData(query: PunchRangeQuery): Promise<DownloadPunchDataResponse> {
    this.assertRange(ETIME_ENDPOINTS.punchData, query, isProviderDateTime, "dd/MM/yyyy_HH:mm");
    return this.request(ETIME_ENDPOINTS.punchData, { Empcode: query.empcode, FromDate: query.fromDate, ToDate: query.toDate }, downloadPunchDataResponseSchema);
  }

  /** API 2 — raw punches with machine ID (MCID). */
  public async downloadPunchDataMCID(query: PunchRangeQuery): Promise<DownloadPunchDataMcidResponse> {
    this.assertRange(ETIME_ENDPOINTS.punchDataMcid, query, isProviderDateTime, "dd/MM/yyyy_HH:mm");
    const response = await this.request(ETIME_ENDPOINTS.punchDataMcid, { Empcode: query.empcode, FromDate: query.fromDate, ToDate: query.toDate }, downloadPunchDataMcidResponseSchema);
    return this.assertNoProviderError(ETIME_ENDPOINTS.punchDataMcid, response);
  }

  /** API 3 — IN/OUT attendance. Date format per `inOutDateFormat` (PROVIDER CONFIRMATION REQUIRED). */
  public async downloadInOutPunchData(query: InOutRangeQuery): Promise<DownloadInOutPunchDataResponse> {
    if (this.inOutDateFormat === "date") {
      this.assertRange(ETIME_ENDPOINTS.inOutPunchData, query, isProviderDate, "dd/MM/yyyy");
    } else {
      this.assertRange(ETIME_ENDPOINTS.inOutPunchData, query, isProviderDateTime, "dd/MM/yyyy_HH:mm");
    }
    const response = await this.request(ETIME_ENDPOINTS.inOutPunchData, { Empcode: query.empcode, FromDate: query.fromDate, ToDate: query.toDate }, downloadInOutPunchDataResponseSchema);
    return this.assertNoProviderError(ETIME_ENDPOINTS.inOutPunchData, response);
  }

  /** The date-only format this client sends for DownloadInOutPunchData. */
  public formatInOutDate(parts: { year: number; month: number; day: number }, endOfDay: boolean): string {
    const date = formatProviderDate(parts);
    if (this.inOutDateFormat === "date") return date;
    return `${date}_${endOfDay ? "23:59" : "00:00"}`;
  }

  /** API 4 — punches after `lastRecord` (`MMyyyy$ID`); returns the next checkpoint in `MaxRecord`. */
  public async downloadLastPunchData(query: { empcode: string; lastRecord: string }): Promise<DownloadLastPunchDataResponse> {
    this.assertEmpcode(ETIME_ENDPOINTS.lastPunchData, query.empcode);
    if (!lastRecordSchema.safeParse(query.lastRecord).success) {
      throw new EtimeOfficeError("INVALID_REQUEST", ETIME_ENDPOINTS.lastPunchData, `${ETIME_ENDPOINTS.lastPunchData}: LastRecord must use the MMyyyy$ID format.`);
    }
    const response = await this.request(ETIME_ENDPOINTS.lastPunchData, { Empcode: query.empcode, LastRecord: query.lastRecord }, downloadLastPunchDataResponseSchema);
    return this.assertNoProviderError(ETIME_ENDPOINTS.lastPunchData, response);
  }

  private assertEmpcode(endpoint: string, empcode: string): void {
    if (typeof empcode !== "string" || empcode.trim() === "") {
      throw new EtimeOfficeError("INVALID_REQUEST", endpoint, `${endpoint}: Empcode is required (an employee code or ALL).`);
    }
  }

  private assertRange(endpoint: string, query: { empcode: string; fromDate: string; toDate: string }, valid: (value: string) => boolean, format: string): void {
    this.assertEmpcode(endpoint, query.empcode);
    for (const [name, value] of [["FromDate", query.fromDate], ["ToDate", query.toDate]] as const) {
      if (!valid(value)) {
        throw new EtimeOfficeError("INVALID_REQUEST", endpoint, `${endpoint}: ${name} must use ${format}.`);
      }
    }
  }

  private assertNoProviderError<T extends { Error: boolean; Msg?: string | null | undefined }>(endpoint: string, response: T): T {
    if (response.Error) {
      const message = (response.Msg ?? "").slice(0, 200) || "no message";
      throw new EtimeOfficeError("PROVIDER_ERROR", endpoint, `${endpoint}: provider reported an error (${message}).`, 200);
    }
    return response;
  }

  private buildUrl(endpoint: string, params: Record<string, string>): string {
    const query = Object.entries(params).map(([key, value]) => `${key}=${encodeQueryValue(value)}`).join("&");
    return `${this.baseUrl}${endpoint}?${query}`;
  }

  private async request<S extends z.ZodType>(endpoint: string, params: Record<string, string>, schema: S): Promise<z.infer<S>> {
    const url = this.buildUrl(endpoint, params);
    let attempt = 0;
    for (;;) {
      try {
        return await this.attempt(endpoint, url, schema);
      } catch (error) {
        const failure = error instanceof EtimeOfficeError ? error : new EtimeOfficeError("NETWORK_ERROR", endpoint, `${endpoint}: request failed.`);
        const delay = this.retryDelaysMs[attempt];
        if (!failure.retryable || delay === undefined) {
          this.log(`[ERROR] e-Time Office ${endpoint} failed: ${failure.code}${failure.httpStatus ? ` (HTTP ${failure.httpStatus})` : ""} after ${attempt + 1} attempt(s).`);
          throw failure;
        }
        attempt += 1;
        this.log(`[WARN] e-Time Office ${endpoint} ${failure.code}; retry ${attempt}/${this.retryDelaysMs.length} in ${delay} ms.`);
        await this.sleep(delay);
      }
    }
  }

  private async attempt<S extends z.ZodType>(endpoint: string, url: string, schema: S): Promise<z.infer<S>> {
    // A finite deadline for the whole exchange (headers and body). A referenced timer is used
    // so the deadline fires even when nothing else keeps the event loop alive.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException(`Timed out after ${this.timeoutMs} ms`, "TimeoutError")), this.timeoutMs);
    try {
      return await this.exchange(endpoint, url, schema, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  private async exchange<S extends z.ZodType>(endpoint: string, url: string, schema: S, signal: AbortSignal): Promise<z.infer<S>> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, { method: "GET", headers: this.headers, signal });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new EtimeOfficeError("TIMEOUT", endpoint, `${endpoint}: no response within ${this.timeoutMs} ms.`);
      }
      throw new EtimeOfficeError("NETWORK_ERROR", endpoint, `${endpoint}: network error.`);
    }

    if (response.status !== 200) {
      throw errorForStatus(endpoint, response.status);
    }

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new EtimeOfficeError("TIMEOUT", endpoint, `${endpoint}: response body not received within ${this.timeoutMs} ms.`);
      }
      throw new EtimeOfficeError("NETWORK_ERROR", endpoint, `${endpoint}: response body could not be read.`);
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new EtimeOfficeError("INVALID_RESPONSE", endpoint, `${endpoint}: response body is not valid JSON.`, 200);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const where = parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ");
      throw new EtimeOfficeError("INVALID_RESPONSE", endpoint, `${endpoint}: response does not match the documented shape (${where}).`, 200);
    }
    return parsed.data;
  }
}
