import type { EmployeeKpiRowDTO, ShiftKpiMetrics } from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";
import type { KpiDataSource, KpiSourceEmployeePage, KpiSourceFilter } from "./kpi-data-source.js";

/** Raw, unrounded sums read from `shift_entries` (and its depot links). */
export interface ShiftKpiRawTotals {
  readonly shiftCount: number;
  readonly totalUnloading: number;
  readonly totalLoading: number;
  readonly totalLabour: number;
  readonly totalDurationSeconds: number;
  readonly warehouseAssociations: number;
  readonly distinctWarehouses: number;
}

const SECONDS_PER_HOUR = 3600;

/**
 * numerator / denominator rounded half-up to 2 decimals using exact integer arithmetic.
 * Every shift KPI ratio is a ratio of integer sums, so no floating-point division is needed
 * (Math.round(x * 100) / 100 mis-rounds exact ties such as 201 / 200 = 1.005).
 */
function ratio2(numerator: number, denominator: number): number {
  const num = BigInt(Math.round(numerator));
  const den = BigInt(Math.round(denominator));
  return Number((num * 200n + den) / (2n * den)) / 100;
}

/**
 * Pure KPI formulas (see Docs/api/kpi-shift-summary.md). Ratios are computed
 * from summed numerators and denominators (a ratio of sums), never as an
 * average of per-shift ratios. A ratio whose denominator is zero is `null`.
 *
 *   total_boxes                  = total_loading + total_unloading
 *   average_boxes_per_shift      = total_boxes / shift_count
 *   average_labour_count         = total_labour / shift_count
 *   average_shift_duration       = total_duration_seconds / shift_count
 *   loading_productivity         = total_loading   / (total_duration_seconds / 3600)
 *   unloading_productivity       = total_unloading / (total_duration_seconds / 3600)
 *
 * Averages and productivity are rounded half-up to 2 decimals (exactly, see ratio2); totals are exact.
 */
export function computeShiftKpiMetrics(raw: ShiftKpiRawTotals): ShiftKpiMetrics {
  const totalBoxes = raw.totalLoading + raw.totalUnloading;
  const hasShifts = raw.shiftCount > 0;
  const hasDuration = raw.totalDurationSeconds > 0;

  return {
    shift_count: raw.shiftCount,
    total_unloading: raw.totalUnloading,
    total_loading: raw.totalLoading,
    total_boxes: totalBoxes,
    average_boxes_per_shift: hasShifts ? ratio2(totalBoxes, raw.shiftCount) : null,
    total_labour_count: raw.totalLabour,
    average_labour_count: hasShifts ? ratio2(raw.totalLabour, raw.shiftCount) : null,
    total_shift_duration_seconds: raw.totalDurationSeconds,
    average_shift_duration_seconds: hasShifts ? ratio2(raw.totalDurationSeconds, raw.shiftCount) : null,
    loading_productivity_boxes_per_hour: hasDuration ? ratio2(raw.totalLoading * SECONDS_PER_HOUR, raw.totalDurationSeconds) : null,
    unloading_productivity_boxes_per_hour: hasDuration ? ratio2(raw.totalUnloading * SECONDS_PER_HOUR, raw.totalDurationSeconds) : null,
    warehouse_associations: raw.warehouseAssociations,
    distinct_warehouses: raw.distinctWarehouses
  };
}

const DURATION_SECONDS = sql<string>`coalesce(sum(extract(epoch from (shift_entries.shift_end - shift_entries.shift_start))), 0)`;

/**
 * KPI data source backed by `shift_entries`. Filters select whole entries:
 * a warehouse or truck-type filter keeps every entry that involves it and
 * counts that entry's full totals (totals are not apportioned per warehouse
 * or truck type, because the entry records one total for the whole shift).
 */
export class ShiftEntryKpiSource implements KpiDataSource {
  public readonly sourceId = "SHIFT_ENTRY" as const;

  private readonly database: DatabaseConnection;

  public constructor(database: DatabaseConnection) {
    this.database = database;
  }

  public async aggregate(filter: KpiSourceFilter): Promise<ShiftKpiMetrics> {
    const totals = await this.filteredEntries(filter)
      .select([
        (eb) => eb.fn.countAll<string>().as("shift_count"),
        sql<string>`coalesce(sum(shift_entries.unloading_total), 0)`.as("total_unloading"),
        sql<string>`coalesce(sum(shift_entries.loading_total), 0)`.as("total_loading"),
        sql<string>`coalesce(sum(shift_entries.labour_count), 0)`.as("total_labour"),
        DURATION_SECONDS.as("total_duration_seconds")
      ])
      .executeTakeFirst();

    const warehouses = await this.database
      .selectFrom("shift_entry_depots")
      .select([
        (eb) => eb.fn.countAll<string>().as("associations"),
        sql<string>`count(distinct shift_entry_depots.depot_id)`.as("distinct_warehouses")
      ])
      .where("shift_entry_depots.shift_entry_id", "in", this.filteredEntries(filter).select("shift_entries.id"))
      .executeTakeFirst();

    return computeShiftKpiMetrics({
      shiftCount: Number(totals?.shift_count ?? 0),
      totalUnloading: Number(totals?.total_unloading ?? 0),
      totalLoading: Number(totals?.total_loading ?? 0),
      totalLabour: Number(totals?.total_labour ?? 0),
      totalDurationSeconds: Number(totals?.total_duration_seconds ?? 0),
      warehouseAssociations: Number(warehouses?.associations ?? 0),
      distinctWarehouses: Number(warehouses?.distinct_warehouses ?? 0)
    });
  }

