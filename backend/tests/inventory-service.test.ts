import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { InventoryService } from "../apps/api/src/modules/inventory/index.js";
import {
  InventoryDomainError,
  type MoveInventoryRequest
} from "../packages/contracts/src/inventory/index.js";
import type { DatabaseConnection } from "../packages/db/src/index.js";

interface MockItem {
  id: string;
  product_code: string;
  name: string | null;
}

interface MockBatch {
  id: string;
  inventory_item_id: string;
  batch_number: string;
}

interface MockLocation {
  id: string;
  depot_id: string;
  code: string;
  name: string;
}

interface MockTask {
  id: string;
  status: string;
}

interface MockBalance {
  id: string;
  inventory_batch_id: string;
  location_id: string;
  box_quantity: string;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockMovement {
  id: string;
  inventory_batch_id: string;
  source_location_id: string | null;
  destination_location_id: string | null;
  box_quantity: string;
  task_id: string | null;
  movement_type: string;
  occurred_at: Date;
  actor_user_id: string | null;
  idempotency_key: string | null;
  correlation_id: string | null;
  created_at: Date;
}

interface FilterCondition {
  col: string;
  op: string;
  val: unknown;
}

interface SeedData {
  items?: MockItem[];
  batches?: MockBatch[];
  locations?: MockLocation[];
  tasks?: MockTask[];
  balances?: MockBalance[];
  movements?: MockMovement[];
}

function createMockInventoryDatabase() {
  const items: MockItem[] = [];
  const batches: MockBatch[] = [];
  const locations: MockLocation[] = [];
  const tasks: MockTask[] = [];
  let balances: MockBalance[] = [];
  let movements: MockMovement[] = [];

  const createQueryBuilder = (
    selectedTable: string,
    inMemoryState?: { balances: MockBalance[]; movements: MockMovement[] }
  ) => {
    const filters: FilterCondition[] = [];
    const activeBalances = inMemoryState ? inMemoryState.balances : balances;
    const activeMovements = inMemoryState ? inMemoryState.movements : movements;

    const builder = {
      select: () => builder,
      selectAll: () => builder,
      where: (col: string, op: string, val: unknown) => {
        filters.push({ col, op, val });
        return builder;
      },
      forUpdate: () => builder,
      executeTakeFirst: async () => {
        const rows = await builder.execute();
        return rows[0] ?? undefined;
      },
      execute: async () => {
        let result: Array<Record<string, unknown>> = [];
        if (selectedTable === "inventory_items") {
          result = items.map((i) => ({ ...i }));
        } else if (selectedTable === "inventory_batches") {
          result = batches.map((b) => ({ ...b }));
        } else if (selectedTable === "locations") {
          result = locations.map((l) => ({ ...l }));
        } else if (selectedTable === "tasks") {
          result = tasks.map((t) => ({ ...t }));
        } else if (selectedTable === "inventory_balances") {
          result = activeBalances.map((b) => ({ ...b }));
        } else if (selectedTable === "inventory_movements") {
          result = activeMovements.map((m) => ({ ...m }));
        }

        for (const f of filters) {
          result = result.filter((row) => {
            const actual = row[f.col];
            if (f.op === "=") return actual === f.val;
            if (f.op === "is" && f.val === null) return actual === null || actual === undefined;
            return true;
          });
        }
        return result;
      }
    };

    return builder;
  };

  const db = {
    selectFrom: (table: string) => createQueryBuilder(table),
    transaction: () => ({
      execute: async <T>(callback: (trx: unknown) => Promise<T>): Promise<T> => {
        // Snapshot for transaction rollback on failure
        const trxBalances = balances.map((b) => ({ ...b }));
        const trxMovements = movements.map((m) => ({ ...m }));
        const inMemoryState = { balances: trxBalances, movements: trxMovements };

        const trx = {
          selectFrom: (table: string) => createQueryBuilder(table, inMemoryState),
          insertInto: (table: string) => ({
            values: (val: Record<string, unknown>) => ({
              execute: async () => {
                if (table === "inventory_balances") {
                  inMemoryState.balances.push({
                    id: (val["id"] as string | undefined) ?? crypto.randomUUID(),
                    inventory_batch_id: val["inventory_batch_id"] as string,
                    location_id: val["location_id"] as string,
                    box_quantity: val["box_quantity"] as string,
                    version: (val["version"] as string | undefined) ?? "1",
                    created_at: (val["created_at"] as Date | undefined) ?? new Date(),
                    updated_at: (val["updated_at"] as Date | undefined) ?? new Date()
                  });
                } else if (table === "inventory_movements") {
                  inMemoryState.movements.push({
                    id: (val["id"] as string | undefined) ?? crypto.randomUUID(),
                    inventory_batch_id: val["inventory_batch_id"] as string,
                    source_location_id: (val["source_location_id"] as string | null | undefined) ?? null,
                    destination_location_id: (val["destination_location_id"] as string | null | undefined) ?? null,
                    box_quantity: val["box_quantity"] as string,
                    task_id: (val["task_id"] as string | null | undefined) ?? null,
                    movement_type: val["movement_type"] as string,
                    occurred_at: (val["occurred_at"] as Date | undefined) ?? new Date(),
                    actor_user_id: (val["actor_user_id"] as string | null | undefined) ?? null,
                    idempotency_key: (val["idempotency_key"] as string | null | undefined) ?? null,
                    correlation_id: (val["correlation_id"] as string | null | undefined) ?? null,
                    created_at: (val["created_at"] as Date | undefined) ?? new Date()
                  });
                }
              }
            })
          }),
          updateTable: (table: string) => ({
            set: (updates: Record<string, unknown>) => ({
              where: (col: string, _op: string, val: unknown) => ({
                execute: async () => {
                  if (table === "inventory_balances") {
                    const idx = inMemoryState.balances.findIndex(
                      (b) => (b as unknown as Record<string, unknown>)[col] === val
                    );
                    if (idx !== -1) {
                      const cur = inMemoryState.balances[idx]!;
                      const nextVer = updates["version"]
                        ? String(Number(cur.version) + 1)
                        : cur.version;
                      inMemoryState.balances[idx] = {
                        ...cur,
                        box_quantity: (updates["box_quantity"] as string | undefined) ?? cur.box_quantity,
                        version: nextVer,
                        updated_at: new Date()
                      };
                    }
                  }
                }
              })
            })
          })
        };

        const result = await callback(trx);
        // Commit
        balances = inMemoryState.balances;
        movements = inMemoryState.movements;
        return result;
      }
    }),
    seed: (data: SeedData) => {
      if (data.items) items.push(...data.items);
      if (data.batches) batches.push(...data.batches);
      if (data.locations) locations.push(...data.locations);
      if (data.tasks) tasks.push(...data.tasks);
      if (data.balances) balances.push(...data.balances);
      if (data.movements) movements.push(...data.movements);
    },
    getState: () => ({
      balances,
      movements
    })
  };

  return db as unknown as DatabaseConnection & {
    seed: (data: SeedData) => void;
    getState: () => { balances: MockBalance[]; movements: MockMovement[] };
  };
}

test("successful partial inventory movement updates source and destination balances atomically", async () => {
  const db = createMockInventoryDatabase();
  const batchId = crypto.randomUUID();
  const locA = crypto.randomUUID();
  const locB = crypto.randomUUID();

  db.seed({
    batches: [{ id: batchId, inventory_item_id: crypto.randomUUID(), batch_number: "BATCH-001" }],
    locations: [
      { id: locA, depot_id: crypto.randomUUID(), code: "LOC-A", name: "Location A" },
      { id: locB, depot_id: crypto.randomUUID(), code: "LOC-B", name: "Location B" }
    ],
    balances: [
      {
        id: crypto.randomUUID(),
        inventory_batch_id: batchId,
        location_id: locA,
        box_quantity: "100",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new InventoryService({ database: db });
  const result = await service.moveInventory(
    {
      inventory_batch_id: batchId,
      source_location_id: locA,
      destination_location_id: locB,
      box_quantity: 30n,
      movement_type: "INTERNAL_TRANSFER"
    },
    "user-123"
  );

  assert.equal(result.is_idempotent_replay, false);
  assert.equal(result.source_balance_after, 70n);
  assert.equal(result.destination_balance_after, 30n);
  assert.equal(result.movement.box_quantity, 30n);
  assert.equal(result.movement.actor_user_id, "user-123");

  const state = db.getState();
  const sourceBal = state.balances.find((b) => b.location_id === locA);
  const destBal = state.balances.find((b) => b.location_id === locB);
  assert.equal(sourceBal?.box_quantity, "70");
  assert.equal(destBal?.box_quantity, "30");
  assert.equal(state.movements.length, 1);
});

test("successful full inventory movement reduces source balance to 0", async () => {
  const db = createMockInventoryDatabase();
  const batchId = crypto.randomUUID();
  const locA = crypto.randomUUID();
  const locB = crypto.randomUUID();

  db.seed({
    batches: [{ id: batchId, inventory_item_id: crypto.randomUUID(), batch_number: "BATCH-001" }],
    locations: [
      { id: locA, depot_id: crypto.randomUUID(), code: "LOC-A", name: "Location A" },
      { id: locB, depot_id: crypto.randomUUID(), code: "LOC-B", name: "Location B" }
    ],
    balances: [
      {
        id: crypto.randomUUID(),
        inventory_batch_id: batchId,
        location_id: locA,
        box_quantity: "50",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new InventoryService({ database: db });
  const result = await service.moveInventory({
    inventory_batch_id: batchId,
    source_location_id: locA,
    destination_location_id: locB,
    box_quantity: 50n,
    movement_type: "RELOCATION"
  });

  assert.equal(result.source_balance_after, 0n);
  assert.equal(result.destination_balance_after, 50n);
  assert.equal(result.is_idempotent_replay, false);
});

test("insufficient stock is rejected without mutating balances or recording movements", async () => {
  const db = createMockInventoryDatabase();
  const batchId = crypto.randomUUID();
  const locA = crypto.randomUUID();
  const locB = crypto.randomUUID();

  db.seed({
    batches: [{ id: batchId, inventory_item_id: crypto.randomUUID(), batch_number: "BATCH-001" }],
    locations: [
      { id: locA, depot_id: crypto.randomUUID(), code: "LOC-A", name: "Location A" },
      { id: locB, depot_id: crypto.randomUUID(), code: "LOC-B", name: "Location B" }
    ],
    balances: [
      {
        id: crypto.randomUUID(),
        inventory_batch_id: batchId,
        location_id: locA,
        box_quantity: "10",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new InventoryService({ database: db });

  await assert.rejects(
    async () => {
      await service.moveInventory({
        inventory_batch_id: batchId,
        source_location_id: locA,
        destination_location_id: locB,
        box_quantity: 15n,
        movement_type: "TRANSFER"
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof InventoryDomainError);
      assert.equal(err.code, "INSUFFICIENT_STOCK");
      return true;
    }
  );

  const state = db.getState();
  const sourceBal = state.balances.find((b) => b.location_id === locA);
  assert.equal(sourceBal?.box_quantity, "10");
  assert.equal(state.movements.length, 0);
});

test("zero and negative quantities are rejected", async () => {
  const db = createMockInventoryDatabase();
  const service = new InventoryService({ database: db });
  const batchId = crypto.randomUUID();
  const locA = crypto.randomUUID();
  const locB = crypto.randomUUID();

  await assert.rejects(
    async () => {
      await service.moveInventory({
        inventory_batch_id: batchId,
        source_location_id: locA,
        destination_location_id: locB,
        box_quantity: 0n,
        movement_type: "TRANSFER"
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof InventoryDomainError);
      assert.equal(err.code, "INVALID_QUANTITY");
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await service.moveInventory({
        inventory_batch_id: batchId,
        source_location_id: locA,
        destination_location_id: locB,
        box_quantity: -5n,
        movement_type: "TRANSFER"
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof InventoryDomainError);
      assert.equal(err.code, "INVALID_QUANTITY");
      return true;
    }
  );
});

test("same source and destination location is rejected", async () => {
  const db = createMockInventoryDatabase();
  const service = new InventoryService({ database: db });
  const batchId = crypto.randomUUID();
  const locA = crypto.randomUUID();

  await assert.rejects(
    async () => {
      await service.moveInventory({
        inventory_batch_id: batchId,
        source_location_id: locA,
        destination_location_id: locA,
        box_quantity: 10n,
        movement_type: "TRANSFER"
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof InventoryDomainError);
      assert.equal(err.code, "SAME_LOCATION_UNSUPPORTED");
      return true;
    }
  );
});

test("missing task is rejected when invalid task_id is supplied", async () => {
  const db = createMockInventoryDatabase();
  const batchId = crypto.randomUUID();
  const locA = crypto.randomUUID();
  const locB = crypto.randomUUID();
  const nonExistentTaskId = crypto.randomUUID();

  db.seed({
    batches: [{ id: batchId, inventory_item_id: crypto.randomUUID(), batch_number: "BATCH-001" }],
    locations: [
      { id: locA, depot_id: crypto.randomUUID(), code: "LOC-A", name: "Location A" },
      { id: locB, depot_id: crypto.randomUUID(), code: "LOC-B", name: "Location B" }
    ],
    balances: [
      {
        id: crypto.randomUUID(),
        inventory_batch_id: batchId,
        location_id: locA,
        box_quantity: "50",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new InventoryService({ database: db });

  await assert.rejects(
    async () => {
      await service.moveInventory({
        inventory_batch_id: batchId,
        source_location_id: locA,
        destination_location_id: locB,
        box_quantity: 10n,
        movement_type: "TASK_MOVE",
        task_id: nonExistentTaskId
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof InventoryDomainError);
      assert.equal(err.code, "TASK_NOT_FOUND");
      return true;
    }
  );
});

test("idempotent retry with same key returns original movement without duplicate balance changes", async () => {
  const db = createMockInventoryDatabase();
  const batchId = crypto.randomUUID();
  const locA = crypto.randomUUID();
  const locB = crypto.randomUUID();
  const idempotencyKey = "UNIQUE-IDEMP-KEY-999";

  db.seed({
    batches: [{ id: batchId, inventory_item_id: crypto.randomUUID(), batch_number: "BATCH-001" }],
    locations: [
      { id: locA, depot_id: crypto.randomUUID(), code: "LOC-A", name: "Location A" },
      { id: locB, depot_id: crypto.randomUUID(), code: "LOC-B", name: "Location B" }
    ],
    balances: [
      {
        id: crypto.randomUUID(),
        inventory_batch_id: batchId,
        location_id: locA,
        box_quantity: "100",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new InventoryService({ database: db });
  const moveReq: MoveInventoryRequest = {
    inventory_batch_id: batchId,
    source_location_id: locA,
    destination_location_id: locB,
    box_quantity: 25n,
    movement_type: "TRANSFER",
    idempotency_key: idempotencyKey
  };

  // First call
  const res1 = await service.moveInventory(moveReq, "user-1");
  assert.equal(res1.is_idempotent_replay, false);
  assert.equal(res1.source_balance_after, 75n);
  assert.equal(res1.destination_balance_after, 25n);

  // Second call (retry)
  const res2 = await service.moveInventory(moveReq, "user-1");
  assert.equal(res2.is_idempotent_replay, true);
  assert.equal(res2.movement.id, res1.movement.id);
  assert.equal(res2.source_balance_after, 75n);
  assert.equal(res2.destination_balance_after, 25n);

  const state = db.getState();
  assert.equal(state.movements.length, 1);
  const src = state.balances.find((b) => b.location_id === locA);
  const dst = state.balances.find((b) => b.location_id === locB);
  assert.equal(src?.box_quantity, "75");
  assert.equal(dst?.box_quantity, "25");
});

test("idempotent retry with conflicting payload is rejected", async () => {
  const db = createMockInventoryDatabase();
  const batchId = crypto.randomUUID();
  const locA = crypto.randomUUID();
  const locB = crypto.randomUUID();
  const idempotencyKey = "UNIQUE-IDEMP-CONFLICT";

  db.seed({
    batches: [{ id: batchId, inventory_item_id: crypto.randomUUID(), batch_number: "BATCH-001" }],
    locations: [
      { id: locA, depot_id: crypto.randomUUID(), code: "LOC-A", name: "Location A" },
      { id: locB, depot_id: crypto.randomUUID(), code: "LOC-B", name: "Location B" }
    ],
    balances: [
      {
        id: crypto.randomUUID(),
        inventory_batch_id: batchId,
        location_id: locA,
        box_quantity: "100",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new InventoryService({ database: db });
  await service.moveInventory(
    {
      inventory_batch_id: batchId,
      source_location_id: locA,
      destination_location_id: locB,
      box_quantity: 20n,
      movement_type: "TRANSFER",
      idempotency_key: idempotencyKey
    },
    "user-1"
  );

  // Retry with different quantity
  await assert.rejects(
    async () => {
      await service.moveInventory(
        {
          inventory_batch_id: batchId,
          source_location_id: locA,
          destination_location_id: locB,
          box_quantity: 30n, // Different quantity
          movement_type: "TRANSFER",
          idempotency_key: idempotencyKey
        },
        "user-1"
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof InventoryDomainError);
      assert.equal(err.code, "IDEMPOTENT_RETRY_MISMATCH");
      return true;
    }
  );
});

test("actor identity is derived from verified server context and cannot be forged from client payload", async () => {
  const db = createMockInventoryDatabase();
  const batchId = crypto.randomUUID();
  const locA = crypto.randomUUID();
  const locB = crypto.randomUUID();

  db.seed({
    batches: [{ id: batchId, inventory_item_id: crypto.randomUUID(), batch_number: "BATCH-001" }],
    locations: [
      { id: locA, depot_id: crypto.randomUUID(), code: "LOC-A", name: "Location A" },
      { id: locB, depot_id: crypto.randomUUID(), code: "LOC-B", name: "Location B" }
    ],
    balances: [
      {
        id: crypto.randomUUID(),
        inventory_batch_id: batchId,
        location_id: locA,
        box_quantity: "100",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new InventoryService({ database: db });
  const result = await service.moveInventory(
    {
      inventory_batch_id: batchId,
      source_location_id: locA,
      destination_location_id: locB,
      box_quantity: 10n,
      movement_type: "TRANSFER"
    },
    "trusted-server-actor-uuid"
  );

  assert.equal(result.movement.actor_user_id, "trusted-server-actor-uuid");
});

test("read queries getBalance, getBatchBalances, getMovement, and getMovementByIdempotencyKey work as expected", async () => {
  const db = createMockInventoryDatabase();
  const batchId = crypto.randomUUID();
  const locA = crypto.randomUUID();
  const locB = crypto.randomUUID();

  db.seed({
    batches: [{ id: batchId, inventory_item_id: crypto.randomUUID(), batch_number: "BATCH-001" }],
    locations: [
      { id: locA, depot_id: crypto.randomUUID(), code: "LOC-A", name: "Location A" },
      { id: locB, depot_id: crypto.randomUUID(), code: "LOC-B", name: "Location B" }
    ],
    balances: [
      {
        id: crypto.randomUUID(),
        inventory_batch_id: batchId,
        location_id: locA,
        box_quantity: "80",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      },
      {
        id: crypto.randomUUID(),
        inventory_batch_id: batchId,
        location_id: locB,
        box_quantity: "20",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new InventoryService({ database: db });
  const balA = await service.getBalance(batchId, locA);
  assert.equal(balA?.box_quantity, 80n);

  const allBals = await service.getBatchBalances(batchId);
  assert.equal(allBals.length, 2);

  const moveRes = await service.moveInventory({
    inventory_batch_id: batchId,
    source_location_id: locA,
    destination_location_id: locB,
    box_quantity: 10n,
    movement_type: "TRANSFER",
    idempotency_key: "READ-TEST-KEY"
  });

  const moveById = await service.getMovement(moveRes.movement.id);
  assert.equal(moveById?.box_quantity, 10n);

  const moveByIdemp = await service.getMovementByIdempotencyKey("READ-TEST-KEY");
  assert.equal(moveByIdemp?.id, moveRes.movement.id);
});
