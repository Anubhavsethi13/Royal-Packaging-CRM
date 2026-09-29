import type {
  KpiDefinitionConfigDetailDTO,
  KpiDefinitionConfigDTO,
  KpiTargetDTO,
  ListKpiDefinitionsFilter
} from "@royal-packaging/contracts";
import { isTargetCurrent, kpiDefinitionStatus } from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";

interface DefinitionRow {
  id: string;
  code: string;
  name: string;
  pillar: string | null;
  description: string | null;
  unit: string | null;
  formula_reference: string | null;
  active: boolean;
  effective_from: Date | null;
  effective_to: Date | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

/**
 * Reads KPI configuration (definitions + targets) for KpiService. Read-only:
 * there is no configuration write path in the backend yet.
 */
export class KpiConfigurationReader {
  private readonly database: DatabaseConnection;

  public constructor(database: DatabaseConnection) {
    this.database = database;
  }

  public async list(
    filter: ListKpiDefinitionsFilter,
    page: { limit: number; offset: number },
    now: Date
  ): Promise<{ items: KpiDefinitionConfigDTO[]; total: number }> {
    let query = this.database.selectFrom("kpi_definitions");

    if (filter.search) {
      const term = `%${filter.search.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
      query = query.where((eb) => eb.or([eb("kpi_definitions.code", "ilike", term), eb("kpi_definitions.name", "ilike", term)]));
    }
    if (filter.pillar) {
      query = query.where(sql<string>`upper(kpi_definitions.pillar)`, "=", filter.pillar.toUpperCase());
    }
    if (filter.status) {
      const started = sql<boolean>`(kpi_definitions.effective_from is null or kpi_definitions.effective_from <= ${now})`;
      const notEnded = sql<boolean>`(kpi_definitions.effective_to is null or kpi_definitions.effective_to >= ${now})`;
      switch (filter.status) {
        case "INACTIVE":
          query = query.where("kpi_definitions.active", "=", false);
          break;
        case "SCHEDULED":
          query = query.where("kpi_definitions.active", "=", true).where("kpi_definitions.effective_from", ">", now);
          break;
        case "EXPIRED":
          query = query.where("kpi_definitions.active", "=", true).where(started).where("kpi_definitions.effective_to", "<", now);
          break;
        case "ACTIVE":
          query = query.where("kpi_definitions.active", "=", true).where(started).where(notEnded);
          break;
      }
    }

    const [countRow, rows] = await Promise.all([
      query.select(sql<string>`count(*)`.as("total")).executeTakeFirst(),
      query
        .selectAll("kpi_definitions")
        .orderBy("kpi_definitions.code", "asc")
        .orderBy("kpi_definitions.id", "asc")
        .limit(page.limit)
        .offset(page.offset)
        .execute()
    ]);

    const targets = await this.targetsFor(rows.map((row) => row.id), now);
    return {
      total: Number(countRow?.total ?? 0),
      items: rows.map((row) => this.toDTO(row, targets.get(row.id) ?? [], now))
    };
  }

  public async get(id: string, now: Date): Promise<KpiDefinitionConfigDetailDTO | null> {
    const row = await this.database.selectFrom("kpi_definitions").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) {
      return null;
    }
    const targets = (await this.targetsFor([row.id], now)).get(row.id) ?? [];
    return { ...this.toDTO(row, targets, now), targets };
  }

  private async targetsFor(definitionIds: string[], now: Date): Promise<Map<string, KpiTargetDTO[]>> {
    const byDefinition = new Map<string, KpiTargetDTO[]>();
    if (definitionIds.length === 0) {
      return byDefinition;
    }
    const rows = await this.database
      .selectFrom("kpi_targets")
      .leftJoin("depots", "depots.id", "kpi_targets.depot_id")
      .select([
        "kpi_targets.id",
        "kpi_targets.kpi_definition_id",
        sql<string>`kpi_targets.target_value::text`.as("target_value"),
        sql<string | null>`kpi_targets.warning_threshold::text`.as("warning_threshold"),
        sql<string | null>`kpi_targets.critical_threshold::text`.as("critical_threshold"),
        "kpi_targets.effective_from",
        "kpi_targets.effective_to",
        "depots.id as depot_id",
        "depots.code as depot_code",
        "depots.name as depot_name"
      ])
      .where("kpi_targets.kpi_definition_id", "in", definitionIds)
      .orderBy("kpi_targets.effective_from", "desc")
      .orderBy("kpi_targets.id", "asc")
      .execute();

    for (const row of rows) {
      const target: KpiTargetDTO = {
        id: row.id,
        target_value: row.target_value,
        warning_threshold: row.warning_threshold,
        critical_threshold: row.critical_threshold,
        effective_from: row.effective_from,
        effective_to: row.effective_to,
        warehouse: row.depot_id && row.depot_code && row.depot_name ? { id: row.depot_id, code: row.depot_code, name: row.depot_name } : null,
        is_current: isTargetCurrent({ effective_from: row.effective_from, effective_to: row.effective_to }, now)
      };
      const list = byDefinition.get(row.kpi_definition_id) ?? [];
      list.push(target);
      byDefinition.set(row.kpi_definition_id, list);
    }
    return byDefinition;
  }

  private toDTO(row: DefinitionRow, targets: KpiTargetDTO[], now: Date): KpiDefinitionConfigDTO {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      pillar: row.pillar,
      description: row.description,
      unit: row.unit,
      formula_reference: row.formula_reference,
      active: row.active,
      effective_from: row.effective_from,
      effective_to: row.effective_to,
      status: kpiDefinitionStatus(row, now),
      current_targets: targets.filter((target) => target.is_current),
      target_count: targets.length,
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: String(row.version)
    };
  }
}
