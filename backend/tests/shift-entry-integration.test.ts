import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before, beforeEach } from "node:test";
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

interface Actor {
  userId: string;
  employeeId: string | null;
  cookie: string;
}

let empA: Actor;
let empB: Actor;
let supervisor: Actor;
let admin: Actor;
let superAdmin: Actor;
let noProfile: Actor;
let noRole: Actor;

let depotMain: string;

interface ErrorBody {
  success: false;
  code: string;
  message: string;
  errors?: Array<{ field?: string; message: string }>;
  error?: { code: string };
}

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);

  // Default (real) DatabaseRBACAuthorizationPolicy - no permissive override.
  const app = createApiApp({ database: db });
  const server = app.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  stopServer = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

after(async () => {
  if (stopServer) await stopServer();
  if (db) await cleanupTestDatabase(db);
});

async function createActor(login: string, role: string | null, withEmployee: boolean): Promise<Actor> {
  const userId = crypto.randomUUID();
  await db
    .insertInto("users")
    .values({ id: userId, login_identifier: login, password_hash: await bcrypt.hash(PASSWORD, 4), is_active: true })
    .execute();

  if (role) {
    const existing = await db.selectFrom("access_roles").select("id").where("code", "=", role).executeTakeFirst();
    const roleId = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      await db.insertInto("access_roles").values({ id: roleId, code: role, name: role, active: true }).execute();
    }
    await db
      .insertInto("user_access_roles")
      .values({
        id: crypto.randomUUID(),
        user_id: userId,
        role_id: roleId,
        assigned_at: new Date(),
        assigned_by_user_id: userId,
        revoked_at: null,
        revoked_by_user_id: null,
        version: "1"
      })
      .execute();
  }

  let employeeId: string | null = null;
  if (withEmployee) {
    employeeId = crypto.randomUUID();
    await db
      .insertInto("employees")
      .values({
        id: employeeId,
        user_id: userId,
        employee_code: `EMP-${login}`,
        name: login,
        department: "Warehouse",
        depot_id: depotMain,
        is_active: true
      })
      .execute();
  }

  const res = await fetch(`${serverUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login_identifier: login, password: PASSWORD })
  });
  assert.equal(res.status, 200, `login for ${login}`);
  const cookie = res.headers.get("set-cookie");
  assert.ok(cookie);
  return { userId, employeeId, cookie };
}

beforeEach(async () => {
  await truncateAllTables(db);

  depotMain = crypto.randomUUID();
  await db
    .insertInto("depots")
    .values([
      { id: depotMain, code: "DEP-01", name: "Main Depot", active: true },
      { id: crypto.randomUUID(), code: "DEP-02", name: "Annex Depot", active: true },
      { id: crypto.randomUUID(), code: "DEP-OLD", name: "Closed Depot", active: false }
    ])
    .execute();

  await db
    .insertInto("truck_types")
    .values([
      { id: crypto.randomUUID(), code: "32FT", name: "32ft" },
      { id: crypto.randomUUID(), code: "CROSSING", name: "Crossing" },
      { id: crypto.randomUUID(), code: "OTHER", name: "Other" },
      { id: crypto.randomUUID(), code: "RETIRED", name: "Retired", active: false }
    ])
    .execute();

  empA = await createActor("emp_a", "EMPLOYEE", true);
  empB = await createActor("emp_b", "EMPLOYEE", true);
  supervisor = await createActor("sup", "SUPERVISOR", true);
  admin = await createActor("adm", "ADMIN", true);
  superAdmin = await createActor("root", "SUPER_ADMIN", true);
  noProfile = await createActor("no_profile", "EMPLOYEE", false);
  noRole = await createActor("no_role", null, true);
});

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    work_date: "2026-09-28",
    shift_start: "08:00",
    shift_end: "16:30",
    labour_count: 6,
    unloading_total: 120,
    loading_total: 340,
    warehouses: [{ warehouse_code: "DEP-01" }],
    truck_types: ["32FT"],
    ...overrides
  };
}

async function post(actor: Actor | null, body: unknown, raw = false): Promise<Response> {
  return fetch(`${serverUrl}/shift-entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(actor ? { Cookie: actor.cookie } : {}) },
    body: raw ? (body as string) : JSON.stringify(body)
  });
}

