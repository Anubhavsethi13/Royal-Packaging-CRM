import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before } from "node:test";
import type { DatabaseConnection } from "@royal-packaging/db";
import { KpiService } from "../apps/api/src/modules/kpi/kpi-service.js";
import { ShiftEntryService } from "../apps/api/src/modules/shift-entries/shift-entry-service.js";
import {
  ensureTestDatabase,
  getScopedTestDatabaseUrl,
  getTestDatabase,
  migrateTestDatabase,
  truncateAllTables,
  cleanupTestDatabase
} from "./helpers/postgres-test-helper.js";

/**
 * Independent verification of the shift KPI aggregation: a deliberately naive in-memory oracle
 * (exact BigInt rational arithmetic, its own time parsing) is compared with the SQL-backed
 * KpiService over many random datasets and filter combinations.
 */

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);

let db: DatabaseConnection;
let shifts: ShiftEntryService;
let kpi: KpiService;

interface Emp { userId: string; employeeId: string; code: string; name: string }
interface Entry {
  employeeId: string;
  workDate: string;
  seconds: number;
  labour: number;
  unloading: number;
  loading: number;
  depots: string[];
  trucks: string[];
}

const DEPOT_CODES = ["DEP-A", "DEP-B", "DEP-C"];
const TRUCK_CODES = ["32FT", "CROSSING", "OTHER"];
const emps: Emp[] = [];
const entries: Entry[] = [];

/** Deterministic PRNG so failures are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260929);
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T,>(items: readonly T[]): T => items[int(0, items.length - 1)] as T;

const pad = (n: number) => String(n).padStart(2, "0");
const hms = (seconds: number) => `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
function isoDay(offset: number): string {
  const date = new Date(Date.UTC(2026, 7, 1 + offset)); // 2026-08-01 + offset
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Exact round-half-up of num/den to 2 decimals, without floating point in the division. */
function ratio2(num: bigint, den: bigint): number {
  return Number((num * 200n + den) / (2n * den)) / 100;
}

interface Filter { from?: string; to?: string; employeeId?: string; warehouse?: string; truck?: string }

function oracle(subset: Entry[]) {
  const count = BigInt(subset.length);
  const sum = (pickValue: (e: Entry) => number) => subset.reduce((total, e) => total + BigInt(pickValue(e)), 0n);
  const loading = sum((e) => e.loading);
  const unloading = sum((e) => e.unloading);
  const labour = sum((e) => e.labour);
  const seconds = sum((e) => e.seconds);
  const boxes = loading + unloading;
  const links = subset.reduce((total, e) => total + e.depots.length, 0);
  const distinct = new Set(subset.flatMap((e) => e.depots)).size;
  const has = subset.length > 0;
  const hasTime = seconds > 0n;
  return {
    shift_count: subset.length,
    total_unloading: Number(unloading),
    total_loading: Number(loading),
    total_boxes: Number(boxes),
    average_boxes_per_shift: has ? ratio2(boxes, count) : null,
    total_labour_count: Number(labour),
    average_labour_count: has ? ratio2(labour, count) : null,
    total_shift_duration_seconds: Number(seconds),
    average_shift_duration_seconds: has ? ratio2(seconds, count) : null,
    loading_productivity_boxes_per_hour: hasTime ? ratio2(loading * 3600n, seconds) : null,
    unloading_productivity_boxes_per_hour: hasTime ? ratio2(unloading * 3600n, seconds) : null,
    warehouse_associations: links,
    distinct_warehouses: distinct
  };
}

function select(filter: Filter): Entry[] {
  return entries.filter(
    (e) =>
      (!filter.from || e.workDate >= filter.from) &&
      (!filter.to || e.workDate <= filter.to) &&
      (!filter.employeeId || e.employeeId === filter.employeeId) &&
      (!filter.warehouse || e.depots.includes(filter.warehouse)) &&
      (!filter.truck || e.trucks.includes(filter.truck))
  );
}

async function createEmployee(index: number): Promise<Emp> {
  const userId = crypto.randomUUID();
  const employeeId = crypto.randomUUID();
  await db.insertInto("users").values({ id: userId, login_identifier: `xc_${index}`, password_hash: "x", is_active: true }).execute();
  await db
    .insertInto("employees")
    .values({ id: employeeId, user_id: userId, employee_code: `XC-${index}`, name: `Xc Employee ${index}`, is_active: true })
    .execute();
  return { userId, employeeId, code: `XC-${index}`, name: `Xc Employee ${index}` };
}

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);
  await truncateAllTables(db);
  shifts = new ShiftEntryService({ database: db });
  kpi = new KpiService({ database: db });

  for (const code of DEPOT_CODES) {
    await db.insertInto("depots").values({ id: crypto.randomUUID(), code, name: `Depot ${code}`, active: true }).execute();
  }
  for (const code of TRUCK_CODES) {
    await db.insertInto("truck_types").values({ id: crypto.randomUUID(), code, name: code }).execute();
  }
});

after(async () => {
  if (db) await cleanupTestDatabase(db);
});

async function record(emp: Emp, day: number, seconds: number, start: number, labour: number, unloading: number, loading: number, depots: string[], trucks: string[]): Promise<void> {
  const workDate = isoDay(day);
  await shifts.create(emp.userId, {
    work_date: workDate,
    shift_start: hms(start),
    shift_end: hms(start + seconds),
    labour_count: labour,
    unloading_total: unloading,
    loading_total: loading,
    warehouses: depots.map((warehouse_code) => ({ warehouse_code })),
    truck_types: trucks
  });
  entries.push({ employeeId: emp.employeeId, workDate, seconds, labour, unloading, loading, depots, trucks });
}

