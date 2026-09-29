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

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);
const PASSWORD = "Password123!";

let db: DatabaseConnection;
let serverUrl: string;
let stopServer: () => Promise<void>;
let tasks: TaskService;

interface Actor { userId: string; employeeId: string | null; cookie: string }
let empA: Actor;
let empB: Actor;
let supervisor: Actor;
let admin: Actor;
let noProfile: Actor;
let noRole: Actor;

const ids = {} as Record<"dep1" | "dep2" | "zoneA" | "locA1" | "locA2" | "locB1" | "item" | "batch" | "loadDone" | "unloadActive" | "pickAssigned" | "otherPending" | "untyped", string>;

interface Operation {
  id: string;
  task_code: string;
  task_type: string | null;
  operation_type: string;
  status: string;
  warehouse: { code: string; name: string } | null;
  source_location: { code: string } | null;
  destination_location: { code: string } | null;
  inventory_item: { product_code: string; name: string | null } | null;
  order: { order_code: string; priority: string } | null;
  assignees: Array<{ employee_id: string; name: string | null }>;
  planned_box_quantity: number | null;
  completed_box_quantity: number | null;
  timing_events: Array<{ event_type: string; event_at: string }>;
  sla: { target_seconds: null; status: string };
  activity?: Array<{ event_type: string; actor: string | null }>;
}
interface ListBody<T> { success: boolean; data: T[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }
interface ErrorBody { success: false; code: string }

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
async function list(actor: Actor, query = ""): Promise<ListBody<Operation>> {
  const res = await get(actor, `/warehouse/operations${query}`);
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as ListBody<Operation>;
}

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);
  await truncateAllTables(db);
  tasks = new TaskService({ database: db });

  const app = createApiApp({ database: db }); // real DatabaseRBACAuthorizationPolicy
  const server = app.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  stopServer = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  empA = await createActor("wo_emp_a", "EMPLOYEE", "Asha Rao");
  empB = await createActor("wo_emp_b", "EMPLOYEE", "Ravi Kumar");
  supervisor = await createActor("wo_sup", "SUPERVISOR", "Sam Supervisor");
  admin = await createActor("wo_admin", "ADMIN", null);
  noProfile = await createActor("wo_noprofile", "EMPLOYEE", null);
  noRole = await createActor("wo_norole", null, "Nobody");

  // Master data
  ids.dep1 = crypto.randomUUID();
  ids.dep2 = crypto.randomUUID();
  await db.insertInto("depots").values([
    { id: ids.dep1, code: "DEP-01", name: "Main Depot", active: true },
    { id: ids.dep2, code: "DEP-02", name: "Annex Depot", active: true }
  ]).execute();
  ids.zoneA = crypto.randomUUID();
  ids.locA1 = crypto.randomUUID();
  ids.locA2 = crypto.randomUUID();
  ids.locB1 = crypto.randomUUID();
  await db.insertInto("locations").values({ id: ids.zoneA, depot_id: ids.dep1, parent_location_id: null, code: "A", name: "Zone A", active: true }).execute();
  await db.insertInto("locations").values([
    { id: ids.locA1, depot_id: ids.dep1, parent_location_id: ids.zoneA, code: "A-01", name: "Receiving bay", active: true },
    { id: ids.locA2, depot_id: ids.dep1, parent_location_id: ids.zoneA, code: "A-02", name: "Dispatch hold", active: false },
    { id: ids.locB1, depot_id: ids.dep2, parent_location_id: null, code: "B-01", name: "Overflow", active: true }
  ]).execute();
  ids.item = crypto.randomUUID();
  ids.batch = crypto.randomUUID();
  await db.insertInto("inventory_items").values({ id: ids.item, product_code: "CB-500", name: "Corrugated box 500" }).execute();
  await db.insertInto("inventory_batches").values({ id: ids.batch, inventory_item_id: ids.item, batch_number: "B-1" }).execute();
  await db.insertInto("inventory_balances").values({ id: crypto.randomUUID(), inventory_batch_id: ids.batch, location_id: ids.locA1, box_quantity: "120" }).execute();

  // Tasks through the real TaskService (so events and assignments are genuine).
  const actor = supervisor.userId;
  const create = async (task_type: string | undefined, depot: string, planned: number, extra: Record<string, string> = {}) =>
    (await tasks.createTask({ depot_id: depot, ...(task_type ? { task_type } : {}), planned_box_quantity: planned, ...extra }, actor)).id;

  ids.loadDone = await create("LOADING", ids.dep1, 100, { inventory_item_id: ids.item, source_location_id: ids.locA1, destination_location_id: ids.locA2 });
  await tasks.assignTask({ task_id: ids.loadDone, employee_id: empA.employeeId as string }, actor);
  await tasks.startTask(ids.loadDone, actor);
  await tasks.pauseTask(ids.loadDone, actor);
  await tasks.resumeTask(ids.loadDone, actor);
  await tasks.completeTask({ task_id: ids.loadDone, completed_box_quantity: 90 }, actor);

  ids.unloadActive = await create("unloading", ids.dep2, 40);
  await tasks.assignTask({ task_id: ids.unloadActive, employee_id: empB.employeeId as string }, actor);
  await tasks.startTask(ids.unloadActive, actor);

  ids.pickAssigned = await create("PICKING", ids.dep1, 10);
  await tasks.assignTask({ task_id: ids.pickAssigned, employee_id: empA.employeeId as string }, actor);

  ids.otherPending = await create("UNPACKING", ids.dep1, 5);
  ids.untyped = await create(undefined, ids.dep2, 0);
});

