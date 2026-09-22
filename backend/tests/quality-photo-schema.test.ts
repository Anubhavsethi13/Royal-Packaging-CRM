import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(workspaceRoot, "packages", "db", "migrations");
const migration007Name = "007_create_quality_records_and_task_photos.ts";
const migration007Path = path.join(migrationsDirectory, migration007Name);

async function readMigration(): Promise<string> {
  return readFile(migration007Path, "utf8");
}

test("migrations directory contains 007 in correct lexical sequence", async () => {
  const allEntries = await readdir(migrationsDirectory);
  const migrationFiles = allEntries.filter((file) => file.endsWith(".ts")).sort();

  assert.deepEqual(migrationFiles.slice(0, 7), [
    "001_create_users_and_rbac.ts",
    "002_create_sessions_and_employees.ts",
    "003_create_depots_locations_and_shifts.ts",
    "004_create_clients_orders_and_order_items.ts",
    "005_create_inventory_items_batches_balances_and_movements.ts",
    "006_create_tasks_assignments_and_events.ts",
    "007_create_quality_records_and_task_photos.ts"
  ]);
});

test("migration 007 creates and drops task_photos and quality_records in dependency order", async () => {
  const source = await readMigration();

  // Up order: task_photos -> quality_records
  assert.match(
    source,
    /createTable\("task_photos"\)[\s\S]*createTable\("quality_records"\)/
  );

  // Down order: quality_records -> task_photos
  assert.match(
    source,
    /dropTable\("quality_records"\)[\s\S]*dropTable\("task_photos"\)/
  );
});

test("task_photos table implements layer box quantity, upload status, abstract storage, and correction reference", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("task_photos"\)/);
  assert.match(source, /addColumn\("id", "uuid", \(column\) => column\.primaryKey\(\)\.notNull\(\)\)/);
  assert.match(source, /addColumn\("task_id", "uuid", \(column\) => column\.notNull\(\)\.references\("tasks\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("layer_number", "integer", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("box_quantity", "bigint", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("captured_by_employee_id", "uuid", \(column\) => column\.references\("employees\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("captured_at", "timestamptz", \(column\) => column\.notNull\(\)\.defaultTo\(sql`now\(\)`\)\)/);
  assert.match(source, /addColumn\("storage_key", "text", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("status", "text"\)/);
  assert.match(source, /addColumn\("superseded_by_photo_id", "uuid", \(column\) => column\.references\("task_photos\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /task_photos_layer_number_positive/);
  assert.match(source, /task_photos_box_quantity_positive/);
  assert.match(source, /task_photos_version_positive/);
  assert.match(source, /task_photos_task_id_index/);
  assert.match(source, /task_photos_task_layer_index/);
  assert.match(source, /task_photos_storage_key_index/);
  assert.match(source, /task_photos_captured_by_employee_id_index/);
  assert.match(source, /task_photos_status_index/);
});

test("quality_records table implements inspection outcome, score, damage rate, final inventory status, and correction reference", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("quality_records"\)/);
  assert.match(source, /addColumn\("id", "uuid", \(column\) => column\.primaryKey\(\)\.notNull\(\)\)/);
  assert.match(source, /addColumn\("task_id", "uuid", \(column\) => column\.notNull\(\)\.references\("tasks\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("outcome", "text", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("quality_score", "numeric"\)/);
  assert.match(source, /addColumn\("damage_rate", "numeric"\)/);
  assert.match(source, /addColumn\("task_accuracy", "numeric"\)/);
  assert.match(source, /addColumn\("final_inventory_status", "text"\)/);
  assert.match(source, /addColumn\("inspected_by_user_id", "uuid", \(column\) => column\.references\("users\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("superseded_by_record_id", "uuid", \(column\) => column\.references\("quality_records\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /quality_records_version_positive/);
  assert.match(source, /quality_records_quality_score_range/);
  assert.match(source, /quality_records_damage_rate_range/);
  assert.match(source, /quality_records_task_accuracy_range/);
  assert.match(source, /quality_records_task_id_index/);
  assert.match(source, /quality_records_inspected_by_user_id_index/);
  assert.match(source, /quality_records_inspected_at_index/);
  assert.match(source, /quality_records_outcome_index/);
});

test("migration 007 does not invent storage providers, alternate quantity units, or downstream financial domains", async () => {
  const source = await readMigration();

  // No hard-coded storage providers
  assert.doesNotMatch(source, /s3|aws|gcs|azure|blob|local_disk/i);

  // No alternate quantity units
  assert.doesNotMatch(source, /piece_quantity|pallet_quantity|kg_quantity/);

  // No downstream financial domains
  assert.doesNotMatch(source, /incentive_rules|payroll_ledger|kpi_snapshots/);
});
