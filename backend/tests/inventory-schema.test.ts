import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(workspaceRoot, "packages", "db", "migrations");
const migration005Name = "005_create_inventory_items_batches_balances_and_movements.ts";
const migration005Path = path.join(migrationsDirectory, migration005Name);

async function readMigration(): Promise<string> {
  return readFile(migration005Path, "utf8");
}

test("migrations directory contains 005 in correct lexical sequence", async () => {
  const allEntries = await readdir(migrationsDirectory);
  const migrationFiles = allEntries.filter((file) => file.endsWith(".ts")).sort();

  assert.deepEqual(migrationFiles.slice(0, 5), [
    "001_create_users_and_rbac.ts",
    "002_create_sessions_and_employees.ts",
    "003_create_depots_locations_and_shifts.ts",
    "004_create_clients_orders_and_order_items.ts",
    "005_create_inventory_items_batches_balances_and_movements.ts"
  ]);
});

test("migration 005 creates and drops all four inventory tables in dependency order", async () => {
  const source = await readMigration();

  // Up order: items -> batches -> balances -> movements
  assert.match(
    source,
    /createTable\("inventory_items"\)[\s\S]*createTable\("inventory_batches"\)[\s\S]*createTable\("inventory_balances"\)[\s\S]*createTable\("inventory_movements"\)/
  );

  // Down order: movements -> balances -> batches -> items
  assert.match(
    source,
    /dropTable\("inventory_movements"\)[\s\S]*dropTable\("inventory_balances"\)[\s\S]*dropTable\("inventory_batches"\)[\s\S]*dropTable\("inventory_items"\)/
  );
});

test("inventory_items establishes product identity with required keys and constraints", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("inventory_items"\)/);
  assert.match(source, /addColumn\("id", "uuid", \(column\) => column\.primaryKey\(\)\.notNull\(\)\)/);
  assert.match(source, /addColumn\("product_code", "text", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("name", "text"\)/);
  assert.match(source, /inventory_items_product_code_unique/);
  assert.match(source, /inventory_items_version_positive/);
});

test("inventory_batches establishes product+batch relationship with required uniqueness", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("inventory_batches"\)/);
  assert.match(source, /addColumn\("inventory_item_id", "uuid", \(column\) => column\.notNull\(\)\.references\("inventory_items\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("batch_number", "text", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /inventory_batches_item_batch_unique/);
  assert.match(source, /inventory_batches_inventory_item_id_index/);
  assert.match(source, /inventory_batches_version_positive/);
});

test("inventory_balances enforces non-negative stock and location balance uniqueness", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("inventory_balances"\)/);
  assert.match(source, /addColumn\("inventory_batch_id", "uuid", \(column\) => column\.notNull\(\)\.references\("inventory_batches\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("location_id", "uuid", \(column\) => column\.notNull\(\)\.references\("locations\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("box_quantity", "bigint", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /inventory_balances_batch_location_unique/);
  assert.match(source, /inventory_balances_box_quantity_non_negative/);
  assert.match(source, /inventory_balances_version_positive/);
  assert.match(source, /inventory_balances_inventory_batch_id_index/);
  assert.match(source, /inventory_balances_location_id_index/);
  assert.match(source, /inventory_balances_location_batch_index/);
});

test("inventory_movements defines append-only ledger with positive quantity and idempotency", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("inventory_movements"\)/);
  assert.match(source, /addColumn\("inventory_batch_id", "uuid", \(column\) => column\.notNull\(\)\.references\("inventory_batches\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("source_location_id", "uuid", \(column\) => column\.references\("locations\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("destination_location_id", "uuid", \(column\) => column\.references\("locations\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("box_quantity", "bigint", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("task_id", "uuid"\)/);
  assert.match(source, /addColumn\("movement_type", "text", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /addColumn\("occurred_at", "timestamptz", \(column\) => column\.notNull\(\)/);
  assert.match(source, /addColumn\("actor_user_id", "uuid", \(column\) => column\.references\("users\.id"\)\.onDelete\("restrict"\)\)/);
  assert.match(source, /addColumn\("idempotency_key", "text"\)/);
  assert.match(source, /addColumn\("correlation_id", "uuid"\)/);
  assert.match(source, /inventory_movements_box_quantity_positive/);
  assert.match(source, /inventory_movements_idempotency_key_unique/);
  assert.match(source, /inventory_movements_batch_occurred_index/);
  assert.match(source, /inventory_movements_source_location_id_index/);
  assert.match(source, /inventory_movements_destination_location_id_index/);
  assert.match(source, /inventory_movements_task_id_index/);
  assert.match(source, /inventory_movements_actor_user_id_index/);
  assert.match(source, /inventory_movements_correlation_id_index/);
});

test("migration 005 does not create a tasks table or invent speculative fields/units", async () => {
  const source = await readMigration();

  // Tasks table must not be created yet
  assert.doesNotMatch(source, /createTable\("tasks"\)/);
  assert.doesNotMatch(source, /references\("tasks\.id"\)/);

  // No alternate units (kg, pieces, pallets) as operational quantity columns
  assert.doesNotMatch(source, /piece_quantity|pallet_quantity|kg_quantity/);

  // No speculative pricing / ERP fields
  assert.doesNotMatch(source, /price|cost|sku|barcode|erp_|status/);
});
