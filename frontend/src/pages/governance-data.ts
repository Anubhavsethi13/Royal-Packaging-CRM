import { z } from 'zod';
import { parseContract } from '../api/contract-validation';
import type { AuditRecord, ReportRecord } from '../types/domain';

/**
 * `GET /audit-logs` and `GET /reports` read models. Only fields with a backend source are mapped;
 * what the backend does not record (actor names, result, before/after, report category, cadence,
 * owner, last run, status) is shown as not recorded rather than invented, and user/employee IDs
 * are never displayed as names (`Docs/integration/frontend-backend-contract-reconciliation.md` §2.2, §2.4).
 */
const timestamp = z.union([z.string(), z.date()]).transform((value) => new Date(value).toLocaleString());

const auditEntrySchema = z.object({
  id: z.string(),
  source: z.enum(['task', 'incentive', 'daily_report']),
  eventType: z.string(),
  eventAt: timestamp,
  taskId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});

const auditEntity: Record<z.infer<typeof auditEntrySchema>['source'], string> = {
  task: 'Task',
  incentive: 'Incentive',
  daily_report: 'Daily report',
};

export function mapAuditLogDtoToRecord(payload: unknown): AuditRecord {
  const dto = parseContract(auditEntrySchema, (payload as { data?: unknown })?.data ?? payload, 'audit log');
  // Daily-report events carry the report id in metadata (documented on AuditLogEntryDTO).
  const reportId = typeof dto.metadata?.report_id === 'string' ? dto.metadata.report_id : null;
  return {
    id: dto.id,
    actor: 'Not recorded',
    action: dto.eventType,
    entity: auditEntity[dto.source],
    entityId: dto.taskId ?? reportId ?? '—',
    timestamp: dto.eventAt,
    result: 'Not recorded',
    before: '—',
    after: '—',
  };
}

const reportDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export function mapReportDefinitionDtoToRecord(payload: unknown): ReportRecord {
  const dto = parseContract(reportDefinitionSchema, (payload as { data?: unknown })?.data ?? payload, 'report');
  return {
    id: dto.id,
    name: dto.name,
    category: 'Not recorded',
    cadence: 'Not recorded',
    lastRun: 'Not recorded',
    owner: 'Not recorded',
    status: 'Not recorded',
  };
}
