import crypto from "node:crypto";
import type { ApplicationConfig } from "@royal-packaging/config";
import type {
  AuthenticatedUser,
  LoginRequest,
  LoginResult,
  SessionState
} from "@royal-packaging/contracts";
import { loginRequestSchema } from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";

import { verifyPassword } from "./password.js";
import {
  createSessionCookie,
  DEFAULT_SESSION_TTL_HOURS,
  generateSessionToken,
  hashSessionToken
} from "./session.js";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_MINUTES = 15;
export const LOCKOUT_DURATION_MINUTES = 15;

// Dummy hash to prevent timing attacks when user is not found
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export interface AuthServiceConfig {
  readonly database: DatabaseConnection;
  readonly appConfig?: Pick<ApplicationConfig, "NODE_ENV">;
  readonly sessionTtlHours?: number;
}

export class AuthService {
  private readonly database: DatabaseConnection;
  private readonly isProduction: boolean;
  private readonly sessionTtlHours: number;

  public constructor(config: AuthServiceConfig) {
    this.database = config.database;
    this.isProduction = config.appConfig?.NODE_ENV === "production";
    this.sessionTtlHours = config.sessionTtlHours ?? DEFAULT_SESSION_TTL_HOURS;
  }

  /**
   * Authenticates a user by login identifier and password with rate limiting/lockout protection.
   */
  public async login(
    input: LoginRequest,
    context?: { correlationId?: string; now?: Date }
  ): Promise<LoginResult> {
    const parseResult = loginRequestSchema.safeParse(input);
    if (!parseResult.success) {
      return {
        success: false,
        reason: "INVALID_CREDENTIALS",
        message: "Invalid login identifier or password"
      };
    }

    const { login_identifier, password } = parseResult.data;
    const now = context?.now ?? new Date();
    const correlationId = context?.correlationId ?? null;

    return this.database.transaction().execute(async (trx) => {
      // 1. Check for an active lockout on this login identifier
      const activeLockout = await trx
        .selectFrom("login_attempts")
        .select(["lockout_until"])
        .where("login_identifier", "=", login_identifier)
        .where("lockout_until", ">", now)
        .orderBy("lockout_until", "desc")
        .limit(1)
        .executeTakeFirst();

      if (activeLockout?.lockout_until) {
        return {
          success: false,
          reason: "ACCOUNT_LOCKED",
          message: "Account is temporarily locked due to multiple failed login attempts. Please try again later.",
          lockoutUntil: activeLockout.lockout_until
        };
      }

      // 2. Count recent failures in the 15-minute window
      const windowStart = new Date(now.getTime() - LOCKOUT_WINDOW_MINUTES * 60 * 1000);
      const recentFailures = await trx
        .selectFrom("login_attempts")
        .select((eb) => eb.fn.count("id").as("failure_count"))
        .where("login_identifier", "=", login_identifier)
        .where("succeeded", "=", false)
        .where("attempted_at", ">=", windowStart)
        .executeTakeFirstOrThrow();

      const previousFailureCount = Number(recentFailures.failure_count ?? 0);

      // 3. Lookup user by login identifier
      const user = await trx
        .selectFrom("users")
        .select(["id", "login_identifier", "password_hash", "is_active", "created_at", "updated_at"])
        .where("login_identifier", "=", login_identifier)
        .executeTakeFirst();

      // Case A: User does not exist
      if (!user) {
        await verifyPassword(password, DUMMY_HASH);
        const newCount = previousFailureCount + 1;
        const willLockout = newCount >= MAX_FAILED_ATTEMPTS;
        const lockoutUntil = willLockout
          ? new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
          : null;

        await trx
          .insertInto("login_attempts")
          .values({
            id: crypto.randomUUID(),
            login_identifier,
            attempted_at: now,
            succeeded: false,
            user_id: null,
            lockout_until: lockoutUntil,
            correlation_id: correlationId,
            created_at: now
          })
          .execute();

        if (willLockout && lockoutUntil) {
          return {
            success: false,
            reason: "ACCOUNT_LOCKED",
            message: "Account is temporarily locked due to multiple failed login attempts. Please try again later.",
            lockoutUntil
          };
        }

        return {
          success: false,
          reason: "INVALID_CREDENTIALS",
          message: "Invalid login identifier or password"
        };
      }

      // Case B: User exists but is inactive
      if (!user.is_active) {
        await verifyPassword(password, DUMMY_HASH);
        const newCount = previousFailureCount + 1;
        const willLockout = newCount >= MAX_FAILED_ATTEMPTS;
        const lockoutUntil = willLockout
          ? new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
          : null;

        await trx
          .insertInto("login_attempts")
          .values({
            id: crypto.randomUUID(),
            login_identifier,
            attempted_at: now,
            succeeded: false,
            user_id: user.id,
            lockout_until: lockoutUntil,
            correlation_id: correlationId,
            created_at: now
          })
          .execute();

        return {
          success: false,
          reason: "ACCOUNT_INACTIVE",
          message: "Invalid login identifier or password"
        };
      }

      // Case C: User is active - verify password
      const passwordMatch = await verifyPassword(password, user.password_hash);

      if (!passwordMatch) {
        const newCount = previousFailureCount + 1;
        const willLockout = newCount >= MAX_FAILED_ATTEMPTS;
        const lockoutUntil = willLockout
          ? new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
          : null;

        await trx
          .insertInto("login_attempts")
          .values({
            id: crypto.randomUUID(),
            login_identifier,
            attempted_at: now,
            succeeded: false,
            user_id: user.id,
            lockout_until: lockoutUntil,
            correlation_id: correlationId,
            created_at: now
          })
          .execute();

        if (willLockout && lockoutUntil) {
          return {
            success: false,
            reason: "ACCOUNT_LOCKED",
            message: "Account is temporarily locked due to multiple failed login attempts. Please try again later.",
            lockoutUntil
          };
        }

        return {
          success: false,
          reason: "INVALID_CREDENTIALS",
          message: "Invalid login identifier or password"
        };
      }

      // Case D: Authentication succeeded
      await trx
        .insertInto("login_attempts")
        .values({
          id: crypto.randomUUID(),
          login_identifier,
          attempted_at: now,
          succeeded: true,
          user_id: user.id,
          lockout_until: null,
          correlation_id: correlationId,
          created_at: now
        })
        .execute();

      const sessionToken = generateSessionToken();
      const sessionTokenHash = hashSessionToken(sessionToken);
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(now.getTime() + this.sessionTtlHours * 60 * 60 * 1000);

      await trx
        .insertInto("sessions")
        .values({
          id: sessionId,
          user_id: user.id,
          session_token_hash: sessionTokenHash,
          created_at: now,
          expires_at: expiresAt,
          revoked_at: null,
          last_seen_at: now,
          version: "1"
        })
        .execute();

      const sanitizedUser: AuthenticatedUser = {
        id: user.id,
        login_identifier: user.login_identifier,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at
      };

      const sessionState: SessionState = {
        id: sessionId,
        user_id: user.id,
        expires_at: expiresAt,
        created_at: now
      };

      const cookieOptions = createSessionCookie(sessionToken, expiresAt, {
        isProduction: this.isProduction
      });

      return {
        success: true,
        user: sanitizedUser,
        session: sessionState,
        sessionToken,
        cookie: cookieOptions
      };
    });
  }

