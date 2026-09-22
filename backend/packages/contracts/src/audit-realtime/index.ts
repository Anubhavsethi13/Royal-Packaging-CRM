import { z } from "zod";

export const listAuditLogsFilterSchema = z.object({
  task_id: z.string().uuid().optional(),
  actor_user_id: z.string().uuid().optional(),
  event_type: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});
export type ListAuditLogsFilter = z.infer<typeof listAuditLogsFilterSchema>;

/**
 * `before`, `reason`, and `requestId` are always null (Assumption:
 * reconciliation doc). The underlying task_events/incentive_events tables
 * capture only an event type, timestamp, actor, and free-form metadata -
 * they never recorded a "before" snapshot, an operator-entered reason, or
 * the originating HTTP request ID. The DTO exposes the shape the frontend
 * expects with honest nulls rather than fabricating that data.
 */
export interface AuditLogEntryDTO {
  readonly id: string;
  readonly source: "task" | "incentive";
  readonly eventType: string;
  readonly eventAt: Date;
  readonly actorUserId: string | null;
  readonly actorEmployeeId: string | null;
  readonly taskId: string | null;
  readonly correlationId: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly before: null;
  readonly reason: null;
  readonly requestId: null;
}