after(async () => {
  if (stopServer) await stopServer();
  if (db) await cleanupTestDatabase(db);
});

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------

test("WO-I1: supervisor sees every task with joined references, BOX quantities, and no invented SLA", async () => {
  const body = await list(supervisor);
  assert.equal(body.success, true);
  assert.equal(body.meta.total, 5);
  const byId = new Map(body.data.map((operation) => [operation.id, operation]));

  const loading = byId.get(ids.loadDone)!;
  assert.equal(loading.task_code, `TSK-${ids.loadDone.replaceAll("-", "").slice(0, 8).toUpperCase()}`);
  assert.equal(loading.operation_type, "LOADING");
  assert.equal(loading.status, "COMPLETED");
  assert.deepEqual({ code: loading.warehouse?.code, name: loading.warehouse?.name }, { code: "DEP-01", name: "Main Depot" });
  assert.equal(loading.source_location?.code, "A-01");
  assert.equal(loading.destination_location?.code, "A-02");
  assert.equal(loading.inventory_item?.product_code, "CB-500");
  assert.equal(loading.planned_box_quantity, 100);
  assert.equal(loading.completed_box_quantity, 90);
  assert.deepEqual(loading.assignees.map((assignee) => assignee.name), ["Asha Rao"]);
  assert.deepEqual(loading.timing_events.map((event) => event.event_type), ["TASK_STARTED", "TASK_PAUSED", "TASK_RESUMED", "TASK_COMPLETED"]);
  assert.equal(loading.sla.target_seconds, null);
  assert.equal(loading.sla.status, "NOT_DEFINED");

  assert.equal(byId.get(ids.unloadActive)?.operation_type, "UNLOADING"); // "unloading" normalised
  assert.equal(byId.get(ids.otherPending)?.operation_type, "OTHER"); // UNPACKING is not guessed
  assert.equal(byId.get(ids.untyped)?.operation_type, "OTHER");
  assert.equal(byId.get(ids.untyped)?.planned_box_quantity, 0);
  assert.deepEqual(byId.get(ids.otherPending)?.assignees, []);
});

test("WO-I2: admin and supervisor share the unscoped (management) view", async () => {
  assert.equal((await list(admin)).meta.total, 5);
});

test("WO-I3: loading and unloading filters use the operation classification", async () => {
  assert.deepEqual((await list(supervisor, "?operation_type=LOADING")).data.map((operation) => operation.id), [ids.loadDone]);
  assert.deepEqual((await list(supervisor, "?operation_type=UNLOADING")).data.map((operation) => operation.id), [ids.unloadActive]);
  assert.deepEqual(new Set((await list(supervisor, "?operation_type=OTHER")).data.map((operation) => operation.id)), new Set([ids.otherPending, ids.untyped]));
});

