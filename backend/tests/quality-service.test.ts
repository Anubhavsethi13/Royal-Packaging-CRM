import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { QualityService } from "../apps/api/src/modules/quality/index.js";
import { QualityDomainError } from "../packages/contracts/src/quality/index.js";
import type { DatabaseConnection } from "../packages/db/src/index.js";

interface MockTask {
  id: string;
  status: string;
  depot_id: string | null;
  task_type: string | null;
  completed_box_quantity: string | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockEmployee {
  id: string;
  user_id: string | null;
  is_active: boolean;
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

interface FilterCondition {
  col: string;
  op: string;
  val: unknown;
}

interface SeedData {
  tasks?: MockTask[];
  employees?: MockEmployee[];
  qualityRecords?: MockQualityRecord[];
  taskPhotos?: MockTaskPhoto[];
}

function createMockQualityDatabase(seed?: SeedData) {
  const tasks: MockTask[] = seed?.tasks ? [...seed.tasks] : [];
  const employees: MockEmployee[] = seed?.employees ? [...seed.employees] : [];
  let qualityRecords: MockQualityRecord[] = seed?.qualityRecords ? [...seed.qualityRecords] : [];
  let taskPhotos: MockTaskPhoto[] = seed?.taskPhotos ? [...seed.taskPhotos] : [];

  const createQueryBuilder = (
    selectedTable: string,
    inMemoryState?: {
      tasks: MockTask[];
      qualityRecords: MockQualityRecord[];
      taskPhotos: MockTaskPhoto[];
    }
  ) => {
    const filters: FilterCondition[] = [];
    const activeTasks = inMemoryState ? inMemoryState.tasks : tasks;
    const activeQualityRecords = inMemoryState ? inMemoryState.qualityRecords : qualityRecords;
    const activeTaskPhotos = inMemoryState ? inMemoryState.taskPhotos : taskPhotos;

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
        if (!rows[0]) throw new Error("Row not found");
        return rows[0];
      },
      execute: async () => {
        let result: Array<Record<string, unknown>> = [];
        if (selectedTable === "tasks") {
          result = activeTasks.map((t) => ({ ...t }));
        } else if (selectedTable === "employees") {
          result = employees.map((e) => ({ ...e }));
        } else if (selectedTable === "quality_records") {
          result = activeQualityRecords.map((q) => ({ ...q }));
        } else if (selectedTable === "task_photos") {
          result = activeTaskPhotos.map((p) => ({ ...p }));
        }

        // Apply filters
        for (const f of filters) {
          result = result.filter((row) => {
            const val = row[f.col];
            if (f.op === "=") return val === f.val;
            if (f.op === "is" && f.val === null) return val === null;
            if (f.op === "is not" && f.val === null) return val !== null;
            return true;
          });
        }

        // Apply sorting
        if (sortCol) {
          const col = sortCol;
          const mult = sortDir === "desc" ? -1 : 1;
          result.sort((a, b) => {
            const va = a[col];
            const vb = b[col];
            if (typeof va === "string" && typeof vb === "string") {
              return va.localeCompare(vb) * mult;
            }
            if (va instanceof Date && vb instanceof Date) {
              return (va.getTime() - vb.getTime()) * mult;
            }
            if (typeof va === "number" && typeof vb === "number") {
              return (va - vb) * mult;
            }
            return 0;
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
        // Deep copy state for atomic rollback
        const txTasks = tasks.map((t) => ({ ...t }));
        const txQualityRecords = qualityRecords.map((q) => ({ ...q }));
        const txTaskPhotos = taskPhotos.map((p) => ({ ...p }));

        const txState = {
          tasks: txTasks,
          qualityRecords: txQualityRecords,
          taskPhotos: txTaskPhotos
        };

        const trx = {
          selectFrom: (table: string) => createQueryBuilder(table, txState),
          insertInto: (table: string) => ({
            values: (val: Record<string, unknown>) => ({
              execute: async () => {
                if (table === "quality_records") {
                  txState.qualityRecords.push({
                    id: (val["id"] as string | undefined) ?? crypto.randomUUID(),
                    task_id: val["task_id"] as string,
                    outcome: val["outcome"] as string,
                    quality_score: (val["quality_score"] as string | null | undefined) ?? null,
                    damage_rate: (val["damage_rate"] as string | null | undefined) ?? null,
                    task_accuracy: (val["task_accuracy"] as string | null | undefined) ?? null,
                    final_inventory_status: (val["final_inventory_status"] as string | null | undefined) ?? null,
                    inspected_at: (val["inspected_at"] as Date | undefined) ?? new Date(),
                    inspected_by_user_id: (val["inspected_by_user_id"] as string | null | undefined) ?? null,
                    superseded_by_record_id: (val["superseded_by_record_id"] as string | null | undefined) ?? null,
                    notes: (val["notes"] as string | null | undefined) ?? null,
                    created_at: (val["created_at"] as Date | undefined) ?? new Date(),
                    updated_at: (val["updated_at"] as Date | undefined) ?? new Date(),
                    version: "1"
                  });
                } else if (table === "task_photos") {
                  txState.taskPhotos.push({
                    id: (val["id"] as string | undefined) ?? crypto.randomUUID(),
                    task_id: val["task_id"] as string,
                    layer_number: val["layer_number"] as number,
                    box_quantity: String(val["box_quantity"]),
                    captured_by_employee_id: (val["captured_by_employee_id"] as string | null | undefined) ?? null,
                    captured_at: (val["captured_at"] as Date | undefined) ?? new Date(),
                    storage_key: val["storage_key"] as string,
                    status: (val["status"] as string | null | undefined) ?? null,
                    superseded_by_photo_id: (val["superseded_by_photo_id"] as string | null | undefined) ?? null,
                    created_at: (val["created_at"] as Date | undefined) ?? new Date(),
                    updated_at: (val["updated_at"] as Date | undefined) ?? new Date(),
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
                if (table === "quality_records") {
                  for (const r of txState.qualityRecords) {
                    const matches = updateFilters.every((f) => {
                      if (f.op === "=") return (r as unknown as Record<string, unknown>)[f.col] === f.val;
                      return true;
                    });
                    if (matches) {
                      if (updateValues["superseded_by_record_id"] !== undefined) {
                        r.superseded_by_record_id = updateValues["superseded_by_record_id"] as string | null;
                      }
                      if (updateValues["updated_at"] !== undefined) {
                        r.updated_at = updateValues["updated_at"] as Date;
                      }
                      r.version = String(Number(r.version) + 1);
                    }
                  }
                } else if (table === "task_photos") {
                  for (const p of txState.taskPhotos) {
                    const matches = updateFilters.every((f) => {
                      if (f.op === "=") return (p as unknown as Record<string, unknown>)[f.col] === f.val;
                      return true;
                    });
                    if (matches) {
                      if (updateValues["superseded_by_photo_id"] !== undefined) {
                        p.superseded_by_photo_id = updateValues["superseded_by_photo_id"] as string | null;
                      }
                      if (updateValues["updated_at"] !== undefined) {
                        p.updated_at = updateValues["updated_at"] as Date;
                      }
                      p.version = String(Number(p.version) + 1);
                    }
                  }
                }
              }
            };
            return updater;
          }
        };

        const res = await callback(trx);
        // Commit tx state to authoritative storage
        qualityRecords = txState.qualityRecords;
        taskPhotos = txState.taskPhotos;
        return res;
      }
    }),
    getState: () => ({
      tasks,
      employees,
      qualityRecords,
      taskPhotos
    })
  };

  return db as unknown as DatabaseConnection & {
    getState: () => {
      tasks: MockTask[];
      employees: MockEmployee[];
      qualityRecords: MockQualityRecord[];
      taskPhotos: MockTaskPhoto[];
    };
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("1. valid quality inspection records quality result and returns QualityRecord", async () => {
  const taskId = crypto.randomUUID();
  const inspectorId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "COMPLETED",
        depot_id: null,
        task_type: "UNPACKING",
        completed_box_quantity: "100",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  const record = await service.inspectTask(
    {
      task_id: taskId,
      outcome: "PASS",
      quality_score: 98,
      damage_rate: 1.5,
      task_accuracy: 100,
      notes: "Clean inspection"
    },
    inspectorId
  );

  assert.ok(record.id);
  assert.equal(record.task_id, taskId);
  assert.equal(record.outcome, "PASS");
  assert.equal(record.quality_score, 98);
  assert.equal(record.damage_rate, 1.5);
  assert.equal(record.task_accuracy, 100);
  assert.equal(record.final_inventory_status, "AVAILABLE");
  assert.equal(record.inspected_by_user_id, inspectorId);
  assert.equal(record.notes, "Clean inspection");
  assert.equal(record.superseded_by_record_id, null);
});

test("2. quality record persistence in database", async () => {
  const taskId = crypto.randomUUID();
  const inspectorId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "COMPLETED",
        depot_id: null,
        task_type: "PACKING",
        completed_box_quantity: "50",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  const record = await service.inspectTask(
    {
      task_id: taskId,
      outcome: "PASS",
      damage_rate: 2.0
    },
    inspectorId
  );

  const state = mockDb.getState();
  assert.equal(state.qualityRecords.length, 1);
  assert.ok(state.qualityRecords[0]);
  assert.equal(state.qualityRecords[0].id, record.id);
  assert.equal(state.qualityRecords[0].task_id, taskId);
  assert.equal(state.qualityRecords[0].final_inventory_status, "AVAILABLE");
});

test("3. damage rate >= 5% produces DAMAGED status", async () => {
  const taskId = crypto.randomUUID();
  const inspectorId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "COMPLETED",
        depot_id: null,
        task_type: "UNPACKING",
        completed_box_quantity: "100",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  // 5.1% damage rate
  const record1 = await service.inspectTask(
    {
      task_id: taskId,
      outcome: "FAIL",
      damage_rate: 5.1
    },
    inspectorId
  );
  assert.equal(record1.final_inventory_status, "DAMAGED");

  // 12% damage rate
  const record2 = await service.inspectTask(
    {
      task_id: taskId,
      outcome: "FAIL",
      damage_rate: 12
    },
    inspectorId
  );
  assert.equal(record2.final_inventory_status, "DAMAGED");

  // 100% damage rate
  const record3 = await service.inspectTask(
    {
      task_id: taskId,
      outcome: "FAIL",
      damage_rate: 100
    },
    inspectorId
  );
  assert.equal(record3.final_inventory_status, "DAMAGED");
});

test("4. damage rate < 5% produces AVAILABLE status", async () => {
  const taskId = crypto.randomUUID();
  const inspectorId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "COMPLETED",
        depot_id: null,
        task_type: "UNPACKING",
        completed_box_quantity: "100",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  // 0% damage rate
  const record1 = await service.inspectTask(
    {
      task_id: taskId,
      outcome: "PASS",
      damage_rate: 0
    },
    inspectorId
  );
  assert.equal(record1.final_inventory_status, "AVAILABLE");

  // 4.99% damage rate
  const record2 = await service.inspectTask(
    {
      task_id: taskId,
      outcome: "PASS",
      damage_rate: 4.99
    },
    inspectorId
  );
  assert.equal(record2.final_inventory_status, "AVAILABLE");
});

test("5. exactly 5% damage rate produces DAMAGED status", async () => {
  const taskId = crypto.randomUUID();
  const inspectorId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "COMPLETED",
        depot_id: null,
        task_type: "UNPACKING",
        completed_box_quantity: "100",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  const record = await service.inspectTask(
    {
      task_id: taskId,
      outcome: "ADJUST",
      damage_rate: 5.0
    },
    inspectorId
  );
  assert.equal(record.final_inventory_status, "DAMAGED");
  assert.equal(record.damage_rate, 5.0);
});

test("6. invalid damage rate is rejected", async () => {
  const taskId = crypto.randomUUID();
  const inspectorId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "COMPLETED",
        depot_id: null,
        task_type: "UNPACKING",
        completed_box_quantity: "100",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  // Negative damage rate
  await assert.rejects(
    () =>
      service.inspectTask(
        {
          task_id: taskId,
          outcome: "PASS",
          damage_rate: -1
        },
        inspectorId
      ),
    (err: unknown) => {
      assert.ok(err instanceof QualityDomainError);
      assert.equal(err.code, "INVALID_DAMAGE_RATE");
      return true;
    }
  );

  // Over 100 damage rate
  await assert.rejects(
    () =>
      service.inspectTask(
        {
          task_id: taskId,
          outcome: "PASS",
          damage_rate: 105
        },
        inspectorId
      ),
    (err: unknown) => {
      assert.ok(err instanceof QualityDomainError);
      assert.equal(err.code, "INVALID_DAMAGE_RATE");
      return true;
    }
  );
});

test("7. quality score range validation (0 to 100)", async () => {
  const taskId = crypto.randomUUID();
  const inspectorId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "COMPLETED",
        depot_id: null,
        task_type: "UNPACKING",
        completed_box_quantity: "100",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  // Below 0
  await assert.rejects(
    () =>
      service.inspectTask(
        {
          task_id: taskId,
          outcome: "PASS",
          quality_score: -5
        },
        inspectorId
      ),
    (err: unknown) => {
      assert.ok(err instanceof QualityDomainError);
      assert.equal(err.code, "INVALID_QUALITY_SCORE");
      return true;
    }
  );

  // Above 100
  await assert.rejects(
    () =>
      service.inspectTask(
        {
          task_id: taskId,
          outcome: "PASS",
          quality_score: 101
        },
        inspectorId
      ),
    (err: unknown) => {
      assert.ok(err instanceof QualityDomainError);
      assert.equal(err.code, "INVALID_QUALITY_SCORE");
      return true;
    }
  );
});

test("8. task accuracy range validation (0 to 100)", async () => {
  const taskId = crypto.randomUUID();
  const inspectorId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "COMPLETED",
        depot_id: null,
        task_type: "UNPACKING",
        completed_box_quantity: "100",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  // Below 0
  await assert.rejects(
    () =>
      service.inspectTask(
        {
          task_id: taskId,
          outcome: "PASS",
          task_accuracy: -0.1
        },
        inspectorId
      ),
    (err: unknown) => {
      assert.ok(err instanceof QualityDomainError);
      assert.equal(err.code, "INVALID_TASK_ACCURACY");
      return true;
    }
  );

  // Above 100
  await assert.rejects(
    () =>
      service.inspectTask(
        {
          task_id: taskId,
          outcome: "PASS",
          task_accuracy: 100.5
        },
        inspectorId
      ),
    (err: unknown) => {
      assert.ok(err instanceof QualityDomainError);
      assert.equal(err.code, "INVALID_TASK_ACCURACY");
      return true;
    }
  );
});

test("9. inspector attribution comes from trusted server context", async () => {
  const taskId = crypto.randomUUID();
  const inspectorId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "COMPLETED",
        depot_id: null,
        task_type: "UNPACKING",
        completed_box_quantity: "100",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  const record = await service.inspectTask(
    {
      task_id: taskId,
      outcome: "PASS"
    },
    inspectorId
  );

  assert.equal(record.inspected_by_user_id, inspectorId);
});

test("10. client inspector ID cannot impersonate another user", async () => {
  const taskId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "COMPLETED",
        depot_id: null,
        task_type: "UNPACKING",
        completed_box_quantity: "100",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  // Missing / empty actorUserId
  await assert.rejects(
    () =>
      service.inspectTask(
        {
          task_id: taskId,
          outcome: "PASS"
        },
        ""
      ),
    (err: unknown) => {
      assert.ok(err instanceof QualityDomainError);
      assert.equal(err.code, "UNAUTHORIZED_ACTOR");
      return true;
    }
  );
});

test("11. task-not-found handling", async () => {
  const nonExistentTaskId = crypto.randomUUID();
  const inspectorId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase();
  const service = new QualityService({ database: mockDb });

  await assert.rejects(
    () =>
      service.inspectTask(
        {
          task_id: nonExistentTaskId,
          outcome: "PASS"
        },
        inspectorId
      ),
    (err: unknown) => {
      assert.ok(err instanceof QualityDomainError);
      assert.equal(err.code, "TASK_NOT_FOUND");
      return true;
    }
  );
});

test("12. historical quality records are preserved when superseded", async () => {
  const taskId = crypto.randomUUID();
  const inspectorId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "COMPLETED",
        depot_id: null,
        task_type: "UNPACKING",
        completed_box_quantity: "100",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  // Initial inspection (damage rate 6% -> DAMAGED)
  const firstRecord = await service.inspectTask(
    {
      task_id: taskId,
      outcome: "FAIL",
      damage_rate: 6.0,
      notes: "Initial inspection: box damage noted"
    },
    inspectorId
  );
  assert.equal(firstRecord.final_inventory_status, "DAMAGED");

  // Re-inspection/Correction superseding the first (damage rate 2% -> AVAILABLE)
  const secondRecord = await service.inspectTask(
    {
      task_id: taskId,
      outcome: "PASS",
      damage_rate: 2.0,
      notes: "Reinspection after box replacement",
      supersedes_record_id: firstRecord.id
    },
    inspectorId
  );
  assert.equal(secondRecord.final_inventory_status, "AVAILABLE");

  // Verify historical records in DB
  const history = await service.getTaskQualityHistory(taskId);
  assert.equal(history.length, 2);

  const updatedFirst = await service.getQualityRecord(firstRecord.id);
  assert.ok(updatedFirst);
  assert.equal(updatedFirst.superseded_by_record_id, secondRecord.id);
  assert.equal(updatedFirst.final_inventory_status, "DAMAGED"); // historical state preserved!
});

test("13. photo layer number must be positive (> 0)", async () => {
  const taskId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "IN_PROGRESS",
        depot_id: null,
        task_type: "PACKING",
        completed_box_quantity: "0",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  // Layer 0 is invalid
  await assert.rejects(
    () =>
      service.recordTaskPhoto({
        task_id: taskId,
        layer_number: 0,
        box_quantity: 10,
        storage_key: "photos/task-1/layer-0.jpg"
      }),
    (err: unknown) => {
      assert.ok(err instanceof QualityDomainError);
      assert.equal(err.code, "INVALID_PHOTO_LAYER");
      return true;
    }
  );

  // Negative layer is invalid
  await assert.rejects(
    () =>
      service.recordTaskPhoto({
        task_id: taskId,
        layer_number: -2,
        box_quantity: 10,
        storage_key: "photos/task-1/layer-neg.jpg"
      }),
    (err: unknown) => {
      assert.ok(err instanceof QualityDomainError);
      assert.equal(err.code, "INVALID_PHOTO_LAYER");
      return true;
    }
  );
});

test("14. photo BOX quantity must be positive (> 0)", async () => {
  const taskId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "IN_PROGRESS",
        depot_id: null,
        task_type: "PACKING",
        completed_box_quantity: "0",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  // Box quantity 0 is invalid
  await assert.rejects(
    () =>
      service.recordTaskPhoto({
        task_id: taskId,
        layer_number: 1,
        box_quantity: 0,
        storage_key: "photos/task-1/layer-1.jpg"
      }),
    (err: unknown) => {
      assert.ok(err instanceof QualityDomainError);
      assert.equal(err.code, "INVALID_BOX_QUANTITY");
      return true;
    }
  );
});

test("15. photo records remain linked to the correct task and employee", async () => {
  const taskId = crypto.randomUUID();
  const employeeId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "IN_PROGRESS",
        depot_id: null,
        task_type: "PACKING",
        completed_box_quantity: "0",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ],
    employees: [
      {
        id: employeeId,
        user_id: crypto.randomUUID(),
        is_active: true
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  const photo = await service.recordTaskPhoto(
    {
      task_id: taskId,
      layer_number: 1,
      box_quantity: 24,
      storage_key: "warehouse/2026/layer1.webp"
    },
    employeeId
  );

  assert.ok(photo.id);
  assert.equal(photo.task_id, taskId);
  assert.equal(photo.layer_number, 1);
  assert.equal(photo.box_quantity, 24n);
  assert.equal(photo.captured_by_employee_id, employeeId);
  assert.equal(photo.storage_key, "warehouse/2026/layer1.webp");

  const photos = await service.getTaskPhotos(taskId);
  assert.equal(photos.length, 1);
  assert.ok(photos[0]);
  assert.equal(photos[0].id, photo.id);
});

test("16. no hard-coded storage provider in storage_key", async () => {
  const taskId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "IN_PROGRESS",
        depot_id: null,
        task_type: "PACKING",
        completed_box_quantity: "0",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  // Any abstract storage key is accepted
  const photo = await service.recordTaskPhoto({
    task_id: taskId,
    layer_number: 2,
    box_quantity: 36,
    storage_key: "urn:blob:custom-store-key-12345"
  });

  assert.equal(photo.storage_key, "urn:blob:custom-store-key-12345");
});

test("17. quality inspection does not unexpectedly mutate task lifecycle", async () => {
  const taskId = crypto.randomUUID();
  const inspectorId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "IN_PROGRESS",
        depot_id: null,
        task_type: "UNPACKING",
        completed_box_quantity: "50",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  await service.inspectTask(
    {
      task_id: taskId,
      outcome: "FAIL",
      damage_rate: 15.0
    },
    inspectorId
  );

  // Verify task status was NOT mutated
  const state = mockDb.getState();
  const task = state.tasks.find((t: MockTask) => t.id === taskId);
  assert.ok(task);
  assert.equal(task.status, "IN_PROGRESS");
});

test("18. failed transactional operation leaves no partial quality state", async () => {
  const taskId = crypto.randomUUID();
  const inspectorId = crypto.randomUUID();

  const mockDb = createMockQualityDatabase({
    tasks: [
      {
        id: taskId,
        status: "COMPLETED",
        depot_id: null,
        task_type: "UNPACKING",
        completed_box_quantity: "100",
        created_at: new Date(),
        updated_at: new Date(),
        version: "1"
      }
    ]
  });

  const service = new QualityService({ database: mockDb });

  // Attempt to supersede a non-existent record ID
  const fakeRecordId = crypto.randomUUID();
  await assert.rejects(
    () =>
      service.inspectTask(
        {
          task_id: taskId,
          outcome: "PASS",
          damage_rate: 1.0,
          supersedes_record_id: fakeRecordId
        },
        inspectorId
      ),
    (err: unknown) => {
      assert.ok(err instanceof QualityDomainError);
      assert.equal(err.code, "QUALITY_RECORD_NOT_FOUND");
      return true;
    }
  );

  // Verify rollback: no records created
  const state = mockDb.getState();
  assert.equal(state.qualityRecords.length, 0);
});
