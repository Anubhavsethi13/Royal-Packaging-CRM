import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before } from "node:test";
import bcrypt from "bcryptjs";
import type { DatabaseConnection } from "@royal-packaging/db";
import { createApiApp } from "../apps/api/src/app.js";
import { TaskService } from "../apps/api/src/modules/warehouse/task-service.js";
import {
  ensureTestDatabase,
  getScopedTestDatabaseUrl,
  getTestDatabase,
  migrateTestDatabase,
  truncateAllTables,
  cleanupTestDatabase
} from "./helpers/postgres-test-helper.js";

/**
 * Supervisor Loading & Unloading: the page reads the existing warehouse operations
 * projection filtered to LOADING,UNLOADING, and every write goes through the
 * existing /tasks lifecycle routes. These tests exercise both with the real
 * DatabaseRBACAuthorizationPolicy.
 */

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);
const PASSWORD = "Password123!";

let db: DatabaseConnection;
let serverUrl: string;
let stopServer: () => Promise<void>;
let tasks: TaskService;

interface Actor { userId: string; employeeId: string | null; cookie: string }
let loader: Actor;
let otherEmployee: Actor;
let supervisor: Actor;
let noRole: Actor;

const ids = {} as Record<"dep1" | "loadTask" | "unloadTask" | "pickTask" | "freshLoad", string>;

interface Operation {
  id: string;
  task_type: string | null;
  operation_type: string;
  status: string;
  warehouse: { code: string } | null;
  assignees: Array<{ employee_id: string; name: string | null }>;
  planned_box_quantity: number | null;
  completed_box_quantity: number | null;
  started_at: string | null;
  completed_at: string | null;
  timing_events: Array<{ event_type: string; event_at: string }>;
  sla: { target_seconds: null; status: string };
  activity?: Array<{ event_type: string }>;
}
interface ListBody { data: Operation[]; meta: { total: number } }
interface ErrorBody { success: false; code: string; errors?: Array<{ field?: string }> }

async function createActor(login: string, role: string | null, name: string | null): Promise<Actor> {
  const userId = crypto.randomUUID();
  await db.insertInto("users").values({ id: userId, login_identifier: login, password_hash: await bcrypt.hash(PASSWORD, 4), is_active: true }).execute();
  if (role) {
    const existing = await db.selectFrom("access_roles").select("id").where("code", "=", role).executeTakeFirst();
    const roleId = existing?.id ?? crypto.randomUUID();
    if (!existing) await db.insertInto("access_roles").values({ id: roleId, code: role, name: role, active: true }).execute();
    await db.insertInto("user_access_roles").values({ id: crypto.randomUUID(), user_id: userId, role_id: roleId, assigned_at: new Date(), assigned_by_user_id: userId, revoked_at: null, revoked_by_user_id: null, version: "1" }).execute();
  }
  let employeeId: string | null = null;
  if (name) {
    employeeId = crypto.randomUUID();
    await db.insertInto("employees").values({ id: employeeId, user_id: userId, employee_code: `EMP-${login}`, name, is_active: true }).execute();
  }
  const res = await fetch(`${serverUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login_identifier: login, password: PASSWORD }) });
  assert.equal(res.status, 200, `login ${login}`);
  return { userId, employeeId, cookie: res.headers.get("set-cookie") as string };
}

async function get(actor: Actor | null, path: string): Promise<Response> {
  return fetch(`${serverUrl}${path}`, { headers: actor ? { Cookie: actor.cookie } : {} });
}
async function post(actor: Actor, path: string, body: unknown = {}): Promise<Response> {
  return fetch(`${serverUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: actor.cookie }, body: JSON.stringify(body) });
}
async function dockOperations(actor: Actor, extra = ""): Promise<ListBody> {
  const res = await get(actor, `/warehouse/operations?operation_type=LOADING,UNLOADING${extra}`);
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as ListBody;
}
async function detail(actor: Actor, id: string): Promise<Operation> {
  const res = await get(actor, `/warehouse/operations/${id}`);
  assert.equal(res.status, 200, await res.clone().text());
  return ((await res.json()) as { data: Operation }).data;
}

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);
  await truncateAllTables(db);
  tasks = new TaskService({ database: db });

  const app = createApiApp({ database: db });
  const server = app.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  stopServer = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  loader = await createActor("lu_loader", "EMPLOYEE", "Lena Loader");
  otherEmployee = await createActor("lu_other", "EMPLOYEE", "Omar Other");
  supervisor = await createActor("lu_sup", "SUPERVISOR", "Sara Supervisor");
  noRole = await createActor("lu_norole", null, "No Role");

  ids.dep1 = crypto.randomUUID();
  await db.insertInto("depots").values({ id: ids.dep1, code: "DOCK-01", name: "Dock Depot", active: true }).execute();

  const actor = supervisor.userId;
  ids.loadTask = (await tasks.createTask({ depot_id: ids.dep1, task_type: "LOADING", planned_box_quantity: 120 }, actor)).id;
  await tasks.assignTask({ task_id: ids.loadTask, employee_id: loader.employeeId as string }, actor);
  await tasks.startTask(ids.loadTask, actor);
  await tasks.pauseTask(ids.loadTask, actor);
  await tasks.resumeTask(ids.loadTask, actor);
  await tasks.completeTask({ task_id: ids.loadTask, completed_box_quantity: 118 }, actor);

  ids.unloadTask = (await tasks.createTask({ depot_id: ids.dep1, task_type: "RECEIVING", planned_box_quantity: 60 }, actor)).id;
  await tasks.assignTask({ task_id: ids.unloadTask, employee_id: otherEmployee.employeeId as string }, actor);

  ids.pickTask = (await tasks.createTask({ depot_id: ids.dep1, task_type: "PICKING", planned_box_quantity: 10 }, actor)).id;

  ids.freshLoad = (await tasks.createTask({ depot_id: ids.dep1, task_type: "load", planned_box_quantity: 30 }, actor)).id;
  await tasks.assignTask({ task_id: ids.freshLoad, employee_id: loader.employeeId as string }, actor);
});

