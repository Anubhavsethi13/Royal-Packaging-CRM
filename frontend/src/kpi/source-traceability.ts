import { KPI_OPERATIONS, KPI_SOURCE_TYPES, type KpiOperation, type KpiSourceRecordReference, type KpiSourceType } from './kpi-domain';
import type { KpiResultReadModel } from './kpi-result-domain';
import type { TaskRecord } from '../types/domain';

export type TraceabilityIssueCode =
  | 'MISSING_SOURCE_RECORD'
  | 'MISSING_SOURCE_TYPE'
  | 'UNSUPPORTED_SOURCE_TYPE'
  | 'MISSING_TASK'
  | 'TASK_UNAVAILABLE'
  | 'EMPLOYEE_MISMATCH'
  | 'OPERATION_MISMATCH'
  | 'MISSING_TIMESTAMP'
  | 'MISSING_METADATA';

export interface TraceabilityIssue {
  code: TraceabilityIssueCode;
  message: string;
  sourceRecordId?: string;
  severity: 'error' | 'warning';
}

export interface SourceReferenceGroup {
  key: string;
  sourceType: KpiSourceType | string;
  operation: KpiOperation | 'UNSPECIFIED';
  references: KpiSourceRecordReference[];
  count: number;
}

const sourceOperationMap: Record<KpiSourceType, KpiOperation> = {
  TASK: 'TASK',
  WAREHOUSE_OPERATION: 'WAREHOUSE',
  LOADING_OPERATION: 'LOADING',
  UNLOADING_OPERATION: 'UNLOADING',
};

export function sourceTypeRequiresTask(sourceType: string): boolean {
  return sourceType === 'TASK' || sourceType.endsWith('_OPERATION');
}

export function sourceReferenceIssues(
  result: Pick<KpiResultReadModel, 'employeeId' | 'operation'>,
  reference: KpiSourceRecordReference,
  resolvedTask?: TaskRecord,
  taskResolutionAttempted = false,
): TraceabilityIssue[] {
  const issues: TraceabilityIssue[] = [];
  const sourceRecordId = reference.sourceRecordId || undefined;
  const add = (code: TraceabilityIssueCode, message: string, severity: TraceabilityIssue['severity'] = 'warning') => issues.push({ code, message, sourceRecordId, severity });

  if (!reference.sourceRecordId?.trim()) add('MISSING_SOURCE_RECORD', 'Source record is unavailable.', 'error');
  if (!reference.sourceType?.trim()) add('MISSING_SOURCE_TYPE', 'Source type is unavailable.', 'error');
  else if (!(KPI_SOURCE_TYPES as readonly string[]).includes(reference.sourceType)) add('UNSUPPORTED_SOURCE_TYPE', 'Source type is not supported by the current frontend read model.', 'error');
  if (sourceTypeRequiresTask(reference.sourceType) && !reference.taskId?.trim()) add('MISSING_TASK', 'Source task is unavailable.', 'error');
  if (reference.taskId && taskResolutionAttempted && !resolvedTask) add('TASK_UNAVAILABLE', 'The supplied source task could not be resolved in the current operational read model.', 'warning');
  if (reference.employeeId && reference.employeeId !== result.employeeId) add('EMPLOYEE_MISMATCH', 'Source employee does not match the KPI result employee.', 'error');
  if (resolvedTask?.employeeId && resolvedTask.employeeId !== result.employeeId) add('EMPLOYEE_MISMATCH', 'Resolved source task employee does not match the KPI result employee.', 'error');
  if (!reference.timestamp?.trim()) add('MISSING_TIMESTAMP', 'Source timestamp is unavailable.', 'warning');
  if (reference.operationType && reference.operationType !== result.operation) add('OPERATION_MISMATCH', 'Source operation does not match the KPI result operation.', 'error');
  const expectedOperation = sourceOperationMap[reference.sourceType as KpiSourceType];
  if (expectedOperation && reference.operationType && reference.operationType !== expectedOperation) add('OPERATION_MISMATCH', 'Source operation does not match its source type.', 'error');
  if (reference.quantity === undefined && reference.durationSeconds === undefined && reference.slaStatus === undefined) add('MISSING_METADATA', 'No supplied quantity, duration, or SLA metadata is available.', 'warning');
  return issues;
}

export function validateKpiResultTraceability(result: KpiResultReadModel, resolvedTasks: ReadonlyMap<string, TaskRecord | undefined> = new Map()): TraceabilityIssue[] {
  if (!result.sourceReferences.length) return [{ code: 'MISSING_SOURCE_RECORD', message: 'No source records are attached to this KPI result.', severity: 'warning' }];
  return result.sourceReferences.flatMap((reference) => {
    const taskWasResolved = Boolean(reference.taskId && resolvedTasks.has(reference.taskId));
    return sourceReferenceIssues(result, reference, taskWasResolved ? resolvedTasks.get(reference.taskId as string) : undefined, taskWasResolved);
  });
}

export function groupSourceReferences(references: KpiSourceRecordReference[]): SourceReferenceGroup[] {
  const groups = new Map<string, SourceReferenceGroup>();
  references.forEach((reference) => {
    const operation = reference.operationType ?? 'UNSPECIFIED';
    const key = `${reference.sourceType}:${operation}`;
    const existing = groups.get(key);
    if (existing) {
      existing.references.push(reference);
      existing.count += 1;
      return;
    }
    groups.set(key, { key, sourceType: reference.sourceType, operation, references: [reference], count: 1 });
  });
  return Array.from(groups.values());
}

export function sourceTypeOperation(sourceType: string): KpiOperation | undefined {
  return sourceOperationMap[sourceType as KpiSourceType] ?? (KPI_OPERATIONS as readonly string[]).includes(sourceType) ? sourceType as KpiOperation : undefined;
}
