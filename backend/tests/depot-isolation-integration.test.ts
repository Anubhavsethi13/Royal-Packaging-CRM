import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before } from "node:test";
import bcrypt from "bcryptjs";
import { localDate } from "@royal-packaging/contracts";
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
 * Depot scope, enforced server-side (V1 business decisions D5/D6, D7, D8, RC-D9 in
 * Docs/product/v1-business-decision-freeze.md):
 * - Supervisors are not assigned to a fixed depot: they work across the organization's
 *   operational tasks, and each task carries its own depot context (or none).
 * - Others see only their own records, plus their own depot's dashboard summary.
 * Two depots (A, B), employees in each, completed tasks with BOX quantities, KPI
 * definitions, a location and a daily report. Every check is a direct API call.
 */

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);
const PASSWORD = "Password123!";
type Key = "supA" | "supB" | "supNone" | "a1" | "a2" | "b1" | "b2" | "admin" | "superAdmin" | "accountant";
interface Actor { cookie: string; userId: string; employeeId: string }

let db: DatabaseConnection;
let serverUrl: string;
let stopServer: () => Promise<void>;
const actors = {} as Record<Key, Actor>;
const depot = {} as Record<"A" | "B", { id: string; code: string; location: string; task: string; openTask: string; report: string }>;
let boxesKpiId: string;
// The application assigns tasks and KPI records to the operational date in
// OPERATIONS_TIMEZONE, so "today" must be that date (not the UTC date, which
// differs between 18:30 and 24:00 UTC for Asia/Kolkata).
const OPERATIONS_TIMEZONE = "Asia/Kolkata";
const TODAY = localDate(new Date(), OPERATIONS_TIMEZONE);

