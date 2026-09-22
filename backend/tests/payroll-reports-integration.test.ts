import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after, beforeEach } from "node:test";
import type { DatabaseConnection } from "@royal-packaging/db";
import { PayrollDomainError, ReportDomainError } from "@royal-packaging/contracts";
import { PayrollService } from "../apps/api/src/modules/payroll/payroll-service.js";
import { ReportService } from "../apps/api/src/modules/reports/report-service.js";
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
let payrollService: PayrollService;
let reportService: ReportService;
let taskService: TaskService;

let actorUserId: string;
let approverUserId: string;
let testEmployeeId: string;
let testDepotId: string;

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);

  payrollService = new PayrollService({ database: db });
  reportService = new ReportService({ database: db });
  taskService = new TaskService({ database: db });
});

after(async () => {
  if (db) {
    await cleanupTestDatabase(db);
  }
});

async function createApprovedIncentive(): Promise<string> {
  const task = await taskService.createTask({ depot_id: testDepotId }, actorUserId);
  const incentiveId = crypto.randomUUID();
  const now = new Date();
  await db
    .insertInto("incentive_ledger")
    .values({
      id: incentiveId,
      task_id: task.id,
      employee_id: testEmployeeId,
      incentive_rule_id: null,
      amount: "100.00",
      status: "APPROVED",
      idempotency_key: null,
      created_at: now,
      updated_at: now,
      version: "1"
    })
    .execute();
  return incentiveId;
}

beforeEach(async () => {
  await truncateAllTables(db);
  const now = new Date();

  actorUserId = crypto.randomUUID();
  await db
    .insertInto("users")
    .values({
      id: actorUserId,
      login_identifier: "payroll-actor@royalpackaging.test",
      password_hash: "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
      is_active: true
    })
    .execute();

  approverUserId = crypto.randomUUID();
  await db
    .insertInto("users")
    .values({
      id: approverUserId,
      login_identifier: "payroll-approver@royalpackaging.test",
      password_hash: "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
      is_active: true
    })
    .execute();

  testDepotId = crypto.randomUUID();
  await db.insertInto("depots").values({ id: testDepotId, code: "DEP-PR", name: "Payroll Depot", active: true }).execute();

  testEmployeeId = crypto.randomUUID();
  await db
    .insertInto("employees")
    .values({
      id: testEmployeeId,
      user_id: actorUserId,
      is_active: true,
      employee_code: "EMP-400",
      name: "Anita Rao",
      department: "Warehouse",
      depot_id: testDepotId,
      created_at: now,
      updated_at: now,
      version: "1"
    })
    .execute();
});

test("PR1: PayrollService.createEntry snapshots the amount from an APPROVED incentive", async () => {
  const incentiveId = await createApprovedIncentive();
  const entry = await payrollService.createEntry({ incentive_ledger_id: incentiveId });
  assert.equal(entry.amount, "100.00");
  assert.equal(entry.status, "PENDING");
  assert.equal(entry.employee_id, testEmployeeId);
  assert.equal(entry.approvals.length, 0);
});

test("PR2: PayrollService.createEntry rejects a non-APPROVED incentive", async () => {
  const task = await taskService.createTask({ depot_id: testDepotId }, actorUserId);
  const incentiveId = crypto.randomUUID();
  const now = new Date();
  await db
    .insertInto("incentive_ledger")
    .values({
      id: incentiveId,
      task_id: task.id,
      employee_id: testEmployeeId,
      incentive_rule_id: null,
      amount: "50.00",
      status: "PENDING",
      idempotency_key: null,
      created_at: now,
      updated_at: now,
      version: "1"
    })
    .execute();

  await assert.rejects(
    () => payrollService.createEntry({ incentive_ledger_id: incentiveId }),
    (err: unknown) => err instanceof PayrollDomainError && err.code === "INCENTIVE_NOT_APPROVED"
  );
});

test("PR3: PayrollService.createEntry rejects an unknown incentive", async () => {
  await assert.rejects(
    () => payrollService.createEntry({ incentive_ledger_id: crypto.randomUUID() }),
    (err: unknown) => err instanceof PayrollDomainError && err.code === "INCENTIVE_NOT_FOUND"
  );
});

test("PR4: PayrollService.createEntry rejects a duplicate entry for the same incentive", async () => {
  const incentiveId = await createApprovedIncentive();
  await payrollService.createEntry({ incentive_ledger_id: incentiveId });

  await assert.rejects(
    () => payrollService.createEntry({ incentive_ledger_id: incentiveId }),
    (err: unknown) => err instanceof PayrollDomainError && err.code === "DUPLICATE_PAYROLL_ENTRY"
  );
});

