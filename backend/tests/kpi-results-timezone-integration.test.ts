import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before } from "node:test";
import bcrypt from "bcryptjs";
import type { DatabaseConnection } from "@royal-packaging/db";
import { loadConfig } from "../packages/config/src/index.js";
import { createApiApp } from "../apps/api/src/app.js";
import { KpiService } from "../apps/api/src/modules/kpi/kpi-service.js";
import {
  ensureTestDatabase,
  getScopedTestDatabaseUrl,
  getTestDatabase,
  migrateTestDatabase,
  truncateAllTables,
  cleanupTestDatabase
} from "./helpers/postgres-test-helper.js";

/**
 * OPERATIONS_TIMEZONE=Asia/Kolkata (UTC+05:30) drives KPI period boundaries.
 * Timestamps stay UTC in the database; only calendar bucketing is local.
 */

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);
const PASSWORD = "Password123!";

let db: DatabaseConnection;
let serverUrl: string;
let stopServer: () => Promise<void>;
const cookies = {} as Record<"supervisor" | "employee", string>;
const ids = {} as Record<"employee" | "other" | "kpi" | "t1" | "depot", string>;

// Instants (UTC) and their India local times:
const T1 = "2026-09-09T19:00:00.000Z"; // 2026-09-10 00:30 IST  (UTC date is the previous day)
const T2 = "2026-09-10T18:29:00.000Z"; // 2026-09-10 23:59 IST
const T3 = "2026-09-10T18:31:00.000Z"; // 2026-09-11 00:01 IST  (UTC date is still 09-10)
const T4 = "2026-09-06T19:00:00.000Z"; // Monday 2026-09-07 00:30 IST (UTC: Sunday)
const T5 = "2026-08-31T19:00:00.000Z"; // 2026-09-01 00:30 IST (UTC: August)

