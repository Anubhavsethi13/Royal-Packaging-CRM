import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after, beforeEach } from "node:test";
import { sql } from "kysely";
import bcrypt from "bcryptjs";
import {
  checkDatabaseHealth,
  type DatabaseConnection
} from "@royal-packaging/db";
import {
  InventoryDomainError,
  TaskDomainError,
  QualityDomainError,
  IncentiveDomainError,
  type AuthenticatedUser
} from "@royal-packaging/contracts";
import { AuthService } from "../apps/api/src/modules/identity/auth-service.js";
import { RBACService } from "../apps/api/src/modules/identity/rbac-service.js";
import { InventoryService } from "../apps/api/src/modules/inventory/inventory-service.js";
import { TaskService } from "../apps/api/src/modules/warehouse/task-service.js";
import { IncentiveService } from "../apps/api/src/modules/incentives/incentive-service.js";
import { QualityService } from "../apps/api/src/modules/quality/quality-service.js";
import { WarehouseOrchestrator } from "../apps/api/src/modules/warehouse/warehouse-orchestrator.js";
import { createApiApp } from "../apps/api/src/app.js";
import { PermissiveAuthorizationPolicy } from "../apps/api/src/middleware/auth-middleware.js";
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
let authService: AuthService;
let rbacService: RBACService;
let inventoryService: InventoryService;
let taskService: TaskService;
let qualityService: QualityService;
let incentiveService: IncentiveService;
let orchestrator: WarehouseOrchestrator;

// Shared IDs for domain seeding
let testUserId: string;
let testEmployeeId: string;
let testDepotId: string;
let testSourceLocId: string;
let testDestLocId: string;
let testBatchId: string;
let testItemId: string;

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);

  authService = new AuthService({ database: db });
  rbacService = new RBACService({ database: db });
  inventoryService = new InventoryService({ database: db });
  taskService = new TaskService({ database: db });
  qualityService = new QualityService({ database: db });
  incentiveService = new IncentiveService({ database: db });
  orchestrator = new WarehouseOrchestrator({
    database: db,
    taskService,
    inventoryService,
    qualityService
  });
});

after(async () => {
  if (db) {
    await cleanupTestDatabase(db);
  }
});

beforeEach(async () => {
  await truncateAllTables(db);

  // Seed baseline organization: user, employee, depot, locations, inventory item, batch
  const passwordHash = await bcrypt.hash("securePassword123!", 4);

  testUserId = crypto.randomUUID();
  await db
    .insertInto("users")
    .values({
      id: testUserId,
      login_identifier: "warehouse_worker",
      password_hash: passwordHash,
      is_active: true
    })
    .execute();

  testEmployeeId = crypto.randomUUID();
  await db
    .insertInto("employees")
    .values({
      id: testEmployeeId,
      user_id: testUserId,
      is_active: true,
      employee_code: `EMP-${testEmployeeId.slice(0, 8)}`
    })
    .execute();

  testDepotId = crypto.randomUUID();
  await db
    .insertInto("depots")
    .values({
      id: testDepotId,
      code: "DEP-01",
      name: "Main Depot",
      active: true
    })
    .execute();

  testSourceLocId = crypto.randomUUID();
  await db
    .insertInto("locations")
    .values({
      id: testSourceLocId,
      depot_id: testDepotId,
      parent_location_id: null,
      code: "LOC-SRC-01",
      name: "Source Shelf A",
      active: true
    })
    .execute();

  testDestLocId = crypto.randomUUID();
  await db
    .insertInto("locations")
    .values({
      id: testDestLocId,
      depot_id: testDepotId,
      parent_location_id: null,
      code: "LOC-DST-01",
      name: "Destination Staging B",
      active: true
    })
    .execute();

  testItemId = crypto.randomUUID();
  await db
    .insertInto("inventory_items")
    .values({
      id: testItemId,
      product_code: "PRD-BOX-01",
      name: "Cardboard Box Heavy Duty"
    })
    .execute();

  testBatchId = crypto.randomUUID();
  await db
    .insertInto("inventory_batches")
    .values({
      id: testBatchId,
      inventory_item_id: testItemId,
      batch_number: "BATCH-2026-001"
    })
    .execute();
});

// ============================================================================
// TEST GROUP 1 — DATABASE / MIGRATION
// ============================================================================

test("TG1.1: Database health check against real PostgreSQL", async () => {
  const health = await checkDatabaseHealth(db);
  assert.equal(health.healthy, true);
  assert.ok(health.checkedAt instanceof Date);
});

test("TG1.2: Foreign key constraints are strictly enforced in real PostgreSQL", async () => {
  const fakeBatchId = "00000000-0000-0000-0000-000000000099";
  await assert.rejects(
    async () => {
      await db
        .insertInto("inventory_balances")
        .values({
          id: crypto.randomUUID(),
          inventory_batch_id: fakeBatchId,
          location_id: testSourceLocId,
          box_quantity: "10"
        })
        .execute();
    },
    (err: Error) => {
      assert.ok(err.message.includes("foreign key") || (err as { code?: string }).code === "23503");
      return true;
    }
  );
});

test("TG1.3: CHECK constraint prevents negative box quantity in inventory_balances", async () => {
  await assert.rejects(
    async () => {
      await db
        .insertInto("inventory_balances")
        .values({
          id: crypto.randomUUID(),
          inventory_batch_id: testBatchId,
          location_id: testSourceLocId,
          box_quantity: "-5"
        })
        .execute();
    },
    (err: Error) => {
      assert.ok(err.message.includes("check") || (err as { code?: string }).code === "23514");
      return true;
    }
  );
});

test("TG1.4: UNIQUE constraint prevents duplicate (inventory_batch_id, location_id) in inventory_balances", async () => {
  await db
    .insertInto("inventory_balances")
    .values({
      id: crypto.randomUUID(),
      inventory_batch_id: testBatchId,
      location_id: testSourceLocId,
      box_quantity: "50"
    })
    .execute();

  await assert.rejects(
    async () => {
      await db
        .insertInto("inventory_balances")
        .values({
          id: crypto.randomUUID(),
          inventory_batch_id: testBatchId,
          location_id: testSourceLocId,
          box_quantity: "20"
        })
        .execute();
    },
    (err: Error) => {
      assert.ok(err.message.includes("unique") || (err as { code?: string }).code === "23505");
      return true;
    }
  );
});

