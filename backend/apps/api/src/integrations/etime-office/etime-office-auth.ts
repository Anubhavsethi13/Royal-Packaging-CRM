/**
 * e-Time Office Basic authentication (API Documentation.pdf, "Authentication"):
 * Base64(UTF-8 of `Corporateid:Username:Password:True`) sent as `Authorization: Basic <value>`.
 *
 * The documentation writes the flag as `True` in the format and `true` in its example;
 * `true` is used (as in the example) — PROVIDER CONFIRMATION REQUIRED. Its sample Base64
 * value does not decode to its sample credentials, so it is not used as a test oracle.
 *
 * Base64 is an encoding, not encryption: HTTPS protects these credentials in transit.
 * Never log the raw string, the encoded value or the header.
 */
export interface EtimeOfficeCredentials {
  readonly corporateId: string;
  readonly username: string;
  readonly password: string;
}

export const ETIME_AUTH_FLAG = "true";

export function encodeEtimeOfficeCredentials(credentials: EtimeOfficeCredentials): string {
  const raw = `${credentials.corporateId}:${credentials.username}:${credentials.password}:${ETIME_AUTH_FLAG}`;
  return Buffer.from(raw, "utf8").toString("base64");
}

export function buildEtimeOfficeHeaders(credentials: EtimeOfficeCredentials): Record<string, string> {
  return {
    Authorization: `Basic ${encodeEtimeOfficeCredentials(credentials)}`,
    "Content-Type": "application/json",
  };
}
