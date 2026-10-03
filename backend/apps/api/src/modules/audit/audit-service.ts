import type { AuditLogEntryDTO, ListAuditLogsFilter } from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";

export interface AuditServiceConfig {
  readonly database: DatabaseConnection;
}

interface RawAuditRow {
  id: string;
  source: "task" | "incentive" | "daily_report";
  event_type: string;
  event_at: Date;
  actor_user_id: string | null;
  task_id: string | null;
  correlation_id: string | null;
  metadata: string | null;
}

export interface AuditAccess {
  readonly includeIncentives: boolean;
  /** Depot isolation: only events of this depot's tasks and daily reports. */
  readonly depotId?: string;
}

const NO_INCENTIVE_ACCESS: AuditAccess = { includeIncentives: false };

/**
 * Unifies task_events, depot_daily_report_events and (Super Admin only)
 * incentive_events into a single audit feed. Both
 * tables record only an event type, timestamp, actor, task linkage, and
 * free-form metadata - they never captured a "before" snapshot, an
 * operator-entered reason, or the originating HTTP request ID, so
 * AuditLogEntryDTO exposes those fields as honest nulls (see its doc
 * comment) rather than fabricating data that was never recorded.
 */
export class AuditService {
  private readonly database: DatabaseConnection;

  public constructor(config: AuditServiceConfig) {
    this.database = config.database;
  }

  /**
   * `access.includeIncentives` must come from the server-side authorization
   * decision (`incentive:read`, Super Admin only). Without it, incentive
   * events are neither listed nor resolvable by id.
   */
  public async list(filter: ListAuditLogsFilter = {}, access: AuditAccess = NO_INCENTIVE_ACCESS): Promise<AuditLogEntryDTO[]> {
    const rows = await this.fetchUnifiedRows(filter, access);
    return Promise.all(rows.map((row) => this.toDTO(row)));
  }

  public async getById(id: string, access: AuditAccess = NO_INCENTIVE_ACCESS): Promise<AuditLogEntryDTO | null> {
    const taskEvent = await this.database
      .selectFrom("task_events")
      .select(["id", "event_type", "event_at", "actor_user_id", "task_id", "correlation_id", "metadata"])
      .where("id", "=", id)
      .executeTakeFirst();

    if (taskEvent) {
      if (access.depotId && !(await this.taskInDepot(taskEvent.task_id, access.depotId))) return null;
      return this.toDTO({ ...taskEvent, source: "task" });
    }

    const dailyReportEvent = await this.findDailyReportEvent(id, access.depotId);
    if (dailyReportEvent) {
      return this.toDTO(dailyReportEvent);
    }

    if (!access.includeIncentives) {
      return null;
    }

    const incentiveEvent = await this.database
      .selectFrom("incentive_events")
      .select(["id", "event_type", "event_at", "actor_user_id", "task_id", "correlation_id", "metadata"])
      .where("id", "=", id)
      .executeTakeFirst();

    if (incentiveEvent) {
      return this.toDTO({ ...incentiveEvent, source: "incentive" });
    }

    return null;
  }

  private async findDailyReportEvent(id: string, depotId: string | undefined): Promise<RawAuditRow | null> {
    let query = this.database
      .selectFrom("depot_daily_report_events")
      .select(["id", "event_type", "event_at", "actor_user_id", "metadata"])
      .where("id", "=", id);
    if (depotId) query = query.where("depot_id", "=", depotId);
    const event = await query.executeTakeFirst();
    return event ? { ...event, task_id: null, correlation_id: null, source: "daily_report" } : null;
  }

  private async taskInDepot(taskId: string | null, depotId: string): Promise<boolean> {
    if (!taskId) return false;
    return !!(await this.database.selectFrom("tasks").select("id").where("id", "=", taskId).where("depot_id", "=", depotId).executeTakeFirst());
  }

