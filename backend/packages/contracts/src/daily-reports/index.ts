import { z } from "zod";
import { isValidCalendarDate, MAX_COUNT, normalizeTime } from "../shift-entries/index.js";

/**
 * Supervisor daily depot report.
 *
 * Example (from the client):
 *   Date 30.09.2026 · Loading 11 · Unloading 10 · 32ft 5 · Crossing 0 ·
 *   Total 21 · Start 10:00 · End 22:30 · Labour 23/23
 *
 * Loading/unloading here are OPERATION COUNTS (11 + 10 = 21 operations), not
 * BOX quantities. Total operations and duration are always derived on the
 * server (`deriveDailyReportFigures`) and are never accepted from clients.
 */

export type DailyReportErrorCode =
  | "DAILY_REPORT_NOT_FOUND"
  | "DAILY_REPORT_DUPLICATE"
  | "DAILY_REPORT_LOCKED"
  | "DAILY_REPORT_VERSION_CONFLICT"
  | "DAILY_REPORT_INCOMPLETE"
  | "DEPOT_ASSIGNMENT_REQUIRED"
  | "DEPOT_FORBIDDEN"
  | "INVALID_DEPOT"
  | "INVALID_TRUCK_TYPE"
  | "VALIDATION_FAILED";

export interface DailyReportErrorField {
  readonly field?: string;
  readonly code?: string;
  readonly message: string;
}

export class DailyReportDomainError extends Error {
  public readonly code: DailyReportErrorCode;
  public readonly fields: readonly DailyReportErrorField[] | undefined;

  public constructor(code: DailyReportErrorCode, message: string, fields?: readonly DailyReportErrorField[]) {
    super(message);
    this.name = "DailyReportDomainError";
    this.code = code;
    this.fields = fields;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const DAILY_REPORT_STATUSES = ["DRAFT", "SUBMITTED"] as const;
export type DailyReportStatus = (typeof DAILY_REPORT_STATUSES)[number];

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const reportDateSchema = z
  .string({ message: "report_date is required" })
  .refine(isValidCalendarDate, { message: "report_date must be a valid calendar date in YYYY-MM-DD format" });

const optionalTime = (field: string) =>
  z
    .string()
    .refine((value) => normalizeTime(value) !== null, { message: `${field} must be a valid time in HH:MM or HH:MM:SS format` })
    .transform((value) => normalizeTime(value) as string)
    .nullable()
    .optional();

const count = (field: string) =>
  z
    .number({ message: `${field} is required and must be a number` })
    .int({ message: `${field} must be an integer` })
    .min(0, { message: `${field} cannot be negative` })
    .max(MAX_COUNT, { message: `${field} is too large` });

const optionalCount = (field: string) => count(field).nullable().optional();

export const dailyReportVehicleSchema = z.strictObject({
  truck_type_code: z.string({ message: "truck_type_code is required" }).trim().min(1).transform((value) => value.toUpperCase()),
  count: count("count")
});

function refineReport(value: { start_time?: string | null | undefined; end_time?: string | null | undefined; vehicles?: ReadonlyArray<{ truck_type_code: string }> | undefined }, ctx: z.RefinementCtx): void {
  // Overnight operations are not supported (same rule as shift entries): end must be after start.
  if (value.start_time && value.end_time && value.end_time <= value.start_time) {
    ctx.addIssue({ code: "custom", path: ["end_time"], message: "end_time must be later than start_time" });
  }
  const seen = new Set<string>();
  (value.vehicles ?? []).forEach((vehicle, index) => {
    if (seen.has(vehicle.truck_type_code)) {
      ctx.addIssue({ code: "custom", path: ["vehicles", index, "truck_type_code"], message: "Duplicate vehicle type in request" });
    }
    seen.add(vehicle.truck_type_code);
  });
}

/**
 * Derived fields (total operations, duration) and audit fields are not
 * accepted: the strict object rejects them. `depot_id` is honoured only for
 * callers allowed to report for any depot; supervisors always report for the
 * depot of their own employee profile.
 */
export const createDailyReportRequestSchema = z
  .strictObject({
    depot_id: z.string().uuid({ message: "depot_id must be a valid UUID" }).optional(),
    report_date: reportDateSchema,
    loading_count: count("loading_count"),
    unloading_count: count("unloading_count"),
    start_time: optionalTime("start_time"),
    end_time: optionalTime("end_time"),
    labour_required: optionalCount("labour_required"),
    labour_present: optionalCount("labour_present"),
    vehicles: z.array(dailyReportVehicleSchema).default([])
  })
  .superRefine(refineReport);
export type CreateDailyReportRequest = z.infer<typeof createDailyReportRequestSchema>;

/** Partial update of a DRAFT report. `version` guards against lost updates. */
export const updateDailyReportRequestSchema = z
  .strictObject({
    version: z.string({ message: "version is required" }).regex(/^\d+$/, { message: "version must be a positive integer string" }),
    loading_count: count("loading_count").optional(),
    unloading_count: count("unloading_count").optional(),
    start_time: optionalTime("start_time"),
    end_time: optionalTime("end_time"),
    labour_required: optionalCount("labour_required"),
    labour_present: optionalCount("labour_present"),
    vehicles: z.array(dailyReportVehicleSchema).optional()
  })
  .superRefine(refineReport);
export type UpdateDailyReportRequest = z.infer<typeof updateDailyReportRequestSchema>;

export const submitDailyReportRequestSchema = z.strictObject({
  version: z.string({ message: "version is required" }).regex(/^\d+$/, { message: "version must be a positive integer string" })
});

export const listDailyReportsFilterSchema = z
  .object({
    depot_id: z.string().uuid({ message: "depot_id must be a valid UUID" }).optional(),
    from: reportDateSchema.optional(),
    to: reportDateSchema.optional(),
    status: z.enum(DAILY_REPORT_STATUSES).optional()
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.to < value.from) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "to must not be earlier than from" });
    }
  });
