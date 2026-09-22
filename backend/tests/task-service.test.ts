import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { TaskService } from "../apps/api/src/modules/warehouse/index.js";
import {
  TaskDomainError
} from "../packages/contracts/src/warehouse/index.js";
import type { DatabaseConnection } from "../packages/db/src/index.js";

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

interface MockEmployee {
  id: string;
  user_id: string | null;
  is_active: boolean;
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

interface FilterCondition {
  col: string;
  op: string;
  val: unknown;
}

interface SeedData {
  tasks?: MockTask[];
  employees?: MockEmployee[];
  assignments?: MockAssignment[];
  events?: MockEvent[];
}

function createMockTaskDatabase() {
  let tasks: MockTask[] = [];
  const employees: MockEmployee[] = [];
  let assignments: MockAssignment[] = [];
  let events: MockEvent[] = [];

  const createQueryBuilder = (
    selectedTable: string,
    inMemoryState?: { tasks: MockTask[]; assignments: MockAssignment[]; events: MockEvent[] }
  ) => {
    const filters: FilterCondition[] = [];
    const joins: Array<{ table: string; col1: string; col2: string }> = [];
    const activeTasks = inMemoryState ? inMemoryState.tasks : tasks;
    const activeAssignments = inMemoryState ? inMemoryState.assignments : assignments;
    const activeEvents = inMemoryState ? inMemoryState.events : events;

    const builder = {
      select: () => builder,
      selectAll: () => builder,
      orderBy: () => builder,
      innerJoin: (table: string, col1: string, col2: string) => {
        joins.push({ table, col1, col2 });
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
        if (!rows[0]) throw new Error("Row not found");
        return rows[0];
      },
      execute: async () => {
        let result: Array<Record<string, unknown>> = [];
        if (selectedTable === "tasks") {
          if (joins.some((j) => j.table === "task_assignments")) {
            for (const t of activeTasks) {
              const matchingAssignments = activeAssignments.filter((a) => a.task_id === t.id);
              for (const a of matchingAssignments) {
                result.push({
                  ...t,
                  "tasks.status": t.status,
                  "task_assignments.employee_id": a.employee_id,
                  "task_assignments.unassigned_at": a.unassigned_at
                });
              }
            }
          } else {
            result = activeTasks.map((t) => ({ ...t }));
          }
        } else if (selectedTable === "employees") {
          result = employees.map((e) => ({ ...e }));
        } else if (selectedTable === "task_assignments") {
          result = activeAssignments.map((a) => ({ ...a }));
        } else if (selectedTable === "task_events") {
          result = activeEvents.map((e) => ({ ...e }));
        }

        for (const f of filters) {
          result = result.filter((row) => {
            const actual = row[f.col] !== undefined ? row[f.col] : (f.col.includes(".") ? row[f.col.split(".")[1]!] : undefined);
            if (f.op === "=") return actual === f.val;
            if (f.op === "is" && f.val === null) return actual === null || actual === undefined;
            if (f.op === "in" && Array.isArray(f.val)) return f.val.includes(actual);
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
        const trxTasks = tasks.map((t) => ({ ...t }));
        const trxAssignments = assignments.map((a) => ({ ...a }));
        const trxEvents = events.map((e) => ({ ...e }));
        const inMemoryState = { tasks: trxTasks, assignments: trxAssignments, events: trxEvents };

        const trx = {
          selectFrom: (table: string) => createQueryBuilder(table, inMemoryState),
          insertInto: (table: string) => ({
            values: (val: Record<string, unknown>) => ({
              execute: async () => {
                if (table === "task_assignments") {
                  inMemoryState.assignments.push({
                    id: (val["id"] as string | undefined) ?? crypto.randomUUID(),
                    task_id: val["task_id"] as string,
                    employee_id: val["employee_id"] as string,
                    assigned_at: (val["assigned_at"] as Date | undefined) ?? new Date(),
                    assigned_by_user_id: val["assigned_by_user_id"] as string,
                    unassigned_at: (val["unassigned_at"] as Date | null | undefined) ?? null,
                    unassigned_by_user_id: (val["unassigned_by_user_id"] as string | null | undefined) ?? null,
                    version: (val["version"] as string | undefined) ?? "1"
                  });
                } else if (table === "task_events") {
                  inMemoryState.events.push({
                    id: (val["id"] as string | undefined) ?? crypto.randomUUID(),
                    task_id: val["task_id"] as string,
                    event_type: val["event_type"] as string,
                    event_at: (val["event_at"] as Date | undefined) ?? new Date(),
                    actor_user_id: (val["actor_user_id"] as string | null | undefined) ?? null,
                    correlation_id: (val["correlation_id"] as string | null | undefined) ?? null,
                    metadata: (val["metadata"] as string | null | undefined) ?? null,
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
                  if (table === "tasks") {
                    const idx = inMemoryState.tasks.findIndex(
                      (t) => (t as unknown as Record<string, unknown>)[col] === val
                    );
                    if (idx !== -1) {
                      const cur = inMemoryState.tasks[idx]!;
                      const nextVer = updates["version"]
                        ? String(Number(cur.version) + 1)
                        : cur.version;
                      inMemoryState.tasks[idx] = {
                        ...cur,
                        status: (updates["status"] as string | undefined) ?? cur.status,
                        started_at: (updates["started_at"] as Date | null | undefined) !== undefined
                          ? (updates["started_at"] as Date | null)
                          : cur.started_at,
                        paused_at: (updates["paused_at"] as Date | null | undefined) !== undefined
                          ? (updates["paused_at"] as Date | null)
                          : cur.paused_at,
                        completed_at: (updates["completed_at"] as Date | null | undefined) !== undefined
                          ? (updates["completed_at"] as Date | null)
                          : cur.completed_at,
                        completed_box_quantity: (updates["completed_box_quantity"] as string | null | undefined) !== undefined
                          ? (updates["completed_box_quantity"] as string | null)
                          : cur.completed_box_quantity,
                        version: nextVer,
                        updated_at: new Date()
                      };
                    }
                  } else if (table === "task_assignments") {
                    const idx = inMemoryState.assignments.findIndex(
                      (a) => (a as unknown as Record<string, unknown>)[col] === val
                    );
                    if (idx !== -1) {
                      const cur = inMemoryState.assignments[idx]!;
                      const nextVer = updates["version"]
                        ? String(Number(cur.version) + 1)
                        : cur.version;
                      inMemoryState.assignments[idx] = {
                        ...cur,
                        unassigned_at: (updates["unassigned_at"] as Date | null | undefined) ?? cur.unassigned_at,
                        unassigned_by_user_id: (updates["unassigned_by_user_id"] as string | null | undefined) ?? cur.unassigned_by_user_id,
                        version: nextVer
                      };
                    }
                  }
                }
              })
            })
          })
        };

        const result = await callback(trx);
        tasks = inMemoryState.tasks;
        assignments = inMemoryState.assignments;
        events = inMemoryState.events;
        return result;
      }
    }),
    seed: (data: SeedData) => {
      if (data.tasks) tasks.push(...data.tasks);
      if (data.employees) employees.push(...data.employees);
      if (data.assignments) assignments.push(...data.assignments);
      if (data.events) events.push(...data.events);
    },
    getState: () => ({
      tasks,
      assignments,
      events
    })
  };

  return db as unknown as DatabaseConnection & {
    seed: (data: SeedData) => void;
    getState: () => { tasks: MockTask[]; assignments: MockAssignment[]; events: MockEvent[] };
  };
}

test("assignTask assigns employee to PENDING task, changes status to ASSIGNED, creates event and assignment", async () => {
  const db = createMockTaskDatabase();
  const taskId = crypto.randomUUID();
  const employeeId = crypto.randomUUID();
  const actorUserId = crypto.randomUUID();

  db.seed({
    tasks: [
      {
        id: taskId,
        depot_id: null,
        task_type: "PICKING",
        status: "PENDING",
        client_id: null,
        order_id: null,
        order_item_id: null,
        inventory_item_id: null,
        inventory_batch_id: null,
        source_location_id: null,
        destination_location_id: null,
        shift_id: null,
        planned_box_quantity: "100",
        completed_box_quantity: null,
        started_at: null,
        paused_at: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ],
    employees: [{ id: employeeId, user_id: null, is_active: true }]
  });

  const service = new TaskService({ database: db });
  const updated = await service.assignTask({ task_id: taskId, employee_id: employeeId }, actorUserId);

  assert.equal(updated.status, "ASSIGNED");
  assert.equal(updated.version, 2n);

  const state = db.getState();
  assert.equal(state.assignments.length, 1);
  assert.equal(state.assignments[0]?.employee_id, employeeId);
  assert.equal(state.assignments[0]?.assigned_by_user_id, actorUserId);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0]?.event_type, "TASK_ASSIGNED");
  assert.equal(state.events[0]?.actor_user_id, actorUserId);
});

test("assignTask supports multiple employees on the same task without duplicate active assignments", async () => {
  const db = createMockTaskDatabase();
  const taskId = crypto.randomUUID();
  const emp1 = crypto.randomUUID();
  const emp2 = crypto.randomUUID();
  const actor = crypto.randomUUID();

  db.seed({
    tasks: [
      {
        id: taskId,
        depot_id: null,
        task_type: "PACKING",
        status: "PENDING",
        client_id: null,
        order_id: null,
        order_item_id: null,
        inventory_item_id: null,
        inventory_batch_id: null,
        source_location_id: null,
        destination_location_id: null,
        shift_id: null,
        planned_box_quantity: "50",
        completed_box_quantity: null,
        started_at: null,
        paused_at: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ],
    employees: [
      { id: emp1, user_id: null, is_active: true },
      { id: emp2, user_id: null, is_active: true }
    ]
  });

  const service = new TaskService({ database: db });
  await service.assignTask({ task_id: taskId, employee_id: emp1 }, actor);
  await service.assignTask({ task_id: taskId, employee_id: emp2 }, actor);

  const state = db.getState();
  assert.equal(state.assignments.length, 2);

  // Attempting duplicate active assignment for emp1 throws
  await assert.rejects(
    async () => {
      await service.assignTask({ task_id: taskId, employee_id: emp1 }, actor);
    },
    (err: unknown) => {
      assert.ok(err instanceof TaskDomainError);
      assert.equal(err.code, "DUPLICATE_ACTIVE_ASSIGNMENT");
      return true;
    }
  );
});

test("unassignTask marks unassigned_at and reverts to PENDING if no active assignments remain", async () => {
  const db = createMockTaskDatabase();
  const taskId = crypto.randomUUID();
  const emp1 = crypto.randomUUID();
  const actor = crypto.randomUUID();

  db.seed({
    tasks: [
      {
        id: taskId,
        depot_id: null,
        task_type: "PACKING",
        status: "PENDING",
        client_id: null,
        order_id: null,
        order_item_id: null,
        inventory_item_id: null,
        inventory_batch_id: null,
        source_location_id: null,
        destination_location_id: null,
        shift_id: null,
        planned_box_quantity: "50",
        completed_box_quantity: null,
        started_at: null,
        paused_at: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ],
    employees: [{ id: emp1, user_id: null, is_active: true }]
  });

  const service = new TaskService({ database: db });
  await service.assignTask({ task_id: taskId, employee_id: emp1 }, actor);
  const unassigned = await service.unassignTask({ task_id: taskId, employee_id: emp1 }, actor);

  assert.equal(unassigned.status, "PENDING");
  const state = db.getState();
  assert.equal(state.assignments[0]?.unassigned_by_user_id, actor);
  assert.ok(state.assignments[0]?.unassigned_at !== null);
  assert.equal(state.events.length, 2);
  assert.equal(state.events[1]?.event_type, "TASK_UNASSIGNED");
});

test("startTask transitions ASSIGNED task to IN_PROGRESS, sets started_at and creates event", async () => {
  const db = createMockTaskDatabase();
  const taskId = crypto.randomUUID();
  const actor = crypto.randomUUID();

  db.seed({
    tasks: [
      {
        id: taskId,
        depot_id: null,
        task_type: "SORTING",
        status: "ASSIGNED",
        client_id: null,
        order_id: null,
        order_item_id: null,
        inventory_item_id: null,
        inventory_batch_id: null,
        source_location_id: null,
        destination_location_id: null,
        shift_id: null,
        planned_box_quantity: "50",
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

  const service = new TaskService({ database: db });
  const started = await service.startTask(taskId, actor);

  assert.equal(started.status, "IN_PROGRESS");
  assert.ok(started.started_at !== null);
  assert.equal(started.version, 2n);

  const state = db.getState();
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0]?.event_type, "TASK_STARTED");
  assert.equal(state.events[0]?.actor_user_id, actor);
});

test("pauseTask and resumeTask lifecycle transitions work correctly and record events", async () => {
  const db = createMockTaskDatabase();
  const taskId = crypto.randomUUID();
  const actor = crypto.randomUUID();

  db.seed({
    tasks: [
      {
        id: taskId,
        depot_id: null,
        task_type: "SORTING",
        status: "IN_PROGRESS",
        client_id: null,
        order_id: null,
        order_item_id: null,
        inventory_item_id: null,
        inventory_batch_id: null,
        source_location_id: null,
        destination_location_id: null,
        shift_id: null,
        planned_box_quantity: "50",
        completed_box_quantity: null,
        started_at: new Date(),
        paused_at: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new TaskService({ database: db });

  // Pause
  const paused = await service.pauseTask(taskId, actor);
  assert.equal(paused.status, "PAUSED");
  assert.ok(paused.paused_at !== null);

  // Resume
  const resumed = await service.resumeTask(taskId, actor);
  assert.equal(resumed.status, "IN_PROGRESS");
  assert.equal(resumed.paused_at, null);

  const state = db.getState();
  assert.equal(state.events.length, 2);
  assert.equal(state.events[0]?.event_type, "TASK_PAUSED");
  assert.equal(state.events[1]?.event_type, "TASK_RESUMED");
});

test("completeTask completes IN_PROGRESS task, sets completed_box_quantity and completed_at", async () => {
  const db = createMockTaskDatabase();
  const taskId = crypto.randomUUID();
  const actor = crypto.randomUUID();

  db.seed({
    tasks: [
      {
        id: taskId,
        depot_id: null,
        task_type: "PICKING",
        status: "IN_PROGRESS",
        client_id: null,
        order_id: null,
        order_item_id: null,
        inventory_item_id: null,
        inventory_batch_id: null,
        source_location_id: null,
        destination_location_id: null,
        shift_id: null,
        planned_box_quantity: "80",
        completed_box_quantity: null,
        started_at: new Date(),
        paused_at: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        version: "2"
      }
    ]
  });

  const service = new TaskService({ database: db });
  const completed = await service.completeTask(
    { task_id: taskId, completed_box_quantity: 80n },
    actor
  );

  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.completed_box_quantity, 80n);
  assert.ok(completed.completed_at !== null);
  assert.equal(completed.version, 3n);

  const state = db.getState();
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0]?.event_type, "TASK_COMPLETED");
});

test("cancelTask cancels active task, and reopenTask returns it to IN_PROGRESS", async () => {
  const db = createMockTaskDatabase();
  const taskId = crypto.randomUUID();
  const actor = crypto.randomUUID();

  db.seed({
    tasks: [
      {
        id: taskId,
        depot_id: null,
        task_type: "PICKING",
        status: "ASSIGNED",
        client_id: null,
        order_id: null,
        order_item_id: null,
        inventory_item_id: null,
        inventory_batch_id: null,
        source_location_id: null,
        destination_location_id: null,
        shift_id: null,
        planned_box_quantity: "50",
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

  const service = new TaskService({ database: db });

  // Cancel
  const cancelled = await service.cancelTask({ task_id: taskId, reason: "Order modified by client" }, actor);
  assert.equal(cancelled.status, "CANCELLED");

  // Reopen
  const reopened = await service.reopenTask({ task_id: taskId, reason: "Reactivated by supervisor" }, actor);
  assert.equal(reopened.status, "IN_PROGRESS");

  const state = db.getState();
  assert.equal(state.events.length, 2);
  assert.equal(state.events[0]?.event_type, "TASK_CANCELLED");
  assert.equal(state.events[1]?.event_type, "TASK_REOPENED");
});

test("unauthorized actor without authenticated user ID is rejected", async () => {
  const db = createMockTaskDatabase();
  const taskId = crypto.randomUUID();
  const service = new TaskService({ database: db });

  await assert.rejects(
    async () => {
      await service.startTask(taskId, "");
    },
    (err: unknown) => {
      assert.ok(err instanceof TaskDomainError);
      assert.equal(err.code, "UNAUTHORIZED_ACTOR");
      return true;
    }
  );
});

test("read queries getTask, getTaskAssignments, getTaskEvents, getActiveTasksForEmployee work correctly", async () => {
  const db = createMockTaskDatabase();
  const taskId = crypto.randomUUID();
  const empId = crypto.randomUUID();
  const actor = crypto.randomUUID();

  db.seed({
    tasks: [
      {
        id: taskId,
        depot_id: null,
        task_type: "PACKING",
        status: "PENDING",
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
        started_at: null,
        paused_at: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ],
    employees: [{ id: empId, user_id: null, is_active: true }]
  });

  const service = new TaskService({ database: db });
  await service.assignTask({ task_id: taskId, employee_id: empId }, actor);

  const task = await service.getTask(taskId);
  assert.equal(task?.id, taskId);

  const assignments = await service.getTaskAssignments(taskId);
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0]?.employee_id, empId);

  const events = await service.getTaskEvents(taskId);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.event_type, "TASK_ASSIGNED");

  const activeEmpTasks = await service.getActiveTasksForEmployee(empId);
  assert.equal(activeEmpTasks.length, 1);
  assert.equal(activeEmpTasks[0]?.id, taskId);
});
