import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before } from "node:test";
import bcrypt from "bcryptjs";
import type { DatabaseConnection } from "@royal-packaging/db";
import { createApiApp } from "../apps/api/src/app.js";
import { KpiService } from "../apps/api/src/modules/kpi/kpi-service.js";
import { addDays, periodStartFor } from "../packages/contracts/src/kpi-reports/results.js";
import {
  ensureTestDatabase,
  getScopedTestDatabaseUrl,
  getTestDatabase,
  migrateTestDatabase,
  truncateAllTables,
  cleanupTestDatabase
} from "./helpers/postgres-test-helper.js";

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);
const PASSWORD = "Password123!";

let db: DatabaseConnection;
let serverUrl: string;
let stopServer: () => Promise<void>;

interface Actor { userId: string; employeeId: string | null; cookie: string }
const actors = {} as Record<"empA" | "empB" | "idle" | "supervisor" | "admin" | "superAdmin" | "noRole", Actor>;
const defs = {} as Record<"boxes" | "loading" | "unloading" | "tasks" | "time" | "avg" | "sla" | "inactive" | "unsupported", string>;
const ids = {} as Record<"dep1" | "dep2" | "t1" | "t2", string>;

// Fixture dates are relative to today so period status (PENDING vs AVAILABLE) is stable.
const D = addDays(new Date().toISOString().slice(0, 10), -20);
const EARLY = addDays(D, -9);
const at = (day: string, time: string) => new Date(`${day}T${time}:00Z`);