async function get(actor: Actor | null, path: string): Promise<Response> {
  return fetch(`${serverUrl}${path}`, { headers: actor ? { Cookie: actor.cookie } : {} });
}

async function createEntry(actor: Actor, overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await post(actor, payload(overrides));
  assert.equal(res.status, 201, await res.clone().text());
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

test("SE-I1: an employee creates a shift entry; employee comes from the session", async () => {
  const res = await post(empA, payload({ warehouses: [{ warehouse_code: "dep-01", warehouse_name: "main depot" }, { warehouse_code: "DEP-02" }], truck_types: ["32ft", "Crossing"] }));
  assert.equal(res.status, 201);
  const body = (await res.json()) as { success: boolean; data: Record<string, unknown> };
  assert.equal(body.success, true);
  const data = body.data;
  assert.equal(data.employee_id, empA.employeeId);
  assert.equal(data.employeeId, empA.employeeId); // camelCase mirror
  assert.equal(data.work_date, "2026-09-28");
  assert.equal(data.shift_start, "08:00:00");
  assert.equal(data.shift_end, "16:30:00");
  assert.equal(data.labour_count, 6);
  assert.equal(data.unloading_total, 120);
  assert.equal(data.loading_total, 340);
  assert.equal(data.created_by_user_id, empA.userId);
  assert.deepEqual((data.warehouses as Array<{ code: string }>).map((w) => w.code), ["DEP-01", "DEP-02"]);
  assert.deepEqual((data.truck_types as Array<{ code: string }>).map((t) => t.code), ["32FT", "CROSSING"]);
  assert.equal(res.headers.get("x-correlation-id") !== null, true);
});

test("SE-I2: truck types are optional; a client-supplied employee_id is rejected", async () => {
  const noTrucks = payload();
  delete noTrucks.truck_types;
  const ok = await post(empA, noTrucks);
  assert.equal(ok.status, 201);
  assert.deepEqual(((await ok.json()) as { data: { truck_types: unknown[] } }).data.truck_types, []);

  const forged = await post(empB, payload({ employee_id: empA.employeeId }));
  assert.equal(forged.status, 400);
  const body = (await forged.json()) as ErrorBody;
  assert.equal(body.code, "VALIDATION_FAILED");
  const rows = await db.selectFrom("shift_entries").select("employee_id").execute();
  assert.deepEqual(rows.map((row) => row.employee_id), [empA.employeeId]); // only the valid entry above; nothing for empB
});

test("SE-I3: missing fields return the canonical error envelope with field errors", async () => {
  const res = await post(empA, {});
  assert.equal(res.status, 400);
  const body = (await res.json()) as ErrorBody;
  assert.equal(body.success, false);
  assert.equal(body.code, "VALIDATION_FAILED");
  assert.equal(body.error?.code, "VALIDATION_FAILED");
  const fields = (body.errors ?? []).map((e) => e.field);
  for (const field of ["work_date", "shift_start", "shift_end", "labour_count", "unloading_total", "loading_total", "warehouses"]) {
    assert.ok(fields.includes(field), `missing error for ${field}`);
  }
});

test("SE-I4: invalid date, invalid time and end-before-start are rejected", async () => {
  for (const [overrides, field] of [
    [{ work_date: "2026-02-30" }, "work_date"],
    [{ shift_start: "25:00" }, "shift_start"],
    [{ shift_end: "noon" }, "shift_end"],
    [{ shift_start: "18:00", shift_end: "06:00" }, "shift_end"]
  ] as Array<[Record<string, unknown>, string]>) {
    const res = await post(empA, payload(overrides));
    assert.equal(res.status, 400, JSON.stringify(overrides));
    const body = (await res.json()) as ErrorBody;
    assert.ok((body.errors ?? []).some((e) => e.field === field), `${field}: ${JSON.stringify(body.errors)}`);
  }
});

test("SE-I5: negative labour, loading and unloading are rejected", async () => {
  for (const field of ["labour_count", "loading_total", "unloading_total"]) {
    const res = await post(empA, payload({ [field]: -5 }));
    assert.equal(res.status, 400, field);
    const body = (await res.json()) as ErrorBody;
    assert.ok((body.errors ?? []).some((e) => e.field === field));
  }
  assert.equal((await post(empA, payload({ labour_count: 0, loading_total: 0, unloading_total: 0 }))).status, 201);
});

test("SE-I6: missing warehouse and unknown/inactive warehouses are rejected", async () => {
  const none = await post(empA, payload({ warehouses: [] }));
  assert.equal(none.status, 400);
  assert.equal(((await none.json()) as ErrorBody).code, "VALIDATION_FAILED");

  for (const warehouses of [[{ warehouse_code: "NOPE" }], [{ warehouse_code: "DEP-OLD" }]]) {
    const res = await post(empA, payload({ warehouses }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as ErrorBody;
    assert.equal(body.code, "INVALID_WAREHOUSE");
    assert.equal(body.errors?.[0]?.field, "warehouses.0.warehouse_code");
  }

  const mismatch = await post(empA, payload({ warehouses: [{ warehouse_code: "DEP-01", warehouse_name: "Wrong Name" }] }));
  assert.equal(mismatch.status, 400);
  assert.equal(((await mismatch.json()) as ErrorBody).code, "INVALID_WAREHOUSE");

  const depots = await db.selectFrom("depots").select("id").execute();
  assert.equal(depots.length, 3, "no depot may be created from a shift payload");
  assert.equal((await db.selectFrom("shift_entries").select("id").execute()).length, 0);
});

test("SE-I7: invalid or inactive truck types are rejected", async () => {
  for (const truck_types of [["BOGUS"], ["RETIRED"], ["32FT", "BOGUS"]]) {
    const res = await post(empA, payload({ truck_types }));
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as ErrorBody).code, "INVALID_TRUCK_TYPE");
  }
  assert.equal((await db.selectFrom("shift_entries").select("id").execute()).length, 0);
});

test("SE-I8: malformed JSON returns a 400 envelope, not a 500", async () => {
  const res = await post(empA, "{not json", true);
  assert.equal(res.status, 400);
  const body = (await res.json()) as ErrorBody;
  assert.equal(body.success, false);
  assert.equal(body.code, "INVALID_JSON");
});

test("SE-I8b: non-object JSON bodies are validation errors, and an oversized body is a delivered 413 (not a reset)", async () => {
  for (const body of ["[]", "null", '"text"', "123", "true"]) {
    const res = await post(empA, body, true);
    assert.equal(res.status, 400, body);
    assert.equal(((await res.json()) as ErrorBody).code, "VALIDATION_FAILED", body);
  }
  const big = JSON.stringify({ padding: "x".repeat(2 * 1024 * 1024) });
  const res = await post(empA, big, true);
  assert.equal(res.status, 413);
  const envelope = (await res.json()) as ErrorBody;
  assert.equal(envelope.success, false);
  assert.equal(envelope.code, "PAYLOAD_TOO_LARGE");
  // The server keeps serving normal requests afterwards.
  assert.equal((await post(empA, payload())).status, 201);
});

test("SE-I9: a second entry for the same employee and date is a 409; other employees and dates are fine", async () => {
  await createEntry(empA);
  const dup = await post(empA, payload());
  assert.equal(dup.status, 409);
  assert.equal(((await dup.json()) as ErrorBody).code, "SHIFT_ENTRY_DUPLICATE");

  assert.equal((await post(empB, payload())).status, 201);
  assert.equal((await post(empA, payload({ work_date: "2026-09-29" }))).status, 201);
});

// ---------------------------------------------------------------------------
// Authentication / authorization
// ---------------------------------------------------------------------------

test("SE-I10: unauthenticated requests get 401 on every endpoint", async () => {
  assert.equal((await post(null, payload())).status, 401);
  assert.equal((await get(null, "/shift-entries/me")).status, 401);
  assert.equal((await get(null, `/shift-entries/${crypto.randomUUID()}`)).status, 401);
});

test("SE-I11: users without an approved role are forbidden", async () => {
  assert.equal((await post(noRole, payload())).status, 403);
  assert.equal((await get(noRole, "/shift-entries/me")).status, 403);
});

test("SE-I12: an approved user without an active employee profile gets EMPLOYEE_PROFILE_REQUIRED", async () => {
  const res = await post(noProfile, payload());
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as ErrorBody).code, "EMPLOYEE_PROFILE_REQUIRED");
  const list = await get(noProfile, "/shift-entries/me");
  assert.equal(list.status, 403);
  assert.equal(((await list.json()) as ErrorBody).code, "EMPLOYEE_PROFILE_REQUIRED");
});

