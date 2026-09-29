import { z } from "zod";

/**
 * Read-only KPI configuration over the existing `kpi_definitions` and
 * `kpi_targets` tables (migration 010). No scores, rankings, incentives or
 * payroll: definitions describe what is measured; targets hold the approved
 * target and threshold values with their effective periods.
 */

export const KPI_DEFINITION_STATUSES = ["ACTIVE", "SCHEDULED", "EXPIRED", "INACTIVE"] as const;
export type KpiDefinitionStatus = (typeof KPI_DEFINITION_STATUSES)[number];

/**
 * Derived from the stored `active` flag and effective range at `now`:
 * INACTIVE when switched off; otherwise SCHEDULED before `effective_from`,
 * EXPIRED after `effective_to`, else ACTIVE. Open-ended bounds never limit.
 */
export function kpiDefinitionStatus(
  definition: { active: boolean; effective_from: Date | null; effective_to: Date | null },
  now: Date
): KpiDefinitionStatus {
  if (!definition.active) return "INACTIVE";
  if (definition.effective_from && definition.effective_from > now) return "SCHEDULED";
  if (definition.effective_to && definition.effective_to < now) return "EXPIRED";
  return "ACTIVE";
}

export function isTargetCurrent(target: { effective_from: Date; effective_to: Date | null }, now: Date): boolean {
  return target.effective_from <= now && (target.effective_to === null || target.effective_to >= now);
}

export const listKpiDefinitionsFilterSchema = z.object({
  search: z.string().trim().min(1).max(100, { message: "search must be at most 100 characters" }).optional(),
  pillar: z.string().trim().min(1, { message: "pillar cannot be empty" }).optional(),
  status: z.enum(KPI_DEFINITION_STATUSES, { message: `status must be one of ${KPI_DEFINITION_STATUSES.join(", ")}` }).optional()
});
export type ListKpiDefinitionsFilter = z.infer<typeof listKpiDefinitionsFilterSchema>;

export interface KpiTargetDTO {
  readonly id: string;
  /** Numeric values are strings to keep the database's exact decimal precision. */
  readonly target_value: string;
  readonly warning_threshold: string | null;
  readonly critical_threshold: string | null;
  readonly effective_from: Date;
  readonly effective_to: Date | null;
  /** null = applies to every warehouse. */
  readonly warehouse: { readonly id: string; readonly code: string; readonly name: string } | null;
  readonly is_current: boolean;
}

export interface KpiDefinitionConfigDTO {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly pillar: string | null;
  readonly description: string | null;
  readonly unit: string | null;
  readonly formula_reference: string | null;
  readonly active: boolean;
  readonly effective_from: Date | null;
  readonly effective_to: Date | null;
  readonly status: KpiDefinitionStatus;
  /** Targets in force now (one per warehouse scope, plus any all-warehouse target). */
  readonly current_targets: readonly KpiTargetDTO[];
  readonly target_count: number;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly version: string;
}

export interface KpiDefinitionConfigDetailDTO extends KpiDefinitionConfigDTO {
  /** Every target row, newest effective date first: the target/threshold history. */
  readonly targets: readonly KpiTargetDTO[];
}