async function createActor(key: Key, role: string, depotId: string | null): Promise<void> {
  const userId = crypto.randomUUID();
  await db.insertInto("users").values({ id: userId, login_identifier: `iso_${key}`, password_hash: await bcrypt.hash(PASSWORD, 4), is_active: true }).execute();
  const existing = await db.selectFrom("access_roles").select("id").where("code", "=", role).executeTakeFirst();
  const roleId = existing?.id ?? crypto.randomUUID();
  if (!existing) await db.insertInto("access_roles").values({ id: roleId, code: role, name: role, active: true }).execute();
  await db.insertInto("user_access_roles").values({ id: crypto.randomUUID(), user_id: userId, role_id: roleId, assigned_at: new Date(), assigned_by_user_id: userId, revoked_at: null, revoked_by_user_id: null, version: "1" }).execute();
  const employeeId = crypto.randomUUID();
  await db.insertInto("employees").values({ id: employeeId, user_id: userId, employee_code: `EMP-${key}`, name: key, depot_id: depotId, is_active: true }).execute();
  const res = await fetch(`${serverUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login_identifier: `iso_${key}`, password: PASSWORD }) });
  assert.equal(res.status, 200, key);
  actors[key] = { cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] as string, userId, employeeId };
}

async function call(actor: Key | null, method: string, path: string, body?: unknown): Promise<{ status: number; code?: string; data: unknown; total?: number }> {
  const headers: Record<string, string> = {};
  if (actor) headers.Cookie = actors[actor].cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${serverUrl}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const json = (await res.json().catch(() => ({}))) as { code?: string; data?: unknown; meta?: { total?: number } };
  return { status: res.status, ...(json.code ? { code: json.code } : {}), data: json.data, ...(json.meta?.total !== undefined ? { total: json.meta.total } : {}) };
}
const ids = (data: unknown): string[] => (Array.isArray(data) ? data.map((row) => (row as { id: string }).id) : []);

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);
  await truncateAllTables(db);
  const appConfig = loadConfig({ NODE_ENV: "test", DATABASE_URL: TEST_DATABASE_URL, SESSION_SECRET: "s".repeat(48), OPERATIONS_TIMEZONE });
  const server = createApiApp({ database: db, appConfig }).createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  stopServer = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  for (const name of ["A", "B"] as const) {
    const id = crypto.randomUUID();
    const location = crypto.randomUUID();
    await db.insertInto("depots").values({ id, code: `DEP-${name}`, name: `Depot ${name}`, active: true }).execute();
    await db.insertInto("locations").values({ id: location, depot_id: id, parent_location_id: null, code: `${name}-01`, name: `Bay ${name}`, active: true }).execute();
    depot[name] = { id, code: `DEP-${name}`, location, task: "", openTask: "", report: "" };
  }
  await db.insertInto("truck_types").values({ id: crypto.randomUUID(), code: "32FT", name: "32ft", active: true }).execute();

  await createActor("supA", "SUPERVISOR", depot.A.id);
  await createActor("supB", "SUPERVISOR", depot.B.id);
  await createActor("supNone", "SUPERVISOR", null);
  await createActor("a1", "EMPLOYEE", depot.A.id);
  await createActor("a2", "EMPLOYEE", depot.A.id);
  await createActor("b1", "EMPLOYEE", depot.B.id);
  await createActor("b2", "EMPLOYEE", depot.B.id);
  await createActor("admin", "ADMIN", null);
  await createActor("superAdmin", "SUPER_ADMIN", null);
  await createActor("accountant", "ACCOUNTANT", null);

  boxesKpiId = crypto.randomUUID();
  await db.insertInto("kpi_definitions").values({ id: boxesKpiId, code: "BOXES_HANDLED", name: "Boxes handled", pillar: null, description: null, unit: null, formula_reference: null, active: true, effective_from: null, effective_to: null }).execute();

  // Supervisors register and complete one LOADING task per depot with both depot employees, through the API.
  // The task carries its depot (named in the request); the Supervisor has no fixed depot.
  for (const [name, sup, e1, e2, boxes] of [["A", "supA", "a1", "a2", 100], ["B", "supB", "b1", "b2", 60]] as const) {
    const created = await call(sup, "POST", "/tasks", { task_type: "LOADING", depot_id: depot[name].id, planned_box_quantity: boxes });
    assert.equal(created.status, 201, JSON.stringify(created));
    const taskId = (created.data as { id: string; depot_id: string }).id;
    assert.equal((created.data as { depot_id: string }).depot_id, depot[name].id, "the task carries its depot context");
    assert.equal((await call(sup, "POST", `/tasks/${taskId}/assignments`, { employeeIds: [actors[e1].employeeId, actors[e2].employeeId] })).status, 200);
    assert.equal((await call(sup, "POST", `/tasks/${taskId}/start`, {})).status, 200);
    assert.equal((await call(sup, "POST", `/tasks/${taskId}/complete`, { completed_box_quantity: boxes })).status, 200);
    depot[name].task = taskId;
    const open = await call(sup, "POST", "/tasks", { task_type: "UNLOADING", depot_id: depot[name].id, planned_box_quantity: 5, source_location_id: depot[name].location });
    depot[name].openTask = (open.data as { id: string }).id;
    const report = await call(sup, "POST", "/daily-reports", { depot_id: depot[name].id, report_date: TODAY, loading_count: 1, unloading_count: 0 });
    assert.equal(report.status, 201, JSON.stringify(report));
    depot[name].report = (report.data as { id: string }).id;
  }
});

after(async () => {
  if (stopServer) await stopServer();
  if (db) await cleanupTestDatabase(db);
});

const SUPERVISORS = ["supA", "supB", "supNone"] as const;

for (const sup of SUPERVISORS) {
  test(`SCOPE-1 (${sup}): a Supervisor reads every depot's tasks, employees, KPI, reports and operations`, async () => {
    const tasks = ids((await call(sup, "GET", "/tasks?pageSize=100")).data);
    for (const name of ["A", "B"] as const) {
      assert.ok(tasks.includes(depot[name].task) && tasks.includes(depot[name].openTask), `${sup} tasks of ${name}`);
      assert.equal((await call(sup, "GET", `/tasks?depot_id=${depot[name].id}`)).status, 200);
      for (const path of ["", "/summary", "/assignments", "/events", "/quality-inspections", "/photos"]) {
        assert.equal((await call(sup, "GET", `/tasks/${depot[name].task}${path}`)).status, 200, `${sup} read ${name}${path}`);
      }
      assert.equal((await call(sup, "GET", `/daily-reports/${depot[name].report}`)).status, 200);
      assert.equal((await call(sup, "GET", `/dashboard?depot_id=${depot[name].id}`)).status, 200);
      assert.equal((await call(sup, "GET", `/kpi/depot-dashboard?date=${TODAY}&depot_id=${depot[name].id}`)).status, 200);
      assert.equal((await call(sup, "GET", `/warehouse/operations/${depot[name].task}`)).status, 200);
    }
    const employees = new Set(ids((await call(sup, "GET", "/employees?pageSize=100")).data));
    for (const key of ["a1", "a2", "b1", "b2"] as const) assert.ok(employees.has(actors[key].employeeId), `${sup} employee ${key}`);
    const kpi = await call(sup, "GET", `/kpi/results?period=DAILY&from=${TODAY}&to=${TODAY}`);
    assert.equal(new Set((kpi.data as Array<{ employee: { id: string } }>).map((row) => row.employee.id)).size, 4, `${sup} KPI of every employee`);
    assert.deepEqual(new Set(ids((await call(sup, "GET", "/locations")).data)), new Set([depot.A.location, depot.B.location]));
  });

  test(`SCOPE-2 (${sup}): a Supervisor works on tasks of any depot, including cross-depot labour`, async () => {
    for (const name of ["A", "B"] as const) {
      const created = await call(sup, "POST", "/tasks", { task_type: "LOADING", depot_id: depot[name].id, planned_box_quantity: 1 });
      assert.equal(created.status, 201, JSON.stringify(created));
      const taskId = (created.data as { id: string; depot_id: string }).id;
      assert.equal((created.data as { depot_id: string }).depot_id, depot[name].id);
      // Cross-depot work is allowed (D8): an employee of either depot may be assigned.
      const assigned = await call(sup, "POST", `/tasks/${taskId}/assignments`, { employeeIds: [actors.a1.employeeId, actors.b1.employeeId] });
      assert.equal(assigned.status, 200, `${sup} assign ${name}: ${assigned.code}`);
      for (const action of ["start", "pause", "resume"]) {
        const res = await call(sup, "POST", `/tasks/${taskId}/${action}`, { reason: "x" });
        assert.equal(res.status, 200, `${sup} ${action} ${name}: ${res.code}`);
      }
      // Left in progress: KPI counts completed tasks only, so later aggregates are unaffected.
    }
  });
}

