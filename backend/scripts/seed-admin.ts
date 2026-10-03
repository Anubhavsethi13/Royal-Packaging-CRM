import crypto from "node:crypto";
import { loadProjectEnv } from "@royal-packaging/config";
import { checkDatabaseHealth, createDatabase, destroyDatabase } from "@royal-packaging/db";
import { hashPassword } from "../apps/api/src/modules/identity/password.js";
import { seedKpiDefinitions, UNSEEDED_KPI_CODES } from "./kpi-definition-seed.js";

interface RoleDef {
  code: string;
  name: string;
}

interface PermissionDef {
  code: string;
  name: string;
  description?: string;
}

const ROLES: RoleDef[] = [
  { code: "SUPER_ADMIN", name: "Super Administrator" },
  { code: "ADMIN", name: "Administrator" },
  { code: "ACCOUNTANT", name: "Accountant" },
  { code: "SUPERVISOR", name: "Warehouse Supervisor" },
  { code: "MANAGER", name: "Operations Manager" },
  { code: "EMPLOYEE", name: "Warehouse Operator" },
  { code: "AUDITOR", name: "Quality Auditor" }
];

const PERMISSIONS: PermissionDef[] = [
  // Commercial
  { code: "client:read", name: "Read Clients" },
  { code: "client:write", name: "Write Clients" },
  { code: "order:read", name: "Read Orders" },
  { code: "order:write", name: "Write Orders" },
  { code: "order:cancel", name: "Cancel Orders" },
  { code: "employee:read", name: "Read Employees" },
  { code: "employee:write", name: "Write Employees" },
  { code: "employee:assign_shift", name: "Assign Employee Shift" },

  // Tasks
  { code: "task:read", name: "Read Tasks" },
  { code: "task:read_summary", name: "Read Task Summary" },
  { code: "task:read_assignments", name: "Read Task Assignments" },
  { code: "task:read_events", name: "Read Task Events" },
  { code: "task:create", name: "Create Task" },
  { code: "task:initialize_from_order", name: "Init Task From Order" },
  { code: "task:assign", name: "Assign Task" },
  { code: "task:unassign", name: "Unassign Task" },
  { code: "task:start", name: "Start Task" },
  { code: "task:pause", name: "Pause Task" },
  { code: "task:resume", name: "Resume Task" },
  { code: "task:complete", name: "Complete Task" },
  { code: "task:cancel", name: "Cancel Task" },
  { code: "task:reopen", name: "Reopen Task" },
  { code: "task:execute_movement", name: "Execute Task Movement" },

  // Inventory & Warehouse
  { code: "inventory:read_catalog", name: "Read Inventory Catalog" },
  { code: "inventory:read_balances", name: "Read Inventory Balances" },
  { code: "inventory:read_movement", name: "Read Inventory Movements" },
  { code: "inventory:move", name: "Move Inventory" },
  { code: "warehouse:scan", name: "Scan Warehouse Barcode" },
  { code: "warehouse:read_tasks", name: "Read Warehouse Tasks" },
  { code: "warehouse:read_route", name: "Read Warehouse Route" },

  // Quality
  { code: "quality:inspect", name: "Inspect Quality" },
  { code: "quality:record_photo", name: "Record Quality Photo" },
  { code: "quality:read_record", name: "Read Quality Record" },
  { code: "quality:read_photos", name: "Read Quality Photos" },
  { code: "quality:read_history", name: "Read Quality History" },

  // Finance, Incentives & Payroll
  { code: "incentive:read", name: "Read Incentives" },
  { code: "incentive:record_kot", name: "Record KOT" },
  { code: "incentive:record_penalty", name: "Record Penalty" },
  { code: "incentive:calculate", name: "Calculate Incentives" },
  { code: "incentive:approve", name: "Approve Incentives" },
  { code: "payroll:read", name: "Read Payroll" },
  { code: "payroll:write", name: "Write Payroll" },
  { code: "payroll:approve", name: "Approve Payroll" },
  { code: "financial:approve", name: "Approve Financial Decisions" },

  // Reports, Audit, Dashboard, Resync
  { code: "report:read", name: "Read Reports" },
  { code: "report:execute", name: "Execute Reports" },
  { code: "audit:read", name: "Read Audit Logs" },
  { code: "dashboard:read", name: "Read Dashboard" },
  { code: "kpi:read", name: "Read KPI" },
  { code: "resync:read", name: "Read Resync" },

  // Daily shift entries
  { code: "shift:create", name: "Create Own Shift Entry" },
  { code: "shift:read_own", name: "Read Own Shift Entries" },
  { code: "shift:read", name: "Read Shift Entry Detail" },

  // Shift-entry KPI summaries
  { code: "kpi:read_own", name: "Read Own KPI Summary" },
  { code: "kpi:read_all", name: "Read All Employee KPI Summaries" },
  { code: "kpi:read_config", name: "Read KPI Configuration" },
  { code: "kpi:read_results", name: "Read KPI Results" },
  { code: "kpi:read_depot", name: "Read Depot KPI Dashboard" },

  // Warehouse operations read model and locations
  { code: "warehouse:read_operations", name: "Read Warehouse Operations" },
  { code: "warehouse:read_all_operations", name: "Read All Warehouse Operations" },
  { code: "location:read", name: "Read Locations" },

  // Supervisor daily depot reports
  { code: "daily_report:read", name: "Read Daily Depot Reports" },
  { code: "daily_report:read_all", name: "Read Daily Reports For All Depots" },
  { code: "daily_report:write", name: "Create/Update/Submit Daily Depot Reports" },
  { code: "daily_report:write_all", name: "Write Daily Reports For Any Depot" },

  // Administration (users, roles, permissions, scopes, settings): Super Admin and Admin
  { code: "settings:read", name: "Open Administration" }
];

