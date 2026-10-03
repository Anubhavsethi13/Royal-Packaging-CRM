import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before, beforeEach } from "node:test";
import type { DatabaseConnection } from "@royal-packaging/db";
import { KPI_RESULT_CALCULATIONS } from "../packages/contracts/src/kpi-reports/results.js";
import { seedKpiDefinitions, UNSEEDED_KPI_CODES, V1_KPI_DEFINITION_SEEDS } from "../scripts/kpi-definition-seed.js";
import {
  ensureTestDatabase,
  getScopedTestDatabaseUrl,
  getTestDatabase,
  migrateTestDatabase,
  truncateAllTables,
  cleanupTestDatabase
} from "./helpers/postgres-test-helper.js";

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);
let db: DatabaseConnection;

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);
});
after(async () => {
  if (db) await cleanupTestDatabase(db);
});
beforeEach(async () => {
  await truncateAllTables(db);
});

const allDefinitions = () => db.selectFrom("kpi_definitions").selectAll().orderBy("code").execute();

test("KS-1: seeds exactly the calculable, non-SLA definitions, with no targets", async () => {
  const outcome = await seedKpiDefinitions(db);
  const rows = await allDefinitions();
  // Compare as a set: database collation order is not JS sort order.
  assert.deepEqual(rows.map((row) => row.code).sort(), ["AVERAGE_BOXES_PER_TASK", "BOXES_HANDLED", "LOADING_BOXES", "LOADING_TIME", "TASKS_COMPLETED", "TASK_TIME", "UNLOADING_BOXES", "UNLOADING_TIME"].sort());
  assert.equal(outcome.inserted.length, 8);
  assert.ok(rows.every((row) => row.active && KPI_RESULT_CALCULATIONS[row.code]));
  for (const code of UNSEEDED_KPI_CODES) assert.equal(rows.some((row) => row.code === code), false, code);
  assert.equal((await db.selectFrom("kpi_targets").select("id").execute()).length, 0);
});

test("KS-2: running the seed again inserts nothing and changes nothing", async () => {
  await seedKpiDefinitions(db);
  const first = await allDefinitions();
  const second = await seedKpiDefinitions(db);
  assert.deepEqual(second.inserted, []);
  assert.equal(second.skipped.length, 8);
  const byId = (rows: typeof first) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(byId(await allDefinitions()), byId(first));
});

test("KS-3: administrator-configured definitions are never modified or duplicated (any code casing)", async () => {
  const customised = crypto.randomUUID();
  await db.insertInto("kpi_definitions").values([
    { id: customised, code: "BOXES_HANDLED", name: "Admin boxes", pillar: "OPS", description: "admin", unit: "BOX", formula_reference: "admin", active: false, effective_from: null, effective_to: null },
    { id: crypto.randomUUID(), code: "loading_boxes", name: "Lower-case loading", pillar: null, description: null, unit: null, formula_reference: null, active: true, effective_from: null, effective_to: null },
    { id: crypto.randomUUID(), code: "LOADING_SLA_COMPLIANCE", name: "Admin SLA", pillar: null, description: null, unit: null, formula_reference: null, active: true, effective_from: null, effective_to: null }
  ]).execute();
  const outcome = await seedKpiDefinitions(db);
  assert.deepEqual(outcome.skipped.sort(), ["BOXES_HANDLED", "LOADING_BOXES"]);
  const rows = await allDefinitions();
  const admin = rows.find((row) => row.id === customised)!;
  assert.deepEqual({ name: admin.name, active: admin.active, pillar: admin.pillar }, { name: "Admin boxes", active: false, pillar: "OPS" });
  assert.equal(rows.filter((row) => row.code.toUpperCase() === "LOADING_BOXES").length, 1);
  assert.equal(rows.filter((row) => row.code === "LOADING_SLA_COMPLIANCE").length, 1); // admin's own, untouched
  assert.equal(rows.length, 3 + 6);
});

test("KS-4: every seed maps to a supported calculation and SLA codes stay unseeded", () => {
  for (const seed of V1_KPI_DEFINITION_SEEDS) assert.ok(KPI_RESULT_CALCULATIONS[seed.code], seed.code);
  const slaCodes = Object.entries(KPI_RESULT_CALCULATIONS).filter(([, calculation]) => calculation.kind === "SLA").map(([code]) => code).sort();
  assert.deepEqual([...UNSEEDED_KPI_CODES].sort(), slaCodes);
});
