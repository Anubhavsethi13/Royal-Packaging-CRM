import type { DashboardFilter, DashboardSummaryDTO } from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";

export interface DashboardServiceConfig {
  readonly database: DatabaseConnection;
}

/**
 * Live-computes a cross-domain operational summary from real task/quality/
 * incentive/employee data, applying the same depot/date filter consistently
 * across every sub-aggregation. `slaCompliance` and `payrollStatus` are
 * always null - see DashboardSummaryDTO's doc comment.
 *
 * inventoryStatusCounts reuses quality_records.final_inventory_status
 * (AVAILABLE/DAMAGED) counts, since inventory itself has no status column -
 * this is the closest real signal for "inventory condition" the schema
 * currently tracks (flagged assumption, reconciliation doc).
 */
export class DashboardService {
  private readonly database: DatabaseConnection;

  public constructor(config: DashboardServiceConfig) {
    this.database = config.database;
  }

  public async getSummary(filter: DashboardFilter = {}): Promise<DashboardSummaryDTO> {
    const [
      tasksByStatus,
      boxesHandled,
      qualitySummary,
      incentiveTotalsByStatus,
      inventoryStatusCounts,
      employeeCountsByDepartment
    ] = await Promise.all([
      this.getTasksByStatus(filter),
      this.getBoxesHandled(filter),
      this.getQualitySummary(filter),
      this.getIncentiveTotalsByStatus(filter),
      this.getInventoryStatusCounts(filter),
      this.getEmployeeCountsByDepartment(filter)
    ]);

    return {
      tasksByStatus,
      boxesHandled,
      qualitySummary,
      incentiveTotalsByStatus,
      inventoryStatusCounts,
      employeeCountsByDepartment,
      slaCompliance: null,
      payrollStatus: null
    };
  }

  private async getTasksByStatus(filter: DashboardFilter): Promise<Record<string, number>> {
    let query = this.database.selectFrom("tasks").select(["status"]).select((eb) => eb.fn.count("id").as("count"));
    if (filter.depot_id) {
      query = query.where("depot_id", "=", filter.depot_id);
    }
    if (filter.from) {
      query = query.where("created_at", ">=", filter.from);
    }
    if (filter.to) {
      query = query.where("created_at", "<=", filter.to);
    }

    const rows = await query.groupBy("status").execute();
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.status] = Number(row.count);
    }
    return result;
  }

  private async getBoxesHandled(filter: DashboardFilter): Promise<string> {
    let query = this.database
      .selectFrom("tasks")
      .select((eb) => eb.fn.coalesce(eb.fn.sum<string>("completed_box_quantity"), eb.val("0")).as("total"))
      .where("status", "=", "COMPLETED");
    if (filter.depot_id) {
      query = query.where("depot_id", "=", filter.depot_id);
    }
    if (filter.from) {
      query = query.where("created_at", ">=", filter.from);
    }
    if (filter.to) {
      query = query.where("created_at", "<=", filter.to);
    }

    const row = await query.executeTakeFirst();
    return row?.total ?? "0";
  }

  private async getQualitySummary(filter: DashboardFilter): Promise<{
    totalInspections: number;
    passCount: number;
    failCount: number;
    averageDamageRate: number | null;
  }> {
    let query = this.database
      .selectFrom("quality_records")
      .innerJoin("tasks", "tasks.id", "quality_records.task_id")
      .select([
        (eb) => eb.fn.count("quality_records.id").as("total"),
        (eb) => eb.fn.count("quality_records.id").filterWhere("quality_records.outcome", "=", "PASS").as("pass_count"),
        (eb) => eb.fn.count("quality_records.id").filterWhere("quality_records.outcome", "=", "FAIL").as("fail_count"),
        (eb) => eb.fn.avg<string | null>("quality_records.damage_rate").as("avg_damage_rate")
      ]);
    if (filter.depot_id) {
      query = query.where("tasks.depot_id", "=", filter.depot_id);
    }
    if (filter.from) {
      query = query.where("tasks.created_at", ">=", filter.from);
    }
    if (filter.to) {
      query = query.where("tasks.created_at", "<=", filter.to);
    }

    const row = await query.executeTakeFirst();

    return {
      totalInspections: Number(row?.total ?? 0),
      passCount: Number(row?.pass_count ?? 0),
      failCount: Number(row?.fail_count ?? 0),
      averageDamageRate:
        row?.avg_damage_rate !== null && row?.avg_damage_rate !== undefined ? Number(row.avg_damage_rate) : null
    };
  }

  private async getIncentiveTotalsByStatus(filter: DashboardFilter): Promise<Record<string, string>> {
    let query = this.database
      .selectFrom("incentive_ledger")
      .innerJoin("tasks", "tasks.id", "incentive_ledger.task_id")
      .select(["incentive_ledger.status as status"])
      .select((eb) => eb.fn.coalesce(eb.fn.sum<string>("incentive_ledger.amount"), eb.val("0")).as("total"));
    if (filter.depot_id) {
      query = query.where("tasks.depot_id", "=", filter.depot_id);
    }
    if (filter.from) {
      query = query.where("tasks.created_at", ">=", filter.from);
    }
    if (filter.to) {
      query = query.where("tasks.created_at", "<=", filter.to);
    }

    const rows = await query.groupBy("incentive_ledger.status").execute();
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.status] = row.total;
    }
    return result;
  }

  private async getInventoryStatusCounts(filter: DashboardFilter): Promise<Record<string, number>> {
    let query = this.database
      .selectFrom("quality_records")
      .innerJoin("tasks", "tasks.id", "quality_records.task_id")
      .select(["quality_records.final_inventory_status as status"])
      .select((eb) => eb.fn.count("quality_records.id").as("count"))
      .where("quality_records.final_inventory_status", "is not", null);
    if (filter.depot_id) {
      query = query.where("tasks.depot_id", "=", filter.depot_id);
    }
    if (filter.from) {
      query = query.where("tasks.created_at", ">=", filter.from);
    }
    if (filter.to) {
      query = query.where("tasks.created_at", "<=", filter.to);
    }

    const rows = await query.groupBy("quality_records.final_inventory_status").execute();
    const result: Record<string, number> = {};
    for (const row of rows) {
      if (row.status) {
        result[row.status] = Number(row.count);
      }
    }
    return result;
  }

  private async getEmployeeCountsByDepartment(filter: DashboardFilter): Promise<Record<string, number>> {
    let query = this.database
      .selectFrom("employees")
      .select(["department"])
      .select((eb) => eb.fn.count("id").as("count"))
      .where("is_active", "=", true);

    if (filter.depot_id) {
      query = query.where("depot_id", "=", filter.depot_id);
    }

    const rows = await query.groupBy("department").execute();
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.department ?? "UNASSIGNED"] = Number(row.count);
    }
    return result;
  }
}
