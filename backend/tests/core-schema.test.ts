import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(workspaceRoot, "packages", "db", "migrations");
const migrationNames = [
  "001_create_users_and_rbac.ts",
  "002_create_sessions_and_employees.ts",
  "003_create_depots_locations_and_shifts.ts"
] as const;

async function readMigration(name: (typeof migrationNames)[number]): Promise<string> {
  return readFile(path.join(migrationsDirectory, name), "utf8");
}

test("core schema migrations exist in their required dependency order", async () => {
  const sources = await Promise.all(migrationNames.map(readMigration));

  assert.deepEqual([...migrationNames], [...migrationNames].sort());
  for (const source of sources) {
    assert.match(source, /export async function up/);
    assert.match(source, /export async function down/);
  }
});

test("user, session, and employee migrations preserve approved relationships", async () => {
  const [usersAndRbac, sessionsAndEmployees] = await Promise.all([
    readMigration("001_create_users_and_rbac.ts"),
    readMigration("002_create_sessions_and_employees.ts")
  ]);

  assert.match(usersAndRbac, /createTable\("users"\)/);
  assert.match(usersAndRbac, /users_login_identifier_unique/);
  assert.match(usersAndRbac, /users_version_positive/);
  assert.match(usersAndRbac, /users_active_login_identifier_index/);
  assert.match(usersAndRbac, /createTable\("access_roles"\)/);
  assert.match(usersAndRbac, /createTable\("access_permissions"\)/);
  assert.match(usersAndRbac, /createTable\("access_role_permissions"\)/);
  assert.match(usersAndRbac, /createTable\("user_access_roles"\)/);
  assert.doesNotMatch(usersAndRbac, /createTable\("roles"\)/);
  assert.doesNotMatch(usersAndRbac, /createTable\("permissions"\)/);
  assert.doesNotMatch(usersAndRbac, /createTable\("role_permissions"\)/);
  assert.doesNotMatch(usersAndRbac, /createTable\("user_roles"\)/);
  assert.match(usersAndRbac, /access_roles_active_index/);
  assert.match(usersAndRbac, /access_role_permissions_role_id_index/);
  assert.match(usersAndRbac, /access_role_permissions_permission_id_index/);
  assert.match(usersAndRbac, /access_role_permissions_created_by_user_id_index/);
  assert.match(usersAndRbac, /user_access_roles_role_revoked_index/);
  assert.match(usersAndRbac, /created_by_user_id", "uuid", \(column\) => column\.notNull\(\)/);
  assert.match(usersAndRbac, /assigned_by_user_id", "uuid", \(column\) => column\.notNull\(\)/);
  assert.match(sessionsAndEmployees, /createTable\("sessions"\)[\s\S]*references\("users\.id"\)/);
  assert.match(sessionsAndEmployees, /sessions_session_token_hash_unique/);
  assert.match(sessionsAndEmployees, /sessions_expires_after_creation/);
  assert.match(sessionsAndEmployees, /sessions_user_revoked_expires_index/);
  assert.match(sessionsAndEmployees, /createTable\("employees"\)[\s\S]*references\("users\.id"\)/);
  assert.doesNotMatch(sessionsAndEmployees, /employees_user_id_unique/);
});

test("depot, location, and shift migrations retain configurable organization structure", async () => {
  const source = await readMigration("003_create_depots_locations_and_shifts.ts");

  assert.match(source, /createTable\("depots"\)/);
  assert.match(source, /depots_code_unique/);
  assert.match(source, /depots_active_index/);
  assert.match(source, /createTable\("locations"\)[\s\S]*references\("depots\.id"\)/);
  assert.match(source, /parent_location_id/);
  assert.match(source, /locations_parent_not_self/);
  assert.match(source, /create constraint trigger locations_prevent_ancestor_cycle/);
  assert.match(source, /after insert or update of parent_location_id on locations/);
  assert.match(source, /with recursive ancestors/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /createTable\("shifts"\)/);
  assert.match(source, /createTable\("employee_shift_assignments"\)/);
  assert.match(source, /employee_shift_assignments_date_range/);
  assert.match(source, /employee_shift_assignments_shift_effective_lookup_index/);
  assert.doesNotMatch(source, /shifts_name_unique/);
  assert.doesNotMatch(source, /insertInto\(/);
});

test("core schema migrations do not introduce later business domains", async () => {
  const source = (await Promise.all(migrationNames.map(readMigration))).join("\n");

  for (const forbiddenTable of [
    "tasks",
    "inventory_items",
    "inventory_movements",
    "orders",
    "incentive_rules",
    "payroll_ledger",
    "quality_records",
    "photos",
    "kpi_snapshots",
    "audit_records"
  ]) {
    assert.doesNotMatch(source, new RegExp(`createTable\\("${forbiddenTable}"\\)`));
  }
});