test("SCOPE-3: a Supervisor without a depot on their profile is not refused", async () => {
  for (const path of ["/tasks", "/employees", "/kpi/results", "/warehouse/operations", "/daily-reports", "/dashboard", "/kpi/depot-dashboard"]) {
    const res = await call("supNone", "GET", path);
    assert.equal(res.status, 200, `${path}: ${res.code}`);
  }
  const options = (await call("supNone", "GET", "/daily-reports/options")).data as { depots: Array<{ id: string }> };
  assert.deepEqual(new Set(options.depots.map((row) => row.id)), new Set([depot.A.id, depot.B.id]), "every depot can be chosen");
  // A daily report always names its depot.
  assert.equal((await call("supNone", "POST", "/daily-reports", { report_date: "2026-01-02", loading_count: 0, unloading_count: 0 })).code, "VALIDATION_FAILED");
  const report = await call("supNone", "POST", "/daily-reports", { depot_id: depot.B.id, report_date: "2026-01-02", loading_count: 2, unloading_count: 1 });
  assert.equal(report.status, 201, JSON.stringify(report));
});

test("SCOPE-4: depotless tasks are allowed and carry no depot", async () => {
  const created = await call("supA", "POST", "/tasks", { task_type: "LOADING", planned_box_quantity: 3 });
  assert.equal(created.status, 201, JSON.stringify(created));
  const taskId = (created.data as { id: string; depot_id: string | null }).id;
  assert.equal((created.data as { depot_id: string | null }).depot_id, null);
  assert.ok(ids((await call("supB", "GET", "/tasks?pageSize=100")).data).includes(taskId), "visible to every Supervisor");
  assert.equal((await call("a1", "GET", `/tasks/${taskId}`)).status, 403, "Others only see tasks assigned to them");
  assert.equal((await call("supA", "POST", `/tasks/${taskId}/cancel`, { reason: "test cleanup" })).status, 200);
});

test("ISO-7: organisation-wide roles keep their broader reach; the Accountant stays read-only", async () => {
  for (const actor of ["admin", "superAdmin", "accountant"] as const) {
    const tasks = await call(actor, "GET", `/warehouse/operations?pageSize=200`);
    assert.ok(ids(tasks.data).includes(depot.A.task) && ids(tasks.data).includes(depot.B.task), actor);
    const kpi = await call(actor, "GET", `/kpi/results?period=DAILY&from=${TODAY}&to=${TODAY}`);
    assert.equal(new Set((kpi.data as Array<{ employee: { id: string } }>).map((row) => row.employee.id)).size, 4, actor);
  }
  assert.equal((await call("admin", "GET", `/tasks/${depot.B.task}`)).status, 200);
  assert.equal((await call("accountant", "POST", "/tasks", { task_type: "LOADING", depot_id: depot.A.id })).status, 403);
  assert.equal((await call("accountant", "POST", "/daily-reports", { depot_id: depot.A.id, report_date: "2026-01-03", loading_count: 0, unloading_count: 0 })).status, 403);
});

