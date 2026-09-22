import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { InventoryService } from "../apps/api/src/modules/inventory/index.js";
import { QualityService } from "../apps/api/src/modules/quality/index.js";
import { TaskService, WarehouseOrchestrator } from "../apps/api/src/modules/warehouse/index.js";
import { OrchestrationDomainError } from "../packages/contracts/src/warehouse/index.js";
import type { DatabaseConnection } from "../packages/db/src/index.js";

interface MockClient {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockOrder {
  id: string;
  client_id: string;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockOrderItem {
  id: string;
  order_id: string;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockInventoryItem {
  id: string;
  product_code: string;
  name: string | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockInventoryBatch {
  id: string;
  inventory_item_id: string;
  batch_number: string;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockLocation {
  id: string;
  depot_id: string;
  name: string;
  location_type: string;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockBalance {
  id: string;
  inventory_batch_id: string;
  location_id: string;
  box_quantity: string;
  version: string;
  created_at: Date;
  updated_at: Date;
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

interface MockTask {
  id: string;
  depot_id: string | null;
  task_type: string | null;
  status: string;
  client_id: string | null;
  order_id: string | null;
  order_item_id: string | null;
  inventory_item_id: string | null;
  inventory_batch_id: string | null;
  source_location_id: string | null;
  destination_location_id: string | null;
  shift_id: string | null;
  planned_box_quantity: string | null;
  completed_box_quantity: string | null;
  started_at: Date | null;
  paused_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockAssignment {
  id: string;
  task_id: string;
  employee_id: string;
  assigned_at: Date;
  assigned_by_user_id: string;
  unassigned_at: Date | null;
  unassigned_by_user_id: string | null;
  version: string;
}

interface MockEvent {
  id: string;
  task_id: string;
  event_type: string;
  event_at: Date;
  actor_user_id: string | null;
  correlation_id: string | null;
  metadata: string | null;
  created_at: Date;
}

interface MockQualityRecord {
  id: string;
  task_id: string;
  outcome: string;
  quality_score: string | null;
  damage_rate: string | null;
  task_accuracy: string | null;
  final_inventory_status: string | null;
  inspected_at: Date;
  inspected_by_user_id: string | null;
  superseded_by_record_id: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockTaskPhoto {
  id: string;
  task_id: string;
  layer_number: number;
  box_quantity: string;
  captured_by_employee_id: string | null;
  captured_at: Date;
  storage_key: string;
  status: string | null;
  superseded_by_photo_id: string | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockEmployee {
  id: string;
  user_id: string | null;
  is_active: boolean;
}

interface FilterCondition {
  col: string;
  op: string;
  val: unknown;
}

interface FailureHooks {
  failOnTaskUpdate?: boolean;
  failOnTaskEventInsert?: boolean;
  failAfterInventoryMovement?: boolean;
}

interface UnifiedMockState {
  clients: MockClient[];
  orders: MockOrder[];
  orderItems: MockOrderItem[];
  inventoryItems: MockInventoryItem[];
  inventoryBatches: MockInventoryBatch[];
  locations: MockLocation[];
  balances: MockBalance[];
  movements: MockMovement[];
  tasks: MockTask[];
  assignments: MockAssignment[];
  events: MockEvent[];
  qualityRecords: MockQualityRecord[];
  taskPhotos: MockTaskPhoto[];
  employees: MockEmployee[];
}

function createUnifiedMockDatabase(
  initialState?: Partial<UnifiedMockState>,
  failureHooks?: FailureHooks
) {
  let state: UnifiedMockState = {
    clients: initialState?.clients ? [...initialState.clients] : [],
    orders: initialState?.orders ? [...initialState.orders] : [],
    orderItems: initialState?.orderItems ? [...initialState.orderItems] : [],
    inventoryItems: initialState?.inventoryItems ? [...initialState.inventoryItems] : [],
    inventoryBatches: initialState?.inventoryBatches ? [...initialState.inventoryBatches] : [],
    locations: initialState?.locations ? [...initialState.locations] : [],
    balances: initialState?.balances ? [...initialState.balances] : [],
    movements: initialState?.movements ? [...initialState.movements] : [],
    tasks: initialState?.tasks ? [...initialState.tasks] : [],
    assignments: initialState?.assignments ? [...initialState.assignments] : [],
    events: initialState?.events ? [...initialState.events] : [],
    qualityRecords: initialState?.qualityRecords ? [...initialState.qualityRecords] : [],
    taskPhotos: initialState?.taskPhotos ? [...initialState.taskPhotos] : [],
    employees: initialState?.employees ? [...initialState.employees] : []
  };

  const getTableRows = (currentState: UnifiedMockState, table: string): Array<Record<string, unknown>> => {
    switch (table) {
      case "clients": return currentState.clients.map((r) => ({ ...r }));
      case "orders": return currentState.orders.map((r) => ({ ...r }));
      case "order_items": return currentState.orderItems.map((r) => ({ ...r }));
      case "inventory_items": return currentState.inventoryItems.map((r) => ({ ...r }));
      case "inventory_batches": return currentState.inventoryBatches.map((r) => ({ ...r }));
      case "locations": return currentState.locations.map((r) => ({ ...r }));
      case "inventory_balances": return currentState.balances.map((r) => ({ ...r }));
      case "inventory_movements": return currentState.movements.map((r) => ({ ...r }));
      case "tasks": return currentState.tasks.map((r) => ({ ...r }));
      case "task_assignments": return currentState.assignments.map((r) => ({ ...r }));
      case "task_events": return currentState.events.map((r) => ({ ...r }));
      case "quality_records": return currentState.qualityRecords.map((r) => ({ ...r }));
      case "task_photos": return currentState.taskPhotos.map((r) => ({ ...r }));
      case "employees": return currentState.employees.map((r) => ({ ...r }));
      default: return [];
    }
  };

  const createQueryBuilder = (selectedTable: string, activeState?: UnifiedMockState) => {
    const currentState = activeState ?? state;
    const filters: FilterCondition[] = [];
    let sortCol: string | null = null;
    let sortDir: "asc" | "desc" = "asc";

    const builder = {
      select: () => builder,
      selectAll: () => builder,
      orderBy: (col: string, dir?: "asc" | "desc") => {
        sortCol = col;
        sortDir = dir ?? "asc";
        return builder;
      },
      where: (col: string, op: string, val: unknown) => {
        filters.push({ col, op, val });
        return builder;
      },
      forUpdate: () => builder,
      executeTakeFirst: async () => {
        const rows = await builder.execute();
        return rows[0] ?? undefined;
      },
      executeTakeFirstOrThrow: async () => {
        const rows = await builder.execute();
        if (!rows[0]) throw new Error(`Row not found in ${selectedTable}`);
        return rows[0];
      },
      execute: async () => {
        let rows = getTableRows(currentState, selectedTable);

        for (const f of filters) {
          rows = rows.filter((row) => {
            const val = row[f.col];
            if (f.op === "=") return val === f.val;
            if (f.op === "is" && f.val === null) return val === null;
            if (f.op === "is not" && f.val === null) return val !== null;
            if (f.op === "in" && Array.isArray(f.val)) return f.val.includes(val);
            return true;
          });
        }

        if (sortCol) {
          const col = sortCol;
          const mult = sortDir === "desc" ? -1 : 1;
          rows.sort((a, b) => {
            const va = a[col];
            const vb = b[col];
            if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * mult;
            if (va instanceof Date && vb instanceof Date) return (va.getTime() - vb.getTime()) * mult;
            if (typeof va === "number" && typeof vb === "number") return (va - vb) * mult;
            return 0;
          });
        }

        return rows;
      }
    };

    return builder;
  };

  const db = {
    selectFrom: (table: string) => createQueryBuilder(table),
    transaction: () => ({
      execute: async <T>(callback: (trx: unknown) => Promise<T>): Promise<T> => {
        const txState: UnifiedMockState = {
          clients: state.clients.map((r) => ({ ...r })),
          orders: state.orders.map((r) => ({ ...r })),
          orderItems: state.orderItems.map((r) => ({ ...r })),
          inventoryItems: state.inventoryItems.map((r) => ({ ...r })),
          inventoryBatches: state.inventoryBatches.map((r) => ({ ...r })),
          locations: state.locations.map((r) => ({ ...r })),
          balances: state.balances.map((r) => ({ ...r })),
          movements: state.movements.map((r) => ({ ...r })),
          tasks: state.tasks.map((r) => ({ ...r })),
          assignments: state.assignments.map((r) => ({ ...r })),
          events: state.events.map((r) => ({ ...r })),
          qualityRecords: state.qualityRecords.map((r) => ({ ...r })),
          taskPhotos: state.taskPhotos.map((r) => ({ ...r })),
          employees: state.employees.map((r) => ({ ...r }))
        };

        const trx = {
          selectFrom: (table: string) => createQueryBuilder(table, txState),
          insertInto: (table: string) => ({
            values: (val: Record<string, unknown>) => ({
              execute: async () => {
                const now = new Date();
                if (table === "tasks") {
                  txState.tasks.push({
                    id: (val["id"] as string | undefined) ?? crypto.randomUUID(),
                    depot_id: (val["depot_id"] as string | null | undefined) ?? null,
                    task_type: (val["task_type"] as string | null | undefined) ?? null,
                    status: (val["status"] as string | undefined) ?? "PENDING",
                    client_id: (val["client_id"] as string | null | undefined) ?? null,
                    order_id: (val["order_id"] as string | null | undefined) ?? null,
                    order_item_id: (val["order_item_id"] as string | null | undefined) ?? null,
                    inventory_item_id: (val["inventory_item_id"] as string | null | undefined) ?? null,
                    inventory_batch_id: (val["inventory_batch_id"] as string | null | undefined) ?? null,
                    source_location_id: (val["source_location_id"] as string | null | undefined) ?? null,
                    destination_location_id: (val["destination_location_id"] as string | null | undefined) ?? null,
                    shift_id: (val["shift_id"] as string | null | undefined) ?? null,
                    planned_box_quantity: (val["planned_box_quantity"] as string | null | undefined) ?? null,
                    completed_box_quantity: (val["completed_box_quantity"] as string | null | undefined) ?? null,
                    started_at: (val["started_at"] as Date | null | undefined) ?? null,
                    paused_at: (val["paused_at"] as Date | null | undefined) ?? null,
                    completed_at: (val["completed_at"] as Date | null | undefined) ?? null,
                    created_at: (val["created_at"] as Date | undefined) ?? now,
                    updated_at: (val["updated_at"] as Date | undefined) ?? now,
                    version: "1"
                  });
                } else if (table === "task_events") {
                  if (failureHooks?.failOnTaskEventInsert && val["event_type"] === "TASK_MOVEMENT_EXECUTED") {
                    throw new Error("Simulated database failure during task_events insert");
                  }
                  txState.events.push({
                    id: (val["id"] as string | undefined) ?? crypto.randomUUID(),
                    task_id: val["task_id"] as string,
                    event_type: val["event_type"] as string,
                    event_at: (val["event_at"] as Date | undefined) ?? now,
                    actor_user_id: (val["actor_user_id"] as string | null | undefined) ?? null,
                    correlation_id: (val["correlation_id"] as string | null | undefined) ?? null,
                    metadata: (val["metadata"] as string | null | undefined) ?? null,
                    created_at: (val["created_at"] as Date | undefined) ?? now
                  });
                } else if (table === "inventory_movements") {
                  txState.movements.push({
                    id: (val["id"] as string | undefined) ?? crypto.randomUUID(),
                    inventory_batch_id: val["inventory_batch_id"] as string,
                    source_location_id: (val["source_location_id"] as string | null | undefined) ?? null,
                    destination_location_id: (val["destination_location_id"] as string | null | undefined) ?? null,
                    box_quantity: String(val["box_quantity"]),
                    task_id: (val["task_id"] as string | null | undefined) ?? null,
                    movement_type: val["movement_type"] as string,
                    occurred_at: (val["occurred_at"] as Date | undefined) ?? now,
                    actor_user_id: (val["actor_user_id"] as string | null | undefined) ?? null,
                    idempotency_key: (val["idempotency_key"] as string | null | undefined) ?? null,
                    correlation_id: (val["correlation_id"] as string | null | undefined) ?? null,
                    created_at: (val["created_at"] as Date | undefined) ?? now
                  });
                  if (failureHooks?.failAfterInventoryMovement) {
                    throw new Error("Simulated crash immediately following inventory movement insertion");
                  }
                } else if (table === "inventory_balances") {
                  txState.balances.push({
                    id: (val["id"] as string | undefined) ?? crypto.randomUUID(),
                    inventory_batch_id: val["inventory_batch_id"] as string,
                    location_id: val["location_id"] as string,
                    box_quantity: String(val["box_quantity"]),
                    version: "1",
                    created_at: (val["created_at"] as Date | undefined) ?? now,
                    updated_at: (val["updated_at"] as Date | undefined) ?? now
                  });
                } else if (table === "task_assignments") {
                  txState.assignments.push({
                    id: (val["id"] as string | undefined) ?? crypto.randomUUID(),
                    task_id: val["task_id"] as string,
                    employee_id: val["employee_id"] as string,
                    assigned_at: (val["assigned_at"] as Date | undefined) ?? now,
                    assigned_by_user_id: val["assigned_by_user_id"] as string,
                    unassigned_at: (val["unassigned_at"] as Date | null | undefined) ?? null,
                    unassigned_by_user_id: (val["unassigned_by_user_id"] as string | null | undefined) ?? null,
                    version: "1"
                  });
                } else if (table === "quality_records") {
                  txState.qualityRecords.push({
                    id: (val["id"] as string | undefined) ?? crypto.randomUUID(),
                    task_id: val["task_id"] as string,
                    outcome: val["outcome"] as string,
                    quality_score: (val["quality_score"] as string | null | undefined) ?? null,
                    damage_rate: (val["damage_rate"] as string | null | undefined) ?? null,
                    task_accuracy: (val["task_accuracy"] as string | null | undefined) ?? null,
                    final_inventory_status: (val["final_inventory_status"] as string | null | undefined) ?? null,
                    inspected_at: (val["inspected_at"] as Date | undefined) ?? now,
                    inspected_by_user_id: (val["inspected_by_user_id"] as string | null | undefined) ?? null,
                    superseded_by_record_id: (val["superseded_by_record_id"] as string | null | undefined) ?? null,
                    notes: (val["notes"] as string | null | undefined) ?? null,
                    created_at: (val["created_at"] as Date | undefined) ?? now,
                    updated_at: (val["updated_at"] as Date | undefined) ?? now,
                    version: "1"
                  });
                } else if (table === "task_photos") {
                  txState.taskPhotos.push({
                    id: (val["id"] as string | undefined) ?? crypto.randomUUID(),
                    task_id: val["task_id"] as string,
                    layer_number: val["layer_number"] as number,
                    box_quantity: String(val["box_quantity"]),
                    captured_by_employee_id: (val["captured_by_employee_id"] as string | null | undefined) ?? null,
                    captured_at: (val["captured_at"] as Date | undefined) ?? now,
                    storage_key: val["storage_key"] as string,
                    status: (val["status"] as string | null | undefined) ?? null,
                    superseded_by_photo_id: (val["superseded_by_photo_id"] as string | null | undefined) ?? null,
                    created_at: (val["created_at"] as Date | undefined) ?? now,
                    updated_at: (val["updated_at"] as Date | undefined) ?? now,
                    version: "1"
                  });
                }
              }
            })
          }),
          updateTable: (table: string) => {
            let updateValues: Record<string, unknown> = {};
            const updateFilters: FilterCondition[] = [];
            const updater = {
              set: (values: Record<string, unknown>) => {
                updateValues = values;
                return updater;
              },
              where: (col: string, op: string, val: unknown) => {
                updateFilters.push({ col, op, val });
                return updater;
              },
              execute: async () => {
                if (table === "tasks") {
                  if (failureHooks?.failOnTaskUpdate) {
                    throw new Error("Simulated database failure during tasks update");
                  }
                  for (const t of txState.tasks) {
                    const matches = updateFilters.every((f) => {
                      if (f.op === "=") return (t as unknown as Record<string, unknown>)[f.col] === f.val;
                      return true;
                    });
                    if (matches) {
                      if (updateValues["status"] !== undefined) t.status = updateValues["status"] as string;
                      if (updateValues["completed_box_quantity"] !== undefined) t.completed_box_quantity = updateValues["completed_box_quantity"] as string | null;
                      if (updateValues["started_at"] !== undefined) t.started_at = updateValues["started_at"] as Date | null;
                      if (updateValues["paused_at"] !== undefined) t.paused_at = updateValues["paused_at"] as Date | null;
                      if (updateValues["completed_at"] !== undefined) t.completed_at = updateValues["completed_at"] as Date | null;
                      if (updateValues["inventory_batch_id"] !== undefined) t.inventory_batch_id = updateValues["inventory_batch_id"] as string | null;
                      if (updateValues["source_location_id"] !== undefined) t.source_location_id = updateValues["source_location_id"] as string | null;
                      if (updateValues["destination_location_id"] !== undefined) t.destination_location_id = updateValues["destination_location_id"] as string | null;
                      t.updated_at = new Date();
                      t.version = String(Number(t.version) + 1);
                    }
                  }
                } else if (table === "inventory_balances") {
                  for (const b of txState.balances) {
                    const matches = updateFilters.every((f) => {
                      if (f.op === "=") return (b as unknown as Record<string, unknown>)[f.col] === f.val;
                      return true;
                    });
                    if (matches) {
                      if (updateValues["box_quantity"] !== undefined) b.box_quantity = updateValues["box_quantity"] as string;
                      b.updated_at = new Date();
                      b.version = String(Number(b.version) + 1);
                    }
                  }
                }
              }
            };
            return updater;
          }
        };

        const res = await callback(trx);
        state = txState;
        return res;
      }
    }),
    getState: () => state
  };

  return db as unknown as DatabaseConnection & {
    getState: () => UnifiedMockState;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("1. Successful executeTaskMovement commits all five writes in ONE atomic transaction", async () => {
  const batchId = crypto.randomUUID();
  const srcLoc = crypto.randomUUID();
  const destLoc = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const actorUserId = crypto.randomUUID();

  const mockDb = createUnifiedMockDatabase({
    tasks: [
      {
        id: taskId,
        depot_id: null,
        task_type: "INTERNAL_MOVE",
        status: "IN_PROGRESS",
        client_id: null,
        order_id: null,
        order_item_id: null,
        inventory_item_id: null,
        inventory_batch_id: null,
        source_location_id: null,
        destination_location_id: null,
        shift_id: null,
        planned_box_quantity: "30",
        completed_box_quantity: null,
        started_at: new Date(),
        paused_at: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ],
    inventoryBatches: [{ id: batchId, inventory_item_id: crypto.randomUUID(), batch_number: "B-2026-001", created_at: new Date(), updated_at: new Date(), version: "1" }],
    locations: [
      { id: srcLoc, depot_id: crypto.randomUUID(), name: "Aisle 1", location_type: "SHELF", created_at: new Date(), updated_at: new Date(), version: "1" },
      { id: destLoc, depot_id: crypto.randomUUID(), name: "Aisle 2", location_type: "SHELF", created_at: new Date(), updated_at: new Date(), version: "1" }
    ],
    balances: [
      {
        id: crypto.randomUUID(),
        inventory_batch_id: batchId,
        location_id: srcLoc,
        box_quantity: "50",
        version: "1",
        created_at: new Date(),
        updated_at: new Date()
      }
    ]
  });

  const taskService = new TaskService({ database: mockDb });
  const inventoryService = new InventoryService({ database: mockDb });
  const qualityService = new QualityService({ database: mockDb });
  const orchestrator = new WarehouseOrchestrator({
    database: mockDb,
    taskService,
    inventoryService,
    qualityService
  });

  const result = await orchestrator.executeTaskMovement(
    {
      task_id: taskId,
      inventory_batch_id: batchId,
      source_location_id: srcLoc,
      destination_location_id: destLoc,
      box_quantity: 30n,
      movement_type: "TRANSFER"
    },
    actorUserId
  );

  // Assert all 5 writes committed together
  // Write 1 & 2: Source and destination balances updated
  assert.equal(result.movement.source_balance_after, 20n);
  assert.equal(result.movement.destination_balance_after, 30n);

  // Write 3: Movement record inserted
  assert.ok(result.movement.movement.id);
  assert.equal(result.movement.movement.task_id, taskId);

  // Write 4: Task updated
  assert.equal(result.task.inventory_batch_id, batchId);
  assert.equal(result.task.source_location_id, srcLoc);
  assert.equal(result.task.destination_location_id, destLoc);
  assert.equal(result.task.version, 2n);

  // Write 5: Task event inserted
  const state = mockDb.getState();
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0]?.event_type, "TASK_MOVEMENT_EXECUTED");
  assert.equal(state.events[0]?.actor_user_id, actorUserId);
});

test("2. Failure after inventory mutations but before task update causes COMPLETE rollback", async () => {
  const batchId = crypto.randomUUID();
  const srcLoc = crypto.randomUUID();
  const destLoc = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const actorUserId = crypto.randomUUID();

  const mockDb = createUnifiedMockDatabase(
    {
      tasks: [
        {
          id: taskId,
          depot_id: null,
          task_type: "INTERNAL_MOVE",
          status: "IN_PROGRESS",
          client_id: null,
          order_id: null,
          order_item_id: null,
          inventory_item_id: null,
          inventory_batch_id: null,
          source_location_id: null,
          destination_location_id: null,
          shift_id: null,
          planned_box_quantity: "30",
          completed_box_quantity: null,
          started_at: new Date(),
          paused_at: null,
          completed_at: null,
          created_at: new Date(),
          updated_at: new Date(),
          version: "1"
        }
      ],
      inventoryBatches: [{ id: batchId, inventory_item_id: crypto.randomUUID(), batch_number: "B-2026-001", created_at: new Date(), updated_at: new Date(), version: "1" }],
      locations: [
        { id: srcLoc, depot_id: crypto.randomUUID(), name: "Aisle 1", location_type: "SHELF", created_at: new Date(), updated_at: new Date(), version: "1" },
        { id: destLoc, depot_id: crypto.randomUUID(), name: "Aisle 2", location_type: "SHELF", created_at: new Date(), updated_at: new Date(), version: "1" }
      ],
      balances: [
        {
          id: crypto.randomUUID(),
          inventory_batch_id: batchId,
          location_id: srcLoc,
          box_quantity: "50",
          version: "1",
          created_at: new Date(),
          updated_at: new Date()
        }
      ]
    },
    {
      failAfterInventoryMovement: true
    }
  );

  const taskService = new TaskService({ database: mockDb });
  const inventoryService = new InventoryService({ database: mockDb });
  const qualityService = new QualityService({ database: mockDb });
  const orchestrator = new WarehouseOrchestrator({
    database: mockDb,
    taskService,
    inventoryService,
    qualityService
  });

  await assert.rejects(
    () =>
      orchestrator.executeTaskMovement(
        {
          task_id: taskId,
          inventory_batch_id: batchId,
          source_location_id: srcLoc,
          destination_location_id: destLoc,
          box_quantity: 30n,
          movement_type: "TRANSFER"
        },
        actorUserId
      ),
    /Simulated crash immediately following inventory movement/
  );

  // Verify complete rollback across all 5 write targets:
  const state = mockDb.getState();
  // 1. Source balance unchanged
  assert.equal(state.balances.find((b) => b.location_id === srcLoc)?.box_quantity, "50");
  // 2. Destination balance not created
  assert.equal(state.balances.find((b) => b.location_id === destLoc), undefined);
  // 3. No inventory movement recorded
  assert.equal(state.movements.length, 0);
  // 4. Task unchanged (version still 1)
  assert.equal(state.tasks[0]?.version, "1");
  assert.equal(state.tasks[0]?.source_location_id, null);
  // 5. No task event inserted
  assert.equal(state.events.length, 0);
});

test("3. Failure during task update causes COMPLETE rollback", async () => {
  const batchId = crypto.randomUUID();
  const srcLoc = crypto.randomUUID();
  const destLoc = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const actorUserId = crypto.randomUUID();

  const mockDb = createUnifiedMockDatabase(
    {
      tasks: [
        {
          id: taskId,
          depot_id: null,
          task_type: "INTERNAL_MOVE",
          status: "IN_PROGRESS",
          client_id: null,
          order_id: null,
          order_item_id: null,
          inventory_item_id: null,
          inventory_batch_id: null,
          source_location_id: null,
          destination_location_id: null,
          shift_id: null,
          planned_box_quantity: "30",
          completed_box_quantity: null,
          started_at: new Date(),
          paused_at: null,
          completed_at: null,
          created_at: new Date(),
          updated_at: new Date(),
          version: "1"
        }
      ],
      inventoryBatches: [{ id: batchId, inventory_item_id: crypto.randomUUID(), batch_number: "B-2026-001", created_at: new Date(), updated_at: new Date(), version: "1" }],
      locations: [
        { id: srcLoc, depot_id: crypto.randomUUID(), name: "Aisle 1", location_type: "SHELF", created_at: new Date(), updated_at: new Date(), version: "1" },
        { id: destLoc, depot_id: crypto.randomUUID(), name: "Aisle 2", location_type: "SHELF", created_at: new Date(), updated_at: new Date(), version: "1" }
      ],
      balances: [
        {
          id: crypto.randomUUID(),
          inventory_batch_id: batchId,
          location_id: srcLoc,
          box_quantity: "50",
          version: "1",
          created_at: new Date(),
          updated_at: new Date()
        }
      ]
    },
    {
      failOnTaskUpdate: true
    }
  );

  const taskService = new TaskService({ database: mockDb });
  const inventoryService = new InventoryService({ database: mockDb });
  const qualityService = new QualityService({ database: mockDb });
  const orchestrator = new WarehouseOrchestrator({
    database: mockDb,
    taskService,
    inventoryService,
    qualityService
  });

  await assert.rejects(
    () =>
      orchestrator.executeTaskMovement(
        {
          task_id: taskId,
          inventory_batch_id: batchId,
          source_location_id: srcLoc,
          destination_location_id: destLoc,
          box_quantity: 30n,
          movement_type: "TRANSFER"
        },
        actorUserId
      ),
    /Simulated database failure during tasks update/
  );

  // Complete rollback verification
  const state = mockDb.getState();
  assert.equal(state.balances.find((b) => b.location_id === srcLoc)?.box_quantity, "50");
  assert.equal(state.balances.find((b) => b.location_id === destLoc), undefined);
  assert.equal(state.movements.length, 0);
  assert.equal(state.tasks[0]?.version, "1");
  assert.equal(state.events.length, 0);
});

test("4. Failure during TASK_MOVEMENT_EXECUTED event insertion causes COMPLETE rollback", async () => {
  const batchId = crypto.randomUUID();
  const srcLoc = crypto.randomUUID();
  const destLoc = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const actorUserId = crypto.randomUUID();

  const mockDb = createUnifiedMockDatabase(
    {
      tasks: [
        {
          id: taskId,
          depot_id: null,
          task_type: "INTERNAL_MOVE",
          status: "IN_PROGRESS",
          client_id: null,
          order_id: null,
          order_item_id: null,
          inventory_item_id: null,
          inventory_batch_id: null,
          source_location_id: null,
          destination_location_id: null,
          shift_id: null,
          planned_box_quantity: "30",
          completed_box_quantity: null,
          started_at: new Date(),
          paused_at: null,
          completed_at: null,
          created_at: new Date(),
          updated_at: new Date(),
          version: "1"
        }
      ],
      inventoryBatches: [{ id: batchId, inventory_item_id: crypto.randomUUID(), batch_number: "B-2026-001", created_at: new Date(), updated_at: new Date(), version: "1" }],
      locations: [
        { id: srcLoc, depot_id: crypto.randomUUID(), name: "Aisle 1", location_type: "SHELF", created_at: new Date(), updated_at: new Date(), version: "1" },
        { id: destLoc, depot_id: crypto.randomUUID(), name: "Aisle 2", location_type: "SHELF", created_at: new Date(), updated_at: new Date(), version: "1" }
      ],
      balances: [
        {
          id: crypto.randomUUID(),
          inventory_batch_id: batchId,
          location_id: srcLoc,
          box_quantity: "50",
          version: "1",
          created_at: new Date(),
          updated_at: new Date()
        }
      ]
    },
    {
      failOnTaskEventInsert: true
    }
  );

  const taskService = new TaskService({ database: mockDb });
  const inventoryService = new InventoryService({ database: mockDb });
  const qualityService = new QualityService({ database: mockDb });
  const orchestrator = new WarehouseOrchestrator({
    database: mockDb,
    taskService,
    inventoryService,
    qualityService
  });

  await assert.rejects(
    () =>
      orchestrator.executeTaskMovement(
        {
          task_id: taskId,
          inventory_batch_id: batchId,
          source_location_id: srcLoc,
          destination_location_id: destLoc,
          box_quantity: 30n,
          movement_type: "TRANSFER"
        },
        actorUserId
      ),
    /Simulated database failure during task_events insert/
  );

  // Complete rollback verification
  const state = mockDb.getState();
  assert.equal(state.balances.find((b) => b.location_id === srcLoc)?.box_quantity, "50");
  assert.equal(state.balances.find((b) => b.location_id === destLoc), undefined);
  assert.equal(state.movements.length, 0);
  assert.equal(state.tasks[0]?.version, "1");
  assert.equal(state.events.length, 0);
});

test("5. Existing InventoryService standalone transaction behavior remains intact", async () => {
  const batchId = crypto.randomUUID();
  const srcLoc = crypto.randomUUID();
  const destLoc = crypto.randomUUID();
  const actorUserId = crypto.randomUUID();

  const mockDb = createUnifiedMockDatabase({
    inventoryBatches: [{ id: batchId, inventory_item_id: crypto.randomUUID(), batch_number: "B-1", created_at: new Date(), updated_at: new Date(), version: "1" }],
    locations: [
      { id: srcLoc, depot_id: crypto.randomUUID(), name: "A1", location_type: "SHELF", created_at: new Date(), updated_at: new Date(), version: "1" },
      { id: destLoc, depot_id: crypto.randomUUID(), name: "B1", location_type: "SHELF", created_at: new Date(), updated_at: new Date(), version: "1" }
    ],
    balances: [
      {
        id: crypto.randomUUID(),
        inventory_batch_id: batchId,
        location_id: srcLoc,
        box_quantity: "100",
        version: "1",
        created_at: new Date(),
        updated_at: new Date()
      }
    ]
  });

  const inventoryService = new InventoryService({ database: mockDb });

  // Standalone call without orchestrator or external transaction
  const result = await inventoryService.moveInventory(
    {
      inventory_batch_id: batchId,
      source_location_id: srcLoc,
      destination_location_id: destLoc,
      box_quantity: 25n,
      movement_type: "STOCK_TRANSFER"
    },
    actorUserId
  );

  assert.equal(result.source_balance_after, 75n);
  assert.equal(result.destination_balance_after, 25n);
  assert.equal(result.is_idempotent_replay, false);

  const state = mockDb.getState();
  assert.equal(state.movements.length, 1);
});

test("6. Existing TaskService standalone transaction behavior remains intact", async () => {
  const taskId = crypto.randomUUID();
  const empId = crypto.randomUUID();
  const actorUserId = crypto.randomUUID();

  const mockDb = createUnifiedMockDatabase({
    tasks: [
      {
        id: taskId,
        depot_id: null,
        task_type: "SORT",
        status: "PENDING",
        client_id: null,
        order_id: null,
        order_item_id: null,
        inventory_item_id: null,
        inventory_batch_id: null,
        source_location_id: null,
        destination_location_id: null,
        shift_id: null,
        planned_box_quantity: "10",
        completed_box_quantity: null,
        started_at: null,
        paused_at: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ],
    employees: [{ id: empId, user_id: crypto.randomUUID(), is_active: true }]
  });

  const taskService = new TaskService({ database: mockDb });

  // Standalone assignTask call
  const assigned = await taskService.assignTask({ task_id: taskId, employee_id: empId }, actorUserId);
  assert.equal(assigned.status, "ASSIGNED");
  assert.equal(assigned.version, 2n);

  const state = mockDb.getState();
  assert.equal(state.assignments.length, 1);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0]?.event_type, "TASK_ASSIGNED");
});

test("7. Existing inventory idempotency behavior remains intact (no duplicate movements or events on retry)", async () => {
  const batchId = crypto.randomUUID();
  const srcLoc = crypto.randomUUID();
  const destLoc = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const actorUserId = crypto.randomUUID();
  const idempotencyKey = "movement-key-unique-1234";

  const mockDb = createUnifiedMockDatabase({
    tasks: [
      {
        id: taskId,
        depot_id: null,
        task_type: "MOVE",
        status: "IN_PROGRESS",
        client_id: null,
        order_id: null,
        order_item_id: null,
        inventory_item_id: null,
        inventory_batch_id: null,
        source_location_id: null,
        destination_location_id: null,
        shift_id: null,
        planned_box_quantity: "20",
        completed_box_quantity: null,
        started_at: new Date(),
        paused_at: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ],
    inventoryBatches: [{ id: batchId, inventory_item_id: crypto.randomUUID(), batch_number: "B-1", created_at: new Date(), updated_at: new Date(), version: "1" }],
    locations: [
      { id: srcLoc, depot_id: crypto.randomUUID(), name: "A1", location_type: "SHELF", created_at: new Date(), updated_at: new Date(), version: "1" },
      { id: destLoc, depot_id: crypto.randomUUID(), name: "B1", location_type: "SHELF", created_at: new Date(), updated_at: new Date(), version: "1" }
    ],
    balances: [
      {
        id: crypto.randomUUID(),
        inventory_batch_id: batchId,
        location_id: srcLoc,
        box_quantity: "50",
        version: "1",
        created_at: new Date(),
        updated_at: new Date()
      }
    ]
  });

  const taskService = new TaskService({ database: mockDb });
  const inventoryService = new InventoryService({ database: mockDb });
  const qualityService = new QualityService({ database: mockDb });
  const orchestrator = new WarehouseOrchestrator({
    database: mockDb,
    taskService,
    inventoryService,
    qualityService
  });

  // First execution
  const first = await orchestrator.executeTaskMovement(
    {
      task_id: taskId,
      inventory_batch_id: batchId,
      source_location_id: srcLoc,
      destination_location_id: destLoc,
      box_quantity: 20n,
      movement_type: "TRANSFER",
      idempotency_key: idempotencyKey
    },
    actorUserId
  );
  assert.equal(first.movement.is_idempotent_replay, false);
  assert.equal(first.movement.source_balance_after, 30n);

  const stateAfterFirst = mockDb.getState();
  assert.equal(stateAfterFirst.movements.length, 1);
  assert.equal(stateAfterFirst.events.length, 1);

  // Idempotent retry with the SAME key
  const second = await orchestrator.executeTaskMovement(
    {
      task_id: taskId,
      inventory_batch_id: batchId,
      source_location_id: srcLoc,
      destination_location_id: destLoc,
      box_quantity: 20n,
      movement_type: "TRANSFER",
      idempotency_key: idempotencyKey
    },
    actorUserId
  );
  assert.equal(second.movement.is_idempotent_replay, true);

  // Assert NO duplicate movement and NO duplicate task event inserted
  const stateAfterSecond = mockDb.getState();
  assert.equal(stateAfterSecond.movements.length, 1);
  assert.equal(stateAfterSecond.events.length, 1);
});

test("8. Actor attribution remains trusted/server-side", async () => {
  const mockDb = createUnifiedMockDatabase();
  const taskService = new TaskService({ database: mockDb });
  const inventoryService = new InventoryService({ database: mockDb });
  const qualityService = new QualityService({ database: mockDb });
  const orchestrator = new WarehouseOrchestrator({
    database: mockDb,
    taskService,
    inventoryService,
    qualityService
  });

  await assert.rejects(
    () =>
      orchestrator.executeTaskMovement(
        {
          task_id: crypto.randomUUID(),
          inventory_batch_id: crypto.randomUUID(),
          source_location_id: crypto.randomUUID(),
          destination_location_id: null,
          box_quantity: 10n,
          movement_type: "DISPATCH"
        },
        ""
      ),
    (err: unknown) => {
      assert.ok(err instanceof OrchestrationDomainError);
      assert.equal(err.code, "UNAUTHORIZED_ACTOR");
      return true;
    }
  );
});

test("9. Existing task lifecycle validation remains unchanged", async () => {
  const taskId = crypto.randomUUID();
  const actorUserId = crypto.randomUUID();

  const mockDb = createUnifiedMockDatabase({
    tasks: [
      {
        id: taskId,
        depot_id: null,
        task_type: "MOVE",
        status: "CANCELLED",
        client_id: null,
        order_id: null,
        order_item_id: null,
        inventory_item_id: null,
        inventory_batch_id: null,
        source_location_id: null,
        destination_location_id: null,
        shift_id: null,
        planned_box_quantity: "10",
        completed_box_quantity: null,
        started_at: null,
        paused_at: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const taskService = new TaskService({ database: mockDb });
  const inventoryService = new InventoryService({ database: mockDb });
  const qualityService = new QualityService({ database: mockDb });
  const orchestrator = new WarehouseOrchestrator({
    database: mockDb,
    taskService,
    inventoryService,
    qualityService
  });

  await assert.rejects(
    () =>
      orchestrator.executeTaskMovement(
        {
          task_id: taskId,
          inventory_batch_id: crypto.randomUUID(),
          source_location_id: crypto.randomUUID(),
          destination_location_id: null,
          box_quantity: 5n,
          movement_type: "MOVE"
        },
        actorUserId
      ),
    (err: unknown) => {
      assert.ok(err instanceof OrchestrationDomainError);
      assert.equal(err.code, "INVALID_TASK_STATE");
      return true;
    }
  );
});

test("10. Closed-loop task summary returns complete cross-domain authoritative state", async () => {
  const clientId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const orderItemId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const batchId = crypto.randomUUID();
  const employeeId = crypto.randomUUID();
  const inspectorId = crypto.randomUUID();

  const mockDb = createUnifiedMockDatabase({
    clients: [{ id: clientId, name: "Royal Client", created_at: new Date(), updated_at: new Date(), version: "1" }],
    orders: [{ id: orderId, client_id: clientId, created_at: new Date(), updated_at: new Date(), version: "1" }],
    orderItems: [{ id: orderItemId, order_id: orderId, created_at: new Date(), updated_at: new Date(), version: "1" }],
    tasks: [
      {
        id: taskId,
        depot_id: null,
        task_type: "PACKING",
        status: "COMPLETED",
        client_id: clientId,
        order_id: orderId,
        order_item_id: orderItemId,
        inventory_item_id: null,
        inventory_batch_id: batchId,
        source_location_id: null,
        destination_location_id: null,
        shift_id: null,
        planned_box_quantity: "40",
        completed_box_quantity: "40",
        started_at: new Date(),
        paused_at: null,
        completed_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        version: "3"
      }
    ],
    employees: [{ id: employeeId, user_id: crypto.randomUUID(), is_active: true }],
    assignments: [
      {
        id: crypto.randomUUID(),
        task_id: taskId,
        employee_id: employeeId,
        assigned_at: new Date(),
        assigned_by_user_id: crypto.randomUUID(),
        unassigned_at: null,
        unassigned_by_user_id: null,
        version: "1"
      }
    ],
    taskPhotos: [
      {
        id: crypto.randomUUID(),
        task_id: taskId,
        layer_number: 1,
        box_quantity: "40",
        captured_by_employee_id: employeeId,
        captured_at: new Date(),
        storage_key: "photos/t1/l1.webp",
        status: null,
        superseded_by_photo_id: null,
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ],
    movements: [
      {
        id: crypto.randomUUID(),
        inventory_batch_id: batchId,
        source_location_id: null,
        destination_location_id: crypto.randomUUID(),
        box_quantity: "40",
        task_id: taskId,
        movement_type: "PACK_TO_STORAGE",
        occurred_at: new Date(),
        actor_user_id: crypto.randomUUID(),
        idempotency_key: null,
        correlation_id: null,
        created_at: new Date()
      }
    ],
    qualityRecords: [
      {
        id: crypto.randomUUID(),
        task_id: taskId,
        outcome: "PASS",
        quality_score: "99",
        damage_rate: "0",
        task_accuracy: "100",
        final_inventory_status: "AVAILABLE",
        inspected_at: new Date(),
        inspected_by_user_id: inspectorId,
        superseded_by_record_id: null,
        notes: "Inspection approved",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ],
    events: [
      {
        id: crypto.randomUUID(),
        task_id: taskId,
        event_type: "TASK_CREATED",
        event_at: new Date(),
        actor_user_id: crypto.randomUUID(),
        correlation_id: null,
        metadata: null,
        created_at: new Date()
      },
      {
        id: crypto.randomUUID(),
        task_id: taskId,
        event_type: "TASK_COMPLETED",
        event_at: new Date(),
        actor_user_id: crypto.randomUUID(),
        correlation_id: null,
        metadata: null,
        created_at: new Date()
      }
    ]
  });

  const taskService = new TaskService({ database: mockDb });
  const inventoryService = new InventoryService({ database: mockDb });
  const qualityService = new QualityService({ database: mockDb });
  const orchestrator = new WarehouseOrchestrator({
    database: mockDb,
    taskService,
    inventoryService,
    qualityService
  });

  const summary = await orchestrator.getClosedLoopTaskSummary(taskId);

  // Authoritative closed loop verification
  assert.equal(summary.task.id, taskId);
  assert.equal(summary.task.status, "COMPLETED");

  assert.ok(summary.order);
  assert.equal(summary.order.id, orderId);
  assert.equal(summary.order.client_id, clientId);

  assert.ok(summary.order_item);
  assert.equal(summary.order_item.id, orderItemId);

  assert.equal(summary.assignments.length, 1);
  assert.equal(summary.assignments[0]?.employee_id, employeeId);

  assert.equal(summary.photos.length, 1);
  assert.equal(summary.photos[0]?.layer_number, 1);
  assert.equal(summary.photos[0]?.box_quantity, 40n);

  assert.equal(summary.movements.length, 1);
  assert.equal(summary.movements[0]?.movement_type, "PACK_TO_STORAGE");

  assert.equal(summary.quality_records.length, 1);
  assert.equal(summary.quality_records[0]?.final_inventory_status, "AVAILABLE");

  assert.equal(summary.events.length, 2);
});