test("TG1.5: BIGINT and NUMERIC fields maintain 64-bit and high-precision values in real PostgreSQL", async () => {
  const largeQuantity = 9007199254740991n; // 2^53 - 1
  const balance = await db
    .insertInto("inventory_balances")
    .values({
      id: crypto.randomUUID(),
      inventory_batch_id: testBatchId,
      location_id: testSourceLocId,
      box_quantity: largeQuantity.toString()
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  assert.equal(BigInt(balance.box_quantity), largeQuantity);

  const kpiDef = await db
    .insertInto("kpi_definitions")
    .values({
      id: crypto.randomUUID(),
      code: "KPI-TEST-BIGINT",
      name: "High Precision Measurement",
      active: true
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  const target = await db
    .insertInto("kpi_targets")
    .values({
      id: crypto.randomUUID(),
      kpi_definition_id: kpiDef.id,
      target_value: "12345.6789",
      warning_threshold: "98.7654",
      critical_threshold: "50.1234"
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  assert.equal(target.target_value, "12345.6789");
  assert.equal(target.warning_threshold, "98.7654");
  assert.equal(target.critical_threshold, "50.1234");
});

// ============================================================================
// TEST GROUP 2 — INVENTORY TRANSACTIONS
// ============================================================================

test("TG2.1: Successful movement atomically decrements source, increments destination, and inserts movement ledger", async () => {
  await db
    .insertInto("inventory_balances")
    .values({
      id: crypto.randomUUID(),
      inventory_batch_id: testBatchId,
      location_id: testSourceLocId,
      box_quantity: "100"
    })
    .execute();

  const result = await inventoryService.moveInventory(
    {
      inventory_batch_id: testBatchId,
      source_location_id: testSourceLocId,
      destination_location_id: testDestLocId,
      box_quantity: 30n,
      movement_type: "TRANSFER"
    },
    testUserId
  );

  assert.equal(result.is_idempotent_replay, false);
  assert.equal(result.source_balance_after, 70n);
  assert.equal(result.destination_balance_after, 30n);

  const srcBal = await inventoryService.getBalance(testBatchId, testSourceLocId);
  assert.equal(srcBal?.box_quantity, 70n);

  const dstBal = await inventoryService.getBalance(testBatchId, testDestLocId);
  assert.equal(dstBal?.box_quantity, 30n);

  const movements = await db.selectFrom("inventory_movements").selectAll().execute();
  assert.equal(movements.length, 1);
  assert.equal(BigInt(movements[0]!.box_quantity), 30n);
  assert.equal(movements[0]!.actor_user_id, testUserId);
});

test("TG2.2: Insufficient stock rolls back entire transaction without partial mutations in real PostgreSQL", async () => {
  await db
    .insertInto("inventory_balances")
    .values({
      id: crypto.randomUUID(),
      inventory_batch_id: testBatchId,
      location_id: testSourceLocId,
      box_quantity: "20"
    })
    .execute();

  await assert.rejects(
    async () => {
      await inventoryService.moveInventory(
        {
          inventory_batch_id: testBatchId,
          source_location_id: testSourceLocId,
          destination_location_id: testDestLocId,
          box_quantity: 50n,
          movement_type: "TRANSFER"
        },
        testUserId
      );
    },
    (err: Error) => {
      assert.ok(err instanceof InventoryDomainError);
      assert.equal(err.code, "INSUFFICIENT_STOCK");
      return true;
    }
  );

  const srcBal = await inventoryService.getBalance(testBatchId, testSourceLocId);
  assert.equal(srcBal?.box_quantity, 20n);

  const dstBal = await inventoryService.getBalance(testBatchId, testDestLocId);
  assert.equal(dstBal, null);

  const movements = await db.selectFrom("inventory_movements").selectAll().execute();
  assert.equal(movements.length, 0);
});

test("TG2.3: Same-location movement is rejected before database mutation", async () => {
  await assert.rejects(
    async () => {
      await inventoryService.moveInventory(
        {
          inventory_batch_id: testBatchId,
          source_location_id: testSourceLocId,
          destination_location_id: testSourceLocId,
          box_quantity: 10n,
          movement_type: "TRANSFER"
        },
        testUserId
      );
    },
    (err: Error) => {
      assert.ok(err instanceof InventoryDomainError);
      assert.equal(err.code, "SAME_LOCATION_UNSUPPORTED");
      return true;
    }
  );
});

// ============================================================================
// TEST GROUP 3 — INVENTORY CONCURRENCY
// ============================================================================

test("TG3.1: Concurrent overlapping stock consumption serializes via row locks and prevents negative stock", async () => {
  // Start with 100 boxes in source
  await db
    .insertInto("inventory_balances")
    .values({
      id: crypto.randomUUID(),
      inventory_batch_id: testBatchId,
      location_id: testSourceLocId,
      box_quantity: "100"
    })
    .execute();

  // Launch 4 concurrent requests each trying to move 40 boxes (total 160 requested > 100 available)
  const results = await Promise.allSettled([
    inventoryService.moveInventory(
      {
        inventory_batch_id: testBatchId,
        source_location_id: testSourceLocId,
        destination_location_id: testDestLocId,
        box_quantity: 40n,
        movement_type: "TRANSFER"
      },
      testUserId
    ),
    inventoryService.moveInventory(
      {
        inventory_batch_id: testBatchId,
        source_location_id: testSourceLocId,
        destination_location_id: testDestLocId,
        box_quantity: 40n,
        movement_type: "TRANSFER"
      },
      testUserId
    ),
    inventoryService.moveInventory(
      {
        inventory_batch_id: testBatchId,
        source_location_id: testSourceLocId,
        destination_location_id: testDestLocId,
        box_quantity: 40n,
        movement_type: "TRANSFER"
      },
      testUserId
    ),
    inventoryService.moveInventory(
      {
        inventory_batch_id: testBatchId,
        source_location_id: testSourceLocId,
        destination_location_id: testDestLocId,
        box_quantity: 40n,
        movement_type: "TRANSFER"
      },
      testUserId
    )
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  // Exactly 2 requests must succeed (40 + 40 = 80 boxes moved, 20 left).
  // Exactly 2 requests must fail with INSUFFICIENT_STOCK.
  assert.equal(fulfilled.length, 2);
  assert.equal(rejected.length, 2);

  for (const rej of rejected) {
    if (rej.status === "rejected") {
      assert.ok(rej.reason instanceof InventoryDomainError);
      assert.equal(rej.reason.code, "INSUFFICIENT_STOCK");
    }
  }

  const finalSource = await inventoryService.getBalance(testBatchId, testSourceLocId);
  const finalDest = await inventoryService.getBalance(testBatchId, testDestLocId);

  assert.equal(finalSource?.box_quantity, 20n);
  assert.equal(finalDest?.box_quantity, 80n);

  const movements = await db.selectFrom("inventory_movements").selectAll().execute();
  assert.equal(movements.length, 2);
});

// ============================================================================
// TEST GROUP 4 — INVENTORY IDEMPOTENCY
// ============================================================================

test("TG4.1: Idempotency replay returns existing movement without duplicate balance mutation", async () => {
  await db
    .insertInto("inventory_balances")
    .values({
      id: crypto.randomUUID(),
      inventory_batch_id: testBatchId,
      location_id: testSourceLocId,
      box_quantity: "100"
    })
    .execute();

  const req = {
    inventory_batch_id: testBatchId,
    source_location_id: testSourceLocId,
    destination_location_id: testDestLocId,
    box_quantity: 25n,
    movement_type: "TRANSFER",
    idempotency_key: "idem-key-001"
  };

  const res1 = await inventoryService.moveInventory(req, testUserId);
  assert.equal(res1.is_idempotent_replay, false);
  assert.equal(res1.source_balance_after, 75n);

  // Exact duplicate request
  const res2 = await inventoryService.moveInventory(req, testUserId);
  assert.equal(res2.is_idempotent_replay, true);
  assert.equal(res2.movement.id, res1.movement.id);

  // Verify only 1 movement in DB and balance was only decremented once
  const movements = await db.selectFrom("inventory_movements").selectAll().execute();
  assert.equal(movements.length, 1);

  const finalSource = await inventoryService.getBalance(testBatchId, testSourceLocId);
  assert.equal(finalSource?.box_quantity, 75n);
});

test("TG4.2: Idempotent retry mismatch throws IDEMPOTENT_RETRY_MISMATCH", async () => {
  await db
    .insertInto("inventory_balances")
    .values({
      id: crypto.randomUUID(),
      inventory_batch_id: testBatchId,
      location_id: testSourceLocId,
      box_quantity: "100"
    })
    .execute();

  await inventoryService.moveInventory(
    {
      inventory_batch_id: testBatchId,
      source_location_id: testSourceLocId,
      destination_location_id: testDestLocId,
      box_quantity: 25n,
      movement_type: "TRANSFER",
      idempotency_key: "idem-key-mismatch"
    },
    testUserId
  );

  // Re-use key with different quantity (50n instead of 25n)
  await assert.rejects(
    async () => {
      await inventoryService.moveInventory(
        {
          inventory_batch_id: testBatchId,
          source_location_id: testSourceLocId,
          destination_location_id: testDestLocId,
          box_quantity: 50n,
          movement_type: "TRANSFER",
          idempotency_key: "idem-key-mismatch"
        },
        testUserId
      );
    },
    (err: Error) => {
      assert.ok(err instanceof InventoryDomainError);
      assert.equal(err.code, "IDEMPOTENT_RETRY_MISMATCH");
      return true;
    }
  );
});

// ============================================================================
// TEST GROUP 5 — TASK CONCURRENCY
// ============================================================================

test("TG5.1: Task lifecycle state transitions and version increments in PostgreSQL", async () => {
  const task = await taskService.createTask(
    {
      task_type: "MOVE",
      depot_id: testDepotId,
      inventory_batch_id: testBatchId,
      source_location_id: testSourceLocId,
      destination_location_id: testDestLocId,
      planned_box_quantity: 50n
    },
    testUserId
  );

  assert.equal(task.status, "PENDING");
  assert.equal(task.version, 1n);

  // Assign
  const assigned = await taskService.assignTask(
    {
      task_id: task.id,
      employee_id: testEmployeeId
    },
    testUserId
  );
  assert.equal(assigned.status, "ASSIGNED");
  assert.equal(assigned.version, 2n);

  // Start
  const started = await taskService.startTask(task.id, testUserId);
  assert.equal(started.status, "IN_PROGRESS");
  assert.equal(started.version, 3n);

  // Pause
  const paused = await taskService.pauseTask(task.id, testUserId, { metadata: { reason: "Lunch break" } });
  assert.equal(paused.status, "PAUSED");
  assert.equal(paused.version, 4n);

  // Resume
  const resumed = await taskService.resumeTask(task.id, testUserId);
  assert.equal(resumed.status, "IN_PROGRESS");
  assert.equal(resumed.version, 5n);

  // Complete
  const completed = await taskService.completeTask(
    {
      task_id: task.id,
      completed_box_quantity: 50n
    },
    testUserId
  );
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.version, 6n);

  // Verify events in PostgreSQL
  const events = await taskService.getTaskEvents(task.id);
  assert.equal(events.length, 6); // CREATED, ASSIGNED, STARTED, PAUSED, RESUMED, COMPLETED
});

test("TG5.2: Invalid state transition is rejected without modifying task in real PostgreSQL", async () => {
  const task = await taskService.createTask(
    {
      task_type: "MOVE",
      depot_id: testDepotId,
      inventory_batch_id: testBatchId,
      source_location_id: testSourceLocId,
      destination_location_id: testDestLocId,
      planned_box_quantity: 50n
    },
    testUserId
  );

  // Attempt to pause a PENDING task directly without starting
  await assert.rejects(
    async () => {
      await taskService.pauseTask(task.id, testUserId);
    },
    (err: Error) => {
      assert.ok(err instanceof TaskDomainError);
      assert.equal(err.code, "INVALID_TASK_STATE");
      return true;
    }
  );

  const unchanged = await taskService.getTask(task.id);
  assert.equal(unchanged?.status, "PENDING");
  assert.equal(unchanged?.version, 1n);
});

// ============================================================================
// TEST GROUP 6 — FND-12B CROSS-DOMAIN ATOMICITY
// ============================================================================

test("TG6.1: WarehouseOrchestrator.executeTaskMovement() commits all 5 writes in ONE atomic PostgreSQL transaction", async () => {
  await db
    .insertInto("inventory_balances")
    .values({
      id: crypto.randomUUID(),
      inventory_batch_id: testBatchId,
      location_id: testSourceLocId,
      box_quantity: "100"
    })
    .execute();

  const task = await taskService.createTask(
    {
      task_type: "MOVE",
      depot_id: testDepotId,
      inventory_batch_id: testBatchId,
      source_location_id: testSourceLocId,
      destination_location_id: testDestLocId,
      planned_box_quantity: 50n
    },
    testUserId
  );

  await taskService.assignTask(
    { task_id: task.id, employee_id: testEmployeeId },
    testUserId
  );
  await taskService.startTask(task.id, testUserId);

  const result = await orchestrator.executeTaskMovement(
    {
      task_id: task.id,
      inventory_batch_id: testBatchId,
      source_location_id: testSourceLocId,
      destination_location_id: testDestLocId,
      box_quantity: 50n,
      idempotency_key: "orch-atomicity-01"
    },
    testUserId
  );

  // 1. Source balance decremented
  const srcBal = await inventoryService.getBalance(testBatchId, testSourceLocId);
  assert.equal(srcBal?.box_quantity, 50n);

  // 2. Destination balance incremented
  const dstBal = await inventoryService.getBalance(testBatchId, testDestLocId);
  assert.equal(dstBal?.box_quantity, 50n);

  // 3. Movement ledger created
  const movements = await db.selectFrom("inventory_movements").selectAll().execute();
  assert.equal(movements.length, 1);
  assert.equal(movements[0]!.task_id, task.id);
  assert.equal(BigInt(movements[0]!.box_quantity), 50n);

  // 4. Task updated in database
  const updatedTask = await taskService.getTask(task.id);
  assert.ok(updatedTask);
  assert.equal(updatedTask.version, 4n);

  // 5. TASK_MOVEMENT_EXECUTED event inserted
  const events = await taskService.getTaskEvents(task.id);
  const movementEvent = events.find((e) => e.event_type === "TASK_MOVEMENT_EXECUTED");
  assert.ok(movementEvent);
  assert.equal(result.movement.movement.id, movements[0]!.id);
});

test("TG6.2: Orchestrator rollback on downstream failure restores inventory and leaves task unchanged", async () => {
  await db
    .insertInto("inventory_balances")
    .values({
      id: crypto.randomUUID(),
      inventory_batch_id: testBatchId,
      location_id: testSourceLocId,
      box_quantity: "100"
    })
    .execute();

  const task = await taskService.createTask(
    {
      task_type: "MOVE",
      depot_id: testDepotId,
      inventory_batch_id: testBatchId,
      source_location_id: testSourceLocId,
      destination_location_id: testDestLocId,
      planned_box_quantity: 50n
    },
    testUserId
  );

  await taskService.assignTask(
    { task_id: task.id, employee_id: testEmployeeId },
    testUserId
  );
  await taskService.startTask(task.id, testUserId);

  // Attempt movement with quantity (500) > stock (100) -> inventory movement fails with INSUFFICIENT_STOCK
  await assert.rejects(
    async () => {
      await orchestrator.executeTaskMovement(
        {
          task_id: task.id,
          inventory_batch_id: testBatchId,
          source_location_id: testSourceLocId,
          destination_location_id: testDestLocId,
          box_quantity: 500n
        },
        testUserId
      );
    },
    (err: Error) => {
      assert.ok(err instanceof InventoryDomainError);
      assert.equal(err.code, "INSUFFICIENT_STOCK");
      return true;
    }
  );

  // Verify COMPLETE ROLLBACK in PostgreSQL:
  // 1. Source balance is still 100
  const srcBal = await inventoryService.getBalance(testBatchId, testSourceLocId);
  assert.equal(srcBal?.box_quantity, 100n);

  // 2. Destination balance is null (0)
  const dstBal = await inventoryService.getBalance(testBatchId, testDestLocId);
  assert.equal(dstBal, null);

  // 3. No inventory movement record exists
  const movements = await db.selectFrom("inventory_movements").selectAll().execute();
  assert.equal(movements.length, 0);

  // 4. Task is still IN_PROGRESS at version 3
  const taskAfter = await taskService.getTask(task.id);
  assert.equal(taskAfter?.status, "IN_PROGRESS");
  assert.equal(taskAfter?.version, 3n);
});

// ============================================================================
// TEST GROUP 7 — TASK + EVENT ATOMICITY
// ============================================================================

test("TG7.1: Task creation and creation event commit atomically in PostgreSQL", async () => {
  const task = await taskService.createTask(
    {
      task_type: "PACK",
      depot_id: testDepotId,
      planned_box_quantity: 100n
    },
    testUserId
  );

  const taskRow = await db.selectFrom("tasks").where("id", "=", task.id).selectAll().executeTakeFirst();
  assert.ok(taskRow);
  assert.equal(taskRow.status, "PENDING");

  const events = await db.selectFrom("task_events").where("task_id", "=", task.id).selectAll().execute();
  assert.equal(events.length, 1);
  assert.equal(events[0]!.event_type, "TASK_CREATED");
});

// ============================================================================
// TEST GROUP 8 — QUALITY TRANSACTIONS
// ============================================================================

test("TG8.1: Quality inspection records threshold-based status and preserves history in PostgreSQL", async () => {
  const task = await taskService.createTask(
    {
      task_type: "MOVE",
      depot_id: testDepotId,
      planned_box_quantity: 50n
    },
    testUserId
  );

  // 1. Damage rate exactly 5.00% -> DAMAGED
  const rec1 = await qualityService.inspectTask(
    {
      task_id: task.id,
      outcome: "FAIL",
      quality_score: 85,
      task_accuracy: 95,
      damage_rate: 5.0,
      notes: "5% damaged cartons"
    },
    testUserId
  );
  assert.equal(rec1.outcome, "FAIL");
  assert.equal(rec1.final_inventory_status, "DAMAGED");

  // 2. Superseding inspection with 4.99% -> AVAILABLE
  const rec2 = await qualityService.inspectTask(
    {
      task_id: task.id,
      outcome: "PASS",
      quality_score: 95,
      task_accuracy: 99,
      damage_rate: 4.99,
      supersedes_record_id: rec1.id,
      notes: "Re-inspected: within tolerance"
    },
    testUserId
  );
  assert.equal(rec2.outcome, "PASS");
  assert.equal(rec2.final_inventory_status, "AVAILABLE");

  // Verify historical persistence in PostgreSQL
  const history = await qualityService.getTaskQualityHistory(task.id);
  assert.equal(history.length, 2);
  assert.equal(history[0]!.id, rec2.id); // latest record
  assert.equal(history[1]!.id, rec1.id);
  assert.equal(history[1]!.superseded_by_record_id, rec2.id);
});

test("TG8.2: Photo registration persists layer box quantities and enforces positive box quantity", async () => {
  const task = await taskService.createTask(
    {
      task_type: "MOVE",
      depot_id: testDepotId,
      planned_box_quantity: 50n
    },
    testUserId
  );

  const photo = await qualityService.recordTaskPhoto(
    {
      task_id: task.id,
      layer_number: 1,
      box_quantity: 12n,
      storage_key: "layers/task-1/layer-1.jpg",
      captured_by_employee_id: testEmployeeId
    },
    testEmployeeId
  );

  assert.equal(photo.layer_number, 1);
  assert.equal(photo.box_quantity, 12n);
  assert.equal(photo.storage_key, "layers/task-1/layer-1.jpg");

  const photos = await qualityService.getTaskPhotos(task.id);
  assert.equal(photos.length, 1);
  assert.equal(photos[0]!.id, photo.id);

  // Non-positive box quantity rejected by domain contract
  await assert.rejects(
    async () => {
      await qualityService.recordTaskPhoto(
        {
          task_id: task.id,
          layer_number: 2,
          box_quantity: 0n,
          storage_key: "layers/task-1/layer-2.jpg",
          captured_by_employee_id: testEmployeeId
        },
        testEmployeeId
      );
    },
    (err: Error) => {
      assert.ok(err instanceof QualityDomainError);
      assert.equal(err.code, "INVALID_BOX_QUANTITY");
      return true;
    }
  );
});

// ============================================================================
// TEST GROUP 9 — AUTH / SESSION PERSISTENCE
// ============================================================================

test("TG9.1: Auth login persists session in PostgreSQL, validates, and revokes cleanly on logout", async () => {
  const loginResult = await authService.login({
    login_identifier: "warehouse_worker",
    password: "securePassword123!"
  });

  assert.equal(loginResult.success, true);
  if (!loginResult.success) return;

  assert.equal(loginResult.user.login_identifier, "warehouse_worker");
  assert.ok(loginResult.sessionToken);

  // Session exists in PostgreSQL
  const sessionRow = await db
    .selectFrom("sessions")
    .where("id", "=", loginResult.session.id)
    .selectAll()
    .executeTakeFirst();
  assert.ok(sessionRow);
  assert.equal(sessionRow.user_id, testUserId);

  // Validate session token
  const validated = await authService.validateSession(loginResult.sessionToken);
  assert.ok(validated);
  assert.equal(validated.id, testUserId);

  // Logout / Revoke
  await authService.revokeSession(loginResult.sessionToken);

  // Revoked session cannot authenticate
  const afterLogout = await authService.validateSession(loginResult.sessionToken);
  assert.equal(afterLogout, null);
});

test("TG9.2: Failed login rate limiter enforces 5-attempt lockout against PostgreSQL persistence", async () => {
  for (let i = 1; i <= 4; i++) {
    const res = await authService.login({
      login_identifier: "warehouse_worker",
      password: "wrongPassword"
    });
    assert.equal(res.success, false);
    assert.equal(res.reason, "INVALID_CREDENTIALS");
  }

  // 5th failed attempt triggers lockout
  const attempt5 = await authService.login({
    login_identifier: "warehouse_worker",
    password: "wrongPassword"
  });
  assert.equal(attempt5.success, false);
  assert.equal(attempt5.reason, "ACCOUNT_LOCKED");

  // Even with correct password, account is locked out for 15 minutes
  const lockedAttempt = await authService.login({
    login_identifier: "warehouse_worker",
    password: "securePassword123!"
  });
  assert.equal(lockedAttempt.success, false);
  assert.equal(lockedAttempt.reason, "ACCOUNT_LOCKED");
});

// ============================================================================
// TEST GROUP 10 — API → DATABASE INTEGRATION
// ============================================================================

test("TG10.1: Real HTTP requests against API server connected to PostgreSQL test database", async () => {
  const app = createApiApp({
    database: db,
    authService,
    rbacService,
    inventoryService,
    taskService,
    qualityService,
    orchestrator,
    authorizationPolicy: new PermissiveAuthorizationPolicy() // Test policy for reaching PostgreSQL through HTTP
  });

  const server = app.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/health/ready`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as { success: boolean; data: { database: { ready: boolean } } };
    assert.equal(healthJson.success, true);
    assert.equal(healthJson.data.database.ready, true);

    // 2. Unauthenticated request to protected endpoint returns 401
    const unauthRes = await fetch(`${baseUrl}/auth/session`);
    assert.equal(unauthRes.status, 401);

    // 3. Login via HTTP API
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login_identifier: "warehouse_worker",
        password: "securePassword123!"
      })
    });
    assert.equal(loginRes.status, 200);
    const cookieHeader = loginRes.headers.get("set-cookie");
    assert.ok(cookieHeader);

    // 4. Authenticated session inspection via HTTP API
    const sessionRes = await fetch(`${baseUrl}/auth/session`, {
      headers: { Cookie: cookieHeader }
    });
    assert.equal(sessionRes.status, 200);
    const sessionJson = (await sessionRes.json()) as { success: boolean; data: { user: AuthenticatedUser } };
    assert.equal(sessionJson.data.user.login_identifier, "warehouse_worker");

    // 5. Create Task via HTTP API into PostgreSQL
    const createTaskRes = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader
      },
      body: JSON.stringify({
        task_type: "MOVE",
        depot_id: testDepotId,
        inventory_batch_id: testBatchId,
        source_location_id: testSourceLocId,
        destination_location_id: testDestLocId,
        planned_box_quantity: 75
      })
    });
    assert.equal(createTaskRes.status, 201);
    const taskJson = (await createTaskRes.json()) as { success: boolean; data: { id: string; planned_box_quantity: string } };
    assert.ok(taskJson.data.id);
    assert.equal(taskJson.data.planned_box_quantity, "75");

    // Verify task exists in PostgreSQL
    const dbTask = await taskService.getTask(taskJson.data.id);
    assert.ok(dbTask);
    assert.equal(dbTask.planned_box_quantity, 75n);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ============================================================================
// TEST GROUP 11 — BIGINT / JSON / SERIALIZATION
// ============================================================================

test("TG11.1: HTTP API serializes BIGINT quantities and Date timestamps without throwing serialization errors", async () => {
  const app = createApiApp({
    database: db,
    authService,
    rbacService,
    inventoryService,
    taskService,
    qualityService,
    orchestrator,
    authorizationPolicy: new PermissiveAuthorizationPolicy()
  });

  const server = app.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // Login
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login_identifier: "warehouse_worker",
        password: "securePassword123!"
      })
    });
    const cookieHeader = loginRes.headers.get("set-cookie")!;

    // Seed large quantity
    await db
      .insertInto("inventory_balances")
      .values({
        id: crypto.randomUUID(),
        inventory_batch_id: testBatchId,
        location_id: testSourceLocId,
        box_quantity: "5000000"
      })
      .execute();

    // Query balances via HTTP
    const balanceRes = await fetch(`${baseUrl}/inventory/balances?batch_id=${testBatchId}`, {
      headers: { Cookie: cookieHeader }
    });
    assert.equal(balanceRes.status, 200);
    const json = (await balanceRes.json()) as { success: boolean; data: Array<{ box_quantity: string; created_at: string }> };
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.equal(json.data[0]!.box_quantity, "5000000");
    assert.ok(typeof json.data[0]!.created_at === "string");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ============================================================================
// TEST GROUP 12 — TRANSACTION / CONNECTION CLEANUP
// ============================================================================

test("TG12.1: Transaction cleanup and connection releases return pool to healthy state", async () => {
  // Execute multiple transactions in sequence
  for (let i = 0; i < 5; i++) {
    await db.transaction().execute(async (trx) => {
      await sql`SELECT 1`.execute(trx);
    });
  }

  // Final health check
  const health = await checkDatabaseHealth(db);
  assert.equal(health.healthy, true);
});

// ============================================================================
// TEST GROUP 13 — RBAC & TASK AUTHORITY (FND-16 APPROVED RULES)
// ============================================================================

async function seedRole(roleCode: string, roleName: string): Promise<string> {
  const existing = await db
    .selectFrom("access_roles")
    .select("id")
    .where("code", "=", roleCode)
    .executeTakeFirst();

  if (existing) {
    return existing.id;
  }

  const roleId = crypto.randomUUID();
  await db
    .insertInto("access_roles")
    .values({
      id: roleId,
      code: roleCode,
      name: roleName,
      active: true
    })
    .execute();

  return roleId;
}

async function createUserWithRole(loginId: string, roleCode: string, roleName: string): Promise<{ userId: string; employeeId: string }> {
  const passwordHash = await bcrypt.hash("password123!", 4);
  const userId = crypto.randomUUID();
  await db
    .insertInto("users")
    .values({
      id: userId,
      login_identifier: loginId,
      password_hash: passwordHash,
      is_active: true
    })
    .execute();

  const employeeId = crypto.randomUUID();
  await db
    .insertInto("employees")
    .values({
      id: employeeId,
      user_id: userId,
      is_active: true,
      employee_code: `EMP-${employeeId.slice(0, 8)}`
    })
    .execute();

  await seedRole(roleCode, roleName);
  await rbacService.assignRoleToUser(userId, roleCode, userId);

  return { userId, employeeId };
}

test("TG13.1: Server-side RBAC role assignment & authority decision in PostgreSQL", async () => {
  await createUserWithRole("super_admin_user", "SUPER_ADMIN", "Super Admin");
  await createUserWithRole("main_admin_user", "MAIN_ADMIN", "Main Admin");
  await createUserWithRole("admin_user", "ADMIN", "Admin");
  const manager = await createUserWithRole("manager_user", "MANAGER", "Manager");
  const employee = await createUserWithRole("employee_user", "EMPLOYEE", "Employee");

  const app = createApiApp({
    database: db,
    authService,
    rbacService,
    inventoryService,
    taskService,
    qualityService,
    orchestrator
  });

  const server = app.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const loginUser = async (loginId: string): Promise<string> => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login_identifier: loginId, password: "password123!" })
    });
    return res.headers.get("set-cookie") ?? "";
  };

  try {
    const superCookie = await loginUser("super_admin_user");
    const mainAdminCookie = await loginUser("main_admin_user");
    const adminCookie = await loginUser("admin_user");
    const managerCookie = await loginUser("manager_user");
    const employeeCookie = await loginUser("employee_user");

    // 1. Task Creation: Super Admin, Main Admin, Admin, Manager allowed; Employee blocked
    const taskData = { depot_id: testDepotId, task_type: "REPACK", planned_box_quantity: 40 };

    const superCreate = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superCookie },
      body: JSON.stringify(taskData)
    });
    assert.equal(superCreate.status, 201);
    const createdTaskId = ((await superCreate.json()) as { data: { id: string } }).data.id;

    const managerCreate = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: managerCookie },
      body: JSON.stringify(taskData)
    });
    assert.equal(managerCreate.status, 201);

    const employeeCreate = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify(taskData)
    });
    assert.equal(employeeCreate.status, 403);

    // 2. Task Assignment: Manager allowed; Employee blocked
    const mgrAssign = await fetch(`${baseUrl}/tasks/${createdTaskId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: managerCookie },
      body: JSON.stringify({ employee_id: employee.employeeId })
    });
    assert.equal(mgrAssign.status, 200);

    const empAssign = await fetch(`${baseUrl}/tasks/${createdTaskId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({ employee_id: manager.employeeId })
    });
    assert.equal(empAssign.status, 403);

    // 3. Quality Inspection: Manager allowed; Employee blocked
    const mgrInspect = await fetch(`${baseUrl}/tasks/${createdTaskId}/quality-inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: managerCookie },
      body: JSON.stringify({ outcome: "PASS", damage_rate: 1.0 })
    });
    assert.equal(mgrInspect.status, 201);

    const empInspect = await fetch(`${baseUrl}/tasks/${createdTaskId}/quality-inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({ outcome: "PASS", damage_rate: 1.0 })
    });
    assert.equal(empInspect.status, 403);

    // 4. Complete task and test Reopen authority
    // Employee completes their assigned task
    await fetch(`${baseUrl}/tasks/${createdTaskId}/start`, {
      method: "POST",
      headers: { Cookie: employeeCookie }
    });
    const completeRes = await fetch(`${baseUrl}/tasks/${createdTaskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({ completed_box_quantity: 40 })
    });
    assert.equal(completeRes.status, 200);

    // Reopen: Manager blocked, Employee blocked, Admin/MainAdmin/SuperAdmin allowed
    const empReopen = await fetch(`${baseUrl}/tasks/${createdTaskId}/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({ reason: "Employee trying reopen" })
    });
    assert.equal(empReopen.status, 403);

    const mgrReopen = await fetch(`${baseUrl}/tasks/${createdTaskId}/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: managerCookie },
      body: JSON.stringify({ reason: "Manager trying reopen" })
    });
    assert.equal(mgrReopen.status, 403);

    const adminReopen = await fetch(`${baseUrl}/tasks/${createdTaskId}/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ reason: "Admin reopen approved" })
    });
    assert.equal(adminReopen.status, 200);

    // Complete again and test Main Admin reopen
    await fetch(`${baseUrl}/tasks/${createdTaskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({ completed_box_quantity: 40 })
    });

    const mainAdminReopen = await fetch(`${baseUrl}/tasks/${createdTaskId}/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: mainAdminCookie },
      body: JSON.stringify({ reason: "Main admin reopen approved" })
    });
    assert.equal(mainAdminReopen.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("TG13.2: Task pause/resume ownership enforcement in PostgreSQL", async () => {
  const empA = await createUserWithRole("emp_a_worker", "EMPLOYEE", "Employee");
  await createUserWithRole("emp_b_worker", "EMPLOYEE", "Employee");
  await createUserWithRole("mgr_worker", "MANAGER", "Manager");
  await createUserWithRole("admin_worker", "ADMIN", "Admin");
  await createUserWithRole("super_worker", "SUPER_ADMIN", "Super Admin");

  const app = createApiApp({
    database: db,
    authService,
    rbacService,
    inventoryService,
    taskService,
    qualityService,
    orchestrator
  });

  const server = app.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const loginUser = async (loginId: string): Promise<string> => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login_identifier: loginId, password: "password123!" })
    });
    return res.headers.get("set-cookie") ?? "";
  };

  try {
    const cookieA = await loginUser("emp_a_worker");
    const cookieB = await loginUser("emp_b_worker");
    const cookieMgr = await loginUser("mgr_worker");
    const cookieAdmin = await loginUser("admin_worker");
    const cookieSuper = await loginUser("super_worker");

    // Manager creates task and assigns only to Employee A
    const createRes = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieMgr },
      body: JSON.stringify({ depot_id: testDepotId, task_type: "PICK", planned_box_quantity: 10 })
    });
    const taskId = ((await createRes.json()) as { data: { id: string } }).data.id;

    await fetch(`${baseUrl}/tasks/${taskId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieMgr },
      body: JSON.stringify({ employee_id: empA.employeeId })
    });

    // Employee A starts task
    await fetch(`${baseUrl}/tasks/${taskId}/start`, {
      method: "POST",
      headers: { Cookie: cookieA }
    });

    // Employee B attempts to pause Employee A's task -> 403 Forbidden
    const empBPause = await fetch(`${baseUrl}/tasks/${taskId}/pause`, {
      method: "POST",
      headers: { Cookie: cookieB }
    });
    assert.equal(empBPause.status, 403);

    // Admin attempts to override pause on Employee A's task -> 403 Forbidden (no unapproved override)
    const adminPause = await fetch(`${baseUrl}/tasks/${taskId}/pause`, {
      method: "POST",
      headers: { Cookie: cookieAdmin }
    });
    assert.equal(adminPause.status, 403);

    // Super Admin attempts to override pause on Employee A's task -> 403 Forbidden (no unapproved override)
    const superPause = await fetch(`${baseUrl}/tasks/${taskId}/pause`, {
      method: "POST",
      headers: { Cookie: cookieSuper }
    });
    assert.equal(superPause.status, 403);

    // Employee A pauses own task -> 200 OK
    const empAPause = await fetch(`${baseUrl}/tasks/${taskId}/pause`, {
      method: "POST",
      headers: { Cookie: cookieA }
    });
    assert.equal(empAPause.status, 200);

    // Employee B attempts to resume Employee A's task -> 403 Forbidden
    const empBResume = await fetch(`${baseUrl}/tasks/${taskId}/resume`, {
      method: "POST",
      headers: { Cookie: cookieB }
    });
    assert.equal(empBResume.status, 403);

    // Super Admin attempts to override resume on Employee A's task -> 403 Forbidden
    const superResume = await fetch(`${baseUrl}/tasks/${taskId}/resume`, {
      method: "POST",
      headers: { Cookie: cookieSuper }
    });
    assert.equal(superResume.status, 403);

    // Manager override to resume -> 200 OK
    const mgrResume = await fetch(`${baseUrl}/tasks/${taskId}/resume`, {
      method: "POST",
      headers: { Cookie: cookieMgr }
    });
    assert.equal(mgrResume.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("TG13.3: Quality gate failure (damage_rate >= 5%) blocks completion in PostgreSQL", async () => {
  const manager = await createUserWithRole("quality_mgr", "MANAGER", "Manager");
  const employee = await createUserWithRole("quality_emp", "EMPLOYEE", "Employee");

  const task = await taskService.createTask(
    { depot_id: testDepotId, task_type: "REPACK", planned_box_quantity: 100n },
    manager.userId
  );
  await taskService.assignTask({ task_id: task.id, employee_id: employee.employeeId }, manager.userId);
  await taskService.startTask(task.id, employee.userId);

  // Manager inspects with damage_rate = 5.2% (>= 5%) -> FAILS quality gate
  const failedInspection = await qualityService.inspectTask(
    { task_id: task.id, outcome: "PASS", damage_rate: 5.2 },
    manager.userId
  );
  assert.equal(failedInspection.outcome, "FAIL");
  assert.equal(failedInspection.final_inventory_status, "DAMAGED");

  // Attempt to complete task is rejected by quality gate
  await assert.rejects(
    async () => {
      await taskService.completeTask(
        { task_id: task.id, completed_box_quantity: 100n },
        employee.userId
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof TaskDomainError);
      assert.equal(err.code, "QUALITY_GATE_FAILED");
      return true;
    }
  );

  // Passing reinspection (damage_rate = 2.0%) supersedes the failed record
  const passingInspection = await qualityService.inspectTask(
    { task_id: task.id, outcome: "PASS", damage_rate: 2.0, supersedes_record_id: failedInspection.id },
    manager.userId
  );
  assert.equal(passingInspection.outcome, "PASS");
  assert.equal(passingInspection.final_inventory_status, "AVAILABLE");

  // Completion now succeeds
  const completed = await taskService.completeTask(
    { task_id: task.id, completed_box_quantity: 100n },
    employee.userId
  );
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.completed_box_quantity, 100n);
});

test("TG13.4: Task cancellation restricted to unstarted tasks in PostgreSQL", async () => {
  const manager = await createUserWithRole("cancel_mgr", "MANAGER", "Manager");
  const employee = await createUserWithRole("cancel_emp", "EMPLOYEE", "Employee");

  // 1. Unstarted PENDING task can be cancelled
  const pendingTask = await taskService.createTask(
    { depot_id: testDepotId, task_type: "REPACK", planned_box_quantity: 30n },
    manager.userId
  );
  const cancelPending = await taskService.cancelTask(
    { task_id: pendingTask.id, reason: "Cancelled before assignment" },
    manager.userId
  );
  assert.equal(cancelPending.status, "CANCELLED");

  // 2. Unstarted ASSIGNED task can be cancelled
  const assignedTask = await taskService.createTask(
    { depot_id: testDepotId, task_type: "REPACK", planned_box_quantity: 30n },
    manager.userId
  );
  await taskService.assignTask(
    { task_id: assignedTask.id, employee_id: employee.employeeId },
    manager.userId
  );
  const cancelAssigned = await taskService.cancelTask(
    { task_id: assignedTask.id, reason: "Cancelled before start" },
    manager.userId
  );
  assert.equal(cancelAssigned.status, "CANCELLED");

  // 3. Started IN_PROGRESS task CANNOT be cancelled
  const startedTask = await taskService.createTask(
    { depot_id: testDepotId, task_type: "REPACK", planned_box_quantity: 30n },
    manager.userId
  );
  await taskService.assignTask(
    { task_id: startedTask.id, employee_id: employee.employeeId },
    manager.userId
  );
  await taskService.startTask(startedTask.id, employee.userId);

  await assert.rejects(
    async () => {
      await taskService.cancelTask(
        { task_id: startedTask.id, reason: "Attempt cancel started task" },
        manager.userId
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof TaskDomainError);
      assert.equal(err.code, "INVALID_TASK_STATE");
      return true;
    }
  );
});

test("TG13.5: Client role spoofing and actor forgery fails closed", async () => {
  await createUserWithRole("honest_worker", "EMPLOYEE", "Employee");

  const app = createApiApp({
    database: db,
    authService,
    rbacService,
    inventoryService,
    taskService,
    qualityService,
    orchestrator
  });

  const server = app.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login_identifier: "honest_worker", password: "password123!" })
    });
    const cookie = loginRes.headers.get("set-cookie") ?? "";

    // Client attempts to claim SUPER_ADMIN via headers and body to create a task
    const spoofRes = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Role": "SUPER_ADMIN",
        "X-Permissions": "task:create,all",
        Cookie: cookie
      },
      body: JSON.stringify({
        depot_id: testDepotId,
        task_type: "REPACK",
        role: "SUPER_ADMIN",
        actor_user_id: crypto.randomUUID()
      })
    });

    assert.equal(spoofRes.status, 403);
    const body = (await spoofRes.json()) as { success: boolean; error: { code: string } };
    assert.equal(body.error.code, "FORBIDDEN");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("TG14.1: Monthly KOT persistence and unique constraint enforcement in real PostgreSQL", async () => {
  const superAdmin = await createUserWithRole("super_admin_kot", "SUPER_ADMIN", "Super Admin");

  // 1. Record KOT for 2026-09
  const kot = await incentiveService.recordMonthlyKot(
    {
      effective_month: "2026-09",
      kot_value: "1500000.00",
      notes: "Target September"
    },
    superAdmin.userId
  );

  assert.equal(kot.effective_month, "2026-09");
  assert.equal(kot.kot_value, "1500000.00");
  assert.equal(kot.created_by_user_id, superAdmin.userId);

  // 2. Fetch from DB
  const fetched = await incentiveService.getMonthlyKot("2026-09");
  assert.ok(fetched);
  assert.equal(fetched.kot_value, "1500000.00");

  // 3. PostgreSQL unique constraint prevents duplicate month
  await assert.rejects(
    async () => {
      await incentiveService.recordMonthlyKot(
        {
          effective_month: "2026-09",
          kot_value: "2000000.00"
        },
        superAdmin.userId
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof IncentiveDomainError);
      assert.equal(err.code, "DUPLICATE_MONTHLY_KOT");
      return true;
    }
  );
});

