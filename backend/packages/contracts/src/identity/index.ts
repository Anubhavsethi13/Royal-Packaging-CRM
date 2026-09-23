import { z } from "zod";

export const loginRequestSchema = z.object({
  login_identifier: z.string().trim().min(1, "Login identifier is required"),
  password: z.string().min(1, "Password is required")
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * Frontend-facing login request shape ({email, password}). The backend's
 * native identifier column is `login_identifier` (it may hold an email,
 * username, or employee code - see auth-service.ts), so the frontend's
 * `email` field is mapped 1:1 onto `login_identifier` (Assumption: the
 * reconciliation doc records this as a naming mismatch, not a semantic
 * change - any string accepted by `login_identifier` today is still
 * accepted through this schema).
 */
export const frontendLoginRequestSchema = z.object({
  email: z.string().trim().min(1, "Email is required"),
  password: z.string().min(1, "Password is required")
});

export type FrontendLoginRequest = z.infer<typeof frontendLoginRequestSchema>;

export interface AuthenticatedUser {
  readonly id: string;
  readonly login_identifier: string;
  readonly is_active: boolean;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface SessionState {
  readonly id: string;
  readonly user_id: string;
  readonly expires_at: Date;
  readonly created_at: Date;
}

export interface SessionCookieOptions {
  readonly name: string;
  readonly value: string;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: "lax" | "strict" | "none";
  readonly path: string;
  readonly expires: Date;
  readonly maxAge: number;
}

export type LoginResult =
  | {
      readonly success: true;
      readonly user: AuthenticatedUser;
      readonly session: SessionState;
      readonly sessionToken: string;
      readonly cookie: SessionCookieOptions;
    }
  | {
      readonly success: false;
      readonly reason: "INVALID_CREDENTIALS" | "ACCOUNT_LOCKED" | "ACCOUNT_INACTIVE";
      readonly message: string;
      readonly lockoutUntil?: Date;
    };

export interface AccessRoleSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly active: boolean;
}

export interface AccessPermissionSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
}

export interface EffectiveAuthorization {
  readonly userId: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

/**
 * Highest-authority-first role precedence used to derive a single
 * "display role" for the frontend when a user holds multiple roles
 * (Assumption: reconciliation doc - the frontend expects one role string,
 * the backend's RBAC model supports many; the highest-authority role wins).
 */
export const ROLE_AUTHORITY_PRECEDENCE = [
  "SUPER_ADMIN",
  "MAIN_ADMIN",
  "ADMIN",
  "MANAGER",
  "SUPERVISOR",
  "EMPLOYEE"
] as const;

export type RoleAuthorityTier = (typeof ROLE_AUTHORITY_PRECEDENCE)[number];

/** Returns the highest-authority role code held by the user, or null if none match a known tier. */
export function deriveDisplayRole(roles: readonly string[]): string | null {
  const upperRoles = new Set(roles.map((role) => role.toUpperCase()));
  for (const tier of ROLE_AUTHORITY_PRECEDENCE) {
    if (upperRoles.has(tier)) {
      return tier;
    }
  }
  return null;
}

/**
 * Frontend-facing enriched user DTO. `scopes` is always an empty array
 * (Assumption: reconciliation doc - depot/location scope-assignment for
 * RBAC scopes is not implemented; authorization remains fully enforced
 * server-side by role, this field is a documented placeholder for a future
 * per-depot scoping feature).
 */
export interface FrontendUserDTO {
  readonly id: string;
  readonly email: string;
  readonly role: string | null;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly scopes: readonly string[];
}

export interface FrontendSessionDTO {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: string;
}

/** Builds the frontend-facing enriched user DTO from native identity + RBAC data. */
export function toFrontendUserDTO(
  user: AuthenticatedUser,
  roles: readonly string[],
  permissions: readonly string[]
): FrontendUserDTO {
  return {
    id: user.id,
    email: user.login_identifier,
    role: deriveDisplayRole(roles),
    roles,
    permissions,
    scopes: []
  };
}
