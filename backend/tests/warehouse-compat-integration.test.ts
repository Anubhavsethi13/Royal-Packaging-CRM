import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after, beforeEach } from "node:test";
import type { DatabaseConnection } from "@royal-packaging/db";
import { calculateGridRoute } from "@royal-packaging/contracts";
import { withCamelCaseMirror } from "../apps/api/src/utils/http-utils.js";
import { InventoryService } from "../apps/api/src/modules/inventory/inventory-service.js";
import { TaskService } from "../apps/api/src/modules/warehouse/task-service.js";
import {
  ensureTestDatabase,
  getScopedTestDatabaseUrl,
  getTestDatabase,
  migrateTestDatabase,
  truncateAllTables,
  cleanupTestDatabase
} from "./helpers/postgres-test-helper.js";

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);

let db: DatabaseConnection;
let inventoryService: InventoryService;
let taskService: TaskService;

let testDepotId: string;
let testLocationId: string;
let testItemId: string;
let testBatchId: string;
let testEmployeeId: string;

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);

  inventoryService = new InventoryService({ database: db });
  taskService = new TaskService({ database: db });
});

after(async () => {
  if (db) {
    await cleanupTestDatabase(db);
  }
});

beforeEach(async () => {
  await truncateAllTables(db);
  const now = new Date();

  testDepotId = crypto.randomUUID();
  await db.insertInto("depots").values({ id: testDepotId, code: "DEP-01", name: "Main Depot", active: true }).execute();

  testLocationId = crypto.randomUUID();
  await db
    .insertInto("locations")
    .values({
      id: testLocationId,
      depot_id: testDepotId,
      parent_location_id: null,
      code: "R3-A12",
      name: "Row 3 Aisle 12",
      active: true
    })
    .execute();

  testItemId = crypto.randomUUID();
  await db
    .insertInto("inventory_items")
    .values({ id: testItemId, product_code: "PRD-100", name: "Test Item" })
    .execute();

  testBatchId = crypto.randomUUID();
  await db
    .insertInto("inventory_batches")
    .values({ id: testBatchId, inventory_item_id: testItemId, batch_number: "BATCH-100" })
    .execute();

  await db
    .insertInto("inventory_balances")
    .values({
      id: crypto.randomUUID(),
      inventory_batch_id: testBatchId,
      location_id: testLocationId,
      box_quantity: "42",
      created_at: now,
      updated_at: now,
      version: "1"
    })
    .execute();

  testEmployeeId = crypto.randomUUID();
  await db
    .insertInto("employees")
    .values({
      id: testEmployeeId,
      user_id: null,
      is_active: true,
      employee_code: "EMP-200",
      created_at: now,
      updated_at: now,
      version: "1"
    })
    .execute();
});

test("WC1: listItems aggregates box quantity across balances", async () => {
  const items = await inventoryService.listItems({});
  const item = items.find((i) => i.id === testItemId);
  assert.ok(item);
  assert.equal(item?.total_box_quantity, 42n);
});

test("WC2: getItemById returns per-batch/location balance breakdown", async () => {
  const item = await inventoryService.getItemById(testItemId);
  assert.ok(item);
  assert.equal(item?.total_box_quantity, 42n);
  assert.equal(item?.balances.length, 1);
  assert.equal(item?.balances[0]?.location_id, testLocationId);
});

test("WC3: getItemById returns null for an unknown item", async () => {
  const item = await inventoryService.getItemById(crypto.randomUUID());
  assert.equal(item, null);
});

test("WC4: scanBarcode matches by product_code", async () => {
  const result = await inventoryService.scanBarcode("PRD-100");
  assert.equal(result.matchType, "PRODUCT_CODE");
  assert.equal(result.item?.id, testItemId);
});

test("WC5: scanBarcode matches by batch_number and returns balances", async () => {
  const result = await inventoryService.scanBarcode("BATCH-100");
  assert.equal(result.matchType, "BATCH_NUMBER");
  assert.equal(result.batch?.id, testBatchId);
  assert.equal(result.balances.length, 1);
});

test("WC6: scanBarcode returns NOT_FOUND for an unknown barcode", async () => {
  const result = await inventoryService.scanBarcode("does-not-exist");
  assert.equal(result.matchType, "NOT_FOUND");
});

test("WC7: resolveBatchForItem selects the oldest batch at a location (FIFO)", async () => {
  const batch = await inventoryService.resolveBatchForItem(testItemId, testLocationId);
  assert.equal(batch, testBatchId);
});

test("WC8: calculateGridRoute computes Manhattan distance between grid locations", () => {
  const route = calculateGridRoute("R1-A1", "R3-A12");
  assert.equal(route.rowDistance, 2);
  assert.equal(route.aisleDistance, 11);
  assert.equal(route.totalSteps, 13);
});

test("WC9: calculateGridRoute rejects malformed grid codes", () => {
  assert.throws(() => calculateGridRoute("BAD", "R3-A12"));
});

test("WC10: listTasks filters by employee_id, status, and depot_id", async () => {
  const actorUserId = crypto.randomUUID();
  await db
    .insertInto("users")
    .values({
      id: actorUserId,
      login_identifier: "actor@royalpackaging.test",
      password_hash: "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
      is_active: true
    })
    .execute();

  const task = await taskService.createTask({ depot_id: testDepotId }, actorUserId);
  await taskService.assignTask({ task_id: task.id, employee_id: testEmployeeId }, actorUserId);

  const byEmployee = await taskService.listTasks({ employee_id: testEmployeeId });
  assert.equal(byEmployee.length, 1);
  assert.equal(byEmployee[0]?.id, task.id);

  const byStatus = await taskService.listTasks({ status: "ASSIGNED" });
  assert.ok(byStatus.some((t) => t.id === task.id));

  const byDepot = await taskService.listTasks({ depot_id: testDepotId });
  assert.ok(byDepot.some((t) => t.id === task.id));

  const byOtherEmployee = await taskService.listTasks({ employee_id: crypto.randomUUID() });
  assert.equal(byOtherEmployee.length, 0);
});

test("WC11: withCamelCaseMirror adds camelCase keys alongside snake_case, additively", () => {
  const input = { inventory_batch_id: "abc", nested: { source_location_id: "xyz", already_camel: 1 } };
  const mirrored = withCamelCaseMirror(input) as Record<string, unknown>;

  assert.equal(mirrored.inventory_batch_id, "abc");
  assert.equal(mirrored.inventoryBatchId, "abc");
  const nested = mirrored.nested as Record<string, unknown>;
  assert.equal(nested.source_location_id, "xyz");
  assert.equal(nested.sourceLocationId, "xyz");
});

test("WC12: withCamelCaseMirror passes Date/bigint/null through arrays unchanged", () => {
  const now = new Date();
  const input = [{ occurred_at: now, box_quantity: 5n, source_location_id: null }];
  const mirrored = withCamelCaseMirror(input) as Array<Record<string, unknown>>;

  assert.equal(mirrored[0]?.occurred_at, now);
  assert.equal(mirrored[0]?.occurredAt, now);
  assert.equal(mirrored[0]?.box_quantity, 5n);
  assert.equal(mirrored[0]?.source_location_id, null);
  assert.equal(mirrored[0]?.sourceLocationId, null);
});