const MANAGEMENT_PERMISSIONS = [
  "client:read", "client:write", "order:read", "order:write", "order:cancel",
  "employee:read", "employee:write", "employee:assign_shift",
  "task:read", "task:read_summary", "task:read_assignments", "task:read_events",
  "task:create", "task:initialize_from_order", "task:assign", "task:unassign",
  "task:start", "task:pause", "task:resume", "task:complete", "task:cancel", "task:execute_movement",
  "inventory:read_catalog", "inventory:read_balances", "inventory:read_movement", "inventory:move",
  "warehouse:scan", "warehouse:read_tasks", "warehouse:read_route",
  "quality:inspect", "quality:record_photo", "quality:read_record", "quality:read_photos", "quality:read_history",
  "report:read", "report:execute",
  "audit:read", "dashboard:read", "kpi:read", "resync:read",
  "shift:create", "shift:read_own", "shift:read",
  "kpi:read_own", "kpi:read_all", "kpi:read_results", "kpi:read_depot",
  "warehouse:read_operations", "warehouse:read_all_operations", "location:read",
  "daily_report:read", "daily_report:write"
];

const EMPLOYEE_PERMISSIONS = [
  "client:read", "order:read", "employee:read",
  "task:read", "task:read_summary", "task:read_assignments", "task:read_events",
  "task:start", "task:pause", "task:resume", "task:complete", "task:execute_movement",
  "inventory:read_catalog", "inventory:read_balances", "inventory:read_movement", "inventory:move",
  "warehouse:scan", "warehouse:read_tasks", "warehouse:read_route",
  "quality:record_photo", "quality:read_record", "quality:read_photos",
  "dashboard:read", "resync:read",
  "shift:create", "shift:read_own", "shift:read",
  "kpi:read_own", "kpi:read_results",
  "warehouse:read_operations", "location:read"
];

/**
 * Incentives and payroll (payroll entries are incentive amounts) are Super
 * Admin only. These permissions are bound to SUPER_ADMIN alone, and the seed
 * revokes them from every other role so existing databases are corrected.
 */
