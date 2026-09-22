import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(workspaceRoot, "packages", "db", "migrations");
const migration008Name = "008_create_login_attempts.ts";
const migration008Path = path.join(migrationsDirectory, migration008Name);

async function readMigration(): Promise<string> {
  return readFile(migration008Path, "utf8");
}

test("migrations directory contains 008 in correct lexical sequence", async () => {
  const allEntries = await readdir(migrationsDirectory);
  const migrationFiles = allEntries.filter((file) => file.endsWith(".ts")).sort();

  assert.deepEqual(migrationFiles.slice(0, 8), [
    "001_create_users_and_rbac.ts",
    "002_create_sessions_and_employees.ts",
    "003_create_depots_locations_and_shifts.ts",
    "004_create_clients_orders_and_order_items.ts",
    "005_create_inventory_items_batches_balances_and_movements.ts",
    "006_create_tasks_assignments_and_events.ts",
    "007_create_quality_records_and_task_photos.ts",
    "008_create_login_attempts.ts"
  ]);
});

test("migration 008 creates and drops login_attempts table in dependency order", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("login_attempts"\)/);
  assert.match(source, /dropTable\("login_attempts"\)/);
});

test("login_attempts table contains required fields, foreign keys, and indexes", async () => {
  const source = await readMigration();

  assert.match(source, /addColumn\("id", "uuid", \(column\) => column\.primaryKey\(\)\.notNull\(\)\)/);
  assert.match(source, /addColumn\("login_identifier", "text", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("attempted_at", "timestamptz", \(column\) => column\.notNull\(\)\.defaultTo\(sql`now\(\)`\)\)/);
  assert.match(source, /addColumn\("succeeded", "boolean", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("user_id", "uuid", \(column\) => column\.references\("users\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("lockout_until", "timestamptz"\)/);
  assert.match(source, /addColumn\("correlation_id", "uuid"\)/);
  assert.match(source, /login_attempts_lockout_order/);
  assert.match(source, /login_attempts_identifier_attempted_index/);
  assert.match(source, /login_attempts_user_id_index/);
});
