import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(workspaceRoot, "packages", "db", "migrations");
const migration006Name = "006_create_tasks_assignments_and_events.ts";
const migration006Path = path.join(migrationsDirectory, migration006Name);

async function readMigration(): Promise<string> {
  return readFile(migration006Path, "utf8");
}

test("migrations directory contains 006 in correct lexical sequence", async () => {
  const allEntries = await readdir(migrationsDirectory);
  const migrationFiles = allEntries.filter((file) => file.endsWith(".ts")).sort();

  assert.deepEqual(migrationFiles.slice(0, 6), [
    "001_create_users_and_rbac.ts",
    "002_create_sessions_and_employees.ts",
    "003_create_depots_locations_and_shifts.ts",
    "004_create_clients_orders_and_order_items.ts",
    "005_create_inventory_items_batches_balances_and_movements.ts",
    "006_create_tasks_assignments_and_events.ts"
  ]);
});

test("migration 006 creates and drops all task tables and FKs in dependency order", async () => {
  const source = await readMigration();

  // Up order: tasks -> task_assignments -> task_events -> inventory_movements FK
  assert.match(
    source,
    /createTable\("tasks"\)[\s\S]*createTable\("task_assignments"\)[\s\S]*createTable\("task_events"\)[\s\S]*alterTable\("inventory_movements"\)/
  );

  // Down order: inventory_movements FK dropped -> task_events -> task_assignments -> tasks
  assert.match(
    source,
    /dropConstraint\("inventory_movements_task_id_foreign"\)[\s\S]*dropTable\("task_events"\)[\s\S]*dropTable\("task_assignments"\)[\s\S]*dropTable\("tasks"\)/
  );
});

test("tasks table contains approved fields, box quantities, version, and foreign keys", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("tasks"\)/);
  assert.match(source, /addColumn\("id", "uuid", \(column\) => column\.primaryKey\(\)\.notNull\(\)\)/);
  assert.match(source, /addColumn\("status", "text", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("depot_id", "uuid", \(column\) => column\.references\("depots\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("client_id", "uuid", \(column\) => column\.references\("clients\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("order_id", "uuid", \(column\) => column\.references\("orders\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("order_item_id", "uuid", \(column\) => column\.references\("order_items\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("inventory_item_id", "uuid", \(column\) => column\.references\("inventory_items\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("inventory_batch_id", "uuid", \(column\) => column\.references\("inventory_batches\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("source_location_id", "uuid", \(column\) => column\.references\("locations\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("destination_location_id", "uuid", \(column\) => column\.references\("locations\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("shift_id", "uuid", \(column\) => column\.references\("shifts\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("planned_box_quantity", "bigint"\)/);
  assert.match(source, /addColumn\("completed_box_quantity", "bigint"\)/);
  assert.match(source, /tasks_planned_box_quantity_non_negative/);
  assert.match(source, /tasks_completed_box_quantity_non_negative/);
  assert.match(source, /tasks_version_positive/);
});

test("task_assignments table records historical multi-employee participation", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("task_assignments"\)/);
  assert.match(source, /addColumn\("task_id", "uuid", \(column\) => column\.notNull\(\)\.references\("tasks\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("employee_id", "uuid", \(column\) => column\.notNull\(\)\.references\("employees\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("assigned_by_user_id", "uuid", \(column\) => column\.notNull\(\)\.references\("users\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("unassigned_by_user_id", "uuid", \(column\) => column\.references\("users\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /task_assignments_task_active_index/);
  assert.match(source, /task_assignments_employee_active_index/);
  assert.match(source, /task_assignments_version_positive/);
  assert.match(source, /task_assignments_unassigned_after_assigned/);
});

test("task_events table records append-only lifecycle history", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("task_events"\)/);
  assert.match(source, /addColumn\("task_id", "uuid", \(column\) => column\.notNull\(\)\.references\("tasks\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("event_type", "text", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("actor_user_id", "uuid", \(column\) => column\.references\("users\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("correlation_id", "uuid"\)/);
  assert.match(source, /addColumn\("metadata", "jsonb"\)/);
  assert.match(source, /task_events_task_id_event_at_index/);
  assert.match(source, /task_events_event_type_event_at_index/);
});

test("migration 006 establishes foreign key constraint on inventory_movements.task_id", async () => {
  const source = await readMigration();

  assert.match(source, /alterTable\("inventory_movements"\)/);
  assert.match(source, /addForeignKeyConstraint\(\s*"inventory_movements_task_id_foreign",\s*\["task_id"\],\s*"tasks",\s*\["id"\]\s*\)/);
});

test("migration 006 does not invent alternate quantity units or downstream domains", async () => {
  const source = await readMigration();

  assert.doesNotMatch(source, /piece_quantity|pallet_quantity|kg_quantity/);
  assert.doesNotMatch(source, /incentive_rules|payroll_ledger|kpi_snapshots|quality_records/);
});