test("TG14.2: Manual penalties persistence and monthly incentive calculation in real PostgreSQL", async () => {
  const superAdmin = await createUserWithRole("super_admin_pen", "SUPER_ADMIN", "Super Admin");
  const employeeUser = await createUserWithRole("penalized_worker", "EMPLOYEE", "Employee");

  await incentiveService.recordMonthlyKot(
    {
      effective_month: "2026-10",
      kot_value: "1000000.00"
    },
    superAdmin.userId
  );

  // Record penalty
  const penalty = await incentiveService.recordManualPenalty(
    {
      employee_id: employeeUser.employeeId,
      amount: "3000.00",
      reason: "Box misplacement",
      effective_month: "2026-10"
    },
    superAdmin.userId
  );

  assert.equal(penalty.amount, "3000.00");
  assert.equal(penalty.employee_id, employeeUser.employeeId);

  // Calculate monthly incentive: 1,000,000 * 6% = 60,000.00
  const calculation = await incentiveService.calculateMonthlyIncentive({ effective_month: "2026-10" });
  assert.equal(calculation.monthly_incentive_pool, "60000.00");
  assert.equal(calculation.gross_incentive_pool, "60000.00");
  assert.equal(calculation.penalties.length, 1);
  assert.equal(calculation.penalty_aggregation_relationship, "TBD_PENDING_POLICY");
  assert.equal(calculation.zero_floor_policy, "TBD_NOT_CONFIRMED");
  assert.equal(calculation.task_reconciliation_status, "TBD_SOURCE_UNDEFINED");
  assert.equal(calculation.overtime_status, "PENDING_CONFIGURATION");
});

