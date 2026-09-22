import type { KpiDrillDownDTO, KpiSnapshotDTO, ListKpiSnapshotsFilter } from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";

export interface KpiServiceConfig {
  readonly database: DatabaseConnection;
}

/**
 * Reads real, already-computed KPI snapshots (kpi_snapshots joined to
 * kpi_definitions). `status` is always "FINAL" and `sourceSummary` is always
 * null on the DTO - see KpiSnapshotDTO's doc comment for why.
 */
export class KpiService {
  private readonly database: DatabaseConnection;

  public constructor(config: KpiServiceConfig) {
    this.database = config.database;
  }

  public async list(filter: ListKpiSnapshotsFilter = {}): Promise<KpiSnapshotDTO[]> {
    let query = this.database
      .selectFrom("kpi_snapshots")
      .innerJoin("kpi_definitions", "kpi_definitions.id", "kpi_snapshots.kpi_definition_id")
      .selectAll("kpi_snapshots")
      .select(["kpi_definitions.code as kpi_code", "kpi_definitions.name as kpi_name"]);

    if (filter.kpi_code) {
      query = query.where("kpi_definitions.code", "=", filter.kpi_code);
    }
    if (filter.depot_id) {
      query = query.where("kpi_snapshots.depot_id", "=", filter.depot_id);
    }
    if (filter.employee_id) {
      query = query.where("kpi_snapshots.employee_id", "=", filter.employee_id);
    }
    if (filter.period_start) {
      query = query.where("kpi_snapshots.period_start", ">=", filter.period_start);
    }
    if (filter.period_end) {
      query = query.where("kpi_snapshots.period_end", "<=", filter.period_end);
    }

    const rows = await query.orderBy("kpi_snapshots.snapshot_at", "desc").execute();
    return rows.map((row) => this.toDTO(row));
  }

  public async getById(id: string): Promise<KpiSnapshotDTO | null> {
    const row = await this.database
      .selectFrom("kpi_snapshots")
      .innerJoin("kpi_definitions", "kpi_definitions.id", "kpi_snapshots.kpi_definition_id")
      .selectAll("kpi_snapshots")
      .select(["kpi_definitions.code as kpi_code", "kpi_definitions.name as kpi_name"])
      .where("kpi_snapshots.id", "=", id)
      .executeTakeFirst();

    return row ? this.toDTO(row) : null;
  }

  /**
   * Returns every snapshot for a given KPI code, most recent first - a
   * simple time-series "drill down". Deeper drill-down (e.g. per-task
   * contribution to a KPI value) is out of scope: kpi_snapshots stores only
   * the computed value, not its constituent inputs.
   */
  public async drillDown(kpiCode: string): Promise<KpiDrillDownDTO> {
    const snapshots = await this.list({ kpi_code: kpiCode });
    return { kpi_code: kpiCode, snapshots };
  }

  private toDTO(row: {
    id: string;
    kpi_code: string;
    kpi_name: string;
    value: string;
    target_value: string | null;
    depot_id: string | null;
    employee_id: string | null;
    period_start: Date | null;
    period_end: Date | null;
    snapshot_at: Date;
  }): KpiSnapshotDTO {
    return {
      id: row.id,
      kpi_code: row.kpi_code,
      kpi_name: row.kpi_name,
      value: row.value,
      target_value: row.target_value,
      depot_id: row.depot_id,
      employee_id: row.employee_id,
      period_start: row.period_start,
      period_end: row.period_end,
      snapshot_at: row.snapshot_at,
      status: "FINAL",
      sourceSummary: null
    };
  }
}
