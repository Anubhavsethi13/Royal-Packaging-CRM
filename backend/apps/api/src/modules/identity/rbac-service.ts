import crypto from "node:crypto";
import type { EffectiveAuthorization } from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";

export interface RBACServiceConfig {
  readonly database: DatabaseConnection;
}

/**
 * Server-side RBAC resolution service.
 * Derives effective roles and permissions exclusively from PostgreSQL.
 * Does NOT trust client-supplied roles, permissions, or scopes.
 */
export class RBACService {
  private readonly database: DatabaseConnection;

  public constructor(config: RBACServiceConfig) {
    this.database = config.database;
  }

  /**
   * Retrieves all active role codes assigned to the given user.
   */
  public async getUserRoles(userId: string): Promise<string[]> {
    if (!userId || userId.trim() === "") {
      return [];
    }

    const rows = await this.database
      .selectFrom("user_access_roles")
      .innerJoin("access_roles", "access_roles.id", "user_access_roles.role_id")
      .select("access_roles.code")
      .where("user_access_roles.user_id", "=", userId)
      .where("user_access_roles.revoked_at", "is", null)
      .where("access_roles.active", "=", true)
      .execute();

    return rows.map((r) => r.code);
  }

  /**
   * Derives all active, deduplicated permission codes granted to the given user.
   */
  public async getUserEffectivePermissions(userId: string): Promise<string[]> {
    if (!userId || userId.trim() === "") {
      return [];
    }

    const rows = await this.database
      .selectFrom("user_access_roles")
      .innerJoin("access_roles", "access_roles.id", "user_access_roles.role_id")
      .innerJoin("access_role_permissions", "access_role_permissions.role_id", "access_roles.id")
      .innerJoin("access_permissions", "access_permissions.id", "access_role_permissions.permission_id")
      .select("access_permissions.code")
      .distinct()
      .where("user_access_roles.user_id", "=", userId)
      .where("user_access_roles.revoked_at", "is", null)
      .where("access_roles.active", "=", true)
      .execute();

    return rows.map((r) => r.code);
  }

  /**
   * Returns the complete effective authorization profile (active roles & permissions).
   */
  public async getEffectiveAuthorization(userId: string): Promise<EffectiveAuthorization> {
    const [roles, permissions] = await Promise.all([
      this.getUserRoles(userId),
      this.getUserEffectivePermissions(userId)
    ]);

    return {
      userId,
      roles,
      permissions
    };
  }

  /**
   * Checks if a user possesses a specific permission.
   */
  public async hasPermission(userId: string, permissionCode: string): Promise<boolean> {
    if (!permissionCode || permissionCode.trim() === "") {
      return false;
    }

    const permissions = await this.getUserEffectivePermissions(userId);
    return permissions.includes(permissionCode);
  }

  /**
   * Checks if a user possesses at least one of the specified permissions.
   */
  public async hasAnyPermission(userId: string, permissionCodes: string[]): Promise<boolean> {
    if (!permissionCodes || permissionCodes.length === 0) {
      return false;
    }

    const permissions = await this.getUserEffectivePermissions(userId);
    const permissionSet = new Set(permissions);
    return permissionCodes.some((code) => permissionSet.has(code));
  }

  /**
   * Checks if a user possesses all of the specified permissions.
   */
  public async hasAllPermissions(userId: string, permissionCodes: string[]): Promise<boolean> {
    if (!permissionCodes || permissionCodes.length === 0) {
      return true;
    }

    const permissions = await this.getUserEffectivePermissions(userId);
    const permissionSet = new Set(permissions);
    return permissionCodes.every((code) => permissionSet.has(code));
  }

  /**
   * Assigns an active role to a user with audit tracking.
   */
  public async assignRoleToUser(
    userId: string,
    roleCode: string,
    assignedByUserId: string,
    now: Date = new Date()
  ): Promise<boolean> {
    const role = await this.database
      .selectFrom("access_roles")
      .select(["id", "active"])
      .where("code", "=", roleCode)
      .executeTakeFirst();

    if (!role || !role.active) {
      return false;
    }

    // Check if user already has an active assignment for this role
    const existing = await this.database
      .selectFrom("user_access_roles")
      .select("id")
      .where("user_id", "=", userId)
      .where("role_id", "=", role.id)
      .where("revoked_at", "is", null)
      .executeTakeFirst();

    if (existing) {
      return true;
    }

    await this.database
      .insertInto("user_access_roles")
      .values({
        id: crypto.randomUUID(),
        user_id: userId,
        role_id: role.id,
        assigned_at: now,
        assigned_by_user_id: assignedByUserId,
        revoked_at: null,
        revoked_by_user_id: null,
        version: "1"
      })
      .execute();

    return true;
  }

  /**
   * Revokes an active role from a user with audit tracking.
   */
  public async revokeRoleFromUser(
    userId: string,
    roleCode: string,
    revokedByUserId: string,
    now: Date = new Date()
  ): Promise<boolean> {
    const role = await this.database
      .selectFrom("access_roles")
      .select("id")
      .where("code", "=", roleCode)
      .executeTakeFirst();

    if (!role) {
      return false;
    }

    const result = await this.database
      .updateTable("user_access_roles")
      .set({
        revoked_at: now,
        revoked_by_user_id: revokedByUserId
      })
      .where("user_id", "=", userId)
      .where("role_id", "=", role.id)
      .where("revoked_at", "is", null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows ?? 0) > 0;
  }
}
