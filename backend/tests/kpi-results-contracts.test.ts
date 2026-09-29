import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  KPI_RESULT_CALCULATIONS,
  kpiResultId,
  listKpiResultsFilterSchema,
  localDate,
  parseKpiResultId,
  periodEndFor,
  periodLabel,
  periodStartFor
} from "../packages/contracts/src/kpi-reports/results.js";

test("KR-C1: period boundaries are explicit calendar dates (ISO weeks start Monday)", () => {
  assert.equal(periodStartFor("DAILY", "2026-09-10"), "2026-09-10");
  assert.equal(periodEndFor("DAILY", "2026-09-10"), "2026-09-10");
  assert.equal(periodStartFor("WEEKLY", "2026-09-10"), "2026-09-07"); // Thursday -> Monday
  assert.equal(periodStartFor("WEEKLY", "2026-09-07"), "2026-09-07");
  assert.equal(periodStartFor("WEEKLY", "2026-09-13"), "2026-09-07"); // Sunday belongs to the same week
  assert.equal(periodEndFor("WEEKLY", "2026-09-07"), "2026-09-13");
  assert.equal(periodStartFor("MONTHLY", "2026-02-17"), "2026-02-01");
  assert.equal(periodEndFor("MONTHLY", "2026-02-01"), "2026-02-28");
  assert.equal(periodEndFor("MONTHLY", "2028-02-01"), "2028-02-29");
  assert.equal(periodStartFor("WEEKLY", "2027-01-01"), "2026-12-28"); // across a year boundary
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(periodLabel("MONTHLY", "2026-09-01"), "September 2026");
});

test("KR-C2: operational dates follow the configured timezone", () => {
  const instant = new Date("2026-09-10T20:00:00Z");
  assert.equal(localDate(instant, "UTC"), "2026-09-10");
  assert.equal(localDate(instant, "Asia/Kolkata"), "2026-09-11");
  assert.equal(localDate(instant, "America/Los_Angeles"), "2026-09-10");
});

test("KR-C3: result ids are deterministic and strictly parsed", () => {
  const kpi = "11111111-1111-4111-8111-111111111111";
  const employee = "22222222-2222-4222-8222-222222222222";
  const id = kpiResultId(kpi, employee, "WEEKLY", "2026-09-07");
  assert.deepEqual(parseKpiResultId(id), { kpiId: kpi, employeeId: employee, period: "WEEKLY", start: "2026-09-07" });
  assert.equal(parseKpiResultId(kpiResultId(kpi, employee, "WEEKLY", "2026-09-08")), null); // not a Monday
  assert.equal(parseKpiResultId(kpiResultId(kpi, employee, "MONTHLY", "2026-09-02")), null);
  assert.equal(parseKpiResultId(`${kpi}_${employee}_CUSTOM_2026-09-07`), null);
  assert.equal(parseKpiResultId(`${kpi}_${employee}_DAILY_2026-02-30`), null);
  assert.equal(parseKpiResultId("not-an-id"), null);
});

test("KR-C4: filter validation", () => {
  assert.equal(listKpiResultsFilterSchema.parse({}).period, "DAILY");
  assert.equal(listKpiResultsFilterSchema.safeParse({ period: "HOURLY" }).success, false);
  assert.equal(listKpiResultsFilterSchema.safeParse({ period: "CUSTOM" }).success, false);
  assert.equal(listKpiResultsFilterSchema.safeParse({ from: "2026-09-10", to: "2026-09-01" }).success, false);
  assert.equal(listKpiResultsFilterSchema.safeParse({ from: "2026-02-30" }).success, false);
  assert.equal(listKpiResultsFilterSchema.safeParse({ employee_id: "x" }).success, false);
  assert.equal(listKpiResultsFilterSchema.safeParse({ metric: "SCORE" }).success, false);
  assert.equal(listKpiResultsFilterSchema.safeParse({ status: "FINAL" }).success, false);
});

test("KR-C5: the calculation registry covers the V1 metrics and never scores or ranks", () => {
  const metrics = new Set(Object.values(KPI_RESULT_CALCULATIONS).map((calculation) => calculation.metric));
  assert.deepEqual([...metrics].sort(), ["AVERAGE_BOXES_PER_TASK", "BOXES_HANDLED", "SLA_COMPLIANCE", "TASKS_COMPLETED", "TIME_TAKEN"]);
  for (const code of Object.keys(KPI_RESULT_CALCULATIONS)) assert.doesNotMatch(code, /SCORE|RANK|INCENTIVE|PAYROLL/);
});