test("SE-I13: an inactive employee profile cannot submit", async () => {
  await db.updateTable("employees").set({ is_active: false }).where("id", "=", empA.employeeId as string).execute();
  const res = await post(empA, payload());
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as ErrorBody).code, "EMPLOYEE_PROFILE_REQUIRED");
});

test("SE-I14: employees read their own entry; another employee's entry is forbidden", async () => {
  const entry = await createEntry(empA);
  const own = await get(empA, `/shift-entries/${entry.id}`);
  assert.equal(own.status, 200);
  assert.equal(((await own.json()) as { data: { id: string } }).data.id, entry.id);

  const other = await get(empB, `/shift-entries/${entry.id}`);
  assert.equal(other.status, 403);
  assert.equal(((await other.json()) as ErrorBody).success, false);
});

test("SE-I15: supervisor, admin and super admin can read any entry", async () => {
  const entry = await createEntry(empA);
  for (const actor of [supervisor, admin, superAdmin]) {
    const res = await get(actor, `/shift-entries/${entry.id}`);
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { data: { employee_id: string } }).data.employee_id, empA.employeeId);
  }
});

test("SE-I16: missing entries are 404 for management and indistinguishable-403 for employees; bad IDs are 400", async () => {
  const missing = crypto.randomUUID();
  const asAdmin = await get(admin, `/shift-entries/${missing}`);
  assert.equal(asAdmin.status, 404);
  assert.equal(((await asAdmin.json()) as ErrorBody).code, "SHIFT_ENTRY_NOT_FOUND");
  assert.equal((await get(empA, `/shift-entries/${missing}`)).status, 403);
  assert.equal((await get(admin, "/shift-entries/not-a-uuid")).status, 400);
});