after(async () => {
  if (stopServer) await stopServer();
  if (db) await cleanupTestDatabase(db);
});

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

test("LU-1: the combined LOADING,UNLOADING filter returns only dock operations", async () => {
  const body = await dockOperations(supervisor);
  assert.deepEqual(new Set(body.data.map((operation) => operation.id)), new Set([ids.loadTask, ids.unloadTask, ids.freshLoad]));
  const types = new Map(body.data.map((operation) => [operation.id, operation.operation_type]));
  assert.equal(types.get(ids.loadTask), "LOADING");
  assert.equal(types.get(ids.unloadTask), "UNLOADING"); // RECEIVING synonym
  assert.equal(types.get(ids.freshLoad), "LOADING"); // "load" synonym, case-insensitive
  assert.equal((await dockOperations(supervisor, "")).meta.total, 3);
  // Single values and lower-case lists still work; duplicates collapse.
  assert.equal((await (await get(supervisor, "/warehouse/operations?operation_type=unloading")).json() as ListBody).meta.total, 1);
  assert.equal((await (await get(supervisor, "/warehouse/operations?operation_type=loading,LOADING")).json() as ListBody).meta.total, 2);
});

test("LU-2: detail carries BOX quantities, timing events, timestamps, the event trail, and no invented SLA", async () => {
  const operation = await detail(supervisor, ids.loadTask);
  assert.equal(operation.status, "COMPLETED");
  assert.equal(operation.warehouse?.code, "DOCK-01");
  assert.equal(operation.planned_box_quantity, 120);
  assert.equal(operation.completed_box_quantity, 118);
  assert.ok(operation.started_at && operation.completed_at);
  assert.ok(Date.parse(operation.completed_at as string) >= Date.parse(operation.started_at as string));
  assert.deepEqual(operation.timing_events.map((event) => event.event_type), ["TASK_STARTED", "TASK_PAUSED", "TASK_RESUMED", "TASK_COMPLETED"]);
  assert.deepEqual(operation.activity?.map((event) => event.event_type), ["TASK_CREATED", "TASK_ASSIGNED", "TASK_STARTED", "TASK_PAUSED", "TASK_RESUMED", "TASK_COMPLETED"]);
  assert.equal(operation.sla.target_seconds, null);
  assert.equal(operation.sla.status, "NOT_DEFINED");
  assert.deepEqual(operation.assignees.map((assignee) => assignee.name), ["Lena Loader"]);
});

test("LU-3: invalid filters are rejected: unknown warehouse, unknown employee, unknown operation type", async () => {
  const warehouse = await get(supervisor, "/warehouse/operations?operation_type=LOADING&warehouse_code=NOPE");
  assert.equal(warehouse.status, 400);
  const warehouseBody = (await warehouse.json()) as ErrorBody;
  assert.equal(warehouseBody.code, "INVALID_WAREHOUSE");
  assert.equal(warehouseBody.errors?.[0]?.field, "warehouse_code");

  const employee = await get(supervisor, `/warehouse/operations?employee_id=${crypto.randomUUID()}`);
  assert.equal(employee.status, 400);
  assert.equal(((await employee.json()) as ErrorBody).code, "INVALID_EMPLOYEE");

  for (const query of ["operation_type=DOCKING", "operation_type=LOADING,DOCKING", "operation_type=,", "status=LOADED"]) {
    const res = await get(supervisor, `/warehouse/operations?${query}`);
    assert.equal(res.status, 400, query);
    assert.equal(((await res.json()) as ErrorBody).code, "VALIDATION_FAILED", query);
  }
  assert.equal((await get(supervisor, "/locations?warehouse_code=NOPE")).status, 400);
  assert.equal((await dockOperations(supervisor, "&warehouse_code=dock-01")).meta.total, 3);
});

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

