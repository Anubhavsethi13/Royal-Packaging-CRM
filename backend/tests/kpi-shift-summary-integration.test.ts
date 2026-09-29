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

interface Actor {
  userId: string;
  employeeId: string | null;
  cookie: string;
}

let empA: Actor;
let empB: Actor;
let empIdle: Actor;
let supervisor: Actor;
let admin: Actor;
let superAdmin: Actor;
let noProfile: Actor;
let noRole: Actor;

interface Metrics {
  shift_count: number;
  total_unloading: number;
  total_loading: number;
  total_boxes: number;
  average_boxes_per_shift: number | null;
  total_labour_count: number;
  average_labour_count: number | null;
  total_shift_duration_seconds: number;
  average_shift_duration_seconds: number | null;
  loading_productivity_boxes_per_hour: number | null;
  unloading_productivity_boxes_per_hour: number | null;
  warehouse_associations: number;
  distinct_warehouses: number;
}

interface EmployeeSummaryBody {
  success: boolean;
  data: { source: string; unit: string; employee_id: string; filters: Record<string, string | null>; metrics: Metrics };
}

interface ManagementSummaryBody {
  success: boolean;
  data: {
    source: string;
    filters: Record<string, string | null>;
    metrics: Metrics;
    employees: Array<{ employee_id: string; employee_code: string; employee_name: string; metrics: Metrics }>;
  };
  meta: Record<string, unknown>;
}

