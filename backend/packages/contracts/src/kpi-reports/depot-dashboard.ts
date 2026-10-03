import { z } from "zod";
import { isValidCalendarDate } from "../shift-entries/index.js";
import { daysBetween } from "./results.js";

/**
 * Depot KPI dashboard: one depot (or, for organisation-wide roles, all
 * depots) over a range of operational dates (OPERATIONS_TIMEZONE).
 *
 * Every figure is derived on demand from records that already exist:
 * registered tasks, completed tasks with their BOX quantity and timing
 * events, employee assignments and daily depot reports. Nothing is stored and
 * there is no second KPI engine: per-employee figures come from the same
 * calculator (and attribution rules) as KPI results.
 *
 * SLA and Quality have no approved formula or target, so they are always
 * reported as NOT_CONFIGURED with no value.
 */

export const DEPOT_DASHBOARD_MAX_RANGE_DAYS = 92;

const dateSchema = (field: string) =>
  z.string().refine(isValidCalendarDate, { message: `${field} must be a valid calendar date in YYYY-MM-DD format` });

export const depotDashboardQuerySchema = z
  .object({
    depot_id: z.string().uuid({ message: "depot_id must be a valid UUID" }).optional(),
    from: dateSchema("from").optional(),
    to: dateSchema("to").optional()
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to) {
      if (value.to < value.from) {
        ctx.addIssue({ code: "custom", path: ["to"], message: "to must not be earlier than from" });
      } else if (daysBetween(value.from, value.to) + 1 > DEPOT_DASHBOARD_MAX_RANGE_DAYS) {
        ctx.addIssue({ code: "custom", path: ["to"], message: `The range may cover at most ${DEPOT_DASHBOARD_MAX_RANGE_DAYS} days` });
      }
    }
  });
export type DepotDashboardQuery = z.infer<typeof depotDashboardQuerySchema>;

/** A metric whose business rule has not been approved: never a number. */
export interface NotConfiguredMetricDTO {
  readonly status: "NOT_CONFIGURED";
  readonly value: null;
  readonly reason: string;
}

export const SLA_NOT_CONFIGURED: NotConfiguredMetricDTO = {
  status: "NOT_CONFIGURED",
  value: null,
  reason: "No SLA formula or target has been approved. Configure the SLA rule (target time per operation and the compliance formula) to enable it."
};

export const QUALITY_NOT_CONFIGURED: NotConfiguredMetricDTO = {
  status: "NOT_CONFIGURED",
  value: null,
  reason: "No quality KPI formula or target has been approved. Quality inspection records exist but are not converted into a KPI."
};

export interface DepotDashboardEmployeeRowDTO {
  readonly employee: { readonly id: string; readonly code: string; readonly name: string | null };
  /** BOX credited: each completed task's BOX shared equally between its assignees at completion. */
  readonly boxes: number;
  readonly tasks_completed: number;
  /** Recorded active minutes on completed tasks; null when no timing events exist. */
  readonly active_minutes: number | null;
  readonly average_task_minutes: number | null;
  readonly sla: NotConfiguredMetricDTO;
  readonly quality: NotConfiguredMetricDTO;
  readonly source_task_ids: readonly string[];
}

export interface DepotDashboardTaskDTO {
  readonly id: string;
  readonly task_code: string;
  readonly operation: "LOADING" | "UNLOADING" | "OTHER";
  readonly boxes: number;
  readonly completed_at: Date;
  readonly warehouse: string | null;
  readonly active_minutes: number | null;
  readonly assignees: ReadonlyArray<{ readonly id: string; readonly name: string | null }>;
}

export interface DepotDashboardReportDTO {
  readonly id: string;
  readonly report_date: string;
  readonly depot_code: string;
  readonly status: string;
  readonly loading_count: number;
  readonly unloading_count: number;
  readonly total_operations: number;
  readonly labour_required: number | null;
  readonly labour_present: number | null;
  readonly duration_minutes: number | null;
}

export interface DepotDashboardDTO {
  readonly overview: {
    readonly from: string;
    readonly to: string;
    readonly timezone: string;
    /** null = all depots (organisation-wide roles only). */
    readonly depot: { readonly id: string; readonly code: string; readonly name: string } | null;
    /** Depots this caller may choose (one for a Supervisor; every active depot for organisation-wide roles). */
    readonly available_depots: ReadonlyArray<{ readonly id: string; readonly code: string; readonly name: string }>;
    /** Active employees of the depot holding the SUPERVISOR or MANAGER role. */
    readonly supervisors: ReadonlyArray<{ readonly employee_id: string; readonly name: string | null }>;
  };
  readonly operations: {
    /** Tasks registered (created) in the range, by operation. */
    readonly loading_tasks: number;
    readonly unloading_tasks: number;
    readonly other_tasks: number;
    readonly total_tasks: number;
    /** Tasks completed in the range. */
    readonly completed_tasks: number;
    readonly completed_loading_tasks: number;
    readonly completed_unloading_tasks: number;
    /** completed_box_quantity of the completed tasks. */
    readonly boxes: number;
    readonly loading_boxes: number;
    readonly unloading_boxes: number;
  };
  readonly time: {
    /** Sum of recorded active minutes of completed tasks; null when none is timed. */
    readonly total_operational_minutes: number | null;
    /** total_operational_minutes ÷ timed completed tasks. */
    readonly average_task_minutes: number | null;
    readonly timed_tasks: number;
  };
  readonly labour: {
    /** Sums over the daily depot reports in the range that record labour. */
    readonly required: number | null;
    readonly present: number | null;
    /** present ÷ required × 100 (2 dp); null when labour is not recorded or required is 0. */
    readonly attendance_percent: number | null;
    readonly reports_with_labour: number;
  };
  readonly performance: {
    readonly sla: NotConfiguredMetricDTO;
    readonly quality: NotConfiguredMetricDTO;
  };
  readonly employees: readonly DepotDashboardEmployeeRowDTO[];
  /** Traceability: the records every figure above is derived from. */
  readonly sources: {
    readonly daily_reports: readonly DepotDashboardReportDTO[];
    readonly completed_tasks: readonly DepotDashboardTaskDTO[];
  };
}