test("TG14.3: Task incentive allocation and Super Admin approval in real PostgreSQL", async () => {
  const superAdmin = await createUserWithRole("super_admin_alloc", "SUPER_ADMIN", "Super Admin");
  const emp1 = await createUserWithRole("task_worker_1", "EMPLOYEE", "Employee");
  const emp2 = await createUserWithRole("task_worker_2", "EMPLOYEE", "Employee");
  const empRemoved = await createUserWithRole("task_worker_removed", "EMPLOYEE", "Employee");

  // Create task and assign employees
  const task = await taskService.createTask(
    {
      depot_id: testDepotId,
      task_type: "REPACK",
      planned_box_quantity: "50"
    },
    superAdmin.userId
  );

  await taskService.assignTask({ task_id: task.id, employee_id: emp1.employeeId }, superAdmin.userId);
  await taskService.assignTask({ task_id: task.id, employee_id: emp2.employeeId }, superAdmin.userId);
  await taskService.assignTask({ task_id: task.id, employee_id: empRemoved.employeeId }, superAdmin.userId);

  // Unassign empRemoved before completion
  await taskService.unassignTask({ task_id: task.id, employee_id: empRemoved.employeeId }, superAdmin.userId);

  // Start and complete task
  await taskService.startTask(task.id, superAdmin.userId);
  await taskService.completeTask({ task_id: task.id, completed_box_quantity: 50n }, superAdmin.userId);

  // Allocate ₹900.00 incentive -> 2 active employees = ₹450.00 each
  const alloc = await incentiveService.calculateTaskIncentive(
    {
      task_id: task.id,
      task_incentive_amount: "900.00"
    },
    superAdmin.userId
  );

  assert.equal(alloc.per_employee_share, "450.00");
  assert.equal(alloc.unresolved_remainder, "0.00");
  assert.equal(alloc.rounding_policy, "EXACT_REMAINDER_HELD");
  assert.equal(alloc.task_to_monthly_pool_reconciliation, "TBD_SOURCE_UNDEFINED");
  assert.equal(alloc.participating_employee_ids.length, 2);
  assert.deepEqual(alloc.excluded_employee_ids, [empRemoved.employeeId]);
  assert.ok(alloc.ledger_entries.every((l) => l.status === "PENDING"));

  // Super Admin approves
  const approved = await incentiveService.approveIncentiveLedger(
    { task_id: task.id, notes: "Approved for October payroll" },
    superAdmin.userId
  );

  assert.equal(approved.length, 2);
  assert.ok(approved.every((l) => l.status === "APPROVED"));
});