test("SE-I17: management users with an employee profile can create their own entries", async () => {
  for (const [actor, date] of [[supervisor, "2026-09-20"], [admin, "2026-09-21"], [superAdmin, "2026-09-22"]] as Array<[Actor, string]>) {
    const entry = await createEntry(actor, { work_date: date });
    assert.equal(entry.employee_id, actor.employeeId);
  }
});

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

test("SE-I18: /shift-entries/me returns only the caller's entries, newest work date first, with pagination meta", async () => {
  for (const day of ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14"]) {
    await createEntry(empA, { work_date: day });
  }
  await createEntry(empB, { work_date: "2026-09-15" });

  const page1 = await get(empA, "/shift-entries/me?page=1&pageSize=2");
  assert.equal(page1.status, 200);
  const body1 = (await page1.json()) as { success: boolean; data: Array<{ work_date: string; employee_id: string }>; meta: Record<string, unknown> };
  assert.equal(body1.success, true);
  assert.deepEqual(body1.data.map((e) => e.work_date), ["2026-09-14", "2026-09-13"]);
  assert.ok(body1.data.every((e) => e.employee_id === empA.employeeId));
  assert.deepEqual(body1.meta, { page: 1, pageSize: 2, total: 5, totalPages: 3, hasNext: true, hasPrevious: false });

  const page3 = await get(empA, "/shift-entries/me?page=3&pageSize=2");
  const body3 = (await page3.json()) as { data: Array<{ work_date: string }>; meta: Record<string, unknown> };
  assert.deepEqual(body3.data.map((e) => e.work_date), ["2026-09-10"]);
  assert.deepEqual(body3.meta, { page: 3, pageSize: 2, total: 5, totalPages: 3, hasNext: false, hasPrevious: true });

  const empBList = (await (await get(empB, "/shift-entries/me")).json()) as { data: unknown[]; meta: { total: number } };
  assert.equal(empBList.data.length, 1);
  assert.equal(empBList.meta.total, 1);
});

