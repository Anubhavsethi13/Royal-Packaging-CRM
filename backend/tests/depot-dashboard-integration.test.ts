import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before } from "node:test";
import bcrypt from "bcryptjs";
import { sql } from "kysely";
import type { DatabaseConnection } from "@royal-packaging/db";
import { loadConfig } from "../packages/config/src/index.js";
import { createApiApp } from "../apps/api/src/app.js";
import {
  ensureTestDatabase,
  getScopedTestDatabaseUrl,
  getTestDatabase,
  migrateTestDatabase,
  truncateAllTables,
  cleanupTestDatabase
} from "./helpers/postgres-test-helper.js";

/**
 * Depot KPI dashboard on the client's example day (30.09.2026, Asia/Kolkata).
 *
 * Depot A (all times IST):
 *   T1 LOADING   118 BOX, a1 + a2, start 10:00 → complete 11:00          = 60 min
 *   T2 UNLOADING  80 BOX, a1,      12:00 → pause 12:10 → resume 12:30 → 12:50 = 30 min
 *   T3 LOADING    40 BOX, a2,      no timing events                        = untimed
 *   Daily report: loading 11, unloading 10, 10:00–22:30, labour 23/23
 * Depot B: TB LOADING 999 BOX (b1) — must never appear in depot A's figures.
 */

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);
const PASSWORD = "Password123!";
const DAY = "2026-09-30";
const ist = (time: string) => new Date(`${DAY}T${time}:00+05:30`);
type Key = "supA" | "supB" | "a1" | "a2" | "b1" | "admin" | "superAdmin" | "accountant";

let db: DatabaseConnection;
let serverUrl: string;
let stopServer: () => Promise<void>;
const actors = {} as Record<Key, { cookie: string; userId: string; employeeId: string }>;
const ids = {} as Record<"depA" | "depB" | "t1" | "t2" | "t3" | "tb" | "report" | "boxesKpi", string>;