test("ISO-8: Others see only their own tasks and their own employee profile", async () => {
  const assigned = (await db.selectFrom("task_assignments").select("task_id").where("employee_id", "=", actors.a1.employeeId).where("unassigned_at", "is", null).execute()).map((row) => row.task_id);
  const own = ids((await call("a1", "GET", "/tasks?pageSize=100")).data);
  assert.ok(own.includes(depot.A.task));
  assert.deepEqual(new Set(own), new Set(assigned));
  assert.ok(!own.includes(depot.B.task) && !own.includes(depot.A.openTask));
  assert.equal((await call("a1", "GET", `/tasks/${depot.B.task}`)).status, 403);
  assert.equal((await call("a1", "GET", `/tasks?employee_id=${actors.b1.employeeId}`)).status, 403);
  assert.deepEqual(ids((await call("a1", "GET", "/employees")).data), [actors.a1.employeeId]);
  assert.equal((await call("a1", "GET", `/employees/${actors.a2.employeeId}`)).status, 403);
  assert.equal((await call("a1", "GET", "/daily-reports")).status, 403);
  assert.equal((await call("a1", "GET", "/audit-logs")).status, 403);
});

test("ISO-8b: Others see a depot-level dashboard summary of their own depot only (RC-D9)", async () => {
  assert.equal((await call("a1", "GET", "/dashboard")).status, 200);
  assert.equal((await call("a1", "GET", `/dashboard?depot_id=${depot.A.id}`)).status, 200);
  assert.equal((await call("a1", "GET", `/dashboard?depot_id=${depot.B.id}`)).code, "DEPOT_FORBIDDEN", "never another depot");
  const own = (await call("a1", "GET", "/dashboard")).data as { tasksByStatus: Record<string, number> };
  const depotATasks = await db.selectFrom("tasks").select("id").where("depot_id", "=", depot.A.id).execute();
  assert.equal(Object.values(own.tasksByStatus).reduce((total, count) => total + count, 0), depotATasks.length, "depot A only, not organization-wide");
});

test("ISO-9: KPI aggregation per depot: BOX shared equally among the depot's assignees, tasks counted once each", async () => {
  const boxes = async (code: string) => ((await call("supNone", "GET", `/kpi/results?period=DAILY&from=${TODAY}&to=${TODAY}&kpi_id=${boxesKpiId}&warehouse_code=${code}`)).data as Array<{ employee: { id: string }; actual: { value: number } }>);
  assert.deepEqual((await boxes(depot.A.code)).map((row) => row.actual.value).sort(), [50, 50]); // 100 BOX shared by a1 and a2
  assert.deepEqual((await boxes(depot.B.code)).map((row) => row.actual.value).sort(), [30, 30]); // 60 BOX shared by b1 and b2
});

test("ISO-10: cross-depot work counts in the employee's own KPI, not in either depot's employee table (D8)", async () => {
  // a1 (Depot A) completes a Depot B task alone: 40 BOX.
  const created = await call("supA", "POST", "/tasks", { task_type: "LOADING", depot_id: depot.B.id, planned_box_quantity: 40 });
  const taskId = (created.data as { id: string }).id;
  assert.equal((await call("supA", "POST", `/tasks/${taskId}/assignments`, { employee_id: actors.a1.employeeId })).status, 200);
  assert.equal((await call("supA", "POST", `/tasks/${taskId}/start`, {})).status, 200);
  assert.equal((await call("supA", "POST", `/tasks/${taskId}/complete`, { completed_box_quantity: 40 })).status, 200);

  const personal = (await call("admin", "GET", `/kpi/results?period=DAILY&from=${TODAY}&to=${TODAY}&kpi_id=${boxesKpiId}&employee_id=${actors.a1.employeeId}`)).data as Array<{ actual: { value: number } }>;
  assert.deepEqual(personal.map((row) => row.actual.value), [90], "50 (Depot A task) + 40 (Depot B task)");

  type Row = { employee: { id: string }; boxes: number };
  const table = async (name: "A" | "B") => ((await call("admin", "GET", `/kpi/depot-dashboard?date=${TODAY}&depot_id=${depot[name].id}`)).data as { employees: Row[] }).employees;
  const depotA = await table("A");
  assert.equal(depotA.find((row) => row.employee.id === actors.a1.employeeId)?.boxes, 50, "Depot A table: only the Depot A task");
  const depotB = await table("B");
  assert.ok(!depotB.some((row) => row.employee.id === actors.a1.employeeId), "Depot B table: no visiting employee");
});
