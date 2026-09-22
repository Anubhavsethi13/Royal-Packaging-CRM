import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(workspaceRoot, "packages", "db", "migrations");
const migration010Name = "010_create_kpi_definitions_targets_and_snapshots.ts";
const migration010Path = path.join(migrationsDirectory, migration010Name);

async function readMigration(): Promise<string> {
  return readFile(migration010Path, "utf8");
}

test("migrations directory contains 010 in correct lexical sequence", async () => {
  const allEntries = await readdir(migrationsDirectory);
  const migrationFiles = allEntries.filter((file) => file.endsWith(".ts")).sort();

  assert.deepEqual(migrationFiles.slice(0, 10), [
    "001_create_users_and_rbac.ts",
    "002_create_sessions_and_employees.ts",
    "003_create_depots_locations_and_shifts.ts",
    "004_create_clients_orders_and_order_items.ts",
    "005_create_inventory_items_batches_balances_and_movements.ts",
    "006_create_tasks_assignments_and_events.ts",
    "007_create_quality_records_and_task_photos.ts",
    "008_create_login_attempts.ts",
    "009_create_incentive_rules_events_and_ledger.ts",
    "010_create_kpi_definitions_targets_and_snapshots.ts"
  ]);
});

test("migration 010 creates and drops KPI tables in strict dependency order", async () => {
  const source = await readMigration();

  // Up order: kpi_definitions -> kpi_targets -> kpi_snapshots
  assert.match(
    source,
    /createTable\("kpi_definitions"\)[\s\S]*createTable\("kpi_targets"\)[\s\S]*createTable\("kpi_snapshots"\)/
  );

  // Down order: kpi_snapshots -> kpi_targets -> kpi_definitions
  assert.match(
    source,
    /dropTable\("kpi_snapshots"\)[\s\S]*dropTable\("kpi_targets"\)[\s\S]*dropTable\("kpi_definitions"\)/
  );
});

test("kpi_definitions table implements code uniqueness, pillar metadata, and versioning", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("kpi_definitions"\)/);
  assert.match(source, /addColumn\("id", "uuid", \(column\) => column\.primaryKey\(\)\.notNull\(\)\)/);
  assert.match(source, /addColumn\("code", "text", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("name", "text", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("pillar", "text"\)/);
  assert.match(source, /addColumn\("description", "text"\)/);
  assert.match(source, /addColumn\("unit", "text"\)/);
  assert.match(source, /addColumn\("formula_reference", "text"\)/);
  assert.match(source, /addColumn\("active", "boolean"/);
  assert.match(source, /kpi_definitions_version_positive/);
  assert.match(source, /kpi_definitions_effective_range/);
  assert.match(source, /kpi_definitions_code_unique_index/);
  assert.match(source, /kpi_definitions_active_index/);
  assert.match(source, /kpi_definitions_pillar_index/);
});

test("kpi_targets table implements target values, thresholds, effective dates, and depot scope", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("kpi_targets"\)/);
  assert.match(source, /addColumn\("id", "uuid", \(column\) => column\.primaryKey\(\)\.notNull\(\)\)/);
  assert.match(source, /addColumn\("kpi_definition_id", "uuid", \(column\) => column\.notNull\(\)\.references\("kpi_definitions\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("target_value", "numeric", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("warning_threshold", "numeric"\)/);
  assert.match(source, /addColumn\("critical_threshold", "numeric"\)/);
  assert.match(source, /addColumn\("depot_id", "uuid", \(column\) => column\.references\("depots\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /kpi_targets_version_positive/);
  assert.match(source, /kpi_targets_effective_range/);
  assert.match(source, /kpi_targets_kpi_definition_id_index/);
  assert.match(source, /kpi_targets_depot_id_index/);
  assert.match(source, /kpi_targets_effective_period_index/);
});

test("kpi_snapshots table implements historical measurement, period bounds, and confirmed drill-down dimensions", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("kpi_snapshots"\)/);
  assert.match(source, /addColumn\("id", "uuid", \(column\) => column\.primaryKey\(\)\.notNull\(\)\)/);
  assert.match(source, /addColumn\("kpi_definition_id", "uuid", \(column\) => column\.notNull\(\)\.references\("kpi_definitions\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("snapshot_at", "timestamptz"/);
  assert.match(source, /addColumn\("value", "numeric", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("target_value", "numeric"\)/);
  assert.match(source, /addColumn\("depot_id", "uuid", \(column\) => column\.references\("depots\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("employee_id", "uuid", \(column\) => column\.references\("employees\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("task_type", "text"\)/);
  assert.match(source, /addColumn\("client_id", "uuid", \(column\) => column\.references\("clients\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("inventory_item_id", "uuid", \(column\) => column\.references\("inventory_items\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("shift_id", "uuid", \(column\) => column\.references\("shifts\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("calculation_version", "text"\)/);
  assert.match(source, /kpi_snapshots_period_range/);
  assert.match(source, /kpi_snapshots_kpi_definition_snapshot_index/);
  assert.match(source, /kpi_snapshots_depot_id_index/);
  assert.match(source, /kpi_snapshots_employee_id_index/);
  assert.match(source, /kpi_snapshots_client_id_index/);
  assert.match(source, /kpi_snapshots_inventory_item_id_index/);
  assert.match(source, /kpi_snapshots_shift_id_index/);
});

test("migration 010 does not invent unapproved report templates, PDF/Excel renderers, or unconfirmed attendance/GPS schemas", async () => {
  const source = await readMigration();

  // No hardcoded report formats
  assert.doesNotMatch(source, /excel|pdf|csv|template|mb51|mb52/i);

  // No unconfirmed report tables
  assert.doesNotMatch(source, /createTable\("report_definitions"\)/);
  assert.doesNotMatch(source, /createTable\("report_executions"\)/);
});
