import type {
  KpiResultDetailDTO,
  KpiResultDTO,
  KpiResultPeriodKind,
  ListKpiResultsFilter,
  KpiDefinitionConfigDetailDTO,
  KpiDefinitionConfigDTO,
  ListKpiDefinitionsFilter,
  EmployeeKpiSummaryDTO,
  EmployeeKpiSummaryFilter,
  KpiDrillDownDTO,
  KpiSnapshotDTO,
  KpiSummaryAppliedFilters,
  ListKpiSnapshotsFilter,
  ManagementKpiSummaryDTO,
  ManagementKpiSummaryFilter
} from "@royal-packaging/contracts";
import { ShiftEntryDomainError } from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";
import { requireActiveEmployeeId } from "../shift-entries/shift-entry-service.js";
import type { KpiDataSource, KpiSourceFilter } from "./kpi-data-source.js";
import { KpiConfigurationReader } from "./kpi-configuration-reader.js";
import { KpiResultCalculator, type KpiResultScope } from "./kpi-result-calculator.js";
import { ShiftEntryKpiSource } from "./shift-entry-kpi-source.js";

export interface KpiServiceConfig {
  readonly database: DatabaseConnection;
  /** Override the shift-entry data source (defaults to the database-backed one). */
  readonly shiftEntrySource?: KpiDataSource;
  /** IANA timezone for KPI result periods (OPERATIONS_TIMEZONE); defaults to UTC. */
  readonly timeZone?: string;
}

export interface ManagementKpiSummaryResult {
  readonly summary: ManagementKpiSummaryDTO;
  readonly totalEmployees: number;
}

/**
 * Reads real, already-computed KPI snapshots (kpi_snapshots joined to
 * kpi_definitions). `status` is always "FINAL" and `sourceSummary` is always
 * null on the DTO - see KpiSnapshotDTO's doc comment for why.
 */
export class KpiService {
  private readonly database: DatabaseConnection;
  private readonly shiftEntrySource: KpiDataSource;
  private readonly configuration: KpiConfigurationReader;
  private readonly results: KpiResultCalculator;

  public constructor(config: KpiServiceConfig) {
    this.database = config.database;
    this.shiftEntrySource = config.shiftEntrySource ?? new ShiftEntryKpiSource(config.database);
    this.configuration = new KpiConfigurationReader(config.database);
    this.results = new KpiResultCalculator(config.database, config.timeZone ?? "UTC");
  }

  /** KPI results calculated on demand from completed tasks for active, calculable KPI definitions. */
  public listResults(filter: ListKpiResultsFilter, scope: KpiResultScope, now: Date = new Date()): Promise<KpiResultDTO[]> {
    return this.results.list(filter, scope, now);
  }

  /** One KPI result (with source references) by its id parts, or null. */
  public getResult(
    id: { kpiId: string; employeeId: string; period: KpiResultPeriodKind; start: string },
    now: Date = new Date()
  ): Promise<KpiResultDetailDTO | null> {
    return this.results.get(id, now);
  }

  public findActiveEmployeeId(userId: string): Promise<string | null> {
    return this.results.findActiveEmployeeId(userId);
  }

  public employeeExists(employeeId: string): Promise<boolean> {
    return this.results.employeeExists(employeeId);
  }

  /** KPI definitions with their current targets (read-only configuration). */
  public listDefinitions(
    filter: ListKpiDefinitionsFilter,
    page: { limit: number; offset: number },
    now: Date = new Date()
  ): Promise<{ items: KpiDefinitionConfigDTO[]; total: number }> {
    return this.configuration.list(filter, page, now);
  }

  /** One definition with its full target/threshold history, or null. */
  public getDefinition(id: string, now: Date = new Date()): Promise<KpiDefinitionConfigDetailDTO | null> {
    return this.configuration.get(id, now);
  }

  /**
   * Shift-entry KPI summary for the employee linked to the session user.
   * The employee is derived server-side; callers cannot choose it.
   */
  public async getEmployeeSummary(userId: string, filter: EmployeeKpiSummaryFilter): Promise<EmployeeKpiSummaryDTO> {
    const employeeId = await requireActiveEmployeeId(this.database, userId);
    const resolved = await this.resolveFilter(filter, employeeId);
    const metrics = await this.shiftEntrySource.aggregate(resolved.source);

    return {
      source: this.shiftEntrySource.sourceId,
      unit: "BOX",
      employee_id: employeeId,
      filters: resolved.applied,
      metrics
    };
  }

  /** Aggregate plus per-employee shift-entry KPIs across employees. */
  public async getManagementSummary(
    filter: ManagementKpiSummaryFilter,
    page: { limit: number; offset: number }
  ): Promise<ManagementKpiSummaryResult> {
    const resolved = await this.resolveFilter(filter, filter.employee_id);
    const [metrics, byEmployee] = await Promise.all([
      this.shiftEntrySource.aggregate(resolved.source),
      this.shiftEntrySource.aggregateByEmployee(resolved.source, page)
    ]);

    return {
      summary: {
        source: this.shiftEntrySource.sourceId,
        unit: "BOX",
        filters: resolved.applied,
        metrics,
        employees: byEmployee.rows
      },
      totalEmployees: byEmployee.totalEmployees
    };
  }

  /** Translates request codes to existing ids; unknown codes are validation errors, not silent empties. */
  private async resolveFilter(
    filter: EmployeeKpiSummaryFilter,
    employeeId: string | undefined
  ): Promise<{ source: KpiSourceFilter; applied: KpiSummaryAppliedFilters }> {
    let depotId: string | undefined;
    let truckTypeId: string | undefined;
    let warehouseCode: string | null = null;
    let truckTypeCode: string | null = null;

    if (filter.warehouse_code) {
      const depot = await this.database
        .selectFrom("depots")
        .select(["id", "code"])
        .where(sql<string>`upper(code)`, "=", filter.warehouse_code.toUpperCase())
        .executeTakeFirst();
      if (!depot) {
        throw new ShiftEntryDomainError("INVALID_WAREHOUSE", `Warehouse '${filter.warehouse_code}' does not exist.`, [
          { field: "warehouse_code", code: "invalid_warehouse", message: `Warehouse '${filter.warehouse_code}' does not exist.` }
        ]);
      }
      depotId = depot.id;
      warehouseCode = depot.code;
    }

    if (filter.truck_type) {
      const truckType = await this.database
        .selectFrom("truck_types")
        .select(["id", "code"])
        .where("code", "=", filter.truck_type.toUpperCase())
        .executeTakeFirst();
      if (!truckType) {
        throw new ShiftEntryDomainError("INVALID_TRUCK_TYPE", `Truck type '${filter.truck_type}' does not exist.`, [
          { field: "truck_type", code: "invalid_truck_type", message: `Truck type '${filter.truck_type}' does not exist.` }
        ]);
      }
      truckTypeId = truckType.id;
      truckTypeCode = truckType.code;
    }

    return {
      source: {
        ...(employeeId ? { employeeId } : {}),
        ...(filter.from ? { from: filter.from } : {}),
        ...(filter.to ? { to: filter.to } : {}),
        ...(depotId ? { depotId } : {}),
        ...(truckTypeId ? { truckTypeId } : {})
      },
      applied: {
        from: filter.from ?? null,
        to: filter.to ?? null,
        warehouse_code: warehouseCode,
        truck_type: truckTypeCode,
        employee_id: employeeId ?? null
      }
    };
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
