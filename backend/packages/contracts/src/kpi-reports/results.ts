import { z } from "zod";
import { isValidCalendarDate } from "../shift-entries/index.js";

/**
 * KPI results V1: calculated on demand from completed tasks (tasks,
 * task_assignments, task_events, depots) for each active KPI definition whose
 * `code` maps to a supported calculation below. Nothing is persisted:
 * results are deterministic for the same data, period and definition.
 * No scores, rankings, incentives or payroll.
 */

export const KPI_RESULT_PERIODS = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type KpiResultPeriodKind = (typeof KPI_RESULT_PERIODS)[number];

export const KPI_RESULT_STATUSES = ["PENDING", "AVAILABLE", "NOT_AVAILABLE"] as const;
export type KpiResultStatus = (typeof KPI_RESULT_STATUSES)[number];

export const KPI_RESULT_METRICS = ["BOXES_HANDLED", "TASKS_COMPLETED", "TIME_TAKEN", "AVERAGE_BOXES_PER_TASK", "SLA_COMPLIANCE"] as const;
export type KpiResultMetric = (typeof KPI_RESULT_METRICS)[number];

export const KPI_RESULT_OPERATIONS = ["TASK", "WAREHOUSE", "LOADING", "UNLOADING"] as const;
export type KpiResultOperation = (typeof KPI_RESULT_OPERATIONS)[number];

export type KpiResultUnit = "BOX" | "COUNT" | "DURATION" | "PERCENTAGE";
export type KpiResultCalculationKind = "BOXES" | "TASKS" | "ACTIVE_MINUTES" | "AVERAGE_BOXES" | "SLA";

export interface KpiResultCalculation {
  readonly metric: KpiResultMetric;
  readonly operation: KpiResultOperation;
  /** Which completed tasks count: loading only, unloading only, or all. */
  readonly taskScope: "ALL" | "LOADING" | "UNLOADING";
  readonly kind: KpiResultCalculationKind;
  readonly unit: KpiResultUnit;
  readonly category: "PRODUCTIVITY" | "TIMELINESS";
  readonly direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
}

/**
 * Supported calculations, keyed by `kpi_definitions.code`. A definition with
 * any other code is not calculable (400 KPI_NOT_CALCULABLE when requested).
 * Metric, unit, category and direction follow the existing frontend KPI
 * metric catalogue. DURATION values are minutes (as in the catalogue);
 * source references keep exact seconds.
 */
export const KPI_RESULT_CALCULATIONS: Readonly<Record<string, KpiResultCalculation>> = {
  BOXES_HANDLED: { metric: "BOXES_HANDLED", operation: "WAREHOUSE", taskScope: "ALL", kind: "BOXES", unit: "BOX", category: "PRODUCTIVITY", direction: "HIGHER_IS_BETTER" },
  LOADING_BOXES: { metric: "BOXES_HANDLED", operation: "LOADING", taskScope: "LOADING", kind: "BOXES", unit: "BOX", category: "PRODUCTIVITY", direction: "HIGHER_IS_BETTER" },
  UNLOADING_BOXES: { metric: "BOXES_HANDLED", operation: "UNLOADING", taskScope: "UNLOADING", kind: "BOXES", unit: "BOX", category: "PRODUCTIVITY", direction: "HIGHER_IS_BETTER" },
  TASKS_COMPLETED: { metric: "TASKS_COMPLETED", operation: "TASK", taskScope: "ALL", kind: "TASKS", unit: "COUNT", category: "PRODUCTIVITY", direction: "HIGHER_IS_BETTER" },
  TASK_TIME: { metric: "TIME_TAKEN", operation: "TASK", taskScope: "ALL", kind: "ACTIVE_MINUTES", unit: "DURATION", category: "TIMELINESS", direction: "LOWER_IS_BETTER" },
  LOADING_TIME: { metric: "TIME_TAKEN", operation: "LOADING", taskScope: "LOADING", kind: "ACTIVE_MINUTES", unit: "DURATION", category: "TIMELINESS", direction: "LOWER_IS_BETTER" },
  UNLOADING_TIME: { metric: "TIME_TAKEN", operation: "UNLOADING", taskScope: "UNLOADING", kind: "ACTIVE_MINUTES", unit: "DURATION", category: "TIMELINESS", direction: "LOWER_IS_BETTER" },
  AVERAGE_BOXES_PER_TASK: { metric: "AVERAGE_BOXES_PER_TASK", operation: "TASK", taskScope: "ALL", kind: "AVERAGE_BOXES", unit: "BOX", category: "PRODUCTIVITY", direction: "HIGHER_IS_BETTER" },
  LOADING_SLA_COMPLIANCE: { metric: "SLA_COMPLIANCE", operation: "LOADING", taskScope: "LOADING", kind: "SLA", unit: "PERCENTAGE", category: "TIMELINESS", direction: "HIGHER_IS_BETTER" },
  UNLOADING_SLA_COMPLIANCE: { metric: "SLA_COMPLIANCE", operation: "UNLOADING", taskScope: "UNLOADING", kind: "SLA", unit: "PERCENTAGE", category: "TIMELINESS", direction: "HIGHER_IS_BETTER" }
};

