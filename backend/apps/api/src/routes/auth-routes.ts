import type { LoginRequest } from "@royal-packaging/contracts";
import { frontendLoginRequestSchema, loginRequestSchema, toFrontendUserDTO } from "@royal-packaging/contracts";
import { requireAuth } from "../middleware/auth-middleware.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { RBACService } from "../modules/identity/rbac-service.js";
import { DEFAULT_SESSION_COOKIE_NAME } from "../modules/identity/session.js";
import type { ApiContext, Router } from "../router.js";
import {
  formatClearCookie,
  formatSetCookie,
  sendError,
  sendJson
} from "../utils/http-utils.js";

/**
 * Accepts either the frontend's {email, password} shape or the backend's
 * native {login_identifier, password} shape, trying the frontend schema
 * first. `email` maps 1:1 onto `login_identifier` (see
 * frontendLoginRequestSchema doc comment).
 */
export function normalizeLoginBody(body: unknown): LoginRequest | null {
  const frontendResult = frontendLoginRequestSchema.safeParse(body);
  if (frontendResult.success) {
    return { login_identifier: frontendResult.data.email, password: frontendResult.data.password };
  }

  const nativeResult = loginRequestSchema.safeParse(body);
  if (nativeResult.success) {
    return nativeResult.data;
  }

  return null;
}

/**
 * Builds the enriched frontend user DTO for a login/session response.
 * Failures here are swallowed to a null return with a server-side log:
 * RBAC/authorization is always still re-checked per-request by
 * `requireAuthorization` middleware regardless of this DTO, so a failure to
 * enrich must never break login itself.
 */
async function buildFrontendUser(
  rbacService: RBACService,
  user: { id: string; login_identifier: string; is_active: boolean; created_at: Date; updated_at: Date }
) {
  try {
    const [roles, permissions] = await Promise.all([
      rbacService.getUserRoles(user.id),
      rbacService.getUserEffectivePermissions(user.id)
    ]);
    return toFrontendUserDTO(user, roles, permissions);
  } catch (err) {
    console.error(`[AUTH] Failed to build frontend user DTO for user ${user.id}:`, err);
    return null;
  }
}

export function registerAuthRoutes(
  router: Router,
  authService: AuthService,
  options: { isProduction?: boolean; rbacService?: RBACService } = {}
): void {
  const isProduction = options.isProduction ?? false;
  const rbacService = options.rbacService;

  // POST /auth/login
  router.post("/auth/login", async (ctx: ApiContext) => {
    const normalized = normalizeLoginBody(ctx.body);
    if (!normalized) {
      sendError(ctx.res, 400, "VALIDATION_FAILED", "Invalid login identifier or password");
      return;
    }

    const loginResult = await authService.login(normalized, {
      correlationId: ctx.correlationId
    });

    if (!loginResult.success) {
      if (loginResult.reason === "ACCOUNT_LOCKED") {
        sendError(
          ctx.res,
          429,
          "ACCOUNT_LOCKED",
          loginResult.message,
          loginResult.lockoutUntil ? { lockoutUntil: loginResult.lockoutUntil.toISOString() } : undefined
        );
        return;
      }

      if (loginResult.reason === "ACCOUNT_INACTIVE") {
        sendError(ctx.res, 401, "ACCOUNT_INACTIVE", "Invalid login identifier or password");
        return;
      }

      // Generic authentication failure - never leak if identifier exists
      sendError(ctx.res, 401, "INVALID_CREDENTIALS", "Invalid login identifier or password");
      return;
    }

    // Set secure session cookie
    const setCookieHeader = formatSetCookie(loginResult.cookie);
    const frontendUser = rbacService ? await buildFrontendUser(rbacService, loginResult.user) : null;

    sendJson(
      ctx.res,
      200,
      {
        success: true,
        data: {
          user: { ...loginResult.user, ...frontendUser },
          session: {
            ...loginResult.session,
            expiresAt: loginResult.session.expires_at.toISOString()
          }
        }
      },
      { "Set-Cookie": setCookieHeader }
    );
  });

  // POST /auth/logout
  router.post("/auth/logout", requireAuth(authService), async (ctx: ApiContext) => {
    if (ctx.sessionToken) {
      await authService.revokeSession(ctx.sessionToken);
    }

    const clearCookieHeader = formatClearCookie(DEFAULT_SESSION_COOKIE_NAME, isProduction);
    sendJson(
      ctx.res,
      200,
      {
        success: true,
        data: {
          message: "Logged out successfully"
        }
      },
      { "Set-Cookie": clearCookieHeader }
    );
  });

  // GET /auth/session
  router.get("/auth/session", requireAuth(authService), async (ctx: ApiContext) => {
    const frontendUser = rbacService && ctx.user ? await buildFrontendUser(rbacService, ctx.user) : null;

    sendJson(ctx.res, 200, {
      success: true,
      data: {
        user: ctx.user ? { ...ctx.user, ...frontendUser } : null
      }
    });
  });
}