interface ErrorBody {
  success: false;
  code: string;
  errors?: Array<{ field?: string }>;
}

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);

  // Real DatabaseRBACAuthorizationPolicy: authorization is exercised for real.
  const app = createApiApp({ database: db });
  const server = app.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  stopServer = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  // Every test is read-only, so the fixture is seeded once.
  await seedFixture();
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
      .values({ id: employeeId, user_id: userId, employee_code: `EMP-${login}`, name: login, department: "Warehouse", is_active: true })
      .execute();
  }

  const res = await fetch(`${serverUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login_identifier: login, password: PASSWORD })
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.get("set-cookie");
  assert.ok(cookie);
  return { userId, employeeId, cookie };
}

/** Responses carry an additive camelCase mirror; assert on the canonical snake_case keys. */
function snakeKeysOnly<T extends object>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/[A-Z]/.test(key)));
}

async function submit(actor: Actor, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${serverUrl}/shift-entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: actor.cookie },
    body: JSON.stringify(body)
  });
  assert.equal(res.status, 201, await res.text());
}

async function get(actor: Actor | null, path: string): Promise<Response> {
  return fetch(`${serverUrl}${path}`, { headers: actor ? { Cookie: actor.cookie } : {} });
}

async function mySummary(actor: Actor, query = ""): Promise<Metrics> {
  const res = await get(actor, `/kpi/me/summary${query}`);
  assert.equal(res.status, 200, await res.clone().text());
  return ((await res.json()) as EmployeeSummaryBody).data.metrics;
}

async function mgmtSummary(actor: Actor, query = ""): Promise<ManagementSummaryBody> {
  const res = await get(actor, `/kpi/summary${query}`);
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as ManagementSummaryBody;
}

/*
 * Fixture (all times same-day):
 *  A 2026-09-01 08:00-16:00 (8h)   labour 4  unload 100 load 200  DEP-01        32FT
 *  A 2026-09-02 09:00-13:00 (4h)   labour 6  unload  50 load 150  DEP-01+DEP-02 CROSSING+32FT
 *  A 2026-09-10 06:00-14:30 (8.5h) labour 5  unload   0 load   0  DEP-02        OTHER
 *  B 2026-09-01 10:00-12:00 (2h)   labour 2  unload  30 load  70  DEP-01        32FT
 */
async function seedFixture(): Promise<void> {
  await truncateAllTables(db);

  await db
    .insertInto("depots")
    .values([
      { id: crypto.randomUUID(), code: "DEP-01", name: "Main Depot", active: true },
      { id: crypto.randomUUID(), code: "DEP-02", name: "Annex Depot", active: true }
    ])
    .execute();
  await db
    .insertInto("truck_types")
    .values([
      { id: crypto.randomUUID(), code: "32FT", name: "32ft" },
      { id: crypto.randomUUID(), code: "CROSSING", name: "Crossing" },
      { id: crypto.randomUUID(), code: "OTHER", name: "Other" }
    ])
    .execute();

  empA = await createActor("emp_a", "EMPLOYEE", true);
  empB = await createActor("emp_b", "EMPLOYEE", true);
  empIdle = await createActor("emp_idle", "EMPLOYEE", true);
  supervisor = await createActor("sup", "SUPERVISOR", true);
  admin = await createActor("adm", "ADMIN", false);
  superAdmin = await createActor("root", "SUPER_ADMIN", false);
  noProfile = await createActor("no_profile", "EMPLOYEE", false);
  noRole = await createActor("no_role", null, true);

  const base = { shift_start: "08:00", shift_end: "16:00", labour_count: 0, unloading_total: 0, loading_total: 0 };
  await submit(empA, { ...base, work_date: "2026-09-01", labour_count: 4, unloading_total: 100, loading_total: 200, warehouses: [{ warehouse_code: "DEP-01" }], truck_types: ["32FT"] });
  await submit(empA, { ...base, work_date: "2026-09-02", shift_start: "09:00", shift_end: "13:00", labour_count: 6, unloading_total: 50, loading_total: 150, warehouses: [{ warehouse_code: "DEP-01" }, { warehouse_code: "DEP-02" }], truck_types: ["CROSSING", "32FT"] });
  await submit(empA, { ...base, work_date: "2026-09-10", shift_start: "06:00", shift_end: "14:30", labour_count: 5, warehouses: [{ warehouse_code: "DEP-02" }], truck_types: ["OTHER"] });
  await submit(empB, { ...base, work_date: "2026-09-01", shift_start: "10:00", shift_end: "12:00", labour_count: 2, unloading_total: 30, loading_total: 70, warehouses: [{ warehouse_code: "DEP-01" }], truck_types: ["32FT"] });
}

// ---------------------------------------------------------------------------
// Employee summary
// ---------------------------------------------------------------------------

test("KS-I1: employee summary aggregates all of the caller's shifts with exact formulas", async () => {
  const res = await get(empA, "/kpi/me/summary");
  assert.equal(res.status, 200);
  const body = (await res.json()) as EmployeeSummaryBody;
  assert.equal(body.success, true);
  assert.equal(body.data.source, "SHIFT_ENTRY");
  assert.equal(body.data.unit, "BOX");
  assert.equal(body.data.employee_id, empA.employeeId);
  const { from, to, warehouse_code, truck_type, employee_id } = body.data.filters; // (camelCase mirrors also present)
  assert.deepEqual({ from, to, warehouse_code, truck_type, employee_id }, { from: null, to: null, warehouse_code: null, truck_type: null, employee_id: empA.employeeId });
  assert.deepEqual(snakeKeysOnly(body.data.metrics), {
    shift_count: 3,
    total_unloading: 150,
    total_loading: 350,
    total_boxes: 500,
    average_boxes_per_shift: 166.67,
    total_labour_count: 15,
    average_labour_count: 5,
    total_shift_duration_seconds: 73800, // 28800 + 14400 + 30600
    average_shift_duration_seconds: 24600,
    loading_productivity_boxes_per_hour: 17.07, // 350 / 20.5h
    unloading_productivity_boxes_per_hour: 7.32, // 150 / 20.5h
    warehouse_associations: 4, // 1 + 2 + 1
    distinct_warehouses: 2
  });
});

test("KS-I2: an employee with exactly one shift", async () => {
  const metrics = await mySummary(empB);
  assert.equal(metrics.shift_count, 1);
  assert.equal(metrics.total_boxes, 100);
  assert.equal(metrics.average_boxes_per_shift, 100);
  assert.equal(metrics.total_shift_duration_seconds, 7200);
  assert.equal(metrics.average_shift_duration_seconds, 7200);
  assert.equal(metrics.loading_productivity_boxes_per_hour, 35); // 70 / 2h
  assert.equal(metrics.unloading_productivity_boxes_per_hour, 15); // 30 / 2h
  assert.equal(metrics.warehouse_associations, 1);
});

test("KS-I3: an employee with zero shifts gets zero totals and null ratios, not an error", async () => {
  const metrics = await mySummary(empIdle);
  assert.equal(metrics.shift_count, 0);
  assert.equal(metrics.total_boxes, 0);
  assert.equal(metrics.total_shift_duration_seconds, 0);
  assert.equal(metrics.warehouse_associations, 0);
  assert.equal(metrics.average_boxes_per_shift, null);
  assert.equal(metrics.average_labour_count, null);
  assert.equal(metrics.average_shift_duration_seconds, null);
  assert.equal(metrics.loading_productivity_boxes_per_hour, null);
  assert.equal(metrics.unloading_productivity_boxes_per_hour, null);
});

test("KS-I4: date-range filtering is inclusive and reported back", async () => {
  const res = await get(empA, "/kpi/me/summary?from=2026-09-01&to=2026-09-05");
  const body = (await res.json()) as EmployeeSummaryBody;
  assert.equal(body.data.filters.from, "2026-09-01");
  assert.equal(body.data.filters.to, "2026-09-05");
  assert.equal(body.data.metrics.shift_count, 2);
  assert.equal(body.data.metrics.total_boxes, 500);
  assert.equal(body.data.metrics.average_boxes_per_shift, 250);
  assert.equal(body.data.metrics.total_shift_duration_seconds, 43200);
  assert.equal(body.data.metrics.average_shift_duration_seconds, 21600);
  assert.equal(body.data.metrics.average_labour_count, 5);
  assert.equal(body.data.metrics.loading_productivity_boxes_per_hour, 29.17); // 350 / 12h
  assert.equal(body.data.metrics.unloading_productivity_boxes_per_hour, 12.5); // 150 / 12h

  // Boundary dates are inclusive: exactly one day.
  assert.equal((await mySummary(empA, "?from=2026-09-10&to=2026-09-10")).shift_count, 1);
  // Open-ended ranges.
  assert.equal((await mySummary(empA, "?from=2026-09-02")).shift_count, 2);
  assert.equal((await mySummary(empA, "?to=2026-09-01")).shift_count, 1);
});

test("KS-I5: a range with no entries is an empty (zero) result", async () => {
  const metrics = await mySummary(empA, "?from=2027-01-01&to=2027-01-31");
  assert.equal(metrics.shift_count, 0);
  assert.equal(metrics.total_boxes, 0);
  assert.equal(metrics.average_boxes_per_shift, null);
});

test("KS-I6: warehouse filter keeps entries involving the warehouse, with whole-entry totals", async () => {
  const res = await get(empA, "/kpi/me/summary?warehouse_code=dep-02");
  const body = (await res.json()) as EmployeeSummaryBody;
  assert.equal(body.data.filters.warehouse_code, "DEP-02");
  assert.equal(body.data.metrics.shift_count, 2); // 09-02 and 09-10
  assert.equal(body.data.metrics.total_boxes, 200);
  assert.equal(body.data.metrics.total_shift_duration_seconds, 45000); // 14400 + 30600
  assert.equal(body.data.metrics.average_labour_count, 5.5);
  assert.equal(body.data.metrics.warehouse_associations, 3); // 09-02 has 2, 09-10 has 1
  assert.equal(body.data.metrics.distinct_warehouses, 2);
});

test("KS-I7: truck-type filter and combined filters", async () => {
  assert.equal((await mySummary(empA, "?truck_type=crossing")).shift_count, 1);
  assert.equal((await mySummary(empA, "?truck_type=32FT")).shift_count, 2);
  assert.equal((await mySummary(empA, "?truck_type=OTHER&warehouse_code=DEP-01")).shift_count, 0);
  const combined = await mySummary(empA, "?truck_type=32FT&warehouse_code=DEP-01&from=2026-09-02&to=2026-09-02");
  assert.equal(combined.shift_count, 1);
  assert.equal(combined.total_boxes, 200);
});

test("KS-I8: unknown warehouse/truck type and invalid dates are 400 validation errors", async () => {
  const wh = await get(empA, "/kpi/me/summary?warehouse_code=NOPE");
  assert.equal(wh.status, 400);
  assert.equal(((await wh.json()) as ErrorBody).code, "INVALID_WAREHOUSE");

  const truck = await get(empA, "/kpi/me/summary?truck_type=NOPE");
  assert.equal(truck.status, 400);
  assert.equal(((await truck.json()) as ErrorBody).code, "INVALID_TRUCK_TYPE");

  for (const query of ["?from=2026-02-31", "?to=garbage", "?from=2026-09-30&to=2026-09-01"]) {
    const res = await get(empA, `/kpi/me/summary${query}`);
    assert.equal(res.status, 400, query);
    assert.equal(((await res.json()) as ErrorBody).code, "VALIDATION_FAILED");
  }
});

test("KS-I9: employees can never choose another employee's data", async () => {
  const res = await get(empB, `/kpi/me/summary?employee_id=${empA.employeeId}`);
  assert.equal(res.status, 400);
  // B still only ever sees their own numbers.
  assert.equal((await mySummary(empB)).total_boxes, 100);
  assert.equal((await mySummary(empA)).total_boxes, 500);
});

// ---------------------------------------------------------------------------
// Management summary
// ---------------------------------------------------------------------------

test("KS-I10: management summary aggregates across employees and lists per-employee rows", async () => {
  const body = await mgmtSummary(supervisor);
  assert.equal(body.success, true);
  assert.equal(body.data.source, "SHIFT_ENTRY");
  assert.equal(body.data.metrics.shift_count, 4);
  assert.equal(body.data.metrics.total_unloading, 180);
  assert.equal(body.data.metrics.total_loading, 420);
  assert.equal(body.data.metrics.total_boxes, 600);
  assert.equal(body.data.metrics.average_boxes_per_shift, 150);
  assert.equal(body.data.metrics.total_shift_duration_seconds, 81000); // 73800 + 7200
  assert.equal(body.data.metrics.warehouse_associations, 5);
  assert.equal(body.data.metrics.distinct_warehouses, 2);

  assert.deepEqual(body.data.employees.map((row) => row.employee_code), ["EMP-emp_a", "EMP-emp_b"]);
  const [rowA, rowB] = body.data.employees;
  assert.equal(rowA?.employee_id, empA.employeeId);
  assert.equal(rowA?.metrics.shift_count, 3);
  assert.equal(rowA?.metrics.total_boxes, 500);
  assert.equal(rowA?.metrics.average_boxes_per_shift, 166.67);
  assert.equal(rowA?.metrics.warehouse_associations, 4);
  assert.equal(rowB?.metrics.shift_count, 1);
  assert.equal(rowB?.metrics.loading_productivity_boxes_per_hour, 35);
  assert.deepEqual(body.meta, { page: 1, pageSize: 25, total: 2, totalPages: 1, hasNext: false, hasPrevious: false });
});

test("KS-I11: per-employee rows sum to the aggregate", async () => {
  const body = await mgmtSummary(admin);
  const sum = (key: "shift_count" | "total_boxes" | "total_shift_duration_seconds" | "total_labour_count" | "warehouse_associations") =>
    body.data.employees.reduce((total, row) => total + row.metrics[key], 0);
  for (const key of ["shift_count", "total_boxes", "total_shift_duration_seconds", "total_labour_count", "warehouse_associations"] as const) {
    assert.equal(sum(key), body.data.metrics[key], key);
  }
});

test("KS-I12: management employee filter, date filter, warehouse and truck filters", async () => {
  const onlyB = await mgmtSummary(admin, `?employee_id=${empB.employeeId}`);
  assert.equal(onlyB.data.filters.employee_id, empB.employeeId);
  assert.equal(onlyB.data.metrics.shift_count, 1);
  assert.deepEqual(onlyB.data.employees.map((row) => row.employee_id), [empB.employeeId]);

  const early = await mgmtSummary(admin, "?from=2026-09-01&to=2026-09-01");
  assert.equal(early.data.metrics.shift_count, 2); // A and B on 09-01
  assert.equal(early.data.employees.length, 2);

  const wh = await mgmtSummary(admin, "?warehouse_code=DEP-02");
  assert.equal(wh.data.metrics.shift_count, 2);
  assert.deepEqual(wh.data.employees.map((row) => row.employee_id), [empA.employeeId]);

  const truck = await mgmtSummary(admin, "?truck_type=32FT&from=2026-09-01&to=2026-09-01");
  assert.equal(truck.data.metrics.shift_count, 2);
});

test("KS-I13: management summary paginates the employee rows, not the aggregate", async () => {
  const page1 = await mgmtSummary(superAdmin, "?page=1&pageSize=1");
  assert.equal(page1.data.employees.length, 1);
  assert.equal(page1.data.employees[0]?.employee_id, empA.employeeId);
  assert.equal(page1.data.metrics.shift_count, 4); // aggregate covers everyone
  assert.deepEqual(page1.meta, { page: 1, pageSize: 1, total: 2, totalPages: 2, hasNext: true, hasPrevious: false });

  const page2 = await mgmtSummary(superAdmin, "?page=2&pageSize=1");
  assert.equal(page2.data.employees[0]?.employee_id, empB.employeeId);
  assert.equal(page2.meta.hasPrevious, true);

  const beyond = await mgmtSummary(superAdmin, "?page=3&pageSize=1");
  assert.deepEqual(beyond.data.employees, []);

  assert.equal((await get(admin, "/kpi/summary?page=0")).status, 400);
});

test("KS-I14: management summary over an empty result set", async () => {
  const body = await mgmtSummary(admin, "?from=2027-01-01&to=2027-01-31");
  assert.equal(body.data.metrics.shift_count, 0);
  assert.equal(body.data.metrics.total_boxes, 0);
  assert.equal(body.data.metrics.average_boxes_per_shift, null);
  assert.deepEqual(body.data.employees, []);
  assert.deepEqual(body.meta, { page: 1, pageSize: 25, total: 0, totalPages: 0, hasNext: false, hasPrevious: false });

  const unknownEmployee = await mgmtSummary(admin, `?employee_id=${crypto.randomUUID()}`);
  assert.equal(unknownEmployee.data.metrics.shift_count, 0);
  assert.deepEqual(unknownEmployee.data.employees, []);
});

test("KS-I15: management filter validation", async () => {
  assert.equal((await get(admin, "/kpi/summary?employee_id=abc")).status, 400);
  assert.equal((await get(admin, "/kpi/summary?warehouse_code=NOPE")).status, 400);
  assert.equal((await get(admin, "/kpi/summary?truck_type=NOPE")).status, 400);
  assert.equal((await get(admin, "/kpi/summary?from=2026-09-30&to=2026-09-01")).status, 400);
});

// ---------------------------------------------------------------------------
// Authentication / authorization
// ---------------------------------------------------------------------------

test("KS-I16: unauthenticated requests get 401", async () => {
  assert.equal((await get(null, "/kpi/me/summary")).status, 401);
  assert.equal((await get(null, "/kpi/summary")).status, 401);
});

test("KS-I17: employees cannot read the management summary", async () => {
  const res = await get(empA, "/kpi/summary");
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as ErrorBody).code, "FORBIDDEN");
});

test("KS-I18: supervisor, admin and super admin can read the management summary", async () => {
  for (const actor of [supervisor, admin, superAdmin]) {
    const res = await get(actor, "/kpi/summary");
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as ManagementSummaryBody).data.metrics.shift_count, 4);
  }
});

test("KS-I19: users without an approved role are forbidden on both endpoints", async () => {
  assert.equal((await get(noRole, "/kpi/me/summary")).status, 403);
  assert.equal((await get(noRole, "/kpi/summary")).status, 403);
});

test("KS-I20: /kpi/me/summary needs an active employee profile", async () => {
  const res = await get(noProfile, "/kpi/me/summary");
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as ErrorBody).code, "EMPLOYEE_PROFILE_REQUIRED");
  // A management user with no employee profile can still use the management summary.
  assert.equal((await get(admin, "/kpi/summary")).status, 200);
  assert.equal((await get(admin, "/kpi/me/summary")).status, 403);
});

test("KS-I21: existing KPI snapshot routes keep working alongside the new ones", async () => {
  const list = await get(empA, "/kpis");
  assert.equal(list.status, 200);
  assert.equal(((await list.json()) as { success: boolean }).success, true);
  assert.equal((await get(empA, "/api/kpi/me/summary")).status, 200);
});
