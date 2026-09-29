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

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);
const PASSWORD = "Password123!";

let db: DatabaseConnection;
let serverUrl: string;
let stopServer: () => Promise<void>;

interface Actor { cookie: string }
let supervisor: Actor;
let admin: Actor;
let superAdmin: Actor;
let employee: Actor;
let noRole: Actor;

const ids = {} as Record<"dep1" | "active" | "scheduled" | "expired" | "inactive" | "tCurrentGlobal" | "tCurrentDepot" | "tOld" | "tFuture", string>;

interface Target { id: string; target_value: string; warning_threshold: string | null; critical_threshold: string | null; warehouse: { code: string } | null; is_current: boolean; effective_from: string; effective_to: string | null }
interface Definition { id: string; code: string; name: string; pillar: string | null; unit: string | null; formula_reference: string | null; status: string; active: boolean; current_targets: Target[]; target_count: number; targets?: Target[] }
interface ListBody { success: boolean; data: Definition[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }
interface ErrorBody { success: false; code: string }

async function createActor(login: string, role: string | null): Promise<Actor> {
  const userId = crypto.randomUUID();
  await db.insertInto("users").values({ id: userId, login_identifier: login, password_hash: await bcrypt.hash(PASSWORD, 4), is_active: true }).execute();
  if (role) {
    const existing = await db.selectFrom("access_roles").select("id").where("code", "=", role).executeTakeFirst();
    const roleId = existing?.id ?? crypto.randomUUID();
    if (!existing) await db.insertInto("access_roles").values({ id: roleId, code: role, name: role, active: true }).execute();
    await db.insertInto("user_access_roles").values({ id: crypto.randomUUID(), user_id: userId, role_id: roleId, assigned_at: new Date(), assigned_by_user_id: userId, revoked_at: null, revoked_by_user_id: null, version: "1" }).execute();
  }
  const res = await fetch(`${serverUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login_identifier: login, password: PASSWORD }) });
  assert.equal(res.status, 200, `login ${login}`);
  return { cookie: res.headers.get("set-cookie") as string };
}

async function get(actor: Actor | null, path: string): Promise<Response> {
  return fetch(`${serverUrl}${path}`, { headers: actor ? { Cookie: actor.cookie } : {} });
}
async function list(actor: Actor, query = ""): Promise<ListBody> {
  const res = await get(actor, `/kpi/definitions${query}`);
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as ListBody;
}

const day = 24 * 3600 * 1000;
const at = (offsetDays: number) => new Date(Date.now() + offsetDays * day);

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

  supervisor = await createActor("kc_sup", "SUPERVISOR");
  admin = await createActor("kc_admin", "ADMIN");
  superAdmin = await createActor("kc_root", "SUPER_ADMIN");
  employee = await createActor("kc_emp", "EMPLOYEE");
  noRole = await createActor("kc_norole", null);
});

after(async () => {
  if (stopServer) await stopServer();
  if (db) await cleanupTestDatabase(db);
});

async function seedConfiguration(): Promise<void> {
  ids.dep1 = crypto.randomUUID();
  await db.insertInto("depots").values({ id: ids.dep1, code: "DEP-01", name: "Main Depot", active: true }).execute();
  for (const key of ["active", "scheduled", "expired", "inactive"] as const) ids[key] = crypto.randomUUID();
  await db.insertInto("kpi_definitions").values([
    { id: ids.active, code: "BOXES_HANDLED", name: "Boxes handled", pillar: "PRODUCTIVITY", description: "Completed BOX per period", unit: "BOX", formula_reference: "SUM(completed_box_quantity)", active: true, effective_from: at(-30), effective_to: null },
    { id: ids.scheduled, code: "DAMAGE_RATE", name: "Damage rate", pillar: "QUALITY", description: null, unit: "PERCENTAGE", formula_reference: null, active: true, effective_from: at(30), effective_to: null },
    { id: ids.expired, code: "LEGACY_PICK", name: "Legacy pick rate", pillar: "PRODUCTIVITY", description: null, unit: "BOX", formula_reference: null, active: true, effective_from: at(-90), effective_to: at(-10) },
    { id: ids.inactive, code: "OLD_TURNAROUND", name: "Dock turnaround", pillar: null, description: null, unit: null, formula_reference: null, active: false, effective_from: null, effective_to: null }
  ]).execute();
  ids.tCurrentGlobal = crypto.randomUUID();
  ids.tCurrentDepot = crypto.randomUUID();
  ids.tOld = crypto.randomUUID();
  ids.tFuture = crypto.randomUUID();
  await db.insertInto("kpi_targets").values([
    { id: ids.tOld, kpi_definition_id: ids.active, target_value: "400", warning_threshold: "350", critical_threshold: "300", effective_from: at(-60), effective_to: at(-31), depot_id: null },
    { id: ids.tCurrentGlobal, kpi_definition_id: ids.active, target_value: "500.25", warning_threshold: "450", critical_threshold: null, effective_from: at(-30), effective_to: null, depot_id: null },
    { id: ids.tCurrentDepot, kpi_definition_id: ids.active, target_value: "650", warning_threshold: null, critical_threshold: null, effective_from: at(-5), effective_to: at(5), depot_id: ids.dep1 },
    { id: ids.tFuture, kpi_definition_id: ids.active, target_value: "700", warning_threshold: null, critical_threshold: null, effective_from: at(10), effective_to: null, depot_id: null }
  ]).execute();
}

// Run first: nothing is seeded into kpi_definitions by default, so an empty configuration must be a valid, honest state.
test("KC-I1: with no KPI definitions configured, the list is empty (not an error)", async () => {
  const body = await list(supervisor);
  assert.equal(body.success, true);
  assert.deepEqual(body.data, []);
  assert.deepEqual(body.meta, { page: 1, pageSize: 25, total: 0, totalPages: 0, hasNext: false, hasPrevious: false } as never);
});

test("KC-I2: definitions are returned with derived status and only their current targets", async () => {
  await seedConfiguration();
  const body = await list(supervisor);
  assert.equal(body.meta.total, 4);
  assert.deepEqual(body.data.map((definition) => definition.code), ["BOXES_HANDLED", "DAMAGE_RATE", "LEGACY_PICK", "OLD_TURNAROUND"]);
  const byCode = new Map(body.data.map((definition) => [definition.code, definition]));
  assert.equal(byCode.get("BOXES_HANDLED")?.status, "ACTIVE");
  assert.equal(byCode.get("DAMAGE_RATE")?.status, "SCHEDULED");
  assert.equal(byCode.get("LEGACY_PICK")?.status, "EXPIRED");
  assert.equal(byCode.get("OLD_TURNAROUND")?.status, "INACTIVE");

  const boxes = byCode.get("BOXES_HANDLED")!;
  assert.equal(boxes.unit, "BOX");
  assert.equal(boxes.formula_reference, "SUM(completed_box_quantity)");
  assert.equal(boxes.target_count, 4);
  assert.deepEqual(new Set(boxes.current_targets.map((target) => target.id)), new Set([ids.tCurrentGlobal, ids.tCurrentDepot]));
  const global = boxes.current_targets.find((target) => target.id === ids.tCurrentGlobal)!;
  assert.deepEqual({ value: global.target_value, warning: global.warning_threshold, critical: global.critical_threshold, warehouse: global.warehouse }, { value: "500.25", warning: "450", critical: null, warehouse: null });
  assert.equal(boxes.current_targets.find((target) => target.id === ids.tCurrentDepot)?.warehouse?.code, "DEP-01");
  assert.deepEqual(byCode.get("OLD_TURNAROUND")?.current_targets, []);
});

test("KC-I3: status, pillar, and search filters, plus pagination", async () => {
  for (const [status, codes] of [["ACTIVE", ["BOXES_HANDLED"]], ["SCHEDULED", ["DAMAGE_RATE"]], ["EXPIRED", ["LEGACY_PICK"]], ["INACTIVE", ["OLD_TURNAROUND"]]] as const) {
    assert.deepEqual((await list(supervisor, `?status=${status}`)).data.map((definition) => definition.code), codes, status);
  }
  assert.deepEqual((await list(supervisor, "?pillar=productivity")).data.map((definition) => definition.code), ["BOXES_HANDLED", "LEGACY_PICK"]);
  assert.deepEqual((await list(supervisor, "?search=damage")).data.map((definition) => definition.code), ["DAMAGE_RATE"]);
  assert.equal((await list(supervisor, "?search=%25")).meta.total, 0);
  const page2 = await list(supervisor, "?page=2&pageSize=3");
  assert.deepEqual(page2.data.map((definition) => definition.code), ["OLD_TURNAROUND"]);
  assert.equal(page2.meta.totalPages, 2);
});

test("KC-I4: detail returns the full target and threshold history, newest first", async () => {
  const res = await get(supervisor, `/kpi/definitions/${ids.active}`);
  assert.equal(res.status, 200);
  const data = ((await res.json()) as { data: Definition }).data;
  assert.deepEqual(data.targets?.map((target) => target.id), [ids.tFuture, ids.tCurrentDepot, ids.tCurrentGlobal, ids.tOld]);
  assert.deepEqual(data.targets?.map((target) => target.is_current), [false, true, true, false]);
  assert.equal(data.targets?.[3]?.critical_threshold, "300");
});

test("KC-I5: invalid requests: bad id, missing definition, invalid filters", async () => {
  assert.equal((await get(supervisor, "/kpi/definitions/not-a-uuid")).status, 400);
  const missing = await get(supervisor, `/kpi/definitions/${crypto.randomUUID()}`);
  assert.equal(missing.status, 404);
  assert.equal(((await missing.json()) as ErrorBody).code, "NOT_FOUND");
  for (const query of ["?status=DRAFT", "?pageSize=0", `?search=${"x".repeat(101)}`]) {
    const res = await get(supervisor, `/kpi/definitions${query}`);
    assert.equal(res.status, 400, query);
    assert.equal(((await res.json()) as ErrorBody).code, "VALIDATION_FAILED", query);
  }
});

test("KC-I6: management roles can read configuration; employees, role-less and anonymous users cannot", async () => {
  for (const actor of [supervisor, admin, superAdmin]) {
    assert.equal((await list(actor)).meta.total, 4);
  }
  for (const path of ["/kpi/definitions", `/kpi/definitions/${ids.active}`]) {
    assert.equal((await get(employee, path)).status, 403, path);
    assert.equal((await get(noRole, path)).status, 403, path);
    assert.equal((await get(null, path)).status, 401, path);
  }
  const forged = await fetch(`${serverUrl}/kpi/definitions`, { headers: { Cookie: employee.cookie, "X-User-Role": "SUPERVISOR", "X-Permissions": "kpi:read_config" } });
  assert.equal(forged.status, 403);
});

test("KC-I7: supervisor scope covers every warehouse's targets (no depot/team scoping exists)", async () => {
  const boxes = (await list(supervisor, "?search=BOXES")).data[0]!;
  assert.deepEqual(new Set(boxes.current_targets.map((target) => target.warehouse?.code ?? "ALL")), new Set(["ALL", "DEP-01"]));
});

test("KC-I8: existing KPI snapshot and summary routes are unaffected", async () => {
  assert.equal((await get(supervisor, "/kpis")).status, 200);
  assert.equal((await get(supervisor, "/kpi/summary")).status, 200);
  assert.equal((await get(supervisor, "/api/kpi/definitions")).status, 200);
});