export const KPI_RESULT_CALCULATION_VERSION = "task-kpi-v1";

/** Longest range (inclusive, in days) accepted per period kind. */
export const KPI_RESULT_MAX_RANGE_DAYS: Readonly<Record<KpiResultPeriodKind, number>> = { DAILY: 92, WEEKLY: 371, MONTHLY: 731 };

const dateSchema = (field: string) =>
  z.string().refine(isValidCalendarDate, { message: `${field} must be a valid calendar date in YYYY-MM-DD format` });

export const listKpiResultsFilterSchema = z
  .object({
    period: z.enum(KPI_RESULT_PERIODS, { message: `period must be one of ${KPI_RESULT_PERIODS.join(", ")}` }).default("DAILY"),
    from: dateSchema("from").optional(),
    to: dateSchema("to").optional(),
    employee_id: z.string().uuid({ message: "employee_id must be a valid UUID" }).optional(),
    kpi_id: z.string().uuid({ message: "kpi_id must be a valid UUID" }).optional(),
    metric: z.enum(KPI_RESULT_METRICS, { message: `metric must be one of ${KPI_RESULT_METRICS.join(", ")}` }).optional(),
    operation: z.enum(KPI_RESULT_OPERATIONS, { message: `operation must be one of ${KPI_RESULT_OPERATIONS.join(", ")}` }).optional(),
    status: z.enum(KPI_RESULT_STATUSES, { message: `status must be one of ${KPI_RESULT_STATUSES.join(", ")}` }).optional(),
    warehouse_code: z.string().trim().min(1, { message: "warehouse_code cannot be empty" }).optional(),
    search: z.string().trim().min(1).max(100, { message: "search must be at most 100 characters" }).optional()
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.to < value.from) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "to must not be earlier than from" });
    }
  });
export type ListKpiResultsFilter = z.infer<typeof listKpiResultsFilterSchema>;

// ---------------------------------------------------------------------------
// Calendar helpers (pure date arithmetic on YYYY-MM-DD; no timezone involved)
// ---------------------------------------------------------------------------

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}
function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
export function addDays(iso: string, days: number): string {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toDate(toIso).getTime() - toDate(fromIso).getTime()) / 86_400_000);
}

/** First day of the period containing `iso`: the date itself, the ISO-week Monday, or the 1st of the month. */
export function periodStartFor(kind: KpiResultPeriodKind, iso: string): string {
  if (kind === "DAILY") return iso;
  const date = toDate(iso);
  if (kind === "WEEKLY") {
    const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0
    return addDays(iso, -weekday);
  }
  return `${iso.slice(0, 7)}-01`;
}