  private async fetchUnifiedRows(filter: ListAuditLogsFilter, access: AuditAccess): Promise<RawAuditRow[]> {
    let taskQuery = this.database
      .selectFrom("task_events")
      .select(["id", "event_type", "event_at", "actor_user_id", "task_id", "correlation_id", "metadata"]);
    let incentiveQuery = this.database
      .selectFrom("incentive_events")
      .select(["id", "event_type", "event_at", "actor_user_id", "task_id", "correlation_id", "metadata"]);

    if (filter.task_id) {
      taskQuery = taskQuery.where("task_id", "=", filter.task_id);
      incentiveQuery = incentiveQuery.where("task_id", "=", filter.task_id);
    }
    if (filter.actor_user_id) {
      taskQuery = taskQuery.where("actor_user_id", "=", filter.actor_user_id);
      incentiveQuery = incentiveQuery.where("actor_user_id", "=", filter.actor_user_id);
    }
    if (filter.event_type) {
      taskQuery = taskQuery.where("event_type", "=", filter.event_type);
      incentiveQuery = incentiveQuery.where("event_type", "=", filter.event_type);
    }
    if (filter.from) {
      taskQuery = taskQuery.where("event_at", ">=", filter.from);
      incentiveQuery = incentiveQuery.where("event_at", ">=", filter.from);
    }
    if (filter.to) {
      taskQuery = taskQuery.where("event_at", "<=", filter.to);
      incentiveQuery = incentiveQuery.where("event_at", "<=", filter.to);
    }

    // Daily depot report events are not task events, so a task filter excludes them.
    let dailyReportQuery = this.database
      .selectFrom("depot_daily_report_events")
      .select(["id", "event_type", "event_at", "actor_user_id", "metadata"]);
    if (filter.actor_user_id) {
      dailyReportQuery = dailyReportQuery.where("actor_user_id", "=", filter.actor_user_id);
    }
    if (filter.event_type) {
      dailyReportQuery = dailyReportQuery.where("event_type", "=", filter.event_type);
    }
    if (filter.from) {
      dailyReportQuery = dailyReportQuery.where("event_at", ">=", filter.from);
    }
    if (filter.to) {
      dailyReportQuery = dailyReportQuery.where("event_at", "<=", filter.to);
    }
    if (access.depotId) {
      const depotId = access.depotId;
      taskQuery = taskQuery.where("task_id", "in", this.database.selectFrom("tasks").select("id").where("depot_id", "=", depotId));
      dailyReportQuery = dailyReportQuery.where("depot_id", "=", depotId);
    }

    const [taskRows, incentiveRows, dailyReportRows] = await Promise.all([
      taskQuery.execute(),
      access.includeIncentives ? incentiveQuery.execute() : Promise.resolve([]),
      filter.task_id ? Promise.resolve([]) : dailyReportQuery.execute()
    ]);

    const unified: RawAuditRow[] = [
      ...taskRows.map((row) => ({ ...row, source: "task" as const })),
      ...incentiveRows.map((row) => ({ ...row, source: "incentive" as const })),
      ...dailyReportRows.map((row) => ({ ...row, task_id: null, correlation_id: null, source: "daily_report" as const }))
    ];

    unified.sort((a, b) => b.event_at.getTime() - a.event_at.getTime());
    return unified;
  }

  private async resolveActorEmployeeId(actorUserId: string | null): Promise<string | null> {
    if (!actorUserId) {
      return null;
    }
    const employee = await this.database
      .selectFrom("employees")
      .select("id")
      .where("user_id", "=", actorUserId)
      .executeTakeFirst();
    return employee?.id ?? null;
  }

  private async toDTO(row: RawAuditRow): Promise<AuditLogEntryDTO> {
    const actorEmployeeId = await this.resolveActorEmployeeId(row.actor_user_id);
    return {
      id: row.id,
      source: row.source,
      eventType: row.event_type,
      eventAt: row.event_at,
      actorUserId: row.actor_user_id,
      actorEmployeeId,
      taskId: row.task_id,
      correlationId: row.correlation_id,
      metadata: parseMetadata(row.metadata),
      before: null,
      reason: null,
      requestId: null
    };
  }
}

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
