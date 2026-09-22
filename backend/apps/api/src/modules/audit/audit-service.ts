import type { AuditLogEntryDTO, ListAuditLogsFilter } from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";

export interface AuditServiceConfig {
  readonly database: DatabaseConnection;
}

interface RawAuditRow {
  id: string;
  source: "task" | "incentive";
  event_type: string;
  event_at: Date;
  actor_user_id: string | null;
  task_id: string | null;
  correlation_id: string | null;
  metadata: string | null;
}

/**
 * Unifies task_events and incentive_events into a single audit feed. Both
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

  public async list(filter: ListAuditLogsFilter = {}): Promise<AuditLogEntryDTO[]> {
    const rows = await this.fetchUnifiedRows(filter);
    return Promise.all(rows.map((row) => this.toDTO(row)));
  }

  public async getById(id: string): Promise<AuditLogEntryDTO | null> {
    const taskEvent = await this.database
      .selectFrom("task_events")
      .select(["id", "event_type", "event_at", "actor_user_id", "task_id", "correlation_id", "metadata"])
      .where("id", "=", id)
      .executeTakeFirst();

    if (taskEvent) {
      return this.toDTO({ ...taskEvent, source: "task" });
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

  private async fetchUnifiedRows(filter: ListAuditLogsFilter): Promise<RawAuditRow[]> {
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

    const [taskRows, incentiveRows] = await Promise.all([taskQuery.execute(), incentiveQuery.execute()]);

    const unified: RawAuditRow[] = [
      ...taskRows.map((row) => ({ ...row, source: "task" as const })),
      ...incentiveRows.map((row) => ({ ...row, source: "incentive" as const }))
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
