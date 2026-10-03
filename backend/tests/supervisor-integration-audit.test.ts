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
 * Final audit: one role matrix across every endpoint behind the five Supervisor
 * pages (Warehouse operations, Locations, Loading & unloading, KPI configuration,
 * KPI results), using the real DatabaseRBACAuthorizationPolicy and real sessions.
 */

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);
const PASSWORD = "Password123!";

let db: DatabaseConnection;
let serverUrl: string;
let stopServer: () => Promise<void>;

type RoleName = "EMPLOYEE" | "SUPERVISOR" | "ADMIN" | "SUPER_ADMIN";
const actors = {} as Record<RoleName, { cookie: string; employeeId: string }>;
const ids = {} as Record<"ownLoad" | "otherUnload" | "kpi", string>;

async function createActor(role: RoleName): Promise<{ cookie: string; employeeId: string }> {
  const userId = crypto.randomUUID();
  const login = `audit_${role.toLowerCase()}`;
  await db.insertInto("users").values({ id: userId, login_identifier: login, password_hash: await bcrypt.hash(PASSWORD, 4), is_active: true }).execute();
  const existing = await db.selectFrom("access_roles").select("id").where("code", "=", role).executeTakeFirst();
  const roleId = existing?.id ?? crypto.randomUUID();
  if (!existing) await db.insertInto("access_roles").values({ id: roleId, code: role, name: role, active: true }).execute();
  await db.insertInto("user_access_roles").values({ id: crypto.randomUUID(), user_id: userId, role_id: roleId, assigned_at: new Date(), assigned_by_user_id: userId, revoked_at: null, revoked_by_user_id: null, version: "1" }).execute();
  const employeeId = crypto.randomUUID();
  await db.insertInto("employees").values({ id: employeeId, user_id: userId, employee_code: `EMP-${role}`, name: `${role} user`, is_active: true }).execute();
  const res = await fetch(`${serverUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login_identifier: login, password: PASSWORD }) });
  assert.equal(res.status, 200);
  return { cookie: res.headers.get("set-cookie") as string, employeeId };
}

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);
  await truncateAllTables(db);
  const app = createApiApp({ database: db });
  const server = app.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  stopServer = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  for (const role of ["EMPLOYEE", "SUPERVISOR", "ADMIN", "SUPER_ADMIN"] as const) actors[role] = await createActor(role);

  const depot = crypto.randomUUID();
  await db.insertInto("depots").values({ id: depot, code: "AUD-01", name: "Audit Depot", active: true }).execute();
  await db.insertInto("locations").values({ id: crypto.randomUUID(), depot_id: depot, parent_location_id: null, code: "L-01", name: "Bay", active: true }).execute();
  const tasks = new TaskService({ database: db });
  // Everyone in this audit works at AUD-01 (supervisors are depot-confined).
  await db.updateTable("employees").set({ depot_id: depot }).execute();
  const actorUser = (await db.selectFrom("users").select("id").where("login_identifier", "=", "audit_supervisor").executeTakeFirstOrThrow()).id;
  ids.ownLoad = (await tasks.createTask({ depot_id: depot, task_type: "LOADING", planned_box_quantity: 10 }, actorUser)).id;
  await tasks.assignTask({ task_id: ids.ownLoad, employee_id: actors.EMPLOYEE.employeeId }, actorUser);
  ids.otherUnload = (await tasks.createTask({ depot_id: depot, task_type: "UNLOADING", planned_box_quantity: 20 }, actorUser)).id;
  await tasks.assignTask({ task_id: ids.otherUnload, employee_id: actors.SUPERVISOR.employeeId }, actorUser);
  await tasks.createTask({ depot_id: depot, task_type: "PICKING", planned_box_quantity: 5 }, actorUser);
  ids.kpi = crypto.randomUUID();
  await db.insertInto("kpi_definitions").values({ id: ids.kpi, code: "AUDIT_KPI", name: "Audit KPI", pillar: null, description: null, unit: "BOX", formula_reference: null, active: true, effective_from: null, effective_to: null }).execute();
});

after(async () => {
  if (stopServer) await stopServer();
  if (db) await cleanupTestDatabase(db);
});

async function status(role: RoleName | null, path: string, headers: Record<string, string> = {}): Promise<number> {
  const res = await fetch(`${serverUrl}${path}`, { headers: { ...(role ? { Cookie: actors[role].cookie } : {}), ...headers } });
  await res.arrayBuffer();
  return res.status;
}
async function total(role: RoleName, path: string): Promise<number> {
  const res = await fetch(`${serverUrl}${path}`, { headers: { Cookie: actors[role].cookie } });
  assert.equal(res.status, 200, `${role} ${path}`);
  return ((await res.json()) as { meta: { total: number } }).meta.total;
}

test("AUDIT-1: management roles see every record of their reach on every Supervisor surface (all records here are in the supervisor's depot)", async () => {
  for (const role of ["SUPERVISOR", "ADMIN", "SUPER_ADMIN"] as const) {
    assert.equal(await total(role, "/warehouse/operations"), 3, `${role} warehouse`);
    assert.equal(await total(role, "/warehouse/operations?operation_type=LOADING,UNLOADING"), 2, `${role} dock`);
    assert.equal(await status(role, `/warehouse/operations/${ids.ownLoad}`), 200, `${role} detail`);
    assert.equal(await total(role, "/locations"), 1, `${role} locations`);
    if (role === "SUPERVISOR") {
      // Product access matrix: KPI Configuration is Super Admin/Admin only.
      assert.equal(await status(role, "/kpi/definitions"), 403, `${role} kpi config`);
      assert.equal(await status(role, `/kpi/definitions/${ids.kpi}`), 403, `${role} kpi config detail`);
    } else {
      assert.equal(await total(role, "/kpi/definitions"), 1, `${role} kpi config`);
      assert.equal(await status(role, `/kpi/definitions/${ids.kpi}`), 200, `${role} kpi config detail`);
    }
    assert.equal(await status(role, "/kpis"), 200, `${role} kpi snapshots`);
    assert.equal(await status(role, "/kpi/results"), 200, `${role} kpi results`);
  }
});

test("AUDIT-2: EMPLOYEE is scoped to own tasks, may read locations, and is denied KPI configuration", async () => {
  assert.equal(await total("EMPLOYEE", "/warehouse/operations"), 1);
  assert.equal(await total("EMPLOYEE", "/warehouse/operations?operation_type=LOADING,UNLOADING"), 1);
  assert.equal(await status("EMPLOYEE", `/warehouse/operations/${ids.ownLoad}`), 200);
  assert.equal(await status("EMPLOYEE", `/warehouse/operations/${ids.otherUnload}`), 403);
  assert.equal(await status("EMPLOYEE", `/warehouse/operations?employee_id=${actors.SUPERVISOR.employeeId}`), 403);
  assert.equal(await total("EMPLOYEE", "/locations"), 1);
  assert.equal(await status("EMPLOYEE", "/kpi/definitions"), 403);
  assert.equal(await status("EMPLOYEE", `/kpi/definitions/${ids.kpi}`), 403);
  // Existing semantics, unchanged: kpi:read (snapshots) is open to every approved role.
  assert.equal(await status("EMPLOYEE", "/kpis"), 200);
  // KPI results: own only; naming another employee is refused.
  assert.equal(await status("EMPLOYEE", "/kpi/results"), 200);
  assert.equal(await status("EMPLOYEE", `/kpi/results?employee_id=${actors.SUPERVISOR.employeeId}`), 403);
});

test("AUDIT-3: identity and role come only from the server session", async () => {
  const forged = { "X-User-Role": "SUPER_ADMIN", "X-User-Id": "someone-else", "X-Permissions": "*", Authorization: "Bearer not-a-real-token" };
  for (const path of ["/warehouse/operations", "/locations", "/kpi/definitions", "/kpis", "/kpi/results"]) {
    assert.equal(await status(null, path, forged), 401, `anonymous ${path}`);
  }
  // An employee cookie plus forged headers is still an employee.
  assert.equal(await status("EMPLOYEE", "/kpi/definitions", forged), 403);
  const res = await fetch(`${serverUrl}/warehouse/operations`, { headers: { Cookie: actors.EMPLOYEE.cookie, ...forged } });
  assert.equal(((await res.json()) as { meta: { total: number } }).meta.total, 1);
});

test("AUDIT-4: a revoked or logged-out session loses access everywhere", async () => {
  const login = await fetch(`${serverUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login_identifier: "audit_supervisor", password: PASSWORD }) });
  const cookie = login.headers.get("set-cookie") as string;
  assert.equal((await fetch(`${serverUrl}/warehouse/operations`, { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(`${serverUrl}/auth/logout`, { method: "POST", headers: { Cookie: cookie } })).status, 200);
  for (const path of ["/warehouse/operations", "/locations", "/kpi/definitions"]) {
    assert.equal((await fetch(`${serverUrl}${path}`, { headers: { Cookie: cookie } })).status, 401, path);
  }
});
