import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { IncentiveDomainError } from "../packages/contracts/src/incentives/index.js";
import type { DatabaseConnection } from "../packages/db/src/index.js";
import {
  fromScaledBigInt,
  IncentiveService,
  toScaledBigInt
} from "../apps/api/src/modules/incentives/incentive-service.js";

interface MockMonthlyKot {
  [key: string]: unknown;
  id: string;
  effective_month: string;
  kot_value: string;
  status: string;
  created_by_user_id: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockManualPenalty {
  [key: string]: unknown;
  id: string;
  employee_id: string;
  task_id: string | null;
  amount: string;
  reason: string;
  effective_month: string;
  recorded_by_user_id: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockIncentiveRule {
  [key: string]: unknown;
  id: string;
  rule_version: string;
  effective_from: Date;
  effective_to: Date | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockIncentiveLedger {
  [key: string]: unknown;
  id: string;
  task_id: string;
  employee_id: string;
  incentive_rule_id: string | null;
  amount: string;
  status: string;
  idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockIncentiveEvent {
  [key: string]: unknown;
  id: string;
  task_id: string;
  incentive_rule_id: string | null;
  event_type: string;
  event_at: Date;
  actor_user_id: string | null;
  correlation_id: string | null;
  metadata: string | null;
  created_at: Date;
}

interface MockEmployee {
  [key: string]: unknown;
  id: string;
  user_id: string | null;
  is_active: boolean;
}

interface MockTask {
  [key: string]: unknown;
  id: string;
  status: string;
  planned_box_quantity: string | null;
  completed_box_quantity: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  version: string;
}

interface MockTaskAssignment {
  [key: string]: unknown;
  id: string;
  task_id: string;
  employee_id: string;
  assigned_at: Date;
  unassigned_at: Date | null;
  version: string;
}

interface MockQualityRecord {
  [key: string]: unknown;
  id: string;
  task_id: string;
  outcome: string;
  quality_score: string | null;
  damage_rate: string | null;
  final_inventory_status: string | null;
  superseded_by_record_id: string | null;
  inspected_at: Date;
  created_at: Date;
  version: string;
}

function createMockIncentiveDatabase() {
  const monthlyKot: MockMonthlyKot[] = [];
  const manualPenalties: MockManualPenalty[] = [];
  const incentiveRules: MockIncentiveRule[] = [];
  const incentiveLedger: MockIncentiveLedger[] = [];
  const incentiveEvents: MockIncentiveEvent[] = [];
  const employees: MockEmployee[] = [];
  const tasks: MockTask[] = [];
  const taskAssignments: MockTaskAssignment[] = [];
  const qualityRecords: MockQualityRecord[] = [];

  const createQueryBuilder = (selectedTable: string) => {
    const filters: Array<{ col: string; op: string; val: unknown }> = [];
    let orderByCol: string | null = null;
    let orderDir: "asc" | "desc" = "asc";

    const builder = {
      innerJoin: () => builder,
      select: () => builder,
      selectAll: () => builder,
      distinct: () => builder,
      forUpdate: () => builder,
      orderBy: (col: string, dir: "asc" | "desc" = "asc") => {
        orderByCol = col;
        orderDir = dir;
        return builder;
      },
      where: (col: string, op: string, val: unknown) => {
        filters.push({ col, op, val });
        return builder;
      },
      execute: async () => {
        let list: Record<string, unknown>[] = [];
        if (selectedTable === "monthly_kot") list = [...monthlyKot];
        if (selectedTable === "manual_penalties") list = [...manualPenalties];
        if (selectedTable === "incentive_rules") list = [...incentiveRules];
        if (selectedTable === "incentive_ledger") list = [...incentiveLedger];
        if (selectedTable === "incentive_events") list = [...incentiveEvents];
        if (selectedTable === "employees") list = [...employees];
        if (selectedTable === "tasks") list = [...tasks];
        if (selectedTable === "task_assignments") list = [...taskAssignments];
        if (selectedTable === "quality_records") list = [...qualityRecords];

        for (const f of filters) {
          if (f.op === "=") list = list.filter((r) => r[f.col] === f.val);
          if (f.op === "in" && Array.isArray(f.val)) list = list.filter((r) => (f.val as unknown[]).includes(r[f.col]));
          if (f.op === "is" && f.val === null) list = list.filter((r) => r[f.col] === null);
          if (f.op === "is not" && f.val === null) list = list.filter((r) => r[f.col] !== null);
        }

        if (orderByCol) {
          list.sort((a, b) => {
            const rawA = a[orderByCol!];
            const rawB = b[orderByCol!];
            const aVal = rawA instanceof Date ? rawA.getTime() : String(rawA);
            const bVal = rawB instanceof Date ? rawB.getTime() : String(rawB);
            return orderDir === "desc" ? (bVal > aVal ? 1 : -1) : aVal > bVal ? 1 : -1;
          });
        }
        return list;
      },
      executeTakeFirst: async () => {
        const rows = await builder.execute();
        return rows[0];
      },
      executeTakeFirstOrThrow: async () => {
        const rows = await builder.execute();
        if (!rows[0]) throw new Error(`Record not found in ${selectedTable}`);
        return rows[0];
      }
    };
    return builder;
  };

  const db = {
    monthlyKot,
    manualPenalties,
    incentiveRules,
    incentiveLedger,
    incentiveEvents,
    employees,
    tasks,
    taskAssignments,
    qualityRecords,
    selectFrom: (table: string) => createQueryBuilder(table),
    insertInto: (table: string) => ({
      values: (val: Record<string, unknown>) => ({
        execute: async () => {
          if (table === "monthly_kot") monthlyKot.push(val as unknown as MockMonthlyKot);
          if (table === "manual_penalties") manualPenalties.push(val as unknown as MockManualPenalty);
          if (table === "incentive_rules") incentiveRules.push(val as unknown as MockIncentiveRule);
          if (table === "incentive_ledger") incentiveLedger.push(val as unknown as MockIncentiveLedger);
          if (table === "incentive_events") incentiveEvents.push(val as unknown as MockIncentiveEvent);
          return {};
        }
      })
    }),
    updateTable: (table: string) => {
      let updateVals: Record<string, unknown> = {};
      const filters: Array<{ col: string; op: string; val: unknown }> = [];
      const updater = {
        set: (v: Record<string, unknown>) => {
          updateVals = v;
          return updater;
        },
        where: (col: string, op: string, val: unknown) => {
          filters.push({ col, op, val });
          return updater;
        },
        execute: async () => {
          let list: Record<string, unknown>[] = [];
          if (table === "incentive_ledger") list = incentiveLedger as unknown as Record<string, unknown>[];
          if (table === "monthly_kot") list = monthlyKot as unknown as Record<string, unknown>[];

          for (const item of list) {
            const match = filters.every((f) => {
              if (f.op === "=") return item[f.col] === f.val;
              if (f.op === "in" && Array.isArray(f.val)) return f.val.includes(item[f.col]);
              return true;
            });
            if (match) {
              const currentVer = Number(item.version || 1);
              Object.assign(item, updateVals);
              item.version = String(currentVer + 1);
            }
          }
          return {};
        }
      };
      return updater;
    },
    deleteFrom: (table: string) => {
      const filters: Array<{ col: string; op: string; val: unknown }> = [];
      const deleter = {
        where: (col: string, op: string, val: unknown) => {
          filters.push({ col, op, val });
          return deleter;
        },
        execute: async () => {
          if (table === "incentive_ledger") {
            for (let i = incentiveLedger.length - 1; i >= 0; i--) {
              const item = incentiveLedger[i];
              if (item) {
                const match = filters.every((f) => item[f.col as keyof MockIncentiveLedger] === f.val);
                if (match) {
                  incentiveLedger.splice(i, 1);
                }
              }
            }
          }
          return {};
        }
      };
      return deleter;
    },
    transaction: () => ({
      execute: async <T>(cb: (trx: unknown) => Promise<T>): Promise<T> => {
        return cb(db);
      }
    })
  };

  return db as unknown as DatabaseConnection & {
    monthlyKot: MockMonthlyKot[];
    manualPenalties: MockManualPenalty[];
    incentiveRules: MockIncentiveRule[];
    incentiveLedger: MockIncentiveLedger[];
    incentiveEvents: MockIncentiveEvent[];
    employees: MockEmployee[];
    tasks: MockTask[];
    taskAssignments: MockTaskAssignment[];
    qualityRecords: MockQualityRecord[];
  };
}

test("Decimal scaling utility provides exact arithmetic without float inaccuracy", () => {
  assert.equal(toScaledBigInt("1200.00"), 120000n);
  assert.equal(toScaledBigInt("900"), 90000n);
  assert.equal(toScaledBigInt("0.06"), 6n);
  assert.equal(toScaledBigInt(1000.5), 100050n);
  assert.equal(fromScaledBigInt(120000n), "1200.00");
  assert.equal(fromScaledBigInt(33333n), "333.33");
  assert.equal(fromScaledBigInt(1n), "0.01");
  assert.equal(fromScaledBigInt(0n), "0.00");
});

test("Rule 1: Super Admin records monthly KOT once per month; duplicate month is rejected", async () => {
  const db = createMockIncentiveDatabase();
  const service = new IncentiveService({ database: db });
  const superAdminId = crypto.randomUUID();

  // 1. Record KOT for 2026-09
  const kot = await service.recordMonthlyKot(
    {
      effective_month: "2026-09",
      kot_value: "1000000.00",
      notes: "September 2026 operational target"
    },
    superAdminId
  );

  assert.equal(kot.effective_month, "2026-09");
  assert.equal(kot.kot_value, "1000000.00");
  assert.equal(kot.status, "ACTIVE");
  assert.equal(kot.created_by_user_id, superAdminId);

  // 2. Query monthly KOT
  const fetched = await service.getMonthlyKot("2026-09");
  assert.ok(fetched);
  assert.equal(fetched.kot_value, "1000000.00");

  // 3. Duplicate KOT for same month must be rejected
  await assert.rejects(
    async () => {
      await service.recordMonthlyKot(
        {
          effective_month: "2026-09",
          kot_value: "1200000.00"
        },
        superAdminId
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof IncentiveDomainError);
      assert.equal(err.code, "DUPLICATE_MONTHLY_KOT");
      return true;
    }
  );

  // Existing value remains untouched
  const stillExisting = await service.getMonthlyKot("2026-09");
  assert.equal(stillExisting?.kot_value, "1000000.00");
});

test("Rule 2: Monthly Incentive = KOT × 6% with explicit TBD markers for unconfirmed rules", async () => {
  const db = createMockIncentiveDatabase();
  const service = new IncentiveService({ database: db });
  const superAdminId = crypto.randomUUID();
  const emp1Id = crypto.randomUUID();
  const emp2Id = crypto.randomUUID();

  db.employees.push(
    { id: emp1Id, user_id: null, is_active: true },
    { id: emp2Id, user_id: null, is_active: true }
  );

  // 1. Record KOT = 1,000,000.00
  await service.recordMonthlyKot(
    { effective_month: "2026-09", kot_value: "1000000.00" },
    superAdminId
  );

  // 2. Record manual penalties for the month
  await service.recordManualPenalty(
    {
      employee_id: emp1Id,
      amount: "5000.00",
      reason: "Damage deduction",
      effective_month: "2026-09"
    },
    superAdminId
  );

  await service.recordManualPenalty(
    {
      employee_id: emp2Id,
      amount: "2500.00",
      reason: "Shortage penalty",
      effective_month: "2026-09"
    },
    superAdminId
  );

  // 3. Calculate Monthly Incentive
  const result = await service.calculateMonthlyIncentive({ effective_month: "2026-09" });

  // Monthly Incentive Pool = 1,000,000 * 6% = 60,000.00
  assert.equal(result.monthly_incentive_pool, "60000.00");
  assert.equal(result.gross_incentive_pool, "60000.00");
  assert.equal(result.penalties.length, 2);
  
  // FND-18A: Unconfirmed business rules are NOT assumed or hardcoded
  assert.equal(result.penalty_aggregation_relationship, "TBD_PENDING_POLICY");
  assert.equal(result.zero_floor_policy, "TBD_NOT_CONFIRMED");
  assert.equal(result.task_reconciliation_status, "TBD_SOURCE_UNDEFINED");
  assert.equal(result.overtime_status, "PENDING_CONFIGURATION");
});

test("Rule 3 & 6: Task equal sharing among participating employees with surfaced remainder", async () => {
  const db = createMockIncentiveDatabase();
  const service = new IncentiveService({ database: db });
  const actorId = crypto.randomUUID();

  const empA = crypto.randomUUID();
  const empB = crypto.randomUUID();
  const empC = crypto.randomUUID();
  const empRemoved = crypto.randomUUID();

  db.employees.push(
    { id: empA, user_id: null, is_active: true },
    { id: empB, user_id: null, is_active: true },
    { id: empC, user_id: null, is_active: true },
    { id: empRemoved, user_id: null, is_active: true }
  );

  const taskId = crypto.randomUUID();
  db.tasks.push({
    id: taskId,
    status: "COMPLETED",
    planned_box_quantity: "100",
    completed_box_quantity: "100",
    started_at: new Date(),
    completed_at: new Date(),
    version: "1"
  });

  // Assign empA, empB, empC (active)
  db.taskAssignments.push(
    {
      id: "a-1",
      task_id: taskId,
      employee_id: empA,
      assigned_at: new Date(),
      unassigned_at: null,
      version: "1"
    },
    {
      id: "a-2",
      task_id: taskId,
      employee_id: empB,
      assigned_at: new Date(),
      unassigned_at: null,
      version: "1"
    },
    {
      id: "a-3",
      task_id: taskId,
      employee_id: empC,
      assigned_at: new Date(),
      unassigned_at: null,
      version: "1"
    },
    // empRemoved was unassigned before completion
    {
      id: "a-4",
      task_id: taskId,
      employee_id: empRemoved,
      assigned_at: new Date(),
      unassigned_at: new Date(),
      version: "2"
    }
  );

  // Task incentive amount = ₹1,200.00 across 3 active employees = ₹400.00 each, remainder = 0.00
  const alloc1 = await service.calculateTaskIncentive(
    { task_id: taskId, task_incentive_amount: "1200.00" },
    actorId
  );

  assert.equal(alloc1.total_task_incentive, "1200.00");
  assert.equal(alloc1.per_employee_share, "400.00");
  assert.equal(alloc1.unresolved_remainder, "0.00");
  assert.equal(alloc1.rounding_policy, "EXACT_REMAINDER_HELD");
  assert.equal(alloc1.task_to_monthly_pool_reconciliation, "TBD_SOURCE_UNDEFINED");
  assert.deepEqual([...alloc1.participating_employee_ids].sort(), [empA, empB, empC].sort());
  assert.deepEqual(alloc1.excluded_employee_ids, [empRemoved]);
  assert.equal(alloc1.ledger_entries.length, 3);
  assert.ok(alloc1.ledger_entries.every((l) => l.amount === "400.00" && l.status === "PENDING"));

  // Task incentive amount = ₹1,000.00 across 3 active employees = ₹333.33 each, remainder = ₹0.01 (surfaced, unassigned)
  const alloc2 = await service.calculateTaskIncentive(
    { task_id: taskId, task_incentive_amount: "1000.00" },
    actorId
  );

  assert.equal(alloc2.total_task_incentive, "1000.00");
  assert.equal(alloc2.per_employee_share, "333.33");
  assert.equal(alloc2.unresolved_remainder, "0.01");
  assert.equal(alloc2.rounding_policy, "EXACT_REMAINDER_HELD");
  assert.equal(alloc2.task_to_monthly_pool_reconciliation, "TBD_SOURCE_UNDEFINED");
  assert.equal(alloc2.ledger_entries.length, 3);
  assert.ok(alloc2.ledger_entries.every((l) => l.amount === "333.33"));
});

test("Rule 4: Manual penalty entry by authorized person with server validation", async () => {
  const db = createMockIncentiveDatabase();
  const service = new IncentiveService({ database: db });
  const managerId = crypto.randomUUID();
  const empId = crypto.randomUUID();

  db.employees.push({ id: empId, user_id: null, is_active: true });

  const penalty = await service.recordManualPenalty(
    {
      employee_id: empId,
      amount: "1500.00",
      reason: "Manual penalty for carton mishandling",
      effective_month: "2026-09"
    },
    managerId
  );

  assert.equal(penalty.amount, "1500.00");
  assert.equal(penalty.employee_id, empId);
  assert.equal(penalty.recorded_by_user_id, managerId);
  assert.equal(penalty.status, "ACTIVE");

  // Rejects invalid employee
  await assert.rejects(
    async () => {
      await service.recordManualPenalty(
        {
          employee_id: crypto.randomUUID(),
          amount: "500.00",
          reason: "Unknown emp",
          effective_month: "2026-09"
        },
        managerId
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof IncentiveDomainError);
      assert.equal(err.code, "EMPLOYEE_NOT_FOUND");
      return true;
    }
  );
});

test("Rule 7: Super Admin approval transitions ledger from PENDING to APPROVED and blocks mutation", async () => {
  const db = createMockIncentiveDatabase();
  const service = new IncentiveService({ database: db });
  const superAdminId = crypto.randomUUID();
  const empId = crypto.randomUUID();
  const taskId = crypto.randomUUID();

  db.employees.push({ id: empId, user_id: null, is_active: true });
  db.tasks.push({
    id: taskId,
    status: "COMPLETED",
    planned_box_quantity: "50",
    completed_box_quantity: "50",
    started_at: new Date(),
    completed_at: new Date(),
    version: "1"
  });
  db.taskAssignments.push({
    id: "a-1",
    task_id: taskId,
    employee_id: empId,
    assigned_at: new Date(),
    unassigned_at: null,
    version: "1"
  });

  const alloc = await service.calculateTaskIncentive(
    { task_id: taskId, task_incentive_amount: "500.00" },
    superAdminId
  );
  assert.equal(alloc.ledger_entries[0]?.status, "PENDING");

  // Approve
  const approved = await service.approveIncentiveLedger(
    { task_id: taskId, notes: "Approved by Super Admin" },
    superAdminId
  );
  assert.equal(approved[0]?.status, "APPROVED");

  // Attempting to recalculate approved task incentive is rejected
  await assert.rejects(
    async () => {
      await service.calculateTaskIncentive(
        { task_id: taskId, task_incentive_amount: "600.00" },
        superAdminId
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof IncentiveDomainError);
      assert.equal(err.code, "ALREADY_APPROVED");
      return true;
    }
  );
});

test("Rule 8: Quality gate failure blocks incentive calculation until passing reinspection", async () => {
  const db = createMockIncentiveDatabase();
  const service = new IncentiveService({ database: db });
  const actorId = crypto.randomUUID();
  const empId = crypto.randomUUID();
  const taskId = crypto.randomUUID();

  db.employees.push({ id: empId, user_id: null, is_active: true });
  db.tasks.push({
    id: taskId,
    status: "COMPLETED",
    planned_box_quantity: "50",
    completed_box_quantity: "50",
    started_at: new Date(),
    completed_at: new Date(),
    version: "1"
  });
  db.taskAssignments.push({
    id: "a-1",
    task_id: taskId,
    employee_id: empId,
    assigned_at: new Date(),
    unassigned_at: null,
    version: "1"
  });

  // Failed quality inspection
  const failedQualityId = crypto.randomUUID();
  db.qualityRecords.push({
    id: failedQualityId,
    task_id: taskId,
    outcome: "FAIL",
    quality_score: "80",
    damage_rate: "6.0",
    final_inventory_status: "DAMAGED",
    superseded_by_record_id: null,
    inspected_at: new Date(),
    created_at: new Date(),
    version: "1"
  });

  // Calculation blocked
  await assert.rejects(
    async () => {
      await service.calculateTaskIncentive(
        { task_id: taskId, task_incentive_amount: "500.00" },
        actorId
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof IncentiveDomainError);
      assert.equal(err.code, "QUALITY_GATE_FAILED");
      return true;
    }
  );

  // Superseded by passing reinspection
  const passingQualityId = crypto.randomUUID();
  db.qualityRecords[0]!.superseded_by_record_id = passingQualityId;
  db.qualityRecords.push({
    id: passingQualityId,
    task_id: taskId,
    outcome: "PASS",
    quality_score: "99",
    damage_rate: "1.0",
    final_inventory_status: "AVAILABLE",
    superseded_by_record_id: null,
    inspected_at: new Date(Date.now() + 1000),
    created_at: new Date(Date.now() + 1000),
    version: "1"
  });

  // Now calculation succeeds
  const alloc = await service.calculateTaskIncentive(
    { task_id: taskId, task_incentive_amount: "500.00" },
    actorId
  );
  assert.equal(alloc.per_employee_share, "500.00");
});

test("FND-18A Audit: KOT is not derived from operational metrics and remains constant for entire month", async () => {
  const db = createMockIncentiveDatabase();
  const service = new IncentiveService({ database: db });
  const superAdminId = crypto.randomUUID();

  // Monthly KOT is recorded once manually
  await service.recordMonthlyKot(
    { effective_month: "2026-10", kot_value: "500000.00" },
    superAdminId
  );

  // Subsequent calculations for that month use the exact recorded value regardless of task/box counts
  const calc1 = await service.calculateMonthlyIncentive({ effective_month: "2026-10" });
  assert.equal(calc1.kot_value, "500000.00");
  assert.equal(calc1.monthly_incentive_pool, "30000.00"); // 500,000 * 6%
  assert.equal(calc1.task_reconciliation_status, "TBD_SOURCE_UNDEFINED");
});

test("FND-18A Audit: Remainder is surfaced without recipient and no currency rounding distortion occurs", async () => {
  const db = createMockIncentiveDatabase();
  const service = new IncentiveService({ database: db });
  const actorId = crypto.randomUUID();

  const emp1 = crypto.randomUUID();
  const emp2 = crypto.randomUUID();
  const emp3 = crypto.randomUUID();
  db.employees.push(
    { id: emp1, user_id: null, is_active: true },
    { id: emp2, user_id: null, is_active: true },
    { id: emp3, user_id: null, is_active: true }
  );

  const taskId = crypto.randomUUID();
  db.tasks.push({
    id: taskId,
    status: "COMPLETED",
    planned_box_quantity: "100",
    completed_box_quantity: "100",
    started_at: new Date(),
    completed_at: new Date(),
    version: "1"
  });

  db.taskAssignments.push(
    { id: "a-1", task_id: taskId, employee_id: emp1, assigned_at: new Date(), unassigned_at: null, version: "1" },
    { id: "a-2", task_id: taskId, employee_id: emp2, assigned_at: new Date(), unassigned_at: null, version: "1" },
    { id: "a-3", task_id: taskId, employee_id: emp3, assigned_at: new Date(), unassigned_at: null, version: "1" }
  );

  // ₹100.00 / 3 = ₹33.33 each, ₹0.01 unassigned remainder
  const alloc = await service.calculateTaskIncentive(
    { task_id: taskId, task_incentive_amount: "100.00" },
    actorId
  );

  assert.equal(alloc.per_employee_share, "33.33");
  assert.equal(alloc.unresolved_remainder, "0.01");
  assert.equal(alloc.rounding_policy, "EXACT_REMAINDER_HELD");
  assert.equal(alloc.task_to_monthly_pool_reconciliation, "TBD_SOURCE_UNDEFINED");

  // Verify none of the employees received the extra 0.01
  for (const entry of alloc.ledger_entries) {
    assert.equal(entry.amount, "33.33");
  }
});

