import assert from "node:assert/strict";
import test from "node:test";
import {
  employeeKpiSummaryFilterSchema,
  managementKpiSummaryFilterSchema
} from "../packages/contracts/src/kpi-reports/shift-summary.js";
import { computeShiftKpiMetrics, type ShiftKpiRawTotals } from "../apps/api/src/modules/kpi/shift-entry-kpi-source.js";

const ZERO: ShiftKpiRawTotals = {
  shiftCount: 0,
  totalUnloading: 0,
  totalLoading: 0,
  totalLabour: 0,
  totalDurationSeconds: 0,
  warehouseAssociations: 0,
  distinctWarehouses: 0
};

test("KS-M1: zero shifts yields zero totals and null ratios (nothing fabricated)", () => {
  const metrics = computeShiftKpiMetrics(ZERO);
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

test("KS-M2: one shift computes every formula exactly", () => {
  // 8h shift (28800 s): 200 loading + 100 unloading, 4 labour, 1 warehouse.
  const metrics = computeShiftKpiMetrics({
    shiftCount: 1,
    totalUnloading: 100,
    totalLoading: 200,
    totalLabour: 4,
    totalDurationSeconds: 28800,
    warehouseAssociations: 1,
    distinctWarehouses: 1
  });
  assert.equal(metrics.total_boxes, 300);
  assert.equal(metrics.average_boxes_per_shift, 300);
  assert.equal(metrics.average_labour_count, 4);
  assert.equal(metrics.average_shift_duration_seconds, 28800);
  assert.equal(metrics.loading_productivity_boxes_per_hour, 25); // 200 / 8h
  assert.equal(metrics.unloading_productivity_boxes_per_hour, 12.5); // 100 / 8h
});

test("KS-M3: multiple shifts use ratio-of-sums and round to 2 decimals", () => {
  // Shifts of 8h, 4h and 8.5h => 20.5h (73800 s); 350 loading, 150 unloading; labour 4+6+5.
  const metrics = computeShiftKpiMetrics({
    shiftCount: 3,
    totalUnloading: 150,
    totalLoading: 350,
    totalLabour: 15,
    totalDurationSeconds: 73800,
    warehouseAssociations: 4,
    distinctWarehouses: 2
  });
  assert.equal(metrics.total_boxes, 500);
  assert.equal(metrics.average_boxes_per_shift, 166.67);
  assert.equal(metrics.average_labour_count, 5);
  assert.equal(metrics.average_shift_duration_seconds, 24600);
  assert.equal(metrics.loading_productivity_boxes_per_hour, 17.07); // 350 / 20.5
  assert.equal(metrics.unloading_productivity_boxes_per_hour, 7.32); // 150 / 20.5
  assert.equal(metrics.warehouse_associations, 4);
  assert.equal(metrics.distinct_warehouses, 2);
});

test("KS-M4: a shift with zero boxes is valid and gives zero (not null) productivity", () => {
  const metrics = computeShiftKpiMetrics({ ...ZERO, shiftCount: 1, totalDurationSeconds: 3600, totalLabour: 3 });
  assert.equal(metrics.total_boxes, 0);
  assert.equal(metrics.average_boxes_per_shift, 0);
  assert.equal(metrics.loading_productivity_boxes_per_hour, 0);
  assert.equal(metrics.unloading_productivity_boxes_per_hour, 0);
});

test("KS-M5: productivity is null when duration is zero even if shifts exist", () => {
  const metrics = computeShiftKpiMetrics({ ...ZERO, shiftCount: 1, totalLoading: 10, totalDurationSeconds: 0 });
  assert.equal(metrics.loading_productivity_boxes_per_hour, null);
  assert.equal(metrics.average_boxes_per_shift, 10);
});

test("KS-M5b: ratios round half-up exactly at decimal ties (floating point would round these down)", () => {
  // 201 boxes / 200 shifts = 1.005 -> 1.01 ; naive Math.round(1.005 * 100) / 100 gives 1.
  const average = computeShiftKpiMetrics({ ...ZERO, shiftCount: 200, totalLoading: 201, totalDurationSeconds: 12000 });
  assert.equal(average.average_boxes_per_shift, 1.01);
  // 1 box over 720000 s (200 h) = 0.005 boxes/hour -> 0.01
  const rate = computeShiftKpiMetrics({ ...ZERO, shiftCount: 1, totalLoading: 1, totalUnloading: 1, totalDurationSeconds: 720000 });
  assert.equal(rate.loading_productivity_boxes_per_hour, 0.01);
  assert.equal(rate.unloading_productivity_boxes_per_hour, 0.01);
  // Ties below the boundary still round down, and exact values are untouched.
  assert.equal(computeShiftKpiMetrics({ ...ZERO, shiftCount: 3, totalLoading: 1 }).average_boxes_per_shift, 0.33);
  assert.equal(computeShiftKpiMetrics({ ...ZERO, shiftCount: 8, totalLoading: 1 }).average_boxes_per_shift, 0.13);
  assert.equal(computeShiftKpiMetrics({ ...ZERO, shiftCount: 4, totalLoading: 10 }).average_boxes_per_shift, 2.5);
});

test("KS-M6: employee summary filter validates dates and rejects an employee filter", () => {
  assert.equal(employeeKpiSummaryFilterSchema.safeParse({}).success, true);
  assert.equal(employeeKpiSummaryFilterSchema.safeParse({ from: "2026-09-01", to: "2026-09-30", warehouse_code: "DEP-01", truck_type: "32FT" }).success, true);
  assert.equal(employeeKpiSummaryFilterSchema.safeParse({ from: "2026-02-31" }).success, false);
  assert.equal(employeeKpiSummaryFilterSchema.safeParse({ from: "2026-09-30", to: "2026-09-01" }).success, false);
  assert.equal(employeeKpiSummaryFilterSchema.safeParse({ warehouse_code: "  " }).success, false);
  // employee_id is not part of the employee schema, so it is dropped rather than honoured.
  const parsed = employeeKpiSummaryFilterSchema.parse({ employee_id: "x" } as Record<string, unknown>);
  assert.equal("employee_id" in parsed, false);
});

test("KS-M7: management filter accepts a UUID employee_id only", () => {
  assert.equal(managementKpiSummaryFilterSchema.safeParse({ employee_id: crypto.randomUUID() }).success, true);
  assert.equal(managementKpiSummaryFilterSchema.safeParse({ employee_id: "not-a-uuid" }).success, false);
});