/** Last day (inclusive) of the period starting at `start`. */
export function periodEndFor(kind: KpiResultPeriodKind, start: string): string {
  if (kind === "DAILY") return start;
  if (kind === "WEEKLY") return addDays(start, 6);
  const date = toDate(start);
  return toIso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function periodLabel(kind: KpiResultPeriodKind, start: string): string {
  if (kind === "DAILY") return start;
  if (kind === "WEEKLY") return `Week of ${start}`;
  return `${MONTHS[Number(start.slice(5, 7)) - 1]} ${start.slice(0, 4)}`;
}

/** Calendar date of `instant` in `timeZone` (IANA), as YYYY-MM-DD. */
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Result ids are deterministic: `<kpiId>_<employeeId>_<period>_<periodStart>`. */
export function kpiResultId(kpiId: string, employeeId: string, kind: KpiResultPeriodKind, start: string): string {
  return `${kpiId}_${employeeId}_${kind}_${start}`;
}

export function parseKpiResultId(id: string): { kpiId: string; employeeId: string; period: KpiResultPeriodKind; start: string } | null {
  const parts = id.split("_");
  if (parts.length !== 4) return null;
  const [kpiId, employeeId, period, start] = parts as [string, string, string, string];
  const uuid = z.string().uuid();
  if (!uuid.safeParse(kpiId).success || !uuid.safeParse(employeeId).success) return null;
  if (!(KPI_RESULT_PERIODS as readonly string[]).includes(period) || !isValidCalendarDate(start)) return null;
  const kind = period as KpiResultPeriodKind;
  if (periodStartFor(kind, start) !== start) return null;
  return { kpiId, employeeId, period: kind, start };
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface KpiResultSourceReferenceDTO {
  /** The completed task (source record). */
  readonly source_record_id: string;
  /** Source type of the measured operation (matches the frontend traceability contract). */
  readonly source_type: "TASK" | "WAREHOUSE_OPERATION" | "LOADING_OPERATION" | "UNLOADING_OPERATION";
  readonly task_id: string;
  readonly task_code: string;
  /** The operation measured by this result (not the task's own type). */
  readonly operation_type: KpiResultOperation;
  readonly employee_id: string;
  readonly timestamp: Date;
  /** This task's contribution to the result value, in the result's unit. */
  readonly raw_metric_value: number | null;
  readonly quantity: { readonly value: number; readonly unit: "BOX" };
  readonly duration_seconds: number | null;
  readonly warehouse: string | null;
  /** Employees assigned at completion; boxes are shared equally between them. */
  readonly participants: number;
}

export interface KpiResultDTO {
  readonly id: string;
  readonly employee: { readonly id: string; readonly code: string; readonly name: string | null };
  readonly kpi: { readonly id: string; readonly code: string; readonly name: string };
  /** The KPI definition record and version the result was calculated against. */
  readonly rule_version_id: string;
  readonly metric: KpiResultMetric;
  readonly category: KpiResultCalculation["category"];
  readonly operation: KpiResultOperation;
  readonly scope: "OWN";
  readonly period: { readonly kind: KpiResultPeriodKind; readonly start: string; readonly end: string; readonly label: string; readonly timezone: string };
  /** null when not calculable (status NOT_AVAILABLE). */
  readonly actual: { readonly value: number; readonly unit: KpiResultUnit } | null;
  /** null when no target is configured for this KPI and period. */
  readonly target: { readonly value: number; readonly unit: KpiResultUnit; readonly target_id: string } | null;
  readonly unit: KpiResultUnit;
  readonly direction: KpiResultCalculation["direction"];
  readonly status: KpiResultStatus;
  readonly not_available_reason: string | null;
  readonly source: "TASK";
  readonly source_count: number;
  readonly calculated_at: Date;
  readonly calculation_version: string;
}

export interface KpiResultDetailDTO extends KpiResultDTO {
  readonly source_references: readonly KpiResultSourceReferenceDTO[];
}
