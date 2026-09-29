import type {
  KpiResultCalculation,
  KpiResultDetailDTO,
  KpiResultDTO,
  KpiResultPeriodKind,
  KpiResultSourceReferenceDTO,
  ListKpiResultsFilter
} from "@royal-packaging/contracts";
import {
  addDays,
  classifyTaskType,
  daysBetween,
  KPI_RESULT_CALCULATION_VERSION,
  KPI_RESULT_CALCULATIONS,
  KPI_RESULT_MAX_RANGE_DAYS,
  kpiResultId,
  localDate,
  periodEndFor,
  periodLabel,
  periodStartFor,
  taskDisplayCode
} from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";

/** A request problem the route turns into a 400 with this code and field. */
export class KpiResultRequestError extends Error {
  public readonly code: string;
  public readonly field: string;

  public constructor(code: string, field: string, message: string) {
    super(message);
    this.name = "KpiResultRequestError";
    this.code = code;
    this.field = field;
  }
}

export interface KpiResultScope {
  /** When set, only this employee's results are produced. */
  readonly employeeId?: string;
}

interface Definition {
  id: string;
  code: string;
  name: string;
  active: boolean;
  effective_from: Date | null;
  effective_to: Date | null;
  version: string;
  calculation: KpiResultCalculation;
}

interface Contribution {
  taskId: string;
  taskScope: "LOADING" | "UNLOADING" | "OTHER";
  completedBoxes: bigint;
  participants: number;
  completedAt: Date;
  bucket: string;
  warehouse: string | null;
  employeeId: string;
  employeeCode: string;
  employeeName: string | null;
  employeeDepotId: string | null;
  durationMs: number | null;
}

interface Target {
  id: string;
  definitionId: string;
  value: number;
  depotId: string | null;
  fromDate: string;
  toDate: string | null;
  effectiveFrom: Date;
}

const TIMING_EVENTS = ["TASK_STARTED", "TASK_PAUSED", "TASK_RESUMED", "TASK_COMPLETED"];

/** The frontend traceability contract ties a reference's source type to the operation the result measures. */
const SOURCE_TYPE_BY_OPERATION = {
  TASK: "TASK",
  WAREHOUSE: "WAREHOUSE_OPERATION",
  LOADING: "LOADING_OPERATION",
  UNLOADING: "UNLOADING_OPERATION"
} as const;

/** numerator / denominator, rounded half-up to 2 decimals with exact integer arithmetic. */
function ratio2(numerator: bigint, denominator: bigint): number {
  return Number((numerator * 200n + denominator) / (2n * denominator)) / 100;
}
function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a;
}
/** Exact sum of completedBoxes / participants over the contributions, as a fraction. */
function sharedBoxes(contributions: readonly Contribution[]): { num: bigint; den: bigint } {
  let num = 0n;
  let den = 1n;
  for (const contribution of contributions) {
    const p = BigInt(contribution.participants);
    num = num * p + contribution.completedBoxes * den;
    den *= p;
    const divisor = gcd(num, den) || 1n;
    num /= divisor;
    den /= divisor;
  }
  return { num, den };
}

/**
 * On-demand KPI result calculation from completed tasks.
 *
 * Attribution reuses the confirmed incentive participant rule: a completed
 * task counts for every employee actively assigned at completion; its BOX
 * quantity is shared equally between them (so per-employee BOX totals add up
 * to the warehouse total). Buckets use the task's completion time in the
 * configured operations timezone.
 */
export class KpiResultCalculator {
  private readonly database: DatabaseConnection;
  private readonly timeZone: string;

  public constructor(database: DatabaseConnection, timeZone: string) {
    this.database = database;
    this.timeZone = timeZone;
  }

  public today(now: Date): string {
    return localDate(now, this.timeZone);
  }

  public async findActiveEmployeeId(userId: string): Promise<string | null> {
    const row = await this.database.selectFrom("employees").select("id").where("user_id", "=", userId).where("is_active", "=", true).executeTakeFirst();
    return row?.id ?? null;
  }

  public async employeeExists(employeeId: string): Promise<boolean> {
    return !!(await this.database.selectFrom("employees").select("id").where("id", "=", employeeId).executeTakeFirst());
  }

