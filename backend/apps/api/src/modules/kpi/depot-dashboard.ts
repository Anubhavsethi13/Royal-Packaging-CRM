import type { DepotDashboardDTO, DepotDashboardQuery, DepotDashboardReportDTO } from "@royal-packaging/contracts";
import { deriveDailyReportFigures, QUALITY_NOT_CONFIGURED, SLA_NOT_CONFIGURED } from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";
import type { KpiResultCalculator } from "./kpi-result-calculator.js";

/** a ÷ b × 100, rounded half-up to 2 decimals with integer arithmetic; null when b is 0. */
function percent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  const num = BigInt(numerator) * 10_000n;
  const den = BigInt(denominator);
  return Number((num * 2n + den) / (2n * den)) / 100;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Builds the depot KPI dashboard from existing records. The caller passes the
 * depot reach decided by the authorization layer: a depot id (Supervisor, or an
 * organisation-wide role that picked a depot) or undefined (all depots).
 */
export class DepotDashboardBuilder {
  private readonly database: DatabaseConnection;
  private readonly calculator: KpiResultCalculator;
  private readonly timeZone: string;

  public constructor(database: DatabaseConnection, calculator: KpiResultCalculator, timeZone: string) {
    this.database = database;
    this.calculator = calculator;
    this.timeZone = timeZone;
  }

  /** `allDepots`: the caller may pick any depot (organisation-wide role); otherwise only `depotId`. */
  public async build(query: DepotDashboardQuery, depotId: string | undefined, allDepots: boolean, now: Date = new Date()): Promise<DepotDashboardDTO | null> {
    const today = this.calculator.today(now);
    const to = query.to ?? query.from ?? today;
    const from = query.from ?? to;

    const depot = depotId
      ? await this.database.selectFrom("depots").select(["id", "code", "name"]).where("id", "=", depotId).executeTakeFirst()
      : null;
    if (depotId && !depot) return null;

    const [registered, completed, employees, reports, supervisors, availableDepots] = await Promise.all([
      this.calculator.registeredTaskCounts(from, to, depotId),
      this.calculator.completedTasks(from, to, depotId),
      this.calculator.employeeTotals(from, to, depotId ? { depotId } : {}),
      this.dailyReports(from, to, depotId),
      depotId ? this.supervisors(depotId) : Promise.resolve([]),
      allDepots
        ? this.database.selectFrom("depots").select(["id", "code", "name"]).where("active", "=", true).orderBy("code", "asc").execute()
        : Promise.resolve(depot ? [depot] : [])
    ]);

    const timed = completed.filter((task) => task.activeMinutes !== null);
    const totalMinutes = timed.reduce((sum, task) => sum + (task.activeMinutes as number), 0);
    const withLabour = reports.filter((report) => report.labour_required !== null && report.labour_present !== null);
    const labourRequired = withLabour.reduce((sum, report) => sum + (report.labour_required as number), 0);
    const labourPresent = withLabour.reduce((sum, report) => sum + (report.labour_present as number), 0);
    const sumBoxes = (operation?: "LOADING" | "UNLOADING") => completed.filter((task) => !operation || task.operation === operation).reduce((sum, task) => sum + task.boxes, 0);

    return {
      overview: { from, to, timezone: this.timeZone, depot: depot ?? null, available_depots: availableDepots, supervisors },
      operations: {
        loading_tasks: registered.loading,
        unloading_tasks: registered.unloading,
        other_tasks: registered.other,
        total_tasks: registered.loading + registered.unloading + registered.other,
        completed_tasks: completed.length,
        completed_loading_tasks: completed.filter((task) => task.operation === "LOADING").length,
        completed_unloading_tasks: completed.filter((task) => task.operation === "UNLOADING").length,
        boxes: sumBoxes(),
        loading_boxes: sumBoxes("LOADING"),
        unloading_boxes: sumBoxes("UNLOADING")
      },
      time: {
        total_operational_minutes: timed.length > 0 ? round2(totalMinutes) : null,
        average_task_minutes: timed.length > 0 ? round2(totalMinutes / timed.length) : null,
        timed_tasks: timed.length
      },
      labour: {
        required: withLabour.length > 0 ? labourRequired : null,
        present: withLabour.length > 0 ? labourPresent : null,
        attendance_percent: withLabour.length > 0 ? percent(labourPresent, labourRequired) : null,
        reports_with_labour: withLabour.length
      },
      performance: { sla: SLA_NOT_CONFIGURED, quality: QUALITY_NOT_CONFIGURED },
      employees: employees.map((row) => ({
        employee: row.employee,
        boxes: row.boxes,
        tasks_completed: row.tasksCompleted,
        active_minutes: row.activeMinutes,
        average_task_minutes: row.averageTaskMinutes,
        sla: SLA_NOT_CONFIGURED,
        quality: QUALITY_NOT_CONFIGURED,
        source_task_ids: row.taskIds
      })),
      sources: {
        daily_reports: reports,
        completed_tasks: completed.map((task) => ({
          id: task.id,
          task_code: task.taskCode,
          operation: task.operation,
          boxes: task.boxes,
          completed_at: task.completedAt,
          warehouse: task.warehouse,
          active_minutes: task.activeMinutes,
          assignees: task.assignees
        }))
      }
    };
  }

  private async dailyReports(from: string, to: string, depotId: string | undefined): Promise<DepotDashboardReportDTO[]> {
    let query = this.database
      .selectFrom("depot_daily_reports")
      .innerJoin("depots", "depots.id", "depot_daily_reports.depot_id")
      .select([
        "depot_daily_reports.id",
        sql<string>`depot_daily_reports.report_date::text`.as("report_date"),
        "depots.code as depot_code",
        "depot_daily_reports.status",
        "depot_daily_reports.loading_count",
        "depot_daily_reports.unloading_count",
        sql<string | null>`depot_daily_reports.start_time::text`.as("start_time"),
        sql<string | null>`depot_daily_reports.end_time::text`.as("end_time"),
        "depot_daily_reports.labour_required",
        "depot_daily_reports.labour_present"
      ])
      .where(sql<boolean>`depot_daily_reports.report_date between ${from}::date and ${to}::date`);
    if (depotId) query = query.where("depot_daily_reports.depot_id", "=", depotId);
    const rows = await query.orderBy("depot_daily_reports.report_date", "asc").orderBy("depots.code", "asc").execute();
    return rows.map((row) => {
      const figures = deriveDailyReportFigures(row);
      return {
        id: row.id,
        report_date: row.report_date,
        depot_code: row.depot_code,
        status: row.status,
        loading_count: row.loading_count,
        unloading_count: row.unloading_count,
        total_operations: figures.total_operations,
        labour_required: row.labour_required,
        labour_present: row.labour_present,
        duration_minutes: figures.duration_minutes
      };
    });
  }

  private async supervisors(depotId: string): Promise<Array<{ employee_id: string; name: string | null }>> {
    const rows = await this.database
      .selectFrom("employees")
      .innerJoin("user_access_roles", "user_access_roles.user_id", "employees.user_id")
      .innerJoin("access_roles", "access_roles.id", "user_access_roles.role_id")
      .select(["employees.id", "employees.name"])
      .distinct()
      .where("employees.depot_id", "=", depotId)
      .where("employees.is_active", "=", true)
      .where("user_access_roles.revoked_at", "is", null)
      .where("access_roles.active", "=", true)
      .where(sql<string>`upper(access_roles.code)`, "in", ["SUPERVISOR", "MANAGER"])
      .orderBy("employees.name", "asc")
      .execute();
    return rows.map((row) => ({ employee_id: row.id, name: row.name }));
  }
}