test("TG14.4: Incentive API endpoints with RBAC enforcement over HTTP against PostgreSQL", async () => {
  await createUserWithRole("super_api_user", "SUPER_ADMIN", "Super Admin");
  await createUserWithRole("manager_api_user", "MANAGER", "Manager");
  const employee = await createUserWithRole("emp_api_user", "EMPLOYEE", "Employee");

  const app = createApiApp({
    database: db,
    authService,
    rbacService,
    inventoryService,
    taskService,
    qualityService,
    incentiveService,
    orchestrator
  });

  const server = app.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const loginUser = async (loginId: string) => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login_identifier: loginId, password: "password123!" })
    });
    return res.headers.get("set-cookie") ?? "";
  };

  try {
    const superCookie = await loginUser("super_api_user");
    const managerCookie = await loginUser("manager_api_user");
    const employeeCookie = await loginUser("emp_api_user");

    // 1. Manager attempts to record monthly KOT -> Forbidden (403)
    const managerKotRes = await fetch(`${baseUrl}/incentives/kot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: managerCookie },
      body: JSON.stringify({ effective_month: "2026-11", kot_value: "1000000.00" })
    });
    assert.equal(managerKotRes.status, 403);

    // 2. Super Admin records monthly KOT -> Created (201)
    const superKotRes = await fetch(`${baseUrl}/incentives/kot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superCookie },
      body: JSON.stringify({ effective_month: "2026-11", kot_value: "1000000.00" })
    });
    assert.equal(superKotRes.status, 201);

    // 3. Manager attempts to record manual penalty -> Forbidden (403, Super Admin only)
    const managerPenaltyRes = await fetch(`${baseUrl}/incentives/penalties`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: managerCookie },
      body: JSON.stringify({
        employee_id: employee.employeeId,
        amount: "1000.00",
        reason: "Operational error",
        effective_month: "2026-11"
      })
    });
    assert.equal(managerPenaltyRes.status, 403);

    // 4. Super Admin records manual penalty -> Created (201)
    const superPenaltyRes = await fetch(`${baseUrl}/incentives/penalties`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superCookie },
      body: JSON.stringify({
        employee_id: employee.employeeId,
        amount: "1000.00",
        reason: "Operational error",
        effective_month: "2026-11"
      })
    });
    assert.equal(superPenaltyRes.status, 201);

    // 5. Employee attempts to record penalty -> Forbidden (403)
    const employeePenaltyRes = await fetch(`${baseUrl}/incentives/penalties`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({
        employee_id: employee.employeeId,
        amount: "500.00",
        reason: "Self penalty attempt",
        effective_month: "2026-11"
      })
    });
    assert.equal(employeePenaltyRes.status, 403);

    // 6. Manager attempts to approve incentive -> Forbidden (403)
    const managerApproveRes = await fetch(`${baseUrl}/incentives/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: managerCookie },
      body: JSON.stringify({ task_id: crypto.randomUUID() })
    });
    assert.equal(managerApproveRes.status, 403);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