export const SUPER_ADMIN_ONLY_PERMISSIONS: readonly string[] = [
  "incentive:read", "incentive:record_kot", "incentive:record_penalty", "incentive:calculate", "incentive:approve",
  "payroll:read", "payroll:write", "payroll:approve", "financial:approve"
];

/** Permissions only the listed roles may hold; the seed revokes them from every other role. */
const RESTRICTED_PERMISSIONS: ReadonlyArray<{ label: string; permissions: readonly string[]; allowedRoles: readonly string[] }> = [
  { label: "Incentives and payroll (Super Admin only)", permissions: SUPER_ADMIN_ONLY_PERMISSIONS, allowedRoles: ["SUPER_ADMIN"] },
  { label: "KPI configuration (Super Admin and Admin only)", permissions: ["kpi:read_config"], allowedRoles: ["SUPER_ADMIN", "ADMIN"] }
];
/** Read-only reporting role: dashboard, reports, KPI results, warehouse/task/employee reads, audit. */
const ACCOUNTANT_PERMISSIONS = [
  "client:read", "order:read", "employee:read",
  "task:read", "task:read_summary", "task:read_assignments", "task:read_events",
  "inventory:read_catalog", "inventory:read_balances", "inventory:read_movement",
  "warehouse:read_tasks", "warehouse:read_route", "warehouse:read_operations", "warehouse:read_all_operations", "location:read",
  "quality:read_record", "quality:read_photos", "quality:read_history",
  "dashboard:read", "kpi:read", "kpi:read_all", "kpi:read_results", "kpi:read_depot",
  "report:read", "report:execute", "audit:read",
  "daily_report:read", "daily_report:read_all"
];

const AUDITOR_PERMISSIONS = [
  "client:read", "order:read", "employee:read",
  "task:read", "task:read_summary", "task:read_assignments", "task:read_events",
  "inventory:read_catalog", "inventory:read_balances",
  "quality:read_record", "quality:read_photos", "quality:read_history",
  "audit:read", "report:read", "dashboard:read", "kpi:read"
];