  /**
   * Validates a session token and returns the authenticated user without sensitive credentials.
   */
  public async validateSession(
    sessionToken: string,
    now: Date = new Date()
  ): Promise<AuthenticatedUser | null> {
    if (!sessionToken || sessionToken.trim() === "") {
      return null;
    }

    const tokenHash = hashSessionToken(sessionToken);

    const record = await this.database
      .selectFrom("sessions")
      .innerJoin("users", "users.id", "sessions.user_id")
      .select([
        "users.id as user_id",
        "users.login_identifier",
        "users.is_active",
        "users.created_at as user_created_at",
        "users.updated_at as user_updated_at",
        "sessions.id as session_id",
        "sessions.expires_at",
        "sessions.revoked_at"
      ])
      .where("sessions.session_token_hash", "=", tokenHash)
      .where("sessions.revoked_at", "is", null)
      .where("sessions.expires_at", ">", now)
      .where("users.is_active", "=", true)
      .executeTakeFirst();

    if (!record) {
      return null;
    }

    // Touch last_seen_at asynchronously / non-blocking
    await this.database
      .updateTable("sessions")
      .set({ last_seen_at: now })
      .where("id", "=", record.session_id)
      .execute();

    return {
      id: record.user_id,
      login_identifier: record.login_identifier,
      is_active: record.is_active,
      created_at: record.user_created_at,
      updated_at: record.user_updated_at
    };
  }

  /**
   * Revokes a session by session token (logout).
   */
  public async revokeSession(sessionToken: string, now: Date = new Date()): Promise<boolean> {
    if (!sessionToken || sessionToken.trim() === "") {
      return false;
    }

    const tokenHash = hashSessionToken(sessionToken);

    const result = await this.database
      .updateTable("sessions")
      .set({ revoked_at: now })
      .where("session_token_hash", "=", tokenHash)
      .where("revoked_at", "is", null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows ?? 0) > 0;
  }

  /**
   * Revokes all active sessions for a user.
   */
  public async revokeAllUserSessions(userId: string, now: Date = new Date()): Promise<number> {
    const result = await this.database
      .updateTable("sessions")
      .set({ revoked_at: now })
      .where("user_id", "=", userId)
      .where("revoked_at", "is", null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows ?? 0);
  }
}
