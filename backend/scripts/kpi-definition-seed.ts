import crypto from "node:crypto";
import { KPI_RESULT_CALCULATIONS } from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";

/**
 * V1 KPI definitions for the codes the KPI result calculator supports.
 *
 * Seeded: calculations that read only recorded operational facts (completed
 * BOX quantity, completed tasks, recorded task timing).
 *
 * Deliberately NOT seeded:
 * - LOADING_SLA_COMPLIANCE / UNLOADING_SLA_COMPLIANCE: SLA targets and the SLA
 *   formula are CLIENT DECISION REQUIRED (backend/docs/architecture/17-approved-business-rules.md),
 *   so they could only ever report NOT_AVAILABLE.
 * - Targets, thresholds, weights, scores: none are approved; kpi_targets stays empty.
 *
 * Idempotent: rows are inserted only when no definition with that code exists
 * (ON CONFLICT on the unique code). Existing definitions, including ones an
 * administrator edited or deactivated, are never modified.
 */
export interface KpiDefinitionSeed {
  readonly code: string;
  readonly name: string;
  readonly pillar: string;
  readonly unit: string;
  readonly description: string;
  readonly formulaReference: string;
}

export const V1_KPI_DEFINITION_SEEDS: readonly KpiDefinitionSeed[] = [
  { code: "BOXES_HANDLED", name: "Boxes handled", pillar: "PRODUCTIVITY", unit: "BOX", description: "Completed BOX quantity on completed tasks, shared equally between the employees assigned at completion.", formulaReference: "SUM(completed_box_quantity / participants)" },
  { code: "LOADING_BOXES", name: "Loading boxes", pillar: "PRODUCTIVITY", unit: "BOX", description: "Completed BOX quantity on completed loading tasks.", formulaReference: "SUM(completed_box_quantity / participants) WHERE task is LOADING" },
  { code: "UNLOADING_BOXES", name: "Unloading boxes", pillar: "PRODUCTIVITY", unit: "BOX", description: "Completed BOX quantity on completed unloading tasks.", formulaReference: "SUM(completed_box_quantity / participants) WHERE task is UNLOADING" },
  { code: "TASKS_COMPLETED", name: "Tasks completed", pillar: "PRODUCTIVITY", unit: "COUNT", description: "Number of completed tasks the employee was assigned to at completion.", formulaReference: "COUNT(completed tasks)" },
  { code: "TASK_TIME", name: "Active task time", pillar: "TIMELINESS", unit: "MINUTES", description: "Recorded active working time (start/resume to pause/complete) on completed tasks.", formulaReference: "SUM(active time) / 60 s" },
  { code: "LOADING_TIME", name: "Loading time", pillar: "TIMELINESS", unit: "MINUTES", description: "Recorded active working time on completed loading tasks.", formulaReference: "SUM(active time) / 60 s WHERE task is LOADING" },
  { code: "UNLOADING_TIME", name: "Unloading time", pillar: "TIMELINESS", unit: "MINUTES", description: "Recorded active working time on completed unloading tasks.", formulaReference: "SUM(active time) / 60 s WHERE task is UNLOADING" },
  { code: "AVERAGE_BOXES_PER_TASK", name: "Average boxes per task", pillar: "PRODUCTIVITY", unit: "BOX", description: "Credited BOX quantity divided by completed tasks.", formulaReference: "BOXES_HANDLED / TASKS_COMPLETED" }
];

/** Codes supported by the calculator that are intentionally left unseeded (unapproved business rules). */
export const UNSEEDED_KPI_CODES: readonly string[] = ["LOADING_SLA_COMPLIANCE", "UNLOADING_SLA_COMPLIANCE"];

export async function seedKpiDefinitions(database: DatabaseConnection): Promise<{ inserted: string[]; skipped: string[] }> {
  const inserted: string[] = [];
  const skipped: string[] = [];
  for (const seed of V1_KPI_DEFINITION_SEEDS) {
    if (!KPI_RESULT_CALCULATIONS[seed.code]) {
      throw new Error(`KPI seed '${seed.code}' has no supported result calculation.`);
    }
    // The calculator matches codes case-insensitively, so any existing spelling counts as configured.
    const existing = await database.selectFrom("kpi_definitions").select("id").where(sql<string>`upper(code)`, "=", seed.code).executeTakeFirst();
    if (existing) {
      skipped.push(seed.code);
      continue;
    }
    const result = await database
      .insertInto("kpi_definitions")
      .values({
        id: crypto.randomUUID(),
        code: seed.code,
        name: seed.name,
        pillar: seed.pillar,
        description: seed.description,
        unit: seed.unit,
        formula_reference: seed.formulaReference,
        active: true,
        effective_from: null,
        effective_to: null
      })
      .onConflict((conflict) => conflict.column("code").doNothing())
      .executeTakeFirst();
    (Number(result.numInsertedOrUpdatedRows ?? 0) > 0 ? inserted : skipped).push(seed.code);
  }
  return { inserted, skipped };
}
