import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(
  workspaceRoot,
  "packages",
  "db",
  "migrations",
  "004_create_clients_orders_and_order_items.ts"
);

async function readMigration(): Promise<string> {
  return readFile(migrationPath, "utf8");
}

test("commercial migration follows the established dependency order", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("clients"\)[\s\S]*createTable\("orders"\)[\s\S]*createTable\("order_items"\)/);
  assert.match(source, /dropTable\("order_items"\)[\s\S]*dropTable\("orders"\)[\s\S]*dropTable\("clients"\)/);
});

test("clients and orders preserve the approved client-to-order relationship", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("clients"\)[\s\S]*addColumn\("name", "text", \(column\) => column\.notNull\(\)\)/);
  assert.match(source, /createTable\("orders"\)[\s\S]*addColumn\("client_id", "uuid", \(column\) => column\.notNull\(\)\.references\("clients\.id"\)/);
  assert.match(source, /orders_client_id_index/);
  assert.match(source, /clients_version_positive/);
  assert.match(source, /orders_version_positive/);
});

test("order items are structurally linked to orders without speculative fields", async () => {
  const source = await readMigration();

  assert.match(source, /createTable\("order_items"\)[\s\S]*addColumn\("order_id", "uuid", \(column\) => column\.notNull\(\)\.references\("orders\.id"\)/);
  assert.match(source, /order_items_order_id_index/);
  assert.match(source, /order_items_version_positive/);
  assert.doesNotMatch(source, /client_code|order_code|status|product|batch|box_quantity|weight|pallet|piece/);
});