test("SE-I19: /shift-entries/me supports from/to date filters and validates them", async () => {
  for (const day of ["2026-09-10", "2026-09-15", "2026-09-20"]) {
    await createEntry(empA, { work_date: day });
  }
  const filtered = await get(empA, "/shift-entries/me?from=2026-09-12&to=2026-09-20");
  const body = (await filtered.json()) as { data: Array<{ work_date: string }>; meta: { total: number } };
  assert.deepEqual(body.data.map((e) => e.work_date), ["2026-09-20", "2026-09-15"]);
  assert.equal(body.meta.total, 2);

  assert.equal((await get(empA, "/shift-entries/me?from=2026-13-01")).status, 400);
  assert.equal((await get(empA, "/shift-entries/me?from=2026-09-20&to=2026-09-01")).status, 400);
  assert.equal((await get(empA, "/shift-entries/me?page=0")).status, 400);
});

test("SE-I20: /shift-entries/me is not captured by the /:id route and an empty list is valid", async () => {
  const res = await get(empA, "/shift-entries/me");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: unknown[]; meta: { total: number; totalPages: number } };
  assert.deepEqual(body.data, []);
  assert.equal(body.meta.total, 0);
});

test("SE-I21: the /api prefix is accepted like every other route", async () => {
  const entry = await createEntry(empA);
  const res = await get(empA, `/api/shift-entries/${entry.id}`);
  assert.equal(res.status, 200);
});

test("SE-I23: options list only active warehouses and truck types, for approved roles", async () => {
  const res = await get(empA, "/shift-entries/options");
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    data: { warehouses: Array<{ code: string; name: string }>; truck_types: Array<{ code: string }> };
  };
  assert.deepEqual(body.data.warehouses.map((w) => w.code), ["DEP-01", "DEP-02"]); // DEP-OLD is inactive
  assert.equal(body.data.warehouses[0]?.name, "Main Depot");
  assert.deepEqual(body.data.truck_types.map((t) => t.code), ["32FT", "CROSSING", "OTHER"]); // RETIRED is inactive

  assert.equal((await get(null, "/shift-entries/options")).status, 401);
  assert.equal((await get(noRole, "/shift-entries/options")).status, 403);
});

test("SE-I22: detail returns warehouses and truck types from the master tables", async () => {
  const entry = await createEntry(empA, { warehouses: [{ warehouse_code: "DEP-02" }], truck_types: ["OTHER", "32FT"] });
  const res = await get(empA, `/shift-entries/${entry.id}`);
  const data = ((await res.json()) as { data: { warehouses: Array<{ id: string; code: string; name: string }>; truck_types: Array<{ code: string; name: string }> } }).data;
  assert.equal(data.warehouses[0]?.code, "DEP-02");
  assert.equal(data.warehouses[0]?.name, "Annex Depot");
  assert.deepEqual(data.truck_types.map((t) => t.code), ["32FT", "OTHER"]);
});
