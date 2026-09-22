import crypto from "node:crypto";
import type { SessionCookieOptions } from "@royal-packaging/contracts";

export const DEFAULT_SESSION_COOKIE_NAME = "rp_session";
export const DEFAULT_SESSION_TTL_HOURS = 24;

/**
 * Generates a high-entropy, cryptographically secure random session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Computes a SHA-256 hash of a session token for secure database storage.
 * The raw session token is never stored in plaintext in the database.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface SessionCookieConfig {
  readonly cookieName?: string;
  readonly isProduction?: boolean;
  readonly ttlHours?: number;
}

/**
 * Builds HTTP-only, SameSite=Lax cookie options for session identifiers.
 */
export function createSessionCookie(
  sessionToken: string,
  expiresAt: Date,
  config: SessionCookieConfig = {}
): SessionCookieOptions {
  const name = config.cookieName ?? DEFAULT_SESSION_COOKIE_NAME;
  const isProduction = config.isProduction ?? false;
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

  return {
    name,
    value: sessionToken,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    maxAge
  };
}