test("LU-4: supervisor sees every dock operation; an employee only their own; another employee's is refused", async () => {
  assert.equal((await dockOperations(supervisor)).meta.total, 3);
  assert.deepEqual(new Set((await dockOperations(loader)).data.map((operation) => operation.id)), new Set([ids.loadTask, ids.freshLoad]));
  assert.deepEqual((await dockOperations(otherEmployee)).data.map((operation) => operation.id), [ids.unloadTask]);
  assert.equal((await get(loader, `/warehouse/operations/${ids.unloadTask}`)).status, 403);
  assert.equal((await get(loader, `/warehouse/operations?operation_type=UNLOADING&employee_id=${otherEmployee.employeeId}`)).status, 403);
});

test("LU-5: unauthenticated and role-less requests are rejected; client role claims are ignored", async () => {
  assert.equal((await get(null, "/warehouse/operations?operation_type=LOADING")).status, 401);
  assert.equal((await get(noRole, "/warehouse/operations?operation_type=LOADING")).status, 403);
  const forged = await fetch(`${serverUrl}/warehouse/operations?operation_type=LOADING`, { headers: { Cookie: noRole.cookie, "X-User-Role": "SUPERVISOR", "X-Permissions": "warehouse:read_all_operations" } });
  assert.equal(forged.status, 403);
  // An employee claiming a management role still gets only their own tasks.
  const claimed = await fetch(`${serverUrl}/warehouse/operations?operation_type=LOADING,UNLOADING`, { headers: { Cookie: otherEmployee.cookie, "X-User-Role": "SUPERVISOR" } });
  assert.deepEqual(((await claimed.json()) as ListBody).data.map((operation) => operation.id), [ids.unloadTask]);
});

// ---------------------------------------------------------------------------
// Existing lifecycle validation (the page's writes stay on /tasks/*)
// ---------------------------------------------------------------------------

test("LU-6: invalid task and invalid transitions are rejected by the existing lifecycle", async () => {
  assert.equal((await post(supervisor, `/tasks/${crypto.randomUUID()}/start`)).status, 404);
  const doneAgain = await post(supervisor, `/tasks/${ids.loadTask}/start`);
  assert.equal(doneAgain.status, 409);
  assert.equal(((await doneAgain.json()) as ErrorBody).code, "INVALID_TASK_STATE");
  const completeUnstarted = await post(supervisor, `/tasks/${ids.unloadTask}/complete`, { completed_box_quantity: 10 });
  assert.equal(completeUnstarted.status, 409);
  assert.equal((await post(supervisor, `/tasks/${ids.unloadTask}/pause`)).status, 409);
  // State is unchanged after the rejections.
  assert.equal((await detail(supervisor, ids.unloadTask)).status, "ASSIGNED");
});

test("LU-7: an employee cannot act on a dock task that is not assigned to them", async () => {
  const res = await post(loader, `/tasks/${ids.unloadTask}/start`);
  assert.equal(res.status, 403);
  assert.equal((await detail(supervisor, ids.unloadTask)).status, "ASSIGNED");
});

test("LU-8: negative and malformed BOX quantities are rejected; a valid completion shows up in the read model", async () => {
  assert.equal((await post(loader, `/tasks/${ids.freshLoad}/start`)).status, 200);
  for (const completed_box_quantity of [-1, "-5", 1.5, "abc", null]) {
    const res = await post(loader, `/tasks/${ids.freshLoad}/complete`, { completed_box_quantity });
    assert.equal(res.status, 400, JSON.stringify(completed_box_quantity));
  }
  let operation = await detail(loader, ids.freshLoad);
  assert.equal(operation.status, "IN_PROGRESS");
  assert.equal(operation.completed_box_quantity, null);
  assert.deepEqual(operation.timing_events.map((event) => event.event_type), ["TASK_STARTED"]);

  assert.equal((await post(loader, `/tasks/${ids.freshLoad}/complete`, { completed_box_quantity: 30 })).status, 200);
  operation = await detail(loader, ids.freshLoad);
  assert.equal(operation.status, "COMPLETED");
  assert.equal(operation.completed_box_quantity, 30);
  assert.deepEqual(operation.timing_events.map((event) => event.event_type), ["TASK_STARTED", "TASK_COMPLETED"]);
});
