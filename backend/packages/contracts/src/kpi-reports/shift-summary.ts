import { z } from "zod";
import { isValidCalendarDate } from "../shift-entries/index.js";

/** Identifies which operational source produced a KPI figure. */
export const KPI_SUMMARY_SOURCES = ["SHIFT_ENTRY"] as const;
export type KpiSummarySource = (typeof KPI_SUMMARY_SOURCES)[number];

const dateSchema = (field: string) =>
  z.string().refine(isValidCalendarDate, { message: `${field} must be a valid calendar date in YYYY-MM-DD format` });

const codeSchema = (field: string) => z.string().trim().min(1, { message: `${field} cannot be empty` });

const filterShape = {
  from: dateSchema("from").optional(),
  to: dateSchema("to").optional(),
  warehouse_code: codeSchema("warehouse_code").optional(),
  truck_type: codeSchema("truck_type").optional()
};

function refineRange(value: { from?: string | undefined; to?: string | undefined }, ctx: z.RefinementCtx): void {
  if (value.from && value.to && value.to < value.from) {
    ctx.addIssue({ code: "custom", path: ["to"], message: "to must not be earlier than from" });
  }
}

/** Filters for the authenticated employee's own summary (no employee filter: the session decides). */
export const employeeKpiSummaryFilterSchema = z.object(filterShape).superRefine(refineRange);
export type EmployeeKpiSummaryFilter = z.infer<typeof employeeKpiSummaryFilterSchema>;

/** Filters for the management summary; `employee_id` narrows to one employee. */
export const managementKpiSummaryFilterSchema = z
  .object({ ...filterShape, employee_id: z.string().uuid({ message: "employee_id must be a valid UUID" }).optional() })
  .superRefine(refineRange);
export type ManagementKpiSummaryFilter = z.infer<typeof managementKpiSummaryFilterSchema>;

/**
 * Metrics derived from shift entries. Units: boxes (BOX), seconds, and
 * boxes per hour. Averages and productivity are `null` when the
 * denominator is zero (no shifts / no duration): never fabricated.
 * See Docs/api/kpi-shift-summary.md for the exact formulas.
 */
export interface ShiftKpiMetrics {
  readonly shift_count: number;
  readonly total_unloading: number;
  readonly total_loading: number;
  readonly total_boxes: number;
  readonly average_boxes_per_shift: number | null;
  readonly total_labour_count: number;
  readonly average_labour_count: number | null;
  readonly total_shift_duration_seconds: number;
  readonly average_shift_duration_seconds: number | null;
  readonly loading_productivity_boxes_per_hour: number | null;
  readonly unloading_productivity_boxes_per_hour: number | null;
  readonly warehouse_associations: number;
  readonly distinct_warehouses: number;
}

export interface KpiSummaryAppliedFilters {
  readonly from: string | null;
  readonly to: string | null;
  readonly warehouse_code: string | null;
  readonly truck_type: string | null;
  readonly employee_id: string | null;
}

export interface EmployeeKpiSummaryDTO {
  readonly source: KpiSummarySource;
  readonly unit: "BOX";
  readonly employee_id: string;
  readonly filters: KpiSummaryAppliedFilters;
  readonly metrics: ShiftKpiMetrics;
}

export interface EmployeeKpiRowDTO {
  readonly employee_id: string;
  readonly employee_code: string;
  readonly employee_name: string | null;
  readonly metrics: ShiftKpiMetrics;
}

export interface ManagementKpiSummaryDTO {
  readonly source: KpiSummarySource;
  readonly unit: "BOX";
  readonly filters: KpiSummaryAppliedFilters;
  /** Aggregate over every matching shift entry (not just the returned employee page). */
  readonly metrics: ShiftKpiMetrics;
  /** One row per employee with at least one matching entry, ordered by name then code. */
  readonly employees: readonly EmployeeKpiRowDTO[];
}