  public async list(filter: ListKpiResultsFilter, scope: KpiResultScope, now: Date): Promise<KpiResultDTO[]> {
    const kind = filter.period;
    const today = this.today(now);
    const to = periodEndFor(kind, periodStartFor(kind, filter.to ?? today));
    const from = periodStartFor(kind, filter.from ?? addDays(filter.to ?? today, -29));
    if (daysBetween(from, to) + 1 > KPI_RESULT_MAX_RANGE_DAYS[kind]) {
      throw new KpiResultRequestError("VALIDATION_FAILED", "from", `The requested range is too long for ${kind} results (maximum ${KPI_RESULT_MAX_RANGE_DAYS[kind]} days).`);
    }

    const definitions = await this.definitions(filter);
    if (filter.warehouse_code && !(await this.database.selectFrom("depots").select("id").where(sql<string>`upper(code)`, "=", filter.warehouse_code.toUpperCase()).executeTakeFirst())) {
      throw new KpiResultRequestError("INVALID_WAREHOUSE", "warehouse_code", `Warehouse '${filter.warehouse_code}' does not exist.`);
    }
    const employeeId = scope.employeeId ?? filter.employee_id;
    const contributions = await this.contributions({ kind, from, to, employeeId, warehouseCode: filter.warehouse_code });

    const results = await this.buildResults(definitions, contributions, kind, today, now, false);
    const search = filter.search?.toLowerCase();
    return results
      .filter((result) => !filter.status || result.status === filter.status)
      .filter((result) => !search || `${result.employee.name ?? ""} ${result.employee.code} ${result.kpi.name} ${result.kpi.code} ${result.metric} ${result.operation}`.toLowerCase().includes(search))
      .sort((left, right) =>
        right.period.start.localeCompare(left.period.start) ||
        (left.employee.name ?? left.employee.code).localeCompare(right.employee.name ?? right.employee.code) ||
        left.employee.id.localeCompare(right.employee.id) ||
        left.kpi.code.localeCompare(right.kpi.code)
      );
  }

  /** One result by its deterministic id parts, with source references; null when there is no result. */
  public async get(
    id: { kpiId: string; employeeId: string; period: KpiResultPeriodKind; start: string },
    now: Date
  ): Promise<KpiResultDetailDTO | null> {
    const definitions = await this.definitions({ kpi_id: id.kpiId }, true);
    if (definitions.length === 0) return null;
    const contributions = await this.contributions({ kind: id.period, from: id.start, to: periodEndFor(id.period, id.start), employeeId: id.employeeId });
    const [result] = await this.buildResults(definitions, contributions, id.period, this.today(now), now, true);
    return (result as KpiResultDetailDTO | undefined) ?? null;
  }

  // -------------------------------------------------------------------------

  /** Active definitions with a supported calculation, narrowed by the KPI filters. */
  private async definitions(filter: Pick<ListKpiResultsFilter, "kpi_id" | "metric" | "operation">, lenient = false): Promise<Definition[]> {
    if (filter.kpi_id) {
      const row = await this.database.selectFrom("kpi_definitions").selectAll().where("id", "=", filter.kpi_id).executeTakeFirst();
      if (!row) {
        if (lenient) return [];
        throw new KpiResultRequestError("INVALID_KPI", "kpi_id", `KPI definition '${filter.kpi_id}' does not exist.`);
      }
      const calculation = KPI_RESULT_CALCULATIONS[row.code.toUpperCase()];
      if (!calculation) {
        if (lenient) return [];
        throw new KpiResultRequestError("KPI_NOT_CALCULABLE", "kpi_id", `KPI '${row.code}' has no supported result calculation.`);
      }
      if (!row.active) {
        if (lenient) return [];
        throw new KpiResultRequestError("KPI_NOT_ACTIVE", "kpi_id", `KPI '${row.code}' is not active.`);
      }
      return [{ ...row, version: String(row.version), calculation }];
    }

    const rows = await this.database
      .selectFrom("kpi_definitions")
      .selectAll()
      .where("active", "=", true)
      .where(sql<string>`upper(code)`, "in", Object.keys(KPI_RESULT_CALCULATIONS))
      .orderBy("code", "asc")
      .execute();
    return rows
      .map((row) => ({ ...row, version: String(row.version), calculation: KPI_RESULT_CALCULATIONS[row.code.toUpperCase()] as KpiResultCalculation }))
      .filter((definition) => (!filter.metric || definition.calculation.metric === filter.metric) && (!filter.operation || definition.calculation.operation === filter.operation));
  }

