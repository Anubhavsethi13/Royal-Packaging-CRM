import assert from "node:assert/strict";
import test from "node:test";
import { RBACService } from "../apps/api/src/modules/identity/index.js";
import type { DatabaseConnection } from "../packages/db/src/index.js";

interface MockRole {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

interface MockPermission {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

interface MockRolePermission {
  role_id: string;
  permission_id: string;
  created_at: Date;
  created_by_user_id: string;
}

interface MockUserRole {
  id: string;
  user_id: string;
  role_id: string;
  assigned_at: Date;
  assigned_by_user_id: string;
  revoked_at: Date | null;
  revoked_by_user_id: string | null;
  version: string;
}

interface FilterCondition {
  col: string;
  op: string;
  val: unknown;
}

function createMockRBACDatabase() {
  const roles: MockRole[] = [];
  const permissions: MockPermission[] = [];
  const rolePermissions: MockRolePermission[] = [];
  const userRoles: MockUserRole[] = [];

  const createQueryBuilder = (selectedTable: string) => {
    const filters: FilterCondition[] = [];
    const joins: Array<{ joinTable: string; leftCol: string; rightCol: string }> = [];
    let isDistinct = false;

    const builder = {
      innerJoin: (joinTable: string, leftCol: string, rightCol: string) => {
        joins.push({ joinTable, leftCol, rightCol });
        return builder;
      },
      select: () => builder,
      distinct: () => {
        isDistinct = true;
        return builder;
      },
      where: (col: string, op: string, val: unknown) => {
        filters.push({ col, op, val });
        return builder;
      },
      execute: async (): Promise<Array<{ code: string }>> => {
        if (selectedTable === "user_access_roles") {
          // Flatten joins for testing
          const results: Array<{
            user_id: string;
            role_id: string;
            role_code: string;
            role_active: boolean;
            permission_id?: string;
            permission_code?: string;
            revoked_at: Date | null;
          }> = [];

          for (const ur of userRoles) {
            const role = roles.find((r) => r.id === ur.role_id);
            if (!role) continue;

            const isRolePermissionsJoin = joins.some((j) => j.joinTable === "access_role_permissions");
            if (isRolePermissionsJoin) {
              const rps = rolePermissions.filter((rp) => rp.role_id === role.id);
              for (const rp of rps) {
                const perm = permissions.find((p) => p.id === rp.permission_id);
                if (!perm) continue;
                results.push({
                  user_id: ur.user_id,
                  role_id: ur.role_id,
                  role_code: role.code,
                  role_active: role.active,
                  permission_id: perm.id,
                  permission_code: perm.code,
                  revoked_at: ur.revoked_at
                });
              }
            } else {
              results.push({
                user_id: ur.user_id,
                role_id: ur.role_id,
                role_code: role.code,
                role_active: role.active,
                revoked_at: ur.revoked_at
              });
            }
          }

          let filtered = results;
          for (const f of filters) {
            if (f.col === "user_access_roles.user_id" && f.op === "=") {
              filtered = filtered.filter((r) => r.user_id === f.val);
            }
            if (f.col === "user_access_roles.revoked_at" && f.op === "is" && f.val === null) {
              filtered = filtered.filter((r) => r.revoked_at === null);
            }
            if (f.col === "access_roles.active" && f.op === "=") {
              filtered = filtered.filter((r) => r.role_active === f.val);
            }
          }

          if (joins.some((j) => j.joinTable === "access_role_permissions")) {
            let mapped = filtered.map((r) => ({ code: r.permission_code! }));
            if (isDistinct) {
              const set = new Set(mapped.map((m) => m.code));
              mapped = Array.from(set).map((code) => ({ code }));
            }
            return mapped;
          }

          return filtered.map((r) => ({ code: r.role_code }));
        }

        return [];
      },
      executeTakeFirst: async (): Promise<unknown> => {
        if (selectedTable === "access_roles") {
          let results = [...roles];
          for (const f of filters) {
            if (f.col === "code" && f.op === "=") {
              results = results.filter((r) => r.code === f.val);
            }
          }
          return results[0];
        }

        if (selectedTable === "user_access_roles") {
          let results = [...userRoles];
          for (const f of filters) {
            if (f.col === "user_id" && f.op === "=") {
              results = results.filter((ur) => ur.user_id === f.val);
            }
            if (f.col === "role_id" && f.op === "=") {
              results = results.filter((ur) => ur.role_id === f.val);
            }
            if (f.col === "revoked_at" && f.op === "is" && f.val === null) {
              results = results.filter((ur) => ur.revoked_at === null);
            }
          }
          return results[0];
        }

        return undefined;
      }
    };

    return builder;
  };

  const mockDb = {
    roles,
    permissions,
    rolePermissions,
    userRoles,
    selectFrom: (table: string) => createQueryBuilder(table),
    insertInto: (table: string) => ({
      values: (val: unknown) => ({
        execute: async () => {
          if (table === "user_access_roles") {
            userRoles.push(val as MockUserRole);
          }
          return {};
        }
      })
    }),
    updateTable: (table: string) => {
      let updateValues: Record<string, unknown> = {};
      const filters: FilterCondition[] = [];
      const updater = {
        set: (vals: Record<string, unknown>) => {
          updateValues = vals;
          return updater;
        },
        where: (col: string, op: string, val: unknown) => {
          filters.push({ col, op, val });
          return updater;
        },
        executeTakeFirst: async () => {
          let count = 0;
          if (table === "user_access_roles") {
            for (const ur of userRoles) {
              let match = true;
              for (const f of filters) {
                if (f.col === "user_id" && ur.user_id !== f.val) match = false;
                if (f.col === "role_id" && ur.role_id !== f.val) match = false;
                if (f.col === "revoked_at" && f.op === "is" && f.val === null && ur.revoked_at !== null) match = false;
              }
              if (match) {
                Object.assign(ur, updateValues);
                count++;
              }
            }
          }
          return { numUpdatedRows: count };
        }
      };
      return updater;
    }
  };

  return mockDb as unknown as DatabaseConnection & {
    roles: typeof roles;
    permissions: typeof permissions;
    rolePermissions: typeof rolePermissions;
    userRoles: typeof userRoles;
  };
}

test("RBACService derives effective permissions from active role mappings", async () => {
  const db = createMockRBACDatabase();
  const rbacService = new RBACService({ database: db });

  // 1. Setup roles
  db.roles.push(
    { id: "role-admin-id", code: "admin", name: "Administrator", active: true },
    { id: "role-operator-id", code: "operator", name: "Warehouse Operator", active: true }
  );

  // 2. Setup permissions
  db.permissions.push(
    { id: "perm-view-inv", code: "inventory:view", name: "View Inventory", description: null },
    { id: "perm-move-inv", code: "inventory:move", name: "Move Inventory", description: null },
    { id: "perm-manage-user", code: "users:manage", name: "Manage Users", description: null }
  );

  // 3. Map permissions to roles
  db.rolePermissions.push(
    { role_id: "role-operator-id", permission_id: "perm-view-inv", created_at: new Date(), created_by_user_id: "system" },
    { role_id: "role-operator-id", permission_id: "perm-move-inv", created_at: new Date(), created_by_user_id: "system" },
    { role_id: "role-admin-id", permission_id: "perm-view-inv", created_at: new Date(), created_by_user_id: "system" },
    { role_id: "role-admin-id", permission_id: "perm-manage-user", created_at: new Date(), created_by_user_id: "system" }
  );

  const userId = "user-123";

  // 4. Assign operator role to user
  await rbacService.assignRoleToUser(userId, "operator", "admin-user");

  // 5. Check effective permissions
  const roles = await rbacService.getUserRoles(userId);
  assert.deepEqual(roles, ["operator"]);

  const permissions = await rbacService.getUserEffectivePermissions(userId);
  assert.deepEqual(permissions.sort(), ["inventory:move", "inventory:view"].sort());

  assert.equal(await rbacService.hasPermission(userId, "inventory:view"), true);
  assert.equal(await rbacService.hasPermission(userId, "inventory:move"), true);
  assert.equal(await rbacService.hasPermission(userId, "users:manage"), false);

  // 6. Assign admin role as well
  await rbacService.assignRoleToUser(userId, "admin", "admin-user");

  const combinedPerms = await rbacService.getUserEffectivePermissions(userId);
  assert.deepEqual(
    combinedPerms.sort(),
    ["inventory:move", "inventory:view", "users:manage"].sort()
  );
  assert.equal(await rbacService.hasPermission(userId, "users:manage"), true);

  // 7. Revoking operator role leaves admin permissions
  await rbacService.revokeRoleFromUser(userId, "operator", "admin-user");

  const remainingPerms = await rbacService.getUserEffectivePermissions(userId);
  assert.deepEqual(
    remainingPerms.sort(),
    ["inventory:view", "users:manage"].sort()
  );
  assert.equal(await rbacService.hasPermission(userId, "inventory:move"), false);
});

test("RBACService evaluates hasAnyPermission and hasAllPermissions", async () => {
  const db = createMockRBACDatabase();
  const rbacService = new RBACService({ database: db });

  db.roles.push({ id: "r1", code: "staff", name: "Staff", active: true });
  db.permissions.push(
    { id: "p1", code: "order:view", name: "View Order", description: null },
    { id: "p2", code: "order:create", name: "Create Order", description: null }
  );
  db.rolePermissions.push(
    { role_id: "r1", permission_id: "p1", created_at: new Date(), created_by_user_id: "sys" }
  );

  const userId = "staff-user-1";
  await rbacService.assignRoleToUser(userId, "staff", "admin");

  assert.equal(await rbacService.hasAnyPermission(userId, ["order:view", "order:create"]), true);
  assert.equal(await rbacService.hasAnyPermission(userId, ["order:create", "order:delete"]), false);

  assert.equal(await rbacService.hasAllPermissions(userId, ["order:view"]), true);
  assert.equal(await rbacService.hasAllPermissions(userId, ["order:view", "order:create"]), false);
});