interface Result {
  id: string;
  employee: { id: string; name: string | null };
  kpi: { id: string; code: string };
  metric: string;
  operation: string;
  period: { kind: string; start: string; end: string; timezone: string };
  actual: { value: number; unit: string } | null;
  target: { value: number; unit: string; target_id: string } | null;
  unit: string;
  direction: string;
  status: string;
  not_available_reason: string | null;
  source_count: number;
  calculated_at: string;
  calculation_version: string;
  source_references?: Array<{ task_id: string; task_code: string; source_type: string; operation_type: string; employee_id: string; raw_metric_value: number | null; quantity: { value: number }; duration_seconds: number | null; warehouse: string | null; participants: number }>;
}
interface ListBody { success: boolean; data: Result[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }
interface ErrorBody { success: false; code: string; errors?: Array<{ field?: string }> }

async function createActor(login: string, role: string | null, employee: { name: string; depotId?: string } | null): Promise<Actor> {
  const userId = crypto.randomUUID();
  await db.insertInto("users").values({ id: userId, login_identifier: login, password_hash: await bcrypt.hash(PASSWORD, 4), is_active: true }).execute();
  if (role) {
    const existing = await db.selectFrom("access_roles").select("id").where("code", "=", role).executeTakeFirst();
    const roleId = existing?.id ?? crypto.randomUUID();
    if (!existing) await db.insertInto("access_roles").values({ id: roleId, code: role, name: role, active: true }).execute();
    await db.insertInto("user_access_roles").values({ id: crypto.randomUUID(), user_id: userId, role_id: roleId, assigned_at: new Date(), assigned_by_user_id: userId, revoked_at: null, revoked_by_user_id: null, version: "1" }).execute();
  }
  let employeeId: string | null = null;
  if (employee) {
    employeeId = crypto.randomUUID();
    await db.insertInto("employees").values({ id: employeeId, user_id: userId, employee_code: `EMP-${login}`, name: employee.name, depot_id: employee.depotId ?? null, is_active: true }).execute();
  }
  const res = await fetch(`${serverUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login_identifier: login, password: PASSWORD }) });
  assert.equal(res.status, 200, `login ${login}`);
  return { userId, employeeId, cookie: res.headers.get("set-cookie") as string };
}

async function task(opts: {
  type: string; depot: string; boxes: number; completedAt: Date | null; status?: string;
  assignees: Array<{ employeeId: string; assignedAt: Date; unassignedAt?: Date }>;
  events?: Array<[string, Date]>;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.insertInto("tasks").values({
    id, depot_id: opts.depot, task_type: opts.type, status: opts.status ?? "COMPLETED", client_id: null, order_id: null, order_item_id: null,
    inventory_item_id: null, inventory_batch_id: null, source_location_id: null, destination_location_id: null, shift_id: null,
    planned_box_quantity: String(opts.boxes), completed_box_quantity: opts.status && opts.status !== "COMPLETED" ? null : String(opts.boxes),
    started_at: opts.events?.[0]?.[1] ?? null, paused_at: null, completed_at: opts.completedAt
  }).execute();
  for (const assignee of opts.assignees) {
    await db.insertInto("task_assignments").values({ id: crypto.randomUUID(), task_id: id, employee_id: assignee.employeeId, assigned_at: assignee.assignedAt, assigned_by_user_id: actors.supervisor.userId, unassigned_at: assignee.unassignedAt ?? null, unassigned_by_user_id: assignee.unassignedAt ? actors.supervisor.userId : null }).execute();
  }
  for (const [eventType, eventAt] of opts.events ?? []) {
    await db.insertInto("task_events").values({ id: crypto.randomUUID(), task_id: id, event_type: eventType, event_at: eventAt, actor_user_id: actors.supervisor.userId, correlation_id: null, metadata: null }).execute();
  }
  return id;
}

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);
  await truncateAllTables(db);

  const app = createApiApp({ database: db }); // real policy; default UTC periods
  const server = app.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  stopServer = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  ids.dep1 = crypto.randomUUID();
  ids.dep2 = crypto.randomUUID();
  await db.insertInto("depots").values([{ id: ids.dep1, code: "DEP-01", name: "Main Depot", active: true }, { id: ids.dep2, code: "DEP-02", name: "Annex Depot", active: true }]).execute();

  actors.empA = await createActor("kr_a", "EMPLOYEE", { name: "Asha Rao", depotId: ids.dep1 });
  actors.empB = await createActor("kr_b", "EMPLOYEE", { name: "Ravi Kumar" });
  actors.idle = await createActor("kr_idle", "EMPLOYEE", { name: "Idle Ida" });
  actors.supervisor = await createActor("kr_sup", "SUPERVISOR", { name: "Sam Supervisor", depotId: ids.dep1 });
  actors.admin = await createActor("kr_admin", "ADMIN", null);
  actors.superAdmin = await createActor("kr_root", "SUPER_ADMIN", null);
  actors.noRole = await createActor("kr_norole", null, { name: "No Role" });

  const definition = async (code: string, active = true) => {
    const id = crypto.randomUUID();
    await db.insertInto("kpi_definitions").values({ id, code, name: code.replaceAll("_", " ").toLowerCase(), pillar: null, description: null, unit: null, formula_reference: null, active, effective_from: at(addDays(D, -60), "00:00"), effective_to: null }).execute();
    return id;
  };
  defs.boxes = await definition("BOXES_HANDLED");
  defs.loading = await definition("LOADING_BOXES");
  defs.unloading = await definition("UNLOADING_BOXES");
  defs.tasks = await definition("TASKS_COMPLETED");
  defs.time = await definition("TASK_TIME");
  defs.avg = await definition("AVERAGE_BOXES_PER_TASK");
  defs.sla = await definition("LOADING_SLA_COMPLIANCE");
  defs.inactive = await definition("UNLOADING_TIME", false);
  defs.unsupported = await definition("CUSTOM_SCORE");
  await db.insertInto("kpi_targets").values([
    { id: crypto.randomUUID(), kpi_definition_id: defs.boxes, target_value: "100", warning_threshold: null, critical_threshold: null, effective_from: at(addDays(D, -60), "00:00"), effective_to: null, depot_id: null },
    { id: crypto.randomUUID(), kpi_definition_id: defs.boxes, target_value: "150", warning_threshold: null, critical_threshold: null, effective_from: at(addDays(D, -60), "00:00"), effective_to: null, depot_id: ids.dep1 }
  ]).execute();

  const A = actors.empA.employeeId as string;
  const B = actors.empB.employeeId as string;
  const early = at(D, "06:00");
  // T1 LOADING, A only, 120 BOX, 08:00-09:00 active, 09:00-09:30 paused, 09:30-10:30 active => 120 min.
  ids.t1 = await task({ type: "LOADING", depot: ids.dep1, boxes: 120, completedAt: at(D, "10:30"), assignees: [{ employeeId: A, assignedAt: early }], events: [["TASK_STARTED", at(D, "08:00")], ["TASK_PAUSED", at(D, "09:00")], ["TASK_RESUMED", at(D, "09:30")], ["TASK_COMPLETED", at(D, "10:30")]] });
  // T2 UNLOADING (RECEIVING), A and B assigned at completion: 45 BOX shared 22.5 each, 30 min.
  ids.t2 = await task({ type: "RECEIVING", depot: ids.dep1, boxes: 45, completedAt: at(D, "11:30"), assignees: [{ employeeId: A, assignedAt: early }, { employeeId: B, assignedAt: early }], events: [["TASK_STARTED", at(D, "11:00")], ["TASK_COMPLETED", at(D, "11:30")]] });
  // T3 PICKING, B, DEP-02, 10 BOX, 10 min.
  await task({ type: "PICKING", depot: ids.dep2, boxes: 10, completedAt: at(D, "12:10"), assignees: [{ employeeId: B, assignedAt: early }], events: [["TASK_STARTED", at(D, "12:00")], ["TASK_COMPLETED", at(D, "12:10")]] });
  // T4 LOADING, A unassigned before completion, B at completion: 7 BOX to B only, 20 min.
  await task({ type: "LOAD", depot: ids.dep1, boxes: 7, completedAt: at(D, "13:20"), assignees: [{ employeeId: A, assignedAt: early, unassignedAt: at(D, "12:59") }, { employeeId: B, assignedAt: at(D, "12:59") }], events: [["TASK_STARTED", at(D, "13:00")], ["TASK_COMPLETED", at(D, "13:20")]] });
  // T5 LOADING, A, 30 BOX, 19:00-20:00 UTC (= next day in Asia/Kolkata), 60 min.
  await task({ type: "LOADING", depot: ids.dep1, boxes: 30, completedAt: at(D, "20:00"), assignees: [{ employeeId: A, assignedAt: early }], events: [["TASK_STARTED", at(D, "19:00")], ["TASK_COMPLETED", at(D, "20:00")]] });
  // T6 in progress: ignored.
  await task({ type: "LOADING", depot: ids.dep1, boxes: 999, completedAt: null, status: "IN_PROGRESS", assignees: [{ employeeId: A, assignedAt: early }], events: [["TASK_STARTED", at(D, "14:00")]] });
  // T7 completed without timing events, A, 50 BOX, nine days earlier.
  await task({ type: "PICKING", depot: ids.dep1, boxes: 50, completedAt: at(EARLY, "09:00"), assignees: [{ employeeId: A, assignedAt: at(EARLY, "08:00") }] });
});

after(async () => {
  if (stopServer) await stopServer();
  if (db) await cleanupTestDatabase(db);
});

async function get(actor: keyof typeof actors | null, path: string): Promise<Response> {
  return fetch(`${serverUrl}${path}`, { headers: actor ? { Cookie: actors[actor].cookie } : {} });
}
async function list(actor: keyof typeof actors, query: string): Promise<ListBody> {
  const res = await get(actor, `/kpi/results${query}`);
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as ListBody;
}
const pick = (results: Result[], employee: string | null, kpi: string) => results.find((result) => result.employee.id === employee && result.kpi.id === kpi);
const day = `?period=DAILY&from=${D}&to=${D}&pageSize=100`;

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

test("KR-I1: daily results for the shared, reassigned, and timed tasks are exact", async () => {
  const { data, meta } = await list("admin", day);
  const A = actors.empA.employeeId;
  const B = actors.empB.employeeId;
  assert.equal(meta.total, 14); // 7 calculable definitions x 2 employees; inactive + unsupported excluded
  const values = (employee: string | null) => Object.fromEntries(data.filter((result) => result.employee.id === employee).map((result) => [result.kpi.code, result.actual?.value ?? null]));
  assert.deepEqual(values(A), { BOXES_HANDLED: 172.5, LOADING_BOXES: 150, UNLOADING_BOXES: 22.5, TASKS_COMPLETED: 3, TASK_TIME: 210, AVERAGE_BOXES_PER_TASK: 57.5, LOADING_SLA_COMPLIANCE: null });
  assert.deepEqual(values(B), { BOXES_HANDLED: 39.5, LOADING_BOXES: 7, UNLOADING_BOXES: 22.5, TASKS_COMPLETED: 3, TASK_TIME: 60, AVERAGE_BOXES_PER_TASK: 13.17, LOADING_SLA_COMPLIANCE: null });
  // Shared boxes add up to the warehouse total (120 + 45 + 10 + 7 + 30 = 212).
  assert.equal((pick(data, A, defs.boxes)?.actual?.value ?? 0) + (pick(data, B, defs.boxes)?.actual?.value ?? 0), 212);
});

test("KR-I2: result fields: units, direction, target by warehouse, status, period, provenance", async () => {
  const { data } = await list("admin", day);
  const boxesA = pick(data, actors.empA.employeeId, defs.boxes)!;
  assert.deepEqual({ metric: boxesA.metric, operation: boxesA.operation, unit: boxesA.unit, direction: boxesA.direction, status: boxesA.status }, { metric: "BOXES_HANDLED", operation: "WAREHOUSE", unit: "BOX", direction: "HIGHER_IS_BETTER", status: "AVAILABLE" });
  assert.equal(boxesA.target?.value, 150); // employee A's warehouse DEP-01 target
  assert.equal(pick(data, actors.empB.employeeId, defs.boxes)?.target?.value, 100); // no warehouse -> all-warehouse target
  assert.equal(pick(data, actors.empA.employeeId, defs.tasks)?.target, null); // no target configured
  assert.deepEqual(boxesA.period, { kind: "DAILY", start: D, end: D, label: D, timezone: "UTC" });
  assert.equal(boxesA.source_count, 3);
  assert.equal(boxesA.calculation_version, "task-kpi-v1");
  const time = pick(data, actors.empA.employeeId, defs.time)!;
  assert.deepEqual({ unit: time.unit, direction: time.direction, metric: time.metric }, { unit: "DURATION", direction: "LOWER_IS_BETTER", metric: "TIME_TAKEN" });
  const sla = pick(data, actors.empA.employeeId, defs.sla)!;
  assert.deepEqual({ status: sla.status, actual: sla.actual }, { status: "NOT_AVAILABLE", actual: null });
  assert.match(sla.not_available_reason ?? "", /No SLA targets/);
});

test("KR-I3: missing timing is NOT_AVAILABLE, never zero; averages never divide by zero", async () => {
  const { data } = await list("admin", `?period=DAILY&from=${EARLY}&to=${EARLY}`);
  const A = actors.empA.employeeId;
  assert.equal(pick(data, A, defs.boxes)?.actual?.value, 50);
  assert.equal(pick(data, A, defs.time)?.status, "NOT_AVAILABLE");
  assert.equal(pick(data, A, defs.time)?.actual, null);
  assert.equal(pick(data, A, defs.avg)?.actual?.value, 50);
  // No loading/unloading tasks that day => no loading/unloading results at all (not zero rows).
  assert.equal(pick(data, A, defs.loading), undefined);
  assert.equal(pick(data, A, defs.sla), undefined);
});

test("KR-I4: weekly and monthly buckets", async () => {
  const weekly = await list("admin", `?period=WEEKLY&from=${D}&to=${D}&kpiId=${defs.boxes}`);
  const weekStart = periodStartFor("WEEKLY", D);
  assert.ok(weekly.data.every((result) => result.period.start === weekStart && result.period.end === addDays(weekStart, 6)));
  const earlyInSameWeek = periodStartFor("WEEKLY", EARLY) === weekStart;
  assert.equal(pick(weekly.data, actors.empA.employeeId, defs.boxes)?.actual?.value, earlyInSameWeek ? 222.5 : 172.5);

  const monthly = await list("admin", `?period=MONTHLY&from=${EARLY}&to=${D}&kpiId=${defs.boxes}&employeeId=${actors.empA.employeeId}`);
  assert.equal(monthly.data.reduce((sum, result) => sum + (result.actual?.value ?? 0), 0), 222.5);
  assert.ok(monthly.data.every((result) => result.period.start.endsWith("-01")));
});

test("KR-I5: the configured operations timezone moves a late task to the next local day", async () => {
  const kolkata = new KpiService({ database: db, timeZone: "Asia/Kolkata" });
  const A = actors.empA.employeeId as string;
  const onD = await kolkata.listResults({ period: "DAILY", from: D, to: D, kpi_id: defs.boxes }, { employeeId: A });
  const next = await kolkata.listResults({ period: "DAILY", from: addDays(D, 1), to: addDays(D, 1), kpi_id: defs.boxes }, { employeeId: A });
  assert.equal(onD[0]?.actual?.value, 142.5); // T5 is 01:30 IST on the following day
  assert.equal(next[0]?.actual?.value, 30);
  assert.equal(next[0]?.period.timezone, "Asia/Kolkata");
});

test("KR-I6: detail carries the source task references with shared quantities and durations", async () => {
  const { data } = await list("admin", day);
  const boxesA = pick(data, actors.empA.employeeId, defs.boxes)!;
  const res = await get("admin", `/kpi/results/${encodeURIComponent(boxesA.id)}`);
  assert.equal(res.status, 200);
  const detail = ((await res.json()) as { data: Result }).data;
  assert.equal(detail.actual?.value, 172.5);
  const refs = detail.source_references ?? [];
  assert.equal(refs.length, 3);
  const shared = refs.find((ref) => ref.task_id === ids.t2)!;
  assert.deepEqual({ participants: shared.participants, credited: shared.quantity.value, raw: shared.raw_metric_value, type: shared.source_type, op: shared.operation_type, secs: shared.duration_seconds, wh: shared.warehouse }, { participants: 2, credited: 22.5, raw: 22.5, type: "WAREHOUSE_OPERATION", op: "WAREHOUSE", secs: 1800, wh: "DEP-01" });
  assert.ok(refs.every((ref) => ref.employee_id === actors.empA.employeeId && ref.task_code.startsWith("TSK-")));
  assert.equal(refs.find((ref) => ref.task_id === ids.t1)?.duration_seconds, 7200);
});

test("KR-I7: results are deterministic and nothing is persisted", async () => {
  const first = await list("admin", day);
  const second = await list("admin", day);
  // calculated_at (and its camelCase mirror) is the request time; everything else must be identical.
  const strip = (body: ListBody) => body.data.map((result) => Object.fromEntries(Object.entries(result).filter(([key]) => key !== "calculated_at" && key !== "calculatedAt")));
  assert.deepEqual(strip(first), strip(second));
  assert.equal((await db.selectFrom("kpi_snapshots").select("id").execute()).length, 0);
});

// ---------------------------------------------------------------------------
// Filters and validation
// ---------------------------------------------------------------------------

test("KR-I8: filters: KPI, metric, operation, status, warehouse, search, pagination, camelCase aliases", async () => {
  assert.equal((await list("admin", `${day}&kpi_id=${defs.tasks}`)).meta.total, 2);
  assert.equal((await list("admin", `?period=DAILY&periodStart=${D}&periodEnd=${D}&kpiId=${defs.tasks}`)).meta.total, 2);
  assert.equal((await list("admin", `${day}&metric=BOXES_HANDLED`)).meta.total, 6);
  assert.equal((await list("admin", `${day}&operation=LOADING`)).meta.total, 4);
  assert.equal((await list("admin", `${day}&status=NOT_AVAILABLE`)).meta.total, 2);
  const dep2 = await list("admin", `${day}&warehouse_code=dep-02`);
  assert.deepEqual(new Set(dep2.data.map((result) => result.kpi.code)), new Set(["BOXES_HANDLED", "TASKS_COMPLETED", "TASK_TIME", "AVERAGE_BOXES_PER_TASK"]));
  assert.ok(dep2.data.every((result) => result.employee.id === actors.empB.employeeId));
  assert.equal(pick(dep2.data, actors.empB.employeeId, defs.boxes)?.actual?.value, 10);
  assert.equal((await list("admin", `${day}&search=ravi`)).meta.total, 7);
  const page = await list("admin", `?period=DAILY&from=${D}&to=${D}&page=2&pageSize=5`);
  assert.equal(page.data.length, 5);
  assert.equal(page.meta.totalPages, 3);
});

test("KR-I9: empty results are an empty list, not an error", async () => {
  const empty = await list("admin", `?period=DAILY&from=${addDays(D, -45)}&to=${addDays(D, -40)}`);
  assert.deepEqual(empty.data, []);
  assert.equal(empty.meta.total, 0);
});

test("KR-I10: invalid KPI references and invalid filters are rejected", async () => {
  const expect400 = async (query: string, code: string) => {
    const res = await get("admin", `/kpi/results${query}`);
    assert.equal(res.status, 400, query);
    assert.equal(((await res.json()) as ErrorBody).code, code, query);
  };
  await expect400(`?kpi_id=${crypto.randomUUID()}`, "INVALID_KPI");
  await expect400(`?kpi_id=${defs.unsupported}`, "KPI_NOT_CALCULABLE");
  await expect400(`?kpi_id=${defs.inactive}`, "KPI_NOT_ACTIVE");
  await expect400("?warehouse_code=NOPE", "INVALID_WAREHOUSE");
  await expect400(`?employee_id=${crypto.randomUUID()}`, "INVALID_EMPLOYEE");
  await expect400("?period=HOURLY", "VALIDATION_FAILED");
  await expect400("?period=CUSTOM", "VALIDATION_FAILED");
  await expect400(`?from=${D}&to=${addDays(D, -1)}`, "VALIDATION_FAILED");
  await expect400(`?period=DAILY&from=${addDays(D, -200)}&to=${D}`, "VALIDATION_FAILED");
  await expect400("?from=2026-02-30", "VALIDATION_FAILED");
  await expect400("?pageSize=0", "VALIDATION_FAILED");
  assert.equal((await get("admin", "/kpi/results/not-a-result-id")).status, 400);
  const notMonday = `${defs.boxes}_${actors.empA.employeeId}_WEEKLY_${addDays(periodStartFor("WEEKLY", D), 1)}`;
  assert.equal((await get("admin", `/kpi/results/${notMonday}`)).status, 400);
  // Well-formed id with no activity -> 404.
  assert.equal((await get("admin", `/kpi/results/${defs.boxes}_${actors.idle.employeeId}_DAILY_${D}`)).status, 404);
  assert.equal((await get("admin", `/kpi/results/${defs.unsupported}_${actors.empA.employeeId}_DAILY_${D}`)).status, 404);
});

// ---------------------------------------------------------------------------
// Authentication, RBAC, scope
// ---------------------------------------------------------------------------

test("KR-I11: organisation-wide roles, including supervisors (no fixed depot), see every employee's results", async () => {
  for (const actor of ["admin", "superAdmin", "supervisor"] as const) {
    assert.equal((await list(actor, day)).meta.total, 14, actor);
  }
  // Supervisors have organization-wide task scope (V1 decision D5/D6): the same results as Admin.
  const all = await list("admin", day);
  const supervisor = await list("supervisor", day);
  assert.deepEqual(new Set(supervisor.data.map((result) => result.id)), new Set(all.data.map((result) => result.id)));
  assert.equal((await get("supervisor", `/kpi/results${day}&employee_id=${actors.empB.employeeId}`)).status, 200);
  assert.equal((await get("supervisor", `/kpi/results${day}&warehouse_code=DEP-02`)).status, 200);
});

test("KR-I12: an employee sees only their own results and cannot reach anyone else's", async () => {
  const own = await list("empA", day);
  assert.equal(own.meta.total, 7);
  assert.ok(own.data.every((result) => result.employee.id === actors.empA.employeeId));
  assert.equal((await list("empA", `${day}&employee_id=${actors.empA.employeeId}`)).meta.total, 7);
  assert.equal((await get("empA", `/kpi/results${day}&employee_id=${actors.empB.employeeId}`)).status, 403);
  const other = (await list("admin", day)).data.find((result) => result.employee.id === actors.empB.employeeId)!;
  assert.equal((await get("empA", `/kpi/results/${encodeURIComponent(other.id)}`)).status, 403);
  const mine = own.data[0]!;
  assert.equal((await get("empA", `/kpi/results/${encodeURIComponent(mine.id)}`)).status, 200);
  assert.equal((await list("idle", day)).meta.total, 0);
});

test("KR-I13: anonymous, role-less, and forged requests are rejected", async () => {
  assert.equal((await get(null, "/kpi/results")).status, 401);
  assert.equal((await get(null, `/kpi/results/${defs.boxes}_${actors.empA.employeeId}_DAILY_${D}`)).status, 401);
  assert.equal((await get("noRole", "/kpi/results")).status, 403);
  const forged = await fetch(`${serverUrl}/kpi/results${day}`, { headers: { Cookie: actors.empB.cookie, "X-User-Role": "SUPER_ADMIN", "X-Permissions": "kpi:read_all" } });
  assert.equal(((await forged.json()) as ListBody).meta.total, 7); // still only Ravi's own results
});

test("KR-I14: existing KPI routes are unaffected", async () => {
  assert.equal((await get("supervisor", "/kpis")).status, 200);
  // KPI configuration is Super Admin/Admin only (product access matrix).
  assert.equal((await get("supervisor", "/kpi/definitions")).status, 403);
  assert.equal((await get("admin", "/kpi/definitions")).status, 200);
  assert.equal((await get("supervisor", "/kpi/summary")).status, 200);
});
