import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(workspaceRoot, "packages", "db", "migrations");
const migration009Name = "009_create_incentive_rules_events_and_ledger.ts";
const migration009Path = path.join(migrationsDirectory, migration009Name);

async function readMigration(): Promise<string> {
  return readFile(migration009Path, "utf8");
}

test("migrations directory contains 009 in correct lexical sequence", async () => {
  const allEntries = await readdir(migrationsDirectory);
  const migrationFiles = allEntries.filter((file) => file.endsWith(".ts")).sort();

  assert.deepEqual(migrationFiles.slice(0, 9), [
    "001_create_users_and_rbac.ts",
    "002_create_sessions_and_employees.ts",
    "003_create_depots_locations_and_shifts.ts",
    "004_create_clients_orders_and_order_items.ts",
    "005_create_inventory_items_batches_balances_and_movements.ts",
    "006_create_tasks_assignments_and_events.ts",
    "007_create_quality_records_and_task_photos.ts",
    "008_create_login_attempts.ts",
    "009_create_incentive_rules_events_and_ledger.ts"
  ]);
});

test("migration 009 creates and drops incentive tables in strict dependency order", async () => {
  const source = await readMigration();

  // Up order: incentive_rules -> incentive_events -> incentive_ledger
  assert.match(
    source,
    /createTable\("incentive_rules"\)[\s\S]*createTable\("incentive_events"\)[\s\S]*createTable\("incentive_ledger"\)/
  );

  // Down order: incentive_ledger -> incentive_events -> incentive_rules
  assert.match(
    source,
    /dropTable\("incentive_ledger"\)[\s\S]*dropTable\("incentive_events"\)[\s\S]*dropTable\("incentive_rules"\)/
  );
});

test("incentive_rules table implements versioned policy, effective range, and uniqueness", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("incentive_rules"\)/);
  assert.match(source, /addColumn\("id", "uuid", \(column\) => column\.primaryKey\(\)\.notNull\(\)\)/);
  assert.match(source, /addColumn\("rule_version", "text", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("effective_from", "timestamptz", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("effective_to", "timestamptz"\)/);
  assert.match(source, /incentive_rules_version_positive/);
  assert.match(source, /incentive_rules_effective_range/);
  assert.match(source, /incentive_rules_rule_version_unique_index/);
  assert.match(source, /incentive_rules_effective_period_index/);
});

test("incentive_events table records canonical lifecycle events for tasks and rules", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("incentive_events"\)/);
  assert.match(source, /addColumn\("id", "uuid", \(column\) => column\.primaryKey\(\)\.notNull\(\)\)/);
  assert.match(source, /addColumn\("task_id", "uuid", \(column\) => column\.notNull\(\)\.references\("tasks\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("incentive_rule_id", "uuid", \(column\) => column\.references\("incentive_rules\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("event_type", "text", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("actor_user_id", "uuid", \(column\) => column\.references\("users\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("correlation_id", "uuid"\)/);
  assert.match(source, /addColumn\("metadata", "jsonb"\)/);
  assert.match(source, /incentive_events_task_id_event_at_index/);
  assert.match(source, /incentive_events_event_type_event_at_index/);
  assert.match(source, /incentive_events_incentive_rule_id_index/);
  assert.match(source, /incentive_events_actor_user_id_index/);
});

test("incentive_ledger table implements per-employee task allocation, numeric amount, status, and idempotency", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("incentive_ledger"\)/);
  assert.match(source, /addColumn\("id", "uuid", \(column\) => column\.primaryKey\(\)\.notNull\(\)\)/);
  assert.match(source, /addColumn\("task_id", "uuid", \(column\) => column\.notNull\(\)\.references\("tasks\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("employee_id", "uuid", \(column\) => column\.notNull\(\)\.references\("employees\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("incentive_rule_id", "uuid", \(column\) => column\.references\("incentive_rules\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("amount", "numeric", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("status", "text", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("idempotency_key", "text"\)/);
  assert.match(source, /incentive_ledger_version_positive/);
  assert.match(source, /incentive_ledger_employee_status_index/);
  assert.match(source, /incentive_ledger_task_id_index/);
  assert.match(source, /incentive_ledger_incentive_rule_id_index/);
  assert.match(source, /incentive_ledger_idempotency_key_index/);
});

test("migration 009 does not encode unapproved incentive formulas, 6% pool, points, or payroll ledgers", async () => {
  const source = await readMigration();

  // No hardcoded legacy formula or rate percentages
  assert.doesNotMatch(source, /0\.03|0\.06|super_incentive|staff_incentive|points_multiplier/i);

  // No premature payroll tables
  assert.doesNotMatch(source, /createTable\("payroll_ledger"\)/);
  assert.doesNotMatch(source, /createTable\("payroll_approvals"\)/);
});
