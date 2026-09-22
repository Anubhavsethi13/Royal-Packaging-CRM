import type { KpiMetricCode, KpiOperation, KpiSourceType, KpiUnit } from './kpi-domain';
import { toLoadingUnloadingOperation } from '../pages/loading-unloading-data';
import { toWarehouseOperation } from '../pages/warehouse-data';
import type { LoadingUnloadingOperationRecord, TaskRecord } from '../types/domain';

export type PreviewableKpiMetric = 'BOXES_HANDLED' | 'TIME_TAKEN' | 'SLA_COMPLIANCE';

export interface KpiOperationalSourceDefinition {
  metric: PreviewableKpiMetric;
  sourceTypes: KpiSourceType[];
  operations: KpiOperation[];
  unit: KpiUnit;
  description: string;
}

export const KPI_OPERATIONAL_SOURCE_MAP: Record<PreviewableKpiMetric, KpiOperationalSourceDefinition> = {
  BOXES_HANDLED: { metric: 'BOXES_HANDLED', sourceTypes: ['WAREHOUSE_OPERATION', 'LOADING_OPERATION', 'UNLOADING_OPERATION'], operations: ['WAREHOUSE', 'LOADING', 'UNLOADING'], unit: 'BOX', description: 'BOX quantities from warehouse, loading, and unloading operational records.' },
  TIME_TAKEN: { metric: 'TIME_TAKEN', sourceTypes: ['LOADING_OPERATION', 'UNLOADING_OPERATION'], operations: ['LOADING', 'UNLOADING'], unit: 'DURATION', description: 'Recorded active timing from loading and unloading operational records.' },
  SLA_COMPLIANCE: { metric: 'SLA_COMPLIANCE', sourceTypes: ['LOADING_OPERATION', 'UNLOADING_OPERATION'], operations: ['LOADING', 'UNLOADING'], unit: 'PERCENTAGE', description: 'SLA target and status fields from loading and unloading operational records.' },
};

export interface KpiSourcePreviewRecord {
  sourceRecordId: string;
  sourceReference: string;
  taskId: string;
  taskCode: string;
  employeeId?: string;
  employee: string;
  sourceType: KpiSourceType;
  operation: KpiOperation;
  metric: PreviewableKpiMetric;
  value?: number;
  unit: KpiUnit;
  taskStatus: string;
  timestamp?: string;
  startedAt?: string;
  completedAt?: string;
  durationSeconds?: number;
  slaTargetSeconds?: number;
  slaStatus?: LoadingUnloadingOperationRecord['slaStatus'];
  warehouse?: string;
  mock: true;
}

export interface KpiSourcePreviewFilters {
  employeeId?: string;
  operation?: KpiOperation | 'all';
  taskStatus?: string;
  date?: string;
}

function operationForTask(task: TaskRecord): KpiOperation | undefined {
  if (task.type === 'Loading') return 'LOADING';
  if (task.type === 'Unloading') return 'UNLOADING';
  return 'WAREHOUSE';
}

function timestampFor(task: TaskRecord): string | undefined {
  return task.startedAt ?? task.completedAt ?? task.createdAt;
}

function sourceFromTask(task: TaskRecord, metric: PreviewableKpiMetric): KpiSourcePreviewRecord | undefined {
  const operation = operationForTask(task);
  if (!operation) return undefined;
  if (metric === 'TIME_TAKEN' || metric === 'SLA_COMPLIANCE') {
    const loading = toLoadingUnloadingOperation(task);
    if (!loading) return undefined;
    const sourceType: KpiSourceType = loading.operationType === 'LOADING' ? 'LOADING_OPERATION' : 'UNLOADING_OPERATION';
    return {
      sourceRecordId: loading.id, sourceReference: `mock://task/${task.id}`, taskId: loading.taskId, taskCode: loading.taskCode,
      employeeId: loading.employeeId, employee: loading.employee, sourceType, operation, metric, unit: metric === 'TIME_TAKEN' ? 'DURATION' : 'PERCENTAGE',
      value: metric === 'TIME_TAKEN' ? loading.totalDurationSeconds : undefined, taskStatus: loading.status, timestamp: timestampFor(task),
      startedAt: loading.startedAt, completedAt: loading.completedAt, durationSeconds: loading.totalDurationSeconds, slaTargetSeconds: loading.slaTargetSeconds,
      slaStatus: loading.slaStatus, warehouse: loading.warehouse, mock: true,
    };
  }
  const warehouse = toWarehouseOperation(task);
  const sourceType: KpiSourceType = operation === 'WAREHOUSE' ? 'WAREHOUSE_OPERATION' : operation === 'LOADING' ? 'LOADING_OPERATION' : 'UNLOADING_OPERATION';
  return {
    sourceRecordId: warehouse.id, sourceReference: `mock://task/${task.id}`, taskId: warehouse.taskId, taskCode: warehouse.taskCode,
    employeeId: warehouse.employeeId, employee: warehouse.employee, sourceType, operation, metric, value: warehouse.boxesHandled, unit: 'BOX',
    taskStatus: warehouse.status, timestamp: timestampFor(task), startedAt: warehouse.startedAt, completedAt: warehouse.completedAt,
    durationSeconds: warehouse.totalDurationSeconds, warehouse: warehouse.warehouse, mock: true,
  };
}

export function sourceDefinitionForMetric(metric: KpiMetricCode): KpiOperationalSourceDefinition | undefined {
  return KPI_OPERATIONAL_SOURCE_MAP[metric as PreviewableKpiMetric];
}

export function sourceRecordsForMetric(tasks: TaskRecord[], metric: KpiMetricCode, operation?: KpiOperation): KpiSourcePreviewRecord[] {
  const definition = sourceDefinitionForMetric(metric);
  if (!definition) return [];
  return tasks.flatMap((task) => {
    const record = sourceFromTask(task, definition.metric);
    return record && definition.sourceTypes.includes(record.sourceType) && (!operation || record.operation === operation) ? [record] : [];
  });
}

export function filterSourceRecords(records: KpiSourcePreviewRecord[], filters: KpiSourcePreviewFilters = {}): KpiSourcePreviewRecord[] {
  return records.filter((record) => (!filters.employeeId || filters.employeeId === 'all' || record.employeeId === filters.employeeId)
    && (!filters.operation || filters.operation === 'all' || record.operation === filters.operation)
    && (!filters.taskStatus || filters.taskStatus === 'all' || record.taskStatus === filters.taskStatus)
    && (!filters.date || record.timestamp?.startsWith(filters.date)));
}

export function formatSourceDuration(seconds?: number): string {
  if (seconds === undefined) return 'Not recorded';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}