test("PR5: PayrollService.recordApproval approves a pending entry", async () => {
  const incentiveId = await createApprovedIncentive();
  const entry = await payrollService.createEntry({ incentive_ledger_id: incentiveId });

  const decided = await payrollService.recordApproval(entry.id, approverUserId, { decision: "APPROVE" });
  assert.equal(decided.status, "APPROVED");
  assert.equal(decided.approvals.length, 1);
  assert.equal(decided.approvals[0]?.decision, "APPROVE");
  assert.equal(decided.approvals[0]?.actor_user_id, approverUserId);
});

test("PR6: PayrollService.recordApproval rejects a pending entry", async () => {
  const incentiveId = await createApprovedIncentive();
  const entry = await payrollService.createEntry({ incentive_ledger_id: incentiveId });

  const decided = await payrollService.recordApproval(entry.id, approverUserId, { decision: "REJECT", notes: "bad" });
  assert.equal(decided.status, "REJECTED");
  assert.equal(decided.approvals[0]?.notes, "bad");
});

test("PR7: PayrollService.recordApproval is one-shot and cannot be re-decided", async () => {
  const incentiveId = await createApprovedIncentive();
  const entry = await payrollService.createEntry({ incentive_ledger_id: incentiveId });
  await payrollService.recordApproval(entry.id, approverUserId, { decision: "APPROVE" });

  await assert.rejects(
    () => payrollService.recordApproval(entry.id, approverUserId, { decision: "REJECT" }),
    (err: unknown) => err instanceof PayrollDomainError && err.code === "APPROVAL_ALREADY_DECIDED"
  );
});

test("PR8: PayrollService.listEntries filters by status and employee_id", async () => {
  const incentiveId = await createApprovedIncentive();
  const entry = await payrollService.createEntry({ incentive_ledger_id: incentiveId });
  await payrollService.recordApproval(entry.id, approverUserId, { decision: "APPROVE" });

  const approved = await payrollService.listEntries({ status: "APPROVED" });
  assert.equal(approved.length, 1);

  const byEmployee = await payrollService.listEntries({ employee_id: testEmployeeId });
  assert.equal(byEmployee.length, 1);

  const pending = await payrollService.listEntries({ status: "PENDING" });
  assert.equal(pending.length, 0);
});

test("PR9: PayrollService.getEntryById returns null for an unknown ID", async () => {
  const entry = await payrollService.getEntryById(crypto.randomUUID());
  assert.equal(entry, null);
});

test("RP1: ReportService.listDefinitions and getDefinitionByCode read real rows", async () => {
  const defId = crypto.randomUUID();
  const now = new Date();
  await db
    .insertInto("report_definitions")
    .values({ id: defId, code: "TASK_SUMMARY", name: "Task Summary", description: null, created_at: now, updated_at: now, version: "1" })
    .execute();

  const definitions = await reportService.listDefinitions();
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0]?.code, "TASK_SUMMARY");

  const byCode = await reportService.getDefinitionByCode("TASK_SUMMARY");
  assert.equal(byCode?.id, defId);
});

test("RP2: ReportService.requestExecution creates a PENDING execution and preserves jsonb filters without JSON.parse", async () => {
  const defId = crypto.randomUUID();
  const now = new Date();
  await db
    .insertInto("report_definitions")
    .values({ id: defId, code: "TASK_SUMMARY", name: "Task Summary", description: null, created_at: now, updated_at: now, version: "1" })
    .execute();

  const execution = await reportService.requestExecution("TASK_SUMMARY", actorUserId, {
    export_format: "csv",
    filters: { depotId: testDepotId, active: true }
  });

  assert.equal(execution.status, "PENDING");
  assert.equal(execution.export_format, "csv");
  assert.deepEqual(execution.filters, { depotId: testDepotId, active: true });
  assert.equal(execution.requested_by_user_id, actorUserId);

  const fetched = await reportService.getExecutionById(execution.id);
  assert.deepEqual(fetched?.filters, { depotId: testDepotId, active: true });
});

test("RP3: ReportService.requestExecution rejects an unknown report code", async () => {
  await assert.rejects(
    () => reportService.requestExecution("DOES_NOT_EXIST", actorUserId, { export_format: "csv" }),
    (err: unknown) => err instanceof ReportDomainError && err.code === "REPORT_DEFINITION_NOT_FOUND"
  );
});

test("RP4: ReportService.getExecutionById returns null for an unknown ID", async () => {
  const execution = await reportService.getExecutionById(crypto.randomUUID());
  assert.equal(execution, null);
});