export type ListDailyReportsFilter = z.infer<typeof listDailyReportsFilterSchema>;

// ---------------------------------------------------------------------------
// Derived figures (single source of truth for every client)
// ---------------------------------------------------------------------------

function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
}

export interface DailyReportFigures {
  /** loading_count + unloading_count */
  readonly total_operations: number;
  /** end_time - start_time in minutes; null until both times are recorded. */
  readonly duration_minutes: number | null;
}

export function deriveDailyReportFigures(report: {
  readonly loading_count: number;
  readonly unloading_count: number;
  readonly start_time: string | null;
  readonly end_time: string | null;
}): DailyReportFigures {
  const duration = report.start_time && report.end_time ? minutesOfDay(report.end_time) - minutesOfDay(report.start_time) : null;
  return {
    total_operations: report.loading_count + report.unloading_count,
    duration_minutes: duration !== null && duration > 0 ? duration : null
  };
}

/** Fields that must be recorded before a report can be submitted. */
export const DAILY_REPORT_SUBMISSION_FIELDS = ["start_time", "end_time", "labour_required", "labour_present"] as const;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface DailyReportDepotDTO {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface DailyReportVehicleDTO {
  readonly truck_type: { readonly id: string; readonly code: string; readonly name: string };
  readonly count: number;
}

/**
 * Completed tasks registered in the CRM for the same depot and operational
 * date (OPERATIONS_TIMEZONE). Shown beside the supervisor's figures so the
 * report is traceable to the task records that drive KPI results.
 */
export interface DailyReportRegisteredTasksDTO {
  readonly loading_tasks_completed: number;
  readonly unloading_tasks_completed: number;
  readonly loading_boxes: number;
  readonly unloading_boxes: number;
  readonly timezone: string;
}

export interface DailyReportDTO extends DailyReportFigures {
  readonly id: string;
  readonly depot: DailyReportDepotDTO;
  readonly supervisor_employee_id: string | null;
  readonly report_date: string;
  readonly loading_count: number;
  readonly unloading_count: number;
  readonly start_time: string | null;
  readonly end_time: string | null;
  readonly labour_required: number | null;
  readonly labour_present: number | null;
  readonly vehicles: readonly DailyReportVehicleDTO[];
  readonly status: DailyReportStatus;
  readonly submitted_at: Date | null;
  readonly submitted_by_user_id: string | null;
  readonly approved_at: Date | null;
  readonly approved_by_user_id: string | null;
  readonly created_by_user_id: string;
  readonly updated_by_user_id: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly version: string;
  readonly registered_tasks: DailyReportRegisteredTasksDTO;
}

export interface DailyReportOptionsDTO {
  /** Depots the caller may report for (one for a supervisor, all active ones for administrators). */
  readonly depots: readonly DailyReportDepotDTO[];
  readonly truck_types: ReadonlyArray<{ readonly id: string; readonly code: string; readonly name: string }>;
}