  public async aggregateByEmployee(
    filter: KpiSourceFilter,
    page: { limit: number; offset: number }
  ): Promise<KpiSourceEmployeePage> {
    const countRow = await this.filteredEntries(filter)
      .select(sql<string>`count(distinct shift_entries.employee_id)`.as("total"))
      .executeTakeFirst();

    const rows = await this.filteredEntries(filter)
      .innerJoin("employees", "employees.id", "shift_entries.employee_id")
      .select([
        "employees.id as employee_id",
        "employees.employee_code as employee_code",
        "employees.name as employee_name",
        (eb) => eb.fn.countAll<string>().as("shift_count"),
        sql<string>`coalesce(sum(shift_entries.unloading_total), 0)`.as("total_unloading"),
        sql<string>`coalesce(sum(shift_entries.loading_total), 0)`.as("total_loading"),
        sql<string>`coalesce(sum(shift_entries.labour_count), 0)`.as("total_labour"),
        DURATION_SECONDS.as("total_duration_seconds")
      ])
      .groupBy(["employees.id", "employees.employee_code", "employees.name"])
      .orderBy(sql`employees.name asc nulls last`)
      .orderBy("employees.employee_code", "asc")
      .orderBy("employees.id", "asc")
      .limit(page.limit)
      .offset(page.offset)
      .execute();

    const employeeIds = rows.map((row) => row.employee_id);
    const warehouseRows =
      employeeIds.length === 0
        ? []
        : await this.database
            .selectFrom("shift_entry_depots")
            .innerJoin("shift_entries", "shift_entries.id", "shift_entry_depots.shift_entry_id")
            .select([
              "shift_entries.employee_id as employee_id",
              (eb) => eb.fn.countAll<string>().as("associations"),
              sql<string>`count(distinct shift_entry_depots.depot_id)`.as("distinct_warehouses")
            ])
            .where("shift_entry_depots.shift_entry_id", "in", this.filteredEntries(filter).select("shift_entries.id"))
            .where("shift_entries.employee_id", "in", employeeIds)
            .groupBy("shift_entries.employee_id")
            .execute();
    const warehouseByEmployee = new Map(warehouseRows.map((row) => [row.employee_id, row]));

    const employees: EmployeeKpiRowDTO[] = rows.map((row) => {
      const warehouse = warehouseByEmployee.get(row.employee_id);
      return {
        employee_id: row.employee_id,
        employee_code: row.employee_code,
        employee_name: row.employee_name,
        metrics: computeShiftKpiMetrics({
          shiftCount: Number(row.shift_count),
          totalUnloading: Number(row.total_unloading),
          totalLoading: Number(row.total_loading),
          totalLabour: Number(row.total_labour),
          totalDurationSeconds: Number(row.total_duration_seconds),
          warehouseAssociations: Number(warehouse?.associations ?? 0),
          distinctWarehouses: Number(warehouse?.distinct_warehouses ?? 0)
        })
      };
    });

    return { rows: employees, totalEmployees: Number(countRow?.total ?? 0) };
  }

  /** Base query over `shift_entries` with every supplied filter applied. */
  private filteredEntries(filter: KpiSourceFilter) {
    let query = this.database.selectFrom("shift_entries");

    if (filter.employeeId) {
      query = query.where("shift_entries.employee_id", "=", filter.employeeId);
    }
    if (filter.employeeDepotId) {
      query = query.where("shift_entries.employee_id", "in", this.database.selectFrom("employees").select("id").where("depot_id", "=", filter.employeeDepotId));
    }
    if (filter.from) {
      query = query.where(sql<boolean>`shift_entries.work_date >= ${filter.from}::date`);
    }
    if (filter.to) {
      query = query.where(sql<boolean>`shift_entries.work_date <= ${filter.to}::date`);
    }
    if (filter.depotId) {
      const depotId = filter.depotId;
      query = query.where(
        "shift_entries.id",
        "in",
        this.database.selectFrom("shift_entry_depots").select("shift_entry_id").where("depot_id", "=", depotId)
      );
    }
    if (filter.truckTypeId) {
      const truckTypeId = filter.truckTypeId;
      query = query.where(
        "shift_entries.id",
        "in",
        this.database.selectFrom("shift_entry_truck_types").select("shift_entry_id").where("truck_type_id", "=", truckTypeId)
      );
    }

    return query;
  }
}