  private async contributions(args: { kind: KpiResultPeriodKind; from: string; to: string; employeeId?: string | undefined; warehouseCode?: string | undefined }): Promise<Contribution[]> {
    const tz = this.timeZone;
    const bucketExpression =
      args.kind === "DAILY"
        ? sql<string>`to_char(tasks.completed_at at time zone ${tz}, 'YYYY-MM-DD')`
        : args.kind === "WEEKLY"
          ? sql<string>`to_char(date_trunc('week', tasks.completed_at at time zone ${tz}), 'YYYY-MM-DD')`
          : sql<string>`to_char(date_trunc('month', tasks.completed_at at time zone ${tz}), 'YYYY-MM-DD')`;
    const atCompletion = sql<boolean>`task_assignments.assigned_at <= tasks.completed_at and (task_assignments.unassigned_at is null or task_assignments.unassigned_at > tasks.completed_at)`;

    let query = this.database
      .selectFrom("tasks")
      .innerJoin("task_assignments", "task_assignments.task_id", "tasks.id")
      .innerJoin("employees", "employees.id", "task_assignments.employee_id")
      .leftJoin("depots", "depots.id", "tasks.depot_id")
      .select([
        "tasks.id as task_id",
        "tasks.task_type",
        "tasks.completed_box_quantity",
        "tasks.completed_at",
        "depots.code as depot_code",
        "employees.id as employee_id",
        "employees.employee_code",
        "employees.name as employee_name",
        "employees.depot_id as employee_depot_id",
        bucketExpression.as("bucket"),
        sql<string>`(select count(*) from task_assignments p where p.task_id = tasks.id and p.assigned_at <= tasks.completed_at and (p.unassigned_at is null or p.unassigned_at > tasks.completed_at))`.as("participants")
      ])
      .where("tasks.status", "=", "COMPLETED")
      .where("tasks.completed_at", "is not", null)
      .where(atCompletion)
      .where(sql<boolean>`tasks.completed_at >= (${args.from}::timestamp at time zone ${tz})`)
      .where(sql<boolean>`tasks.completed_at < ((${addDays(args.to, 1)})::timestamp at time zone ${tz})`);

    if (args.employeeId) query = query.where("task_assignments.employee_id", "=", args.employeeId);
    if (args.warehouseCode) query = query.where(sql<string>`upper(depots.code)`, "=", args.warehouseCode.toUpperCase());

    const rows = await query.orderBy("tasks.completed_at", "asc").orderBy("tasks.id", "asc").execute();
    const durations = await this.activeDurations([...new Set(rows.map((row) => row.task_id))]);

    return rows.map((row) => {
      const operation = classifyTaskType(row.task_type);
      return {
        taskId: row.task_id,
        taskScope: operation === "LOADING" || operation === "UNLOADING" ? operation : "OTHER",
        completedBoxes: BigInt(row.completed_box_quantity ?? "0"),
        participants: Math.max(1, Number(row.participants)),
        completedAt: row.completed_at as Date,
        bucket: row.bucket,
        warehouse: row.depot_code,
        employeeId: row.employee_id,
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
        employeeDepotId: row.employee_depot_id,
        durationMs: durations.get(row.task_id) ?? null
      };
    });
  }

  /** Active working time per task from start/pause/resume/complete events; null without a start. */
  private async activeDurations(taskIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (taskIds.length === 0) return result;
    const events = await this.database
      .selectFrom("task_events")
      .select(["task_id", "event_type", "event_at"])
      .where("task_id", "in", taskIds)
      .where("event_type", "in", TIMING_EVENTS)
      .orderBy("event_at", "asc")
      .orderBy("id", "asc")
      .execute();
    const open = new Map<string, number>();
    for (const event of events) {
      const at = event.event_at.getTime();
      if (event.event_type === "TASK_STARTED" || event.event_type === "TASK_RESUMED") {
        if (!open.has(event.task_id)) open.set(event.task_id, at);
        if (!result.has(event.task_id)) result.set(event.task_id, 0);
      } else {
        const started = open.get(event.task_id);
        if (started !== undefined) {
          result.set(event.task_id, (result.get(event.task_id) ?? 0) + Math.max(0, at - started));
          open.delete(event.task_id);
        }
      }
    }
    return result;
  }

  private async targets(definitionIds: string[]): Promise<Target[]> {
    if (definitionIds.length === 0) return [];
    const rows = await this.database
      .selectFrom("kpi_targets")
      .select(["id", "kpi_definition_id", sql<string>`target_value::text`.as("target_value"), "depot_id", "effective_from", "effective_to"])
      .where("kpi_definition_id", "in", definitionIds)
      .execute();
    return rows.map((row) => ({
      id: row.id,
      definitionId: row.kpi_definition_id,
      value: Number(row.target_value),
      depotId: row.depot_id,
      fromDate: localDate(row.effective_from, this.timeZone),
      toDate: row.effective_to ? localDate(row.effective_to, this.timeZone) : null,
      effectiveFrom: row.effective_from
    }));
  }