async function actor(login: string, role: string, name: string): Promise<{ cookie: string; employeeId: string }> {
  const userId = crypto.randomUUID();
  await db.insertInto("users").values({ id: userId, login_identifier: login, password_hash: await bcrypt.hash(PASSWORD, 4), is_active: true }).execute();
  const existing = await db.selectFrom("access_roles").select("id").where("code", "=", role).executeTakeFirst();
  const roleId = existing?.id ?? crypto.randomUUID();
  if (!existing) await db.insertInto("access_roles").values({ id: roleId, code: role, name: role, active: true }).execute();
  await db.insertInto("user_access_roles").values({ id: crypto.randomUUID(), user_id: userId, role_id: roleId, assigned_at: new Date(), assigned_by_user_id: userId, revoked_at: null, revoked_by_user_id: null, version: "1" }).execute();
  const employeeId = crypto.randomUUID();
  await db.insertInto("employees").values({ id: employeeId, user_id: userId, employee_code: `EMP-${login}`, name, depot_id: ids.depot, is_active: true }).execute();
  const res = await fetch(`${serverUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login_identifier: login, password: PASSWORD }) });
  assert.equal(res.status, 200);
  return { cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] as string, employeeId };
}

async function completedTask(completedAt: string, boxes: number, employeeId: string, assignedBy: string): Promise<string> {
  const id = crypto.randomUUID();
  const end = new Date(completedAt);
  const start = new Date(end.getTime() - 30 * 60_000);
  await db.insertInto("tasks").values({ id, depot_id: ids.depot, task_type: "LOADING", status: "COMPLETED", client_id: null, order_id: null, order_item_id: null, inventory_item_id: null, inventory_batch_id: null, source_location_id: null, destination_location_id: null, shift_id: null, planned_box_quantity: String(boxes), completed_box_quantity: String(boxes), started_at: start, paused_at: null, completed_at: end }).execute();
  await db.insertInto("task_assignments").values({ id: crypto.randomUUID(), task_id: id, employee_id: employeeId, assigned_at: new Date(start.getTime() - 60_000), assigned_by_user_id: assignedBy, unassigned_at: null, unassigned_by_user_id: null }).execute();
  await db.insertInto("task_events").values([
    { id: crypto.randomUUID(), task_id: id, event_type: "TASK_STARTED", event_at: start, actor_user_id: assignedBy, correlation_id: null, metadata: null },
    { id: crypto.randomUUID(), task_id: id, event_type: "TASK_COMPLETED", event_at: end, actor_user_id: assignedBy, correlation_id: null, metadata: null }
  ]).execute();
  return id;
}

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);
  await truncateAllTables(db);

  // The app is configured exactly as production would be: through OPERATIONS_TIMEZONE.
  const appConfig = loadConfig({ NODE_ENV: "test", DATABASE_URL: TEST_DATABASE_URL, SESSION_SECRET: "s".repeat(48), OPERATIONS_TIMEZONE: "Asia/Kolkata" });
  const server = createApiApp({ database: db, appConfig }).createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  stopServer = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  // Everyone works in one depot (the supervisor is depot-confined).
  ids.depot = crypto.randomUUID();
  await db.insertInto("depots").values({ id: ids.depot, code: "DEP-TZ", name: "Timezone depot", active: true }).execute();

  const supervisor = await actor("tz_sup", "SUPERVISOR", "Sam Supervisor");
  const employee = await actor("tz_emp", "EMPLOYEE", "Priya Patel");
  const other = await actor("tz_other", "EMPLOYEE", "Other Person");
  cookies.supervisor = supervisor.cookie;
  cookies.employee = employee.cookie;
  ids.employee = employee.employeeId;
  ids.other = other.employeeId;

  ids.kpi = crypto.randomUUID();
  await db.insertInto("kpi_definitions").values({ id: ids.kpi, code: "BOXES_HANDLED", name: "Boxes handled", pillar: null, description: null, unit: null, formula_reference: null, active: true, effective_from: null, effective_to: null }).execute();

  const assigner = (await db.selectFrom("users").select("id").where("login_identifier", "=", "tz_sup").executeTakeFirstOrThrow()).id;
  ids.t1 = await completedTask(T1, 10, ids.employee, assigner);
  await completedTask(T2, 20, ids.employee, assigner);
  await completedTask(T3, 40, ids.employee, assigner);
  await completedTask(T4, 5, ids.employee, assigner);
  await completedTask(T5, 7, ids.employee, assigner);
  await completedTask(T2, 99, ids.other, assigner);
});

after(async () => {
  if (stopServer) await stopServer();
  if (db) await cleanupTestDatabase(db);
});

interface Result { id: string; employee: { id: string }; actual: { value: number } | null; period: { kind: string; start: string; end: string; timezone: string }; source_count: number }
async function results(cookie: string, query: string): Promise<Result[]> {
  const res = await fetch(`${serverUrl}/kpi/results${query}`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200, await res.clone().text());
  return ((await res.json()) as { data: Result[] }).data;
}
const byStart = (list: Result[], employee: string) => Object.fromEntries(list.filter((result) => result.employee.id === employee).map((result) => [result.period.start, result.actual?.value]));

test("TZ-1: a task completed at 00:30 IST counts on that Indian date, not the previous UTC date", async () => {
  const daily = await results(cookies.supervisor, "?period=DAILY&from=2026-09-08&to=2026-09-12");
  assert.deepEqual(byStart(daily, ids.employee), { "2026-09-10": 30, "2026-09-11": 40 });
  assert.equal(byStart(daily, ids.employee)["2026-09-09"], undefined);
  assert.ok(daily.every((result) => result.period.timezone === "Asia/Kolkata"));
});

test("TZ-2: 23:59 and 00:01 IST fall on consecutive operational days", async () => {
  const day10 = await results(cookies.supervisor, `?period=DAILY&from=2026-09-10&to=2026-09-10&employee_id=${ids.employee}`);
  assert.equal(day10[0]?.actual?.value, 30); // T1 + T2, not T3
  assert.equal(day10[0]?.source_count, 2);
});

test("TZ-3: weekly periods start on Monday 00:00 IST", async () => {
  const weekly = await results(cookies.supervisor, `?period=WEEKLY&from=2026-08-31&to=2026-09-13&employee_id=${ids.employee}`);
  assert.deepEqual(byStart(weekly, ids.employee), { "2026-08-31": 7, "2026-09-07": 75 });
  assert.ok(weekly.every((result) => result.period.end === (result.period.start === "2026-08-31" ? "2026-09-06" : "2026-09-13")));
});

test("TZ-4: monthly periods start on the 1st 00:00 IST", async () => {
  const monthly = await results(cookies.supervisor, `?period=MONTHLY&from=2026-08-01&to=2026-09-30&employee_id=${ids.employee}`);
  assert.deepEqual(byStart(monthly, ids.employee), { "2026-09-01": 82 });
});

test("TZ-5: the same data bucketed in UTC differs, proving the timezone comes from configuration", async () => {
  const utc = new KpiService({ database: db, timeZone: "UTC" });
  const daily = await utc.listResults({ period: "DAILY", from: "2026-09-08", to: "2026-09-12" }, { employeeId: ids.employee });
  assert.deepEqual(Object.fromEntries(daily.map((result) => [result.period.start, result.actual?.value])), { "2026-09-09": 10, "2026-09-10": 60 });
  const monthly = await utc.listResults({ period: "MONTHLY", from: "2026-08-01", to: "2026-09-30" }, { employeeId: ids.employee });
  assert.deepEqual(Object.fromEntries(monthly.map((result) => [result.period.start, result.actual?.value])), { "2026-08-01": 7, "2026-09-01": 75 });
});

test("TZ-6: stored timestamps are untouched UTC instants", async () => {
  const row = await db.selectFrom("tasks").select(["completed_at"]).where("id", "=", ids.t1).executeTakeFirstOrThrow();
  assert.equal((row.completed_at as Date).toISOString(), T1);
  const detail = await fetch(`${serverUrl}/kpi/results/${ids.kpi}_${ids.employee}_DAILY_2026-09-10`, { headers: { Cookie: cookies.supervisor } });
  const references = ((await detail.json()) as { data: { source_references: Array<{ task_id: string; timestamp: string }> } }).data.source_references;
  assert.equal(references.find((reference) => reference.task_id === ids.t1)?.timestamp, T1);
});

test("TZ-7: the frontend cannot widen scope, pick an employee, or claim a role through the query or headers", async () => {
  const own = await results(cookies.employee, "?period=DAILY&from=2026-09-08&to=2026-09-12&scope=ORGANIZATION&role=SUPERVISOR");
  assert.ok(own.length > 0 && own.every((result) => result.employee.id === ids.employee));
  const headers = { Cookie: cookies.employee, "X-User-Role": "SUPER_ADMIN", "X-Employee-Id": ids.other };
  const viaHeaders = await fetch(`${serverUrl}/kpi/results?period=DAILY&from=2026-09-08&to=2026-09-12`, { headers });
  assert.ok(((await viaHeaders.json()) as { data: Result[] }).data.every((result) => result.employee.id === ids.employee));
  assert.equal((await fetch(`${serverUrl}/kpi/results?employee_id=${ids.other}`, { headers: { Cookie: cookies.employee } })).status, 403);
  assert.equal((await fetch(`${serverUrl}/kpi/results/${ids.kpi}_${ids.other}_DAILY_2026-09-10`, { headers: { Cookie: cookies.employee } })).status, 403);
});
