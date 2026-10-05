/**
 * Classified e-Time Office failures. Messages never contain credentials, the raw
 * authentication string, its Base64 form, or the Authorization header.
 */
export type EtimeOfficeErrorCode =
  | "NOT_CONFIGURED"
  | "INVALID_REQUEST"
  | "AUTHENTICATION_FAILED"
  | "RESOURCE_NOT_FOUND"
  | "PROVIDER_SERVER_ERROR"
  | "UNEXPECTED_STATUS"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "PROVIDER_ERROR";

/** Transient failures are retried with exponential backoff; everything else is not. */
const RETRYABLE: ReadonlySet<EtimeOfficeErrorCode> = new Set(["PROVIDER_SERVER_ERROR", "TIMEOUT", "NETWORK_ERROR"]);

export class EtimeOfficeError extends Error {
  public readonly code: EtimeOfficeErrorCode;
  public readonly httpStatus: number | null;
  public readonly endpoint: string;

  public constructor(code: EtimeOfficeErrorCode, endpoint: string, message: string, httpStatus: number | null = null) {
    super(message);
    this.name = "EtimeOfficeError";
    this.code = code;
    this.endpoint = endpoint;
    this.httpStatus = httpStatus;
  }

  public get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}

/** Maps a documented (or undocumented) HTTP status to a classified error. */
export function errorForStatus(endpoint: string, status: number): EtimeOfficeError {
  switch (status) {
    case 400:
      return new EtimeOfficeError("INVALID_REQUEST", endpoint, `${endpoint}: provider rejected the request parameters (HTTP 400).`, status);
    case 401:
      return new EtimeOfficeError("AUTHENTICATION_FAILED", endpoint, `${endpoint}: provider rejected the credentials (HTTP 401). Check the ETIME_* configuration.`, status);
    case 404:
      return new EtimeOfficeError("RESOURCE_NOT_FOUND", endpoint, `${endpoint}: endpoint or resource not found (HTTP 404). Check ETIME_BASE_URL.`, status);
    default:
      if (status >= 500) {
        return new EtimeOfficeError("PROVIDER_SERVER_ERROR", endpoint, `${endpoint}: provider server error (HTTP ${status}).`, status);
      }
      return new EtimeOfficeError("UNEXPECTED_STATUS", endpoint, `${endpoint}: undocumented HTTP status ${status}.`, status);
  }
}
