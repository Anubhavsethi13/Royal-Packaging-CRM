import assert from "node:assert/strict";
import test from "node:test";
import {
  createDailyReportRequestSchema,
  deriveDailyReportFigures,
  updateDailyReportRequestSchema
} from "../packages/contracts/src/daily-reports/index.js";

test("DRC-1: total operations = loading + unloading; duration = end - start (client example)", () => {
  assert.deepEqual(deriveDailyReportFigures({ loading_count: 11, unloading_count: 10, start_time: "10:00:00", end_time: "22:30:00" }), { total_operations: 21, duration_minutes: 750 });
});

test("DRC-2: duration is unknown until both times are recorded", () => {
  assert.equal(deriveDailyReportFigures({ loading_count: 0, unloading_count: 0, start_time: "10:00:00", end_time: null }).duration_minutes, null);
  assert.equal(deriveDailyReportFigures({ loading_count: 0, unloading_count: 0, start_time: null, end_time: null }).duration_minutes, null);
  assert.equal(deriveDailyReportFigures({ loading_count: 0, unloading_count: 0, start_time: null, end_time: null }).total_operations, 0);
});

test("DRC-3: requests normalise times and vehicle codes, and reject derived or unknown fields", () => {
  const parsed = createDailyReportRequestSchema.parse({ report_date: "2026-09-30", loading_count: 11, unloading_count: 10, start_time: "10:00", end_time: "22:30", vehicles: [{ truck_type_code: "32ft", count: 5 }] });
  assert.equal(parsed.start_time, "10:00:00");
  assert.equal(parsed.vehicles[0]?.truck_type_code, "32FT");
  assert.equal(createDailyReportRequestSchema.safeParse({ report_date: "2026-09-30", loading_count: 1, unloading_count: 1, total_operations: 2 }).success, false);
  assert.equal(createDailyReportRequestSchema.safeParse({ report_date: "2026-09-30", loading_count: 1, unloading_count: 1, start_time: "12:00", end_time: "12:00" }).success, false);
  assert.equal(updateDailyReportRequestSchema.safeParse({ loading_count: 1 }).success, false, "version is required");
});
