import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before } from "node:test";
import bcrypt from "bcryptjs";
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

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);
const PASSWORD = "Password123!";

type ActorKey = "supA" | "supB" | "supNoDepot" | "admin" | "superAdmin" | "accountant" | "others";
let db: DatabaseConnection;
let serverUrl: string;
let stopServer: () => Promise<void>;
const actors = {} as Record<ActorKey, { cookie: string; userId: string; employeeId: string }>;
const depots = {} as Record<"A" | "B" | "inactive", string>;

// The client's example report.
const EXAMPLE = {
  report_date: "2026-09-30",
  loading_count: 11,
  unloading_count: 10,
  start_time: "10:00",
  end_time: "22:30",
  labour_required: 23,
  labour_present: 23,
  vehicles: [{ truck_type_code: "32ft", count: 5 }, { truck_type_code: "CROSSING", count: 0 }]
};

async function createActor(key: ActorKey, role: string, depotId: string | null): Promise<void> {
  const userId = crypto.randomUUID();
  await db.insertInto("users").values({ id: userId, login_identifier: `dr_${key}`, password_hash: await bcrypt.hash(PASSWORD, 4), is_active: true }).execute();
  const existing = await db.selectFrom("access_roles").select("id").where("code", "=", role).executeTakeFirst();
  const roleId = existing?.id ?? crypto.randomUUID();
  if (!existing) await db.insertInto("access_roles").values({ id: roleId, code: role, name: role, active: true }).execute();
  await db.insertInto("user_access_roles").values({ id: crypto.randomUUID(), user_id: userId, role_id: roleId, assigned_at: new Date(), assigned_by_user_id: userId, revoked_at: null, revoked_by_user_id: null, version: "1" }).execute();
  const employeeId = crypto.randomUUID();
  await db.insertInto("employees").values({ id: employeeId, user_id: userId, employee_code: `EMP-${key}`, name: key, depot_id: depotId, is_active: true }).execute();
  const res = await fetch(`${serverUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login_identifier: `dr_${key}`, password: PASSWORD }) });
  assert.equal(res.status, 200, key);
  actors[key] = { cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] as string, userId, employeeId };
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

  depots.A = crypto.randomUUID();
  depots.B = crypto.randomUUID();
  depots.inactive = crypto.randomUUID();
  await db.insertInto("depots").values([
    { id: depots.A, code: "DEP-04", name: "Depot Four", active: true },
    { id: depots.B, code: "DEP-05", name: "Depot Five", active: true },
    { id: depots.inactive, code: "DEP-99", name: "Closed", active: false }
  ]).execute();
  await db.insertInto("truck_types").values([
    { id: crypto.randomUUID(), code: "32FT", name: "32ft", active: true },
    { id: crypto.randomUUID(), code: "CROSSING", name: "Crossing", active: true }
  ]).execute();

  await createActor("supA", "SUPERVISOR", depots.A);
  await createActor("supB", "SUPERVISOR", depots.B);
  await createActor("supNoDepot", "SUPERVISOR", null);
  await createActor("admin", "ADMIN", null);
  await createActor("superAdmin", "SUPER_ADMIN", null);
  await createActor("accountant", "ACCOUNTANT", null);
  await createActor("others", "EMPLOYEE", depots.A);

  // Registered tasks: depot A, completed 00:30 IST on 30 Sep (still 29 Sep in UTC).
  const task = (depotId: string, type: string, completedAt: string, boxes: number, status = "COMPLETED") =>
    db.insertInto("tasks").values({ id: crypto.randomUUID(), depot_id: depotId, task_type: type, status, client_id: null, order_id: null, order_item_id: null, inventory_item_id: null, inventory_batch_id: null, source_location_id: null, destination_location_id: null, shift_id: null, planned_box_quantity: String(boxes), completed_box_quantity: status === "COMPLETED" ? String(boxes) : null, started_at: new Date(new Date(completedAt).getTime() - 1_800_000), paused_at: null, completed_at: status === "COMPLETED" ? new Date(completedAt) : null }).execute();
  await task(depots.A, "LOADING", "2026-09-29T19:00:00Z", 120);
  await task(depots.A, "UNLOADING", "2026-09-30T10:00:00Z", 80);
  await task(depots.A, "UNLOADING", "2026-09-30T19:00:00Z", 999); // 1 Oct 00:30 IST: different operational date
  await task(depots.B, "LOADING", "2026-09-30T10:00:00Z", 555); // other depot
  await task(depots.A, "LOADING", "2026-09-30T10:00:00Z", 50, "IN_PROGRESS"); // not completed
});

after(async () => {
  if (stopServer) await stopServer();
  if (db) await cleanupTestDatabase(db);
});

interface Report {
  id: string; depot: { id: string; code: string }; report_date: string; loading_count: number; unloading_count: number; total_operations: number;
  start_time: string | null; end_time: string | null; duration_minutes: number | null; labour_required: number | null; labour_present: number | null;
  vehicles: Array<{ truck_type: { code: string }; count: number }>; status: string; version: string; supervisor_employee_id: string | null;
  submitted_at: string | null; submitted_by_user_id: string | null;
  registered_tasks: { loading_tasks_completed: number; unloading_tasks_completed: number; loading_boxes: number; unloading_boxes: number; timezone: string };
}
async function call(actor: ActorKey | null, method: string, path: string, body?: unknown): Promise<{ status: number; body: { data: Report & Report[]; code?: string; errors?: Array<{ field?: string }>; meta?: { total: number } } }> {
  const headers: Record<string, string> = {};
  if (actor) headers.Cookie = actors[actor].cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${serverUrl}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: (await res.json()) as never };
}

let reportA: Report;

test("DR-1: a supervisor registers the example report for the depot they name; totals and duration are derived", async () => {
  const res = await call("supA", "POST", "/daily-reports", { ...EXAMPLE, depot_id: depots.A });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  reportA = res.body.data;
  assert.equal(reportA.depot.id, depots.A);
  assert.equal(reportA.supervisor_employee_id, actors.supA.employeeId);
  assert.equal(reportA.report_date, "2026-09-30");
  assert.equal(reportA.total_operations, 21);
  assert.equal(reportA.duration_minutes, 750); // 12 h 30 min
  assert.deepEqual(reportA.vehicles.map((vehicle) => [vehicle.truck_type.code, vehicle.count]), [["32FT", 5], ["CROSSING", 0]]);
  assert.equal(reportA.status, "DRAFT");
  assert.equal(reportA.version, "1");
});

test("DR-2: derived and identity fields cannot be supplied by the client", async () => {
  for (const extra of [{ total_operations: 99 }, { duration_minutes: 5 }, { supervisor_employee_id: actors.supB.employeeId }, { status: "SUBMITTED" }]) {
    const res = await call("supA", "POST", "/daily-reports", { ...EXAMPLE, depot_id: depots.A, report_date: "2026-09-01", ...extra });
    assert.equal(res.status, 400, JSON.stringify(extra));
    assert.equal(res.body.code, "VALIDATION_FAILED");
  }
});

test("DR-3: supervisors have no fixed depot; every report names its depot", async () => {
  // Any depot, named explicitly; a supervisor without a depot on their profile is not refused.
  const other = await call("supA", "POST", "/daily-reports", { ...EXAMPLE, report_date: "2026-09-02", depot_id: depots.B });
  assert.equal(other.status, 201, JSON.stringify(other.body));
  assert.equal(other.body.data.depot.id, depots.B);
  assert.equal((await call("supNoDepot", "POST", "/daily-reports", EXAMPLE)).body.code, "VALIDATION_FAILED", "the depot must be named");
  const noDepot = await call("supNoDepot", "POST", "/daily-reports", { ...EXAMPLE, report_date: "2026-09-07", depot_id: depots.A });
  assert.equal(noDepot.status, 201, JSON.stringify(noDepot.body));
  assert.equal((await call("supNoDepot", "POST", "/daily-reports", { ...EXAMPLE, report_date: "2026-09-08", depot_id: depots.inactive })).body.code, "INVALID_DEPOT");
  // Reports of every depot are readable by every supervisor.
  assert.equal((await call("supB", "GET", `/daily-reports/${reportA.id}`)).status, 200);
  assert.equal((await call("supB", "GET", `/daily-reports?depot_id=${depots.A}`)).status, 200);
  const all = await call("supB", "GET", "/daily-reports");
  assert.equal(all.status, 200);
  assert.deepEqual(new Set(all.body.data.map((report) => report.depot.id)), new Set([depots.A, depots.B]));
  const options = await call("supA", "GET", "/daily-reports/options");
  assert.deepEqual(new Set((options.body.data as unknown as { depots: Array<{ id: string }> }).depots.map((depot) => depot.id)), new Set([depots.A, depots.B]), "every active depot");
});

test("DR-4: one report per depot per date", async () => {
  const duplicate = await call("supA", "POST", "/daily-reports", { ...EXAMPLE, depot_id: depots.A });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, "DAILY_REPORT_DUPLICATE");
});

test("DR-5: validation of counts, times and vehicle types", async () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ loading_count: -1 }, "VALIDATION_FAILED"],
    [{ unloading_count: 1.5 }, "VALIDATION_FAILED"],
    [{ start_time: "22:30", end_time: "10:00" }, "VALIDATION_FAILED"],
    [{ start_time: "25:00" }, "VALIDATION_FAILED"],
    [{ report_date: "2026-02-30" }, "VALIDATION_FAILED"],
    [{ vehicles: [{ truck_type_code: "ROCKET", count: 1 }] }, "INVALID_TRUCK_TYPE"],
    [{ vehicles: [{ truck_type_code: "32FT", count: 1 }, { truck_type_code: "32ft", count: 2 }] }, "VALIDATION_FAILED"]
  ];
  for (const [patch, code] of cases) {
    const res = await call("supA", "POST", "/daily-reports", { ...EXAMPLE, depot_id: depots.A, report_date: "2026-09-03", ...patch });
    assert.equal(res.body.code, code, JSON.stringify(patch));
  }
});

test("DR-6: updates need the current version and keep derived values consistent", async () => {
  const stale = await call("supA", "PATCH", `/daily-reports/${reportA.id}`, { version: "7", loading_count: 12 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, "DAILY_REPORT_VERSION_CONFLICT");
  const badTimes = await call("supA", "PATCH", `/daily-reports/${reportA.id}`, { version: "1", end_time: "09:00" });
  assert.equal(badTimes.status, 400);
  const ok = await call("supA", "PATCH", `/daily-reports/${reportA.id}`, { version: "1", loading_count: 12, vehicles: [{ truck_type_code: "32FT", count: 6 }] });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.data.total_operations, 22);
  assert.equal(ok.body.data.version, "2");
  assert.deepEqual(ok.body.data.vehicles.map((vehicle) => [vehicle.truck_type.code, vehicle.count]), [["32FT", 6]]);
  reportA = ok.body.data;
});

test("DR-7: submission requires times and labour, then locks the report", async () => {
  const draft = await call("supA", "POST", "/daily-reports", { depot_id: depots.A, report_date: "2026-09-04", loading_count: 3, unloading_count: 4 });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.data.duration_minutes, null);
  const incomplete = await call("supA", "POST", `/daily-reports/${draft.body.data.id}/submit`, { version: "1" });
  assert.equal(incomplete.status, 422);
  assert.equal(incomplete.body.code, "DAILY_REPORT_INCOMPLETE");
  assert.deepEqual((incomplete.body.errors ?? []).map((error) => error.field).sort(), ["end_time", "labour_present", "labour_required", "start_time"]);

  const submitted = await call("supA", "POST", `/daily-reports/${reportA.id}/submit`, { version: reportA.version });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  assert.equal(submitted.body.data.status, "SUBMITTED");
  assert.equal(submitted.body.data.submitted_by_user_id, actors.supA.userId);
  assert.ok(submitted.body.data.submitted_at);
  const locked = await call("supA", "PATCH", `/daily-reports/${reportA.id}`, { version: submitted.body.data.version, loading_count: 1 });
  assert.equal(locked.status, 409);
  assert.equal(locked.body.code, "DAILY_REPORT_LOCKED");
  assert.equal((await call("admin", "POST", `/daily-reports/${reportA.id}/submit`, { version: submitted.body.data.version })).body.code, "DAILY_REPORT_LOCKED");
  reportA = submitted.body.data;
});

test("DR-8: the report is traceable to registered tasks on the same operational date (OPERATIONS_TIMEZONE)", async () => {
  const res = await call("admin", "GET", `/daily-reports/${reportA.id}`);
  const { loading_tasks_completed, unloading_tasks_completed, loading_boxes, unloading_boxes, timezone } = res.body.data.registered_tasks;
  // Depot A on 30 Sep IST: the 00:30 IST loading task counts; the next-day, other-depot and unfinished tasks do not.
  assert.deepEqual({ loading_tasks_completed, unloading_tasks_completed, loading_boxes, unloading_boxes, timezone }, { loading_tasks_completed: 1, unloading_tasks_completed: 1, loading_boxes: 120, unloading_boxes: 80, timezone: "Asia/Kolkata" });
});

test("DR-9: role matrix", async () => {
  // Administrators (like supervisors) report for any depot, but must name an active one.
  assert.equal((await call("admin", "POST", "/daily-reports", { ...EXAMPLE, report_date: "2026-09-05" })).body.code, "VALIDATION_FAILED");
  assert.equal((await call("admin", "POST", "/daily-reports", { ...EXAMPLE, report_date: "2026-09-05", depot_id: depots.inactive })).body.code, "INVALID_DEPOT");
  const byAdmin = await call("admin", "POST", "/daily-reports", { ...EXAMPLE, report_date: "2026-09-05", depot_id: depots.B });
  assert.equal(byAdmin.status, 201);
  assert.equal((await call("superAdmin", "GET", `/daily-reports/${byAdmin.body.data.id}`)).status, 200);

  // Accountant: read all depots, never write.
  const accountantList = await call("accountant", "GET", "/daily-reports");
  assert.equal(accountantList.status, 200);
  assert.ok(new Set(accountantList.body.data.map((report) => report.depot.id)).size >= 2);
  assert.equal((await call("accountant", "POST", "/daily-reports", { ...EXAMPLE, report_date: "2026-09-06", depot_id: depots.A })).status, 403);
  assert.equal((await call("accountant", "PATCH", `/daily-reports/${byAdmin.body.data.id}`, { version: "1", loading_count: 1 })).status, 403);

  // Others: no access. Anonymous: 401.
  assert.equal((await call("others", "GET", "/daily-reports")).status, 403);
  assert.equal((await call("others", "POST", "/daily-reports", EXAMPLE)).status, 403);
  assert.equal((await call(null, "GET", "/daily-reports")).status, 401);
  assert.equal((await call(null, "POST", "/daily-reports", EXAMPLE)).status, 401);
});

test("DR-10: every change is audited with who, what, when, which depot and which report", async () => {
  const events = await db.selectFrom("depot_daily_report_events").selectAll().where("report_id", "=", reportA.id).orderBy("event_at", "asc").execute();
  assert.deepEqual(events.map((event) => event.event_type), ["DAILY_REPORT_CREATED", "DAILY_REPORT_UPDATED", "DAILY_REPORT_SUBMITTED"]);
  assert.ok(events.every((event) => event.actor_user_id === actors.supA.userId && event.depot_id === depots.A));
  assert.deepEqual(JSON.parse(events[1]!.metadata ?? "{}").changed.sort(), ["loading_count", "vehicles"]);

  const feed = await fetch(`${serverUrl}/audit-logs`, { headers: { Cookie: actors.admin.cookie } });
  const entries = ((await feed.json()) as { data: Array<{ source: string; metadata: { report_id?: string; depot_id?: string } | null }> }).data;
  const reportEntries = entries.filter((entry) => entry.source === "daily_report" && entry.metadata?.report_id === reportA.id);
  assert.equal(reportEntries.length, 3);
  assert.ok(reportEntries.every((entry) => entry.metadata?.depot_id === depots.A));
});