test("WO-I4: status, warehouse, employee, and search filters", async () => {
  assert.deepEqual((await list(supervisor, "?status=IN_PROGRESS")).data.map((operation) => operation.id), [ids.unloadActive]);
  assert.equal((await list(supervisor, "?warehouse_code=dep-02")).meta.total, 2);
  assert.deepEqual(new Set((await list(supervisor, `?employee_id=${empA.employeeId}`)).data.map((operation) => operation.id)), new Set([ids.loadDone, ids.pickAssigned]));
  assert.deepEqual((await list(supervisor, "?search=Ravi")).data.map((operation) => operation.id), [ids.unloadActive]);
  assert.deepEqual((await list(supervisor, "?search=CB-500")).data.map((operation) => operation.id), [ids.loadDone]);
  const code = `TSK-${ids.pickAssigned.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  assert.deepEqual((await list(supervisor, `?search=${code}`)).data.map((operation) => operation.id), [ids.pickAssigned]);
  assert.equal((await list(supervisor, "?search=%25")).meta.total, 0); // LIKE wildcards are literal
});

test("WO-I5: pagination is done in SQL with standard page meta", async () => {
  const first = await list(supervisor, "?page=1&pageSize=2");
  const third = await list(supervisor, "?page=3&pageSize=2");
  assert.equal(first.data.length, 2);
  assert.deepEqual(first.meta, { page: 1, pageSize: 2, total: 5, totalPages: 3, hasNext: true, hasPrevious: false } as never);
  assert.equal(third.data.length, 1);
  const all = [...first.data, ...(await list(supervisor, "?page=2&pageSize=2")).data, ...third.data].map((operation) => operation.id);
  assert.equal(new Set(all).size, 5);
});

test("WO-I6: invalid filters are 400 validation errors", async () => {
  for (const query of ["?status=STARTED", "?operation_type=DOCKING", "?employee_id=abc", "?page=0"]) {
    const res = await get(supervisor, `/warehouse/operations${query}`);
    assert.equal(res.status, 400, query);
    assert.equal(((await res.json()) as ErrorBody).code, "VALIDATION_FAILED");
  }
});

// ---------------------------------------------------------------------------
// Scope and authorization
// ---------------------------------------------------------------------------

test("WO-I7: an employee sees only tasks actively assigned to them, and cannot widen scope with filters", async () => {
  const own = await list(empA);
  assert.deepEqual(new Set(own.data.map((operation) => operation.id)), new Set([ids.loadDone, ids.pickAssigned]));
  assert.equal(own.meta.total, 2);
  // Asking for another employee's tasks is refused outright (never their data).
  const other = await get(empA, `/warehouse/operations?employee_id=${empB.employeeId}`);
  assert.equal(other.status, 403);
  assert.equal(((await other.json()) as ErrorBody).code, "FORBIDDEN");
  // Naming yourself is allowed.
  assert.equal((await list(empA, `?employee_id=${empA.employeeId}`)).meta.total, 2);
  assert.deepEqual((await list(empB)).data.map((operation) => operation.id), [ids.unloadActive]);
});

test("WO-I8: approved user without an employee profile gets an empty directory", async () => {
  const body = await list(noProfile);
  assert.deepEqual(body.data, []);
  assert.equal(body.meta.total, 0);
});

test("WO-I9: unauthenticated is 401 and users without an approved role are 403", async () => {
  assert.equal((await get(null, "/warehouse/operations")).status, 401);
  assert.equal((await get(null, `/warehouse/operations/${ids.loadDone}`)).status, 401);
  assert.equal((await get(null, "/locations")).status, 401);
  assert.equal((await get(noRole, "/warehouse/operations")).status, 403);
  assert.equal((await get(noRole, "/locations")).status, 403);
});

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

test("WO-I10: detail includes the full activity timeline with actors", async () => {
  const res = await get(supervisor, `/warehouse/operations/${ids.loadDone}`);
  assert.equal(res.status, 200);
  const data = ((await res.json()) as { data: Operation }).data;
  assert.equal(data.id, ids.loadDone);
  assert.deepEqual(data.activity?.map((event) => event.event_type), ["TASK_CREATED", "TASK_ASSIGNED", "TASK_STARTED", "TASK_PAUSED", "TASK_RESUMED", "TASK_COMPLETED"]);
  assert.ok(data.activity?.every((event) => event.actor === "Sam Supervisor"));
});

test("WO-I11: detail scope: own task 200, someone else's 403, missing 403 for employees and 404 for management, bad id 400", async () => {
  assert.equal((await get(empA, `/warehouse/operations/${ids.loadDone}`)).status, 200);
  assert.equal((await get(empA, `/warehouse/operations/${ids.unloadActive}`)).status, 403);
  assert.equal((await get(empA, `/warehouse/operations/${crypto.randomUUID()}`)).status, 403);
  assert.equal((await get(noProfile, `/warehouse/operations/${ids.loadDone}`)).status, 403);
  const missing = await get(supervisor, `/warehouse/operations/${crypto.randomUUID()}`);
  assert.equal(missing.status, 404);
  assert.equal(((await missing.json()) as ErrorBody).code, "NOT_FOUND");
  assert.equal((await get(supervisor, "/warehouse/operations/not-a-uuid")).status, 400);
});

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

interface LocationBody { id: string; code: string; name: string; active: boolean; warehouse: { code: string; name: string }; parent: { code: string } | null; box_on_hand: number }

test("WO-I12: locations list existing rows with depot, parent, and real BOX on hand", async () => {
  const res = await get(supervisor, "/locations");
  assert.equal(res.status, 200);
  const body = (await res.json()) as ListBody<LocationBody>;
  assert.equal(body.meta.total, 4);
  assert.deepEqual(body.data.map((location) => location.code), ["A", "A-01", "A-02", "B-01"]); // depot code, then location code
  const a1 = body.data.find((location) => location.code === "A-01")!;
  assert.deepEqual({ depot: a1.warehouse.code, parent: a1.parent?.code, box: a1.box_on_hand, active: a1.active }, { depot: "DEP-01", parent: "A", box: 120, active: true });
  assert.equal(body.data.find((location) => location.code === "B-01")?.parent, null);
  assert.equal(body.data.find((location) => location.code === "B-01")?.box_on_hand, 0);
});

test("WO-I13: location filters, pagination, and validation", async () => {
  const filtered = (await (await get(supervisor, "/locations?warehouse_code=dep-02")).json()) as ListBody<LocationBody>;
  assert.deepEqual(filtered.data.map((location) => location.code), ["B-01"]);
  const inactive = (await (await get(supervisor, "/locations?active=false")).json()) as ListBody<LocationBody>;
  assert.deepEqual(inactive.data.map((location) => location.code), ["A-02"]);
  const search = (await (await get(supervisor, "/locations?search=receiving")).json()) as ListBody<LocationBody>;
  assert.deepEqual(search.data.map((location) => location.code), ["A-01"]);
  const paged = (await (await get(supervisor, "/locations?page=2&pageSize=3")).json()) as ListBody<LocationBody>;
  assert.equal(paged.data.length, 1);
  assert.equal(paged.meta.totalPages, 2);
  assert.equal((await get(supervisor, "/locations?active=maybe")).status, 400);
});

test("WO-I14: employees can read locations (master data), and the /api prefix works", async () => {
  assert.equal((await get(empA, "/locations")).status, 200);
  assert.equal((await get(supervisor, "/api/warehouse/operations?pageSize=1")).status, 200);
});

test("WO-I15: the existing task routes are unchanged", async () => {
  const res = await get(supervisor, "/tasks");
  assert.equal(res.status, 200);
  const body = (await res.json()) as ListBody<Record<string, unknown>>;
  assert.equal(body.meta.total, 5);
  assert.equal("task_code" in (body.data[0] ?? {}), false); // raw task records, as before
});
