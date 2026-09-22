import { z } from "zod";

export * from "./reports.js";

export const listKpiSnapshotsFilterSchema = z.object({
  kpi_code: z.string().trim().min(1).optional(),
  depot_id: z.string().uuid().optional(),
  employee_id: z.string().uuid().optional(),
  period_start: z.coerce.date().optional(),
  period_end: z.coerce.date().optional()
});
export type ListKpiSnapshotsFilter = z.infer<typeof listKpiSnapshotsFilterSchema>;

/**
 * `status` is always "FINAL" and `sourceSummary` is always null (Assumption:
 * reconciliation doc). The underlying kpi_snapshots table has no workflow
 * status column and no free-text source summary; this DTO exposes the shape
 * the frontend expects with honest, documented placeholder values rather
 * than fabricating data that isn't tracked.
 */
export interface KpiSnapshotDTO {
  readonly id: string;
  readonly kpi_code: string;
  readonly kpi_name: string;
  readonly value: string;
  readonly target_value: string | null;
  readonly depot_id: string | null;
  readonly employee_id: string | null;
  readonly period_start: Date | null;
  readonly period_end: Date | null;
  readonly snapshot_at: Date;
  readonly status: "FINAL";
  readonly sourceSummary: null;
}

export interface KpiDrillDownDTO {
  readonly kpi_code: string;
  readonly snapshots: readonly KpiSnapshotDTO[];
}

export const dashboardFilterSchema = z.object({
  depot_id: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});
export type DashboardFilter = z.infer<typeof dashboardFilterSchema>;

/**
 * `slaCompliance` and `payrollStatus` are always null (Assumption:
 * reconciliation doc). SLA targets per depot/task-type were never defined,
 * and payroll has no disbursement/paid state yet (see payroll module docs),
 * so both fields are honestly null rather than fabricated.
 */
export interface DashboardSummaryDTO {
  readonly tasksByStatus: Record<string, number>;
  readonly boxesHandled: string;
  readonly qualitySummary: {
    readonly totalInspections: number;
    readonly passCount: number;
    readonly failCount: number;
    readonly averageDamageRate: number | null;
  };
  readonly incentiveTotalsByStatus: Record<string, string>;
  readonly inventoryStatusCounts: Record<string, number>;
  readonly employeeCountsByDepartment: Record<string, number>;
  readonly slaCompliance: null;
  readonly payrollStatus: null;
}