test("XC1: randomized datasets: SQL aggregation equals the independent oracle for random filters", async () => {
  for (let i = 1; i <= 6; i++) emps.push(await createEmployee(i));

  // 6 employees x 12 random distinct days over ~90 days, random durations (down to 1 minute) with seconds precision.
  for (const emp of emps) {
    const days = new Set<number>();
    while (days.size < 12) days.add(int(0, 89));
    for (const day of days) {
      const start = int(0, 80000);
      const seconds = int(60, Math.min(43200, 86399 - start));
      const depots = DEPOT_CODES.filter(() => rand() < 0.5);
      await record(
        emp, day, seconds, start, int(0, 40), int(0, 900), int(0, 900),
        depots.length ? depots : [pick(DEPOT_CODES)],
        TRUCK_CODES.filter(() => rand() < 0.4)
      );
    }
  }
  assert.equal(entries.length, 72);

  for (let round = 0; round < 60; round++) {
    const from = rand() < 0.6 ? isoDay(int(0, 89)) : undefined;
    const to = rand() < 0.6 ? isoDay(int(0, 89)) : undefined;
    const filter: Filter = {
      ...(from && to && to < from ? { from: to, to: from } : { ...(from ? { from } : {}), ...(to ? { to } : {}) }),
      ...(rand() < 0.3 ? { employeeId: pick(emps).employeeId } : {}),
      ...(rand() < 0.4 ? { warehouse: pick(DEPOT_CODES) } : {}),
      ...(rand() < 0.4 ? { truck: pick(TRUCK_CODES) } : {})
    };
    const expected = select(filter);
    const label = JSON.stringify(filter);

    const { summary, totalEmployees } = await kpi.getManagementSummary(
      {
        ...(filter.from ? { from: filter.from } : {}),
        ...(filter.to ? { to: filter.to } : {}),
        ...(filter.employeeId ? { employee_id: filter.employeeId } : {}),
        ...(filter.warehouse ? { warehouse_code: filter.warehouse } : {}),
        ...(filter.truck ? { truck_type: filter.truck } : {})
      },
      { limit: 100, offset: 0 }
    );
    assert.deepEqual(summary.metrics, oracle(expected), `aggregate for ${label}`);

    const expectedEmployees = emps.filter((emp) => expected.some((e) => e.employeeId === emp.employeeId));
    assert.equal(totalEmployees, expectedEmployees.length, `employee count for ${label}`);
    assert.deepEqual(
      summary.employees.map((row) => row.employee_id),
      expectedEmployees.map((emp) => emp.employeeId),
      `employee order for ${label}`
    );
    for (const row of summary.employees) {
      assert.deepEqual(row.metrics, oracle(expected.filter((e) => e.employeeId === row.employee_id)), `row ${row.employee_code} for ${label}`);
    }
  }
});

test("XC2: employee (own) summaries equal the oracle and ignore every other employee", async () => {
  for (const emp of emps) {
    for (const range of [{}, { from: isoDay(20), to: isoDay(60) }, { from: isoDay(70) }, { to: isoDay(5) }]) {
      const own = await kpi.getEmployeeSummary(emp.userId, range);
      assert.equal(own.employee_id, emp.employeeId);
      assert.deepEqual(own.metrics, oracle(select({ ...range, employeeId: emp.employeeId })), `${emp.code} ${JSON.stringify(range)}`);
    }
  }
});

test("XC3: rounding is exact at decimal ties (201 boxes over 200 shifts is 1.005, which rounds half-up to 1.01)", async () => {
  const solo = await createEmployee(99);
  const before = entries.length;
  for (let day = 0; day < 200; day++) {
    // 60-second shifts; a single entry carries all 201 boxes.
    await record(solo, 200 + day, 60, 0, 1, 0, day === 0 ? 201 : 0, ["DEP-A"], []);
  }
  assert.equal(entries.length - before, 200);
  const { metrics } = await kpi.getEmployeeSummary(solo.userId, {});
  assert.equal(metrics.shift_count, 200);
  assert.equal(metrics.total_boxes, 201);
  assert.equal(metrics.average_boxes_per_shift, 1.01);
  assert.deepEqual(metrics, oracle(select({ employeeId: solo.employeeId })));
});

test("XC4: boundary datasets: no rows, minimal one-minute shift, maximal same-day shift, zero boxes", async () => {
  const lone = await createEmployee(100);
  assert.deepEqual((await kpi.getEmployeeSummary(lone.userId, {})).metrics, oracle([]));

  await record(lone, 400, 60, 0, 0, 0, 0, ["DEP-B"], []); // one minute, zero everything
  await record(lone, 401, 86399, 0, 1, 1, 1, ["DEP-B", "DEP-C"], ["OTHER"]); // 00:00:00 -> 23:59:59
  const metrics = (await kpi.getEmployeeSummary(lone.userId, {})).metrics;
  assert.deepEqual(metrics, oracle(select({ employeeId: lone.employeeId })));
  assert.equal(metrics.total_shift_duration_seconds, 86459);
  assert.equal(metrics.loading_productivity_boxes_per_hour, ratio2(3600n, 86459n));
});
