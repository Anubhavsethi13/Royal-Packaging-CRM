import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before } from "node:test";
import bcrypt from "bcryptjs";
import type { DatabaseConnection } from "@royal-packaging/db";
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
 * Layer-photo capturer identity: session → user → active employee profile.
 * A captured_by_employee_id in the body can only repeat the caller's own
 * employee; anything else is refused. Depot isolation and task assignment
 * rules still apply.
 */

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);
const PASSWORD = "Password123!";
type Key = "a1" | "a2" | "b1" | "supA" | "supB" | "adminNoProfile" | "noRole";

let db: DatabaseConnection;
let serverUrl: string;
let stopServer: () => Promise<void>;
const actors = {} as Record<Key, { cookie: string; userId: string; employeeId: string | null }>;
const ids = {} as Record<"depA" | "depB" | "taskA" | "taskB", string>;

async function createActor(key: Key, role: string | null, depotId: string | null, withEmployee = true): Promise<void> {
  const userId = crypto.randomUUID();
  await db.insertInto("users").values({ id: userId, login_identifier: `ph_${key}`, password_hash: await bcrypt.hash(PASSWORD, 4), is_active: true }).execute();
  if (role) {
    const existing = await db.selectFrom("access_roles").select("id").where("code", "=", role).executeTakeFirst();
    const roleId = existing?.id ?? crypto.randomUUID();
    if (!existing) await db.insertInto("access_roles").values({ id: roleId, code: role, name: role, active: true }).execute();
    await db.insertInto("user_access_roles").values({ id: crypto.randomUUID(), user_id: userId, role_id: roleId, assigned_at: new Date(), assigned_by_user_id: userId, revoked_at: null, revoked_by_user_id: null, version: "1" }).execute();
  }
  let employeeId: string | null = null;
  if (withEmployee) {
    employeeId = crypto.randomUUID();
    await db.insertInto("employees").values({ id: employeeId, user_id: userId, employee_code: `EMP-${key}`, name: key, depot_id: depotId, is_active: true }).execute();
  }
  const res = await fetch(`${serverUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login_identifier: `ph_${key}`, password: PASSWORD }) });
  assert.equal(res.status, 200, key);
  actors[key] = { cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] as string, userId, employeeId };
}

async function photo(actor: Key | null, taskId: string, extra: Record<string, unknown> = {}): Promise<{ status: number; code?: string; data?: { captured_by_employee_id: string | null } }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (actor) headers.Cookie = actors[actor].cookie;
  const res = await fetch(`${serverUrl}/tasks/${taskId}/photos`, {
    method: "POST",
    headers,
    body: JSON.stringify({ layer_number: Math.floor(Math.random() * 1_000_000) + 1, box_quantity: 10, storage_key: `layers/${crypto.randomUUID()}.jpg`, ...extra })
  });
  const body = (await res.json()) as { code?: string; data?: { captured_by_employee_id: string | null } };
  return { status: res.status, ...(body.code ? { code: body.code } : {}), ...(body.data ? { data: body.data } : {}) };
}
const photoCount = async () => (await db.selectFrom("task_photos").select("id").execute()).length;

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);
  await truncateAllTables(db);
  const server = createApiApp({ database: db }).createServer(); // real DatabaseRBACAuthorizationPolicy
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  stopServer = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  ids.depA = crypto.randomUUID();
  ids.depB = crypto.randomUUID();
  await db.insertInto("depots").values([{ id: ids.depA, code: "PH-A", name: "Photo A", active: true }, { id: ids.depB, code: "PH-B", name: "Photo B", active: true }]).execute();
  await createActor("a1", "EMPLOYEE", ids.depA);
  await createActor("a2", "EMPLOYEE", ids.depA);
  await createActor("b1", "EMPLOYEE", ids.depB);
  await createActor("supA", "SUPERVISOR", ids.depA);
  await createActor("supB", "SUPERVISOR", ids.depB);
  await createActor("adminNoProfile", "ADMIN", null, false);
  await createActor("noRole", null, ids.depA);

  // One task per depot, each assigned to that depot's first employee (through the API).
  for (const [key, sup, employee] of [["taskA", "supA", "a1"], ["taskB", "supB", "b1"]] as const) {
    const created = await fetch(`${serverUrl}/tasks`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: actors[sup].cookie }, body: JSON.stringify({ task_type: "LOADING", planned_box_quantity: 20 }) });
    assert.equal(created.status, 201);
    ids[key] = ((await created.json()) as { data: { id: string } }).data.id;
    const assigned = await fetch(`${serverUrl}/tasks/${ids[key]}/assignments`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: actors[sup].cookie }, body: JSON.stringify({ employee_id: actors[employee].employeeId }) });
    assert.equal(assigned.status, 200);
  }
});

after(async () => {
  if (stopServer) await stopServer();
  if (db) await cleanupTestDatabase(db);
});

test("PH-1: an authenticated employee records their own photo; the capturer comes from the session", async () => {
  const implicit = await photo("a1", ids.taskA);
  assert.equal(implicit.status, 201, JSON.stringify(implicit));
  assert.equal(implicit.data?.captured_by_employee_id, actors.a1.employeeId);
  // Repeating one's own employee id is accepted (compatibility), never required.
  const explicit = await photo("a1", ids.taskA, { captured_by_employee_id: actors.a1.employeeId });
  assert.equal(explicit.status, 201);
  assert.equal(explicit.data?.captured_by_employee_id, actors.a1.employeeId);
});

test("PH-2: an employee cannot record a photo as another employee", async () => {
  const before = await photoCount();
  for (const other of [actors.a2.employeeId, actors.b1.employeeId, crypto.randomUUID()]) {
    const res = await photo("a1", ids.taskA, { captured_by_employee_id: other });
    assert.equal(res.status, 403, String(other));
    assert.equal(res.code, "FORBIDDEN");
  }
  assert.equal(await photoCount(), before, "nothing written");
});

test("PH-3: unauthorized callers are refused", async () => {
  const before = await photoCount();
  assert.equal((await photo(null, ids.taskA)).status, 401);
  assert.equal((await photo("noRole", ids.taskA)).status, 403);
  // An employee who is not assigned to the task cannot add evidence to it.
  assert.equal((await photo("a2", ids.taskA)).status, 403);
  // An account without an employee profile has no capturer identity.
  const noProfile = await photo("adminNoProfile", ids.taskA);
  assert.equal(noProfile.status, 403);
  assert.equal(noProfile.code, "EMPLOYEE_PROFILE_REQUIRED");
  assert.equal(await photoCount(), before, "nothing written");
});

test("PH-4: a supervisor records evidence as themselves, never on behalf of an employee", async () => {
  const own = await photo("supA", ids.taskA);
  assert.equal(own.status, 201);
  assert.equal(own.data?.captured_by_employee_id, actors.supA.employeeId);
  // No contract allows capturing on behalf of someone else.
  const onBehalf = await photo("supA", ids.taskA, { captured_by_employee_id: actors.a1.employeeId });
  assert.equal(onBehalf.status, 403);
});

test("PH-5: cross-depot tasks: supervisors record as themselves; employee-id and task manipulation is refused", async () => {
  // Supervisors have organization-wide task scope (V1 decision D5/D6): another depot's task is
  // allowed, but the photo is always recorded against the supervisor's own profile.
  const before = await photoCount();
  const otherDepotTask = await photo("supA", ids.taskB);
  assert.equal(otherDepotTask.status, 201, JSON.stringify(otherDepotTask));
  assert.equal(otherDepotTask.data?.captured_by_employee_id, actors.supA.employeeId);
  const forgedA = await photo("supA", ids.taskA, { captured_by_employee_id: actors.b1.employeeId });
  assert.equal(forgedA.status, 403);
  assert.equal(forgedA.code, "FORBIDDEN");
  const forgedB = await photo("supB", ids.taskA, { captured_by_employee_id: actors.b1.employeeId });
  assert.equal(forgedB.status, 403);
  assert.equal(forgedB.code, "FORBIDDEN");
  // Others: only tasks they are assigned to, only as themselves.
  assert.equal((await photo("a1", ids.taskB)).status, 403);
  assert.equal((await photo("b1", ids.taskA, { captured_by_employee_id: actors.a1.employeeId })).status, 403);
  assert.equal(await photoCount(), before + 1, "only the supervisor's own photo is written");
  // Every stored photo names its real capturer.
  const rows = await db.selectFrom("task_photos").select(["captured_by_employee_id"]).execute();
  assert.ok(rows.every((row) => row.captured_by_employee_id === actors.a1.employeeId || row.captured_by_employee_id === actors.supA.employeeId));
});