export async function seedDatabase(): Promise<void> {
  loadProjectEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[FATAL] Missing DATABASE_URL environment variable.");
    process.exit(1);
  }

  const isProduction = process.env.NODE_ENV === "production";
  const adminEmail = process.env.SEED_ADMIN_EMAIL || (isProduction ? undefined : "admin@royalpackaging.com");
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || (isProduction ? undefined : "Admin@123456");
  const adminName = process.env.SEED_ADMIN_NAME || "System Administrator";

  if (!adminEmail || !adminPassword) {
    console.error(
      "[FATAL] SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD environment variables are required in production."
    );
    process.exit(1);
  }

  const database = createDatabase({ DATABASE_URL: databaseUrl });

  try {
    await checkDatabaseHealth(database);
    console.log("[INFO] Connected to PostgreSQL for administrative seed.");

    // 1. Ensure initial admin, superadmin, and supervisor users exist in `users`
    const defaultUsers = [
      {
        email: adminEmail,
        password: adminPassword,
        name: adminName,
        department: "Management",
        roles: ["SUPER_ADMIN", "ADMIN"]
      },
      {
        email: process.env.SEED_SUPERADMIN_EMAIL || (isProduction ? undefined : "superadmin@royalpackaging.com"),
        password: process.env.SEED_SUPERADMIN_PASSWORD || (isProduction ? undefined : "SuperAdmin@123456"),
        name: "Super Administrator",
        department: "Executive Leadership",
        roles: ["SUPER_ADMIN"]
      },
      {
        email: process.env.SEED_SUPERVISOR_EMAIL || (isProduction ? undefined : "supervisor@royalpackaging.com"),
        password: process.env.SEED_SUPERVISOR_PASSWORD || (isProduction ? undefined : "Supervisor@123456"),
        name: "Warehouse Supervisor",
        department: "Warehouse Operations",
        roles: ["SUPERVISOR"]
      }
    ].filter((u): u is { email: string; password: string; name: string; department: string; roles: string[] } => Boolean(u.email && u.password));

    const userMap = new Map<string, { id: string; roles: string[] }>();

    for (const u of defaultUsers) {
      let existingUser = await database
        .selectFrom("users")
        .select(["id", "login_identifier"])
        .where("login_identifier", "=", u.email)
        .executeTakeFirst();

      if (!existingUser) {
        const userId = crypto.randomUUID();
        const passwordHash = await hashPassword(u.password);

        await database
          .insertInto("users")
          .values({
            id: userId,
            login_identifier: u.email,
            password_hash: passwordHash,
            is_active: true
          })
          .execute();

        const employeeId = crypto.randomUUID();
        await database
          .insertInto("employees")
          .values({
            id: employeeId,
            user_id: userId,
            employee_code: `EMP-${userId.slice(0, 8).toUpperCase()}`,
            name: u.name,
            department: u.department,
            is_active: true
          })
          .execute();

        existingUser = { id: userId, login_identifier: u.email };
        console.log(`[SEED] Created account: ${u.email}`);
      } else {
        const passwordHash = await hashPassword(u.password);
        await database
          .updateTable("users")
          .set({ password_hash: passwordHash, is_active: true })
          .where("id", "=", existingUser.id)
          .execute();
        console.log(`[SEED] Account already exists, refreshed credentials: ${u.email}`);
      }

      userMap.set(u.email, { id: existingUser.id, roles: u.roles });
    }

    const creatorId = userMap.get(adminEmail)?.id || crypto.randomUUID();

    // 2. Ensure roles exist in `access_roles`
    const roleIdMap = new Map<string, string>();
    for (const r of ROLES) {
      let role = await database
        .selectFrom("access_roles")
        .select("id")
        .where("code", "=", r.code)
        .executeTakeFirst();

      if (!role) {
        const id = crypto.randomUUID();
        await database
          .insertInto("access_roles")
          .values({
            id,
            code: r.code,
            name: r.name,
            active: true
          })
          .execute();
        role = { id };
        console.log(`[SEED] Created role: ${r.code}`);
      }
      roleIdMap.set(r.code, role.id);
    }

    // 3. Ensure permissions exist in `access_permissions`
    const existingPerms = await database
      .selectFrom("access_permissions")
      .select(["id", "code"])
      .execute();
    const permissionIdMap = new Map<string, string>(existingPerms.map((p) => [p.code, p.id]));

    const permsToInsert = PERMISSIONS.filter((p) => !permissionIdMap.has(p.code)).map((p) => {
      const id = crypto.randomUUID();
      permissionIdMap.set(p.code, id);
      return {
        id,
        code: p.code,
        name: p.name,
        description: p.description ?? null
      };
    });

    if (permsToInsert.length > 0) {
      for (let i = 0; i < permsToInsert.length; i += 50) {
        const chunk = permsToInsert.slice(i, i + 50);
        await database.insertInto("access_permissions").values(chunk).execute();
      }
    }
    console.log(`[SEED] Ensured ${PERMISSIONS.length} access permissions exist.`);

    // 4. Map role permissions idempotently in `access_role_permissions`
    const roleBindings: Array<{ roleCode: string; permissions: string[] }> = [
      { roleCode: "SUPER_ADMIN", permissions: PERMISSIONS.map((p) => p.code) },
      { roleCode: "ADMIN", permissions: PERMISSIONS.filter((p) => !SUPER_ADMIN_ONLY_PERMISSIONS.includes(p.code)).map((p) => p.code) },
      { roleCode: "ACCOUNTANT", permissions: ACCOUNTANT_PERMISSIONS },
      { roleCode: "SUPERVISOR", permissions: MANAGEMENT_PERMISSIONS },
      { roleCode: "MANAGER", permissions: MANAGEMENT_PERMISSIONS },
      { roleCode: "EMPLOYEE", permissions: EMPLOYEE_PERMISSIONS },
      { roleCode: "AUDITOR", permissions: AUDITOR_PERMISSIONS }
    ];

    const existingRolePermissions = await database
      .selectFrom("access_role_permissions")
      .select(["role_id", "permission_id"])
      .execute();
    const existingBindingSet = new Set(
      existingRolePermissions.map((b) => `${b.role_id}:${b.permission_id}`)
    );

    const bindingsToInsert: Array<{ role_id: string; permission_id: string; created_by_user_id: string }> = [];
    let newBindingsCount = 0;

    for (const binding of roleBindings) {
      const roleId = roleIdMap.get(binding.roleCode);
      if (!roleId) continue;

      for (const permCode of binding.permissions) {
        const permId = permissionIdMap.get(permCode);
        if (!permId) continue;

        if (!existingBindingSet.has(`${roleId}:${permId}`)) {
          bindingsToInsert.push({
            role_id: roleId,
            permission_id: permId,
            created_by_user_id: creatorId
          });
          existingBindingSet.add(`${roleId}:${permId}`);
          newBindingsCount++;
        }
      }
    }

    if (bindingsToInsert.length > 0) {
      for (let i = 0; i < bindingsToInsert.length; i += 50) {
        const chunk = bindingsToInsert.slice(i, i + 50);
        await database.insertInto("access_role_permissions").values(chunk).execute();
      }
    }
    console.log(`[SEED] Role-permission mappings up to date (${newBindingsCount} new bindings added).`);

    // 4b. Revoke restricted permissions from roles that may no longer hold them (idempotent),
    // so databases seeded under earlier rules are corrected too.
    for (const restriction of RESTRICTED_PERMISSIONS) {
      const keepRoleIds = restriction.allowedRoles.map((code) => roleIdMap.get(code)).filter((id): id is string => Boolean(id));
      const permissionIds = restriction.permissions.map((code) => permissionIdMap.get(code)).filter((id): id is string => Boolean(id));
      if (keepRoleIds.length === 0 || permissionIds.length === 0) continue;
      const revoked = await database
        .deleteFrom("access_role_permissions")
        .where("permission_id", "in", permissionIds)
        .where("role_id", "not in", keepRoleIds)
        .executeTakeFirst();
      console.log(`[SEED] ${restriction.label}: revoked ${Number(revoked.numDeletedRows)} binding(s) from roles other than ${restriction.allowedRoles.join(", ")}.`);
    }

    // 5. Assign roles to seeded users
    for (const [email, { id: userId, roles }] of userMap.entries()) {
      for (const roleCode of roles) {
        const roleId = roleIdMap.get(roleCode);
        if (!roleId) continue;

        const existingAssignment = await database
          .selectFrom("user_access_roles")
          .select("id")
          .where("user_id", "=", userId)
          .where("role_id", "=", roleId)
          .where("revoked_at", "is", null)
          .executeTakeFirst();

        if (!existingAssignment) {
          await database
            .insertInto("user_access_roles")
            .values({
              id: crypto.randomUUID(),
              user_id: userId,
              role_id: roleId,
              assigned_by_user_id: creatorId
            })
            .execute();
          console.log(`[SEED] Assigned ${roleCode} role to ${email}`);
        }
      }
    }

    // 5. V1 KPI definitions (idempotent; never modifies existing definitions; no targets).
    const kpiSeed = await seedKpiDefinitions(database);
    console.log(`[SEED] KPI definitions: ${kpiSeed.inserted.length} inserted, ${kpiSeed.skipped.length} already present. Not seeded (unapproved rules): ${UNSEEDED_KPI_CODES.join(", ")}.`);

    console.log("[INFO] Administrative database seed completed successfully.");
  } finally {
    await destroyDatabase(database).catch(() => {});
  }
}

// Execute directly if run via CLI
seedDatabase().catch((err) => {
  console.error("[FATAL] Seed error:", err);
  process.exit(1);
});