  private async buildResults(
    definitions: Definition[],
    contributions: Contribution[],
    kind: KpiResultPeriodKind,
    today: string,
    now: Date,
    withReferences: boolean
  ): Promise<KpiResultDTO[]> {
    const targets = await this.targets(definitions.map((definition) => definition.id));
    const groups = new Map<string, Contribution[]>();
    for (const contribution of contributions) {
      const key = `${contribution.employeeId}|${contribution.bucket}`;
      groups.set(key, [...(groups.get(key) ?? []), contribution]);
    }

    const results: KpiResultDTO[] = [];
    for (const group of groups.values()) {
      const first = group[0] as Contribution;
      const start = first.bucket;
      const end = periodEndFor(kind, start);
      for (const definition of definitions) {
        if (!this.effectiveDuring(definition, start, end)) continue;
        const calculation = definition.calculation;
        const tasks = calculation.taskScope === "ALL" ? group : group.filter((contribution) => contribution.taskScope === calculation.taskScope);
        if (tasks.length === 0) continue;

        const { value, reason } = this.calculate(calculation, tasks);
        const target = this.targetFor(targets, definition.id, first.employeeDepotId, start);
        const base: KpiResultDTO = {
          id: kpiResultId(definition.id, first.employeeId, kind, start),
          employee: { id: first.employeeId, code: first.employeeCode, name: first.employeeName },
          kpi: { id: definition.id, code: definition.code, name: definition.name },
          rule_version_id: `${definition.id}:v${definition.version}`,
          metric: calculation.metric,
          category: calculation.category,
          operation: calculation.operation,
          scope: "OWN",
          period: { kind, start, end, label: periodLabel(kind, start), timezone: this.timeZone },
          actual: value === null ? null : { value, unit: calculation.unit },
          target: target ? { value: target.value, unit: calculation.unit, target_id: target.id } : null,
          unit: calculation.unit,
          direction: calculation.direction,
          status: value === null ? "NOT_AVAILABLE" : end >= today ? "PENDING" : "AVAILABLE",
          not_available_reason: reason,
          source: "TASK",
          source_count: tasks.length,
          calculated_at: now,
          calculation_version: KPI_RESULT_CALCULATION_VERSION
        };
        results.push(withReferences ? { ...base, source_references: this.references(calculation, tasks) } as KpiResultDetailDTO : base);
      }
    }
    return results;
  }

  private calculate(calculation: KpiResultCalculation, tasks: Contribution[]): { value: number | null; reason: string | null } {
    switch (calculation.kind) {
      case "BOXES": {
        const { num, den } = sharedBoxes(tasks);
        return { value: ratio2(num, den), reason: null };
      }
      case "TASKS":
        return { value: tasks.length, reason: null };
      case "AVERAGE_BOXES": {
        const { num, den } = sharedBoxes(tasks);
        return { value: ratio2(num, den * BigInt(tasks.length)), reason: null };
      }
      case "ACTIVE_MINUTES": {
        const timed = tasks.filter((task) => task.durationMs !== null);
        if (timed.length === 0) return { value: null, reason: "No start/complete timing events are recorded for these tasks." };
        const totalMs = timed.reduce((sum, task) => sum + BigInt(Math.round(task.durationMs as number)), 0n);
        return { value: ratio2(totalMs, 60_000n), reason: null };
      }
      case "SLA":
        return { value: null, reason: "No SLA targets are defined for tasks, so compliance cannot be calculated." };
    }
  }

  private references(calculation: KpiResultCalculation, tasks: Contribution[]): KpiResultSourceReferenceDTO[] {
    return tasks.map((task) => {
      const credited = ratio2(task.completedBoxes, BigInt(task.participants));
      const raw =
        calculation.kind === "BOXES" || calculation.kind === "AVERAGE_BOXES" ? credited
          : calculation.kind === "TASKS" ? 1
            : calculation.kind === "ACTIVE_MINUTES" ? (task.durationMs === null ? null : ratio2(BigInt(Math.round(task.durationMs)), 60_000n))
              : null;
      return {
        source_record_id: task.taskId,
        source_type: SOURCE_TYPE_BY_OPERATION[calculation.operation],
        task_id: task.taskId,
        task_code: taskDisplayCode(task.taskId),
        operation_type: calculation.operation,
        employee_id: task.employeeId,
        timestamp: task.completedAt,
        raw_metric_value: raw,
        quantity: { value: credited, unit: "BOX" },
        duration_seconds: task.durationMs === null ? null : Math.round(task.durationMs / 1000),
        warehouse: task.warehouse,
        participants: task.participants
      };
    });
  }

  private effectiveDuring(definition: Definition, start: string, end: string): boolean {
    const from = definition.effective_from ? localDate(definition.effective_from, this.timeZone) : null;
    const to = definition.effective_to ? localDate(definition.effective_to, this.timeZone) : null;
    return (!from || from <= end) && (!to || to >= start);
  }

  /** Target in force on the period's first day: the employee's warehouse target first, else the all-warehouse one. */
  private targetFor(targets: Target[], definitionId: string, depotId: string | null, start: string): Target | null {
    const inForce = targets.filter((target) => target.definitionId === definitionId && target.fromDate <= start && (target.toDate === null || target.toDate >= start));
    const pick = (candidates: Target[]) => candidates.sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0] ?? null;
    return (depotId ? pick(inForce.filter((target) => target.depotId === depotId)) : null) ?? pick(inForce.filter((target) => target.depotId === null));
  }
}