async function createActor(key: Key, role: string, depotId: string | null, name: string): Promise<void> {
  const userId = crypto.randomUUID();
  await db.insertInto("users").values({ id: userId, login_identifier: `dd_${key}`, password_hash: await bcrypt.hash(PASSWORD, 4), is_active: true }).execute();
  const existing = await db.selectFrom("access_roles").select("id").where("code", "=", role).executeTakeFirst();
  const roleId = existing?.id ?? crypto.randomUUID();
  if (!existing) await db.insertInto("access_roles").values({ id: roleId, code: role, name: role, active: true }).execute();
  await db.insertInto("user_access_roles").values({ id: crypto.randomUUID(), user_id: userId, role_id: roleId, assigned_at: new Date(), assigned_by_user_id: userId, revoked_at: null, revoked_by_user_id: null, version: "1" }).execute();
  const employeeId = crypto.randomUUID();
  await db.insertInto("employees").values({ id: employeeId, user_id: userId, employee_code: `EMP-${key}`, name, depot_id: depotId, is_active: true }).execute();
  const res = await fetch(`${serverUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login_identifier: `dd_${key}`, password: PASSWORD }) });
  assert.equal(res.status, 200, key);
  actors[key] = { cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] as string, userId, employeeId };
}

async function task(depotId: string, type: string, boxes: number, assignees: Key[], events: Array<[string, string]>, completedAt: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insertInto("tasks").values({ id, depot_id: depotId, task_type: type, status: "COMPLETED", client_id: null, order_id: null, order_item_id: null, inventory_item_id: null, inventory_batch_id: null, source_location_id: null, destination_location_id: null, shift_id: null, planned_box_quantity: String(boxes), completed_box_quantity: String(boxes), started_at: events[0] ? ist(events[0][1]) : null, paused_at: null, completed_at: ist(completedAt), created_at: ist("09:00") }).execute();
  for (const key of assignees) {
    await db.insertInto("task_assignments").values({ id: crypto.randomUUID(), task_id: id, employee_id: actors[key].employeeId, assigned_at: ist("09:30"), assigned_by_user_id: actors.admin.userId, unassigned_at: null, unassigned_by_user_id: null }).execute();
  }
  for (const [eventType, time] of events) {
    await db.insertInto("task_events").values({ id: crypto.randomUUID(), task_id: id, event_type: eventType, event_at: ist(time), actor_user_id: actors.admin.userId, correlation_id: null, metadata: null }).execute();
  }
  return id;
}

async function dashboard(actor: Key | null, query = `?date=${DAY}`): Promise<{ status: number; body: { code?: string; data: Dashboard }; text: string }> {
  const res = await fetch(`${serverUrl}/kpi/depot-dashboard${query}`, { headers: actor ? { Cookie: actors[actor].cookie } : {} });
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text), text };
}

interface Dashboard {
  overview: { from: string; to: string; timezone: string; depot: { id: string; code: string } | null; supervisors: Array<{ employee_id: string; name: string }> };
  operations: Record<string, number>;
  time: { total_operational_minutes: number | null; average_task_minutes: number | null; timed_tasks: number };
  labour: { required: number | null; present: number | null; attendance_percent: number | null; reports_with_labour: number };
  performance: { sla: { status: string; value: null }; quality: { status: string; value: null } };
  employees: Array<{ employee: { id: string }; boxes: number; tasks_completed: number; active_minutes: number | null; average_task_minutes: number | null; sla: { status: string; value: null }; quality: { status: string; value: null }; source_task_ids: string[] }>;
  sources: { daily_reports: Array<{ id: string; total_operations: number; duration_minutes: number | null }>; completed_tasks: Array<{ id: string; boxes: number; active_minutes: number | null; assignees: Array<{ id: string }> }> };
}

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);
  await truncateAllTables(db);
  const appConfig = loadConfig({ NODE_ENV: "test", DATABASE_URL: TEST_DATABASE_URL, SESSION_SECRET: "s".repeat(48), OPERATIONS_TIMEZONE: "Asia/Kolkata" });
  const server = createApiApp({ database: db, appConfig }).createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  stopServer = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  ids.depA = crypto.randomUUID();
  ids.depB = crypto.randomUUID();
  await db.insertInto("depots").values([{ id: ids.depA, code: "DEP-04", name: "Depot Four", active: true }, { id: ids.depB, code: "DEP-05", name: "Depot Five", active: true }]).execute();
  await db.insertInto("truck_types").values({ id: crypto.randomUUID(), code: "32FT", name: "32ft", active: true }).execute();

  await createActor("supA", "SUPERVISOR", ids.depA, "Sam Supervisor");
  await createActor("supB", "SUPERVISOR", ids.depB, "Sue Supervisor");
  await createActor("a1", "EMPLOYEE", ids.depA, "Asha Rao");
  await createActor("a2", "EMPLOYEE", ids.depA, "Ravi Kumar");
  await createActor("b1", "EMPLOYEE", ids.depB, "Bina Das");
  await createActor("admin", "ADMIN", null, "Ada Admin");
  await createActor("superAdmin", "SUPER_ADMIN", null, "Root");
  await createActor("accountant", "ACCOUNTANT", null, "Acc Ountant");

  ids.boxesKpi = crypto.randomUUID();
  await db.insertInto("kpi_definitions").values({ id: ids.boxesKpi, code: "BOXES_HANDLED", name: "Boxes handled", pillar: null, description: null, unit: null, formula_reference: null, active: true, effective_from: null, effective_to: null }).execute();

  ids.t1 = await task(ids.depA, "LOADING", 118, ["a1", "a2"], [["TASK_STARTED", "10:00"], ["TASK_COMPLETED", "11:00"]], "11:00");
  ids.t2 = await task(ids.depA, "UNLOADING", 80, ["a1"], [["TASK_STARTED", "12:00"], ["TASK_PAUSED", "12:10"], ["TASK_RESUMED", "12:30"], ["TASK_COMPLETED", "12:50"]], "12:50");
  ids.t3 = await task(ids.depA, "LOADING", 40, ["a2"], [], "14:00");
  ids.tb = await task(ids.depB, "LOADING", 999, ["b1"], [["TASK_STARTED", "10:00"], ["TASK_COMPLETED", "10:30"]], "10:30");

  const report = await fetch(`${serverUrl}/daily-reports`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: actors.supA.cookie }, body: JSON.stringify({ depot_id: ids.depA, report_date: DAY, loading_count: 11, unloading_count: 10, start_time: "10:00", end_time: "22:30", labour_required: 23, labour_present: 23, vehicles: [{ truck_type_code: "32FT", count: 5 }] }) });
  assert.equal(report.status, 201);
  ids.report = ((await report.json()) as { data: { id: string } }).data.id;
});

after(async () => {
  if (stopServer) await stopServer();
  if (db) await cleanupTestDatabase(db);
});

test("DD-1: overview, operations, time, labour (client example day)", async () => {
  const { status, body } = await dashboard("supA", `?date=${DAY}&depot_id=${ids.depA}`);
  assert.equal(status, 200, JSON.stringify(body));
  const data = body.data;
  assert.deepEqual({ from: data.overview.from, to: data.overview.to, tz: data.overview.timezone, depot: data.overview.depot?.code }, { from: DAY, to: DAY, tz: "Asia/Kolkata", depot: "DEP-04" });
  assert.deepEqual(data.overview.supervisors.map((supervisor) => supervisor.name), ["Sam Supervisor"]);
  const { loading_tasks, unloading_tasks, other_tasks, total_tasks, completed_tasks, completed_loading_tasks, completed_unloading_tasks, boxes, loading_boxes, unloading_boxes } = data.operations;
  assert.deepEqual(
    { loading_tasks, unloading_tasks, other_tasks, total_tasks, completed_tasks, completed_loading_tasks, completed_unloading_tasks, boxes, loading_boxes, unloading_boxes },
    { loading_tasks: 2, unloading_tasks: 1, other_tasks: 0, total_tasks: 3, completed_tasks: 3, completed_loading_tasks: 2, completed_unloading_tasks: 1, boxes: 238, loading_boxes: 158, unloading_boxes: 80 }
  );
  assert.deepEqual({ total: data.time.total_operational_minutes, average: data.time.average_task_minutes, timed: data.time.timed_tasks }, { total: 90, average: 45, timed: 2 });
  assert.deepEqual({ required: data.labour.required, present: data.labour.present, attendance: data.labour.attendance_percent, reports: data.labour.reports_with_labour }, { required: 23, present: 23, attendance: 100, reports: 1 });
});

test("DD-2: SLA and Quality are reported as not configured, never as numbers", async () => {
  const data = (await dashboard("supA", `?date=${DAY}&depot_id=${ids.depA}`)).body.data;
  assert.equal(data.performance.sla.status, "NOT_CONFIGURED");
  assert.equal(data.performance.sla.value, null);
  assert.equal(data.performance.quality.status, "NOT_CONFIGURED");
  assert.equal(data.performance.quality.value, null);
  assert.ok(data.employees.every((row) => row.sla.status === "NOT_CONFIGURED" && row.sla.value === null && row.quality.value === null));
});

test("DD-3: employee KPI table — BOX shared equally, tasks, time, average", async () => {
  const rows = new Map((await dashboard("supA", `?date=${DAY}&depot_id=${ids.depA}`)).body.data.employees.map((row) => [row.employee.id, row]));
  assert.equal(rows.size, 2);
  const a1 = rows.get(actors.a1.employeeId)!;
  const a2 = rows.get(actors.a2.employeeId)!;
  assert.deepEqual({ boxes: a1.boxes, tasks: a1.tasks_completed, minutes: a1.active_minutes, avg: a1.average_task_minutes }, { boxes: 139, tasks: 2, minutes: 90, avg: 45 }); // 59 + 80
  assert.deepEqual({ boxes: a2.boxes, tasks: a2.tasks_completed, minutes: a2.active_minutes, avg: a2.average_task_minutes }, { boxes: 99, tasks: 2, minutes: 60, avg: 60 }); // 59 + 40, T3 untimed
  assert.deepEqual(new Set(a1.source_task_ids), new Set([ids.t1, ids.t2]));
  assert.deepEqual(new Set(a2.source_task_ids), new Set([ids.t1, ids.t3]));
});

test("DD-4: traceability — report → registered tasks → BOX → employee KPI, all from the same records", async () => {
  const data = (await dashboard("supA", `?date=${DAY}&depot_id=${ids.depA}`)).body.data;
  assert.deepEqual(data.sources.daily_reports.map((report) => [report.id, report.total_operations, report.duration_minutes]), [[ids.report, 21, 750]]);
  assert.deepEqual(new Set(data.sources.completed_tasks.map((source) => source.id)), new Set([ids.t1, ids.t2, ids.t3]));
  const fromSources = data.sources.completed_tasks.reduce((sum, source) => sum + source.boxes, 0);
  const fromEmployees = data.employees.reduce((sum, row) => sum + row.boxes, 0);
  assert.equal(fromSources, data.operations.boxes);
  assert.equal(fromEmployees, data.operations.boxes); // equal sharing adds up to the depot total
  const t1 = data.sources.completed_tasks.find((source) => source.id === ids.t1)!;
  assert.deepEqual({ minutes: t1.active_minutes, assignees: new Set(t1.assignees.map((assignee) => assignee.id)) }, { minutes: 60, assignees: new Set([actors.a1.employeeId, actors.a2.employeeId]) });

  // The dashboard agrees with the KPI results engine (one source of truth).
  const res = await fetch(`${serverUrl}/kpi/results?period=DAILY&from=${DAY}&to=${DAY}&kpi_id=${ids.boxesKpi}&employee_id=${actors.a1.employeeId}`, { headers: { Cookie: actors.supA.cookie } });
  const results = ((await res.json()) as { data: Array<{ actual: { value: number } }> }).data;
  assert.equal(results[0]?.actual.value, 139);
});

test("DD-5: depot scope and roles", async () => {
  // Supervisors have organization-wide task scope (no fixed depot): any depot, named in the query.
  for (const sup of ["supA", "supB"] as const) {
    const b = (await dashboard(sup, `?date=${DAY}&depot_id=${ids.depB}`)).body.data;
    assert.deepEqual({ depot: b.overview.depot?.code, boxes: b.operations.boxes, employees: b.employees.map((row) => row.employee.id) }, { depot: "DEP-05", boxes: 999, employees: [actors.b1.employeeId] }, sup);
  }
  assert.ok(!(await dashboard("supA", `?date=${DAY}&depot_id=${ids.depA}`)).body.data.sources.completed_tasks.some((source) => source.id === ids.tb), "a depot view holds only that depot's tasks");
  // The depot picker offers every depot the caller may open.
  const available = async (actor: Key) => ((await dashboard(actor)).body.data.overview as unknown as { available_depots: Array<{ code: string }> }).available_depots.map((depot) => depot.code);
  assert.deepEqual(await available("supA"), ["DEP-04", "DEP-05"]);
  assert.deepEqual(await available("accountant"), ["DEP-04", "DEP-05"]);

  // Organisation-wide roles: any depot, or all depots together.
  assert.equal((await dashboard("admin", `?date=${DAY}&depot_id=${ids.depB}`)).body.data.operations.boxes, 999);
  const all = (await dashboard("superAdmin")).body.data;
  assert.equal(all.overview.depot, null);
  assert.equal(all.operations.boxes, 238 + 999);
  assert.equal((await dashboard("accountant", `?date=${DAY}&depot_id=${ids.depA}`)).status, 200);
  // Others and anonymous callers.
  assert.equal((await dashboard("a1")).status, 403);
  assert.equal((await dashboard(null)).status, 401);
});

test("DD-6: no incentive data, and request validation", async () => {
  for (const actor of ["supA", "admin", "accountant", "superAdmin"] as const) {
    assert.doesNotMatch((await dashboard(actor)).text, /incentive|payroll/i, actor);
  }
  assert.equal((await dashboard("admin", "?from=2026-09-30&to=2026-09-01")).status, 400);
  assert.equal((await dashboard("admin", "?from=2026-01-01&to=2026-12-31")).status, 400);
  assert.equal((await dashboard("admin", "?depot_id=not-a-uuid")).status, 400);
  assert.equal((await dashboard("admin", `?depot_id=${crypto.randomUUID()}`)).status, 404);
  const empty = (await dashboard("supA", "?date=2026-01-01")).body.data;
  assert.deepEqual({ completed: empty.operations.completed_tasks, minutes: empty.time.total_operational_minutes, attendance: empty.labour.attendance_percent, employees: empty.employees }, { completed: 0, minutes: null, attendance: null, employees: [] });
});

test("DD-7: every figure re-derived independently from the raw source rows (two-day range) matches the dashboard and KPI results", async () => {
  // Day 2 (01.10.2026 IST): one more completed UNLOADING task and a report with partial labour.
  const DAY2 = "2026-10-01";
  const at2 = (time: string) => new Date(`${DAY2}T${time}:00+05:30`);
  const t4 = crypto.randomUUID();
  await db.insertInto("tasks").values({ id: t4, depot_id: ids.depA, task_type: "UNLOADING", status: "COMPLETED", client_id: null, order_id: null, order_item_id: null, inventory_item_id: null, inventory_batch_id: null, source_location_id: null, destination_location_id: null, shift_id: null, planned_box_quantity: "50", completed_box_quantity: "50", started_at: at2("09:00"), paused_at: null, completed_at: at2("09:20"), created_at: at2("08:00") }).execute();
  await db.insertInto("task_assignments").values({ id: crypto.randomUUID(), task_id: t4, employee_id: actors.a1.employeeId, assigned_at: at2("08:30"), assigned_by_user_id: actors.admin.userId, unassigned_at: null, unassigned_by_user_id: null }).execute();
  await db.insertInto("task_events").values([
    { id: crypto.randomUUID(), task_id: t4, event_type: "TASK_STARTED", event_at: at2("09:00"), actor_user_id: actors.admin.userId, correlation_id: null, metadata: null },
    { id: crypto.randomUUID(), task_id: t4, event_type: "TASK_COMPLETED", event_at: at2("09:20"), actor_user_id: actors.admin.userId, correlation_id: null, metadata: null }
  ]).execute();
  const report2 = await fetch(`${serverUrl}/daily-reports`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: actors.supA.cookie }, body: JSON.stringify({ depot_id: ids.depA, report_date: DAY2, loading_count: 0, unloading_count: 1, labour_required: 20, labour_present: 18 }) });
  assert.equal(report2.status, 201);
  for (const code of ["TASKS_COMPLETED", "TASK_TIME"]) {
    await db.insertInto("kpi_definitions").values({ id: crypto.randomUUID(), code, name: code, pillar: null, description: null, unit: null, formula_reference: null, active: true, effective_from: null, effective_to: null }).execute();
  }

  // ---- Independent re-derivation from raw rows (no application code involved) ----
  const fromTs = new Date(`${DAY}T00:00:00+05:30`);
  const toTs = new Date(`2026-10-02T00:00:00+05:30`);
  const registered = await db.selectFrom("tasks").select(["task_type"]).where("depot_id", "=", ids.depA).where("created_at", ">=", fromTs).where("created_at", "<", toTs).execute();
  const completed = await db.selectFrom("tasks").select(["id", "task_type", "completed_box_quantity", "completed_at"]).where("depot_id", "=", ids.depA).where("status", "=", "COMPLETED").where("completed_at", ">=", fromTs).where("completed_at", "<", toTs).execute();
  const events = await db.selectFrom("task_events").select(["task_id", "event_type", "event_at"]).where("task_id", "in", completed.map((row) => row.id)).orderBy("event_at", "asc").execute();
  const minutesOf = (taskId: string): number | null => {
    let open: number | null = null;
    let total: number | null = null;
    for (const event of events.filter((row) => row.task_id === taskId)) {
      if (event.event_type === "TASK_STARTED" || event.event_type === "TASK_RESUMED") { open ??= event.event_at.getTime(); total ??= 0; }
      else if ((event.event_type === "TASK_PAUSED" || event.event_type === "TASK_COMPLETED") && open !== null) { total = (total ?? 0) + (event.event_at.getTime() - open); open = null; }
    }
    return total === null ? null : total / 60_000;
  };
  const boxesOf = (row: { completed_box_quantity: string | null }) => Number(row.completed_box_quantity ?? 0);
  const timed = completed.map((row) => minutesOf(row.id)).filter((value): value is number => value !== null);
  const reports = await db.selectFrom("depot_daily_reports").select(["labour_required", "labour_present"]).where("depot_id", "=", ids.depA).where(sql<boolean>`report_date between ${DAY}::date and ${DAY2}::date`).execute();
  const withLabour = reports.filter((row) => row.labour_required !== null && row.labour_present !== null);
  const required = withLabour.reduce((sum, row) => sum + (row.labour_required as number), 0);
  const present = withLabour.reduce((sum, row) => sum + (row.labour_present as number), 0);

  const expected = {
    loading_tasks: registered.filter((row) => row.task_type === "LOADING").length,
    unloading_tasks: registered.filter((row) => row.task_type === "UNLOADING").length,
    total_tasks: registered.length,
    completed_tasks: completed.length,
    boxes: completed.reduce((sum, row) => sum + boxesOf(row), 0),
    loading_boxes: completed.filter((row) => row.task_type === "LOADING").reduce((sum, row) => sum + boxesOf(row), 0),
    unloading_boxes: completed.filter((row) => row.task_type === "UNLOADING").reduce((sum, row) => sum + boxesOf(row), 0),
    total_minutes: timed.reduce((sum, value) => sum + value, 0),
    average_minutes: timed.reduce((sum, value) => sum + value, 0) / timed.length,
    required,
    present,
    attendance: Math.round((present / required) * 10_000) / 100
  };
  // Sanity: the fixture really spans both days.
  assert.deepEqual({ completed: expected.completed_tasks, boxes: expected.boxes, minutes: expected.total_minutes, required, present }, { completed: 4, boxes: 288, minutes: 110, required: 43, present: 41 });

  const res = await dashboard("supA", `?from=${DAY}&to=${DAY2}&depot_id=${ids.depA}`);
  assert.equal(res.status, 200);
  const data = res.body.data;
  assert.deepEqual(
    {
      loading_tasks: data.operations.loading_tasks, unloading_tasks: data.operations.unloading_tasks, total_tasks: data.operations.total_tasks, completed_tasks: data.operations.completed_tasks,
      boxes: data.operations.boxes, loading_boxes: data.operations.loading_boxes, unloading_boxes: data.operations.unloading_boxes,
      total_minutes: data.time.total_operational_minutes, average_minutes: data.time.average_task_minutes,
      required: data.labour.required, present: data.labour.present, attendance: data.labour.attendance_percent
    },
    { ...expected, average_minutes: Math.round(expected.average_minutes * 100) / 100 }
  );
  assert.equal(data.labour.reports_with_labour, 2);

  // Per employee: equal BOX sharing among assignees at completion, tasks, timed minutes and average.
  const assignments = await db.selectFrom("task_assignments").select(["task_id", "employee_id"]).where("task_id", "in", completed.map((row) => row.id)).where("unassigned_at", "is", null).execute();
  for (const row of data.employees) {
    const mine = completed.filter((task) => assignments.some((assignment) => assignment.task_id === task.id && assignment.employee_id === row.employee.id));
    const share = mine.reduce((sum, task) => sum + boxesOf(task) / assignments.filter((assignment) => assignment.task_id === task.id).length, 0);
    const myTimed = mine.map((task) => minutesOf(task.id)).filter((value): value is number => value !== null);
    const myMinutes = myTimed.reduce((sum, value) => sum + value, 0);
    assert.equal(row.boxes, Math.round(share * 100) / 100, `boxes ${row.employee.id}`);
    assert.equal(row.tasks_completed, mine.length, `tasks ${row.employee.id}`);
    assert.equal(row.active_minutes, myTimed.length ? myMinutes : null, `minutes ${row.employee.id}`);
    assert.equal(row.average_task_minutes, myTimed.length ? Math.round((myMinutes / myTimed.length) * 100) / 100 : null, `average ${row.employee.id}`);
    assert.deepEqual(new Set(row.source_task_ids), new Set(mine.map((task) => task.id)), `sources ${row.employee.id}`);

    // The KPI results engine (daily buckets summed over the range) agrees.
    const kpi = await fetch(`${serverUrl}/kpi/results?period=DAILY&from=${DAY}&to=${DAY2}&employee_id=${row.employee.id}`, { headers: { Cookie: actors.supA.cookie } });
    const results = ((await kpi.json()) as { data: Array<{ kpi: { code: string }; actual: { value: number } | null }> }).data;
    const sum = (code: string) => results.filter((result) => result.kpi.code === code).reduce((total, result) => total + (result.actual?.value ?? 0), 0);
    assert.equal(Math.round(sum("BOXES_HANDLED") * 100) / 100, row.boxes, `kpi boxes ${row.employee.id}`);
    assert.equal(sum("TASKS_COMPLETED"), row.tasks_completed, `kpi tasks ${row.employee.id}`);
    assert.equal(Math.round(sum("TASK_TIME") * 100) / 100, row.active_minutes ?? 0, `kpi minutes ${row.employee.id}`);
  }
});
