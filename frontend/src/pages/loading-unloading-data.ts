import type { LoadingUnloadingOperationRecord, LoadingUnloadingOperationType, OperationalSlaStatus, TaskRecord } from '../types/domain';
import { calculateTimerDurations } from './task-workflow';

export interface LoadingUnloadingFilters { search?: string; operationType?: string; status?: string; employee?: string; warehouse?: string; slaStatus?: string; }

export function validateLoadingUnloadingBoxes(value: string, assigned: number): string | undefined {
  if (!/^\d+$/.test(value.trim())) return 'Enter a whole BOX quantity.';
  const handled = Number(value);
  if (handled < 0) return 'BOX quantity cannot be negative.';
  if (handled > assigned) return 'Handled BOX quantity cannot exceed assigned BOX quantity.';
  return undefined;
}

export function loadingUnloadingSearchText(operation: LoadingUnloadingOperationRecord): string {
  return `${operation.taskCode} ${operation.operationType} ${operation.employee} ${operation.warehouse} ${operation.orderReference ?? ''}`.toLowerCase();
}

export function slaVarianceSeconds(operation: LoadingUnloadingOperationRecord): number | undefined {
  if (operation.slaTargetSeconds === undefined || operation.totalDurationSeconds === undefined) return undefined;
  return operation.totalDurationSeconds - operation.slaTargetSeconds;
}

export function classifyLoadingUnloadingTask(task: TaskRecord): LoadingUnloadingOperationType | undefined {
  if (task.type === 'Loading') return 'LOADING';
  if (task.type === 'Unloading') return 'UNLOADING';
  return undefined;
}

function operationalSlaStatus(task: TaskRecord): OperationalSlaStatus {
  const status = task.v1Status;
  if (task.sla === 'Breach risk') return 'BREACHED';
  if (task.sla === 'At risk') return 'AT_RISK';
  if (!status || status === 'ASSIGNED' || status === 'ACCEPTED' || status === 'REASSIGNED') return 'NOT_STARTED';
  if (status === 'STARTED' || status === 'PAUSED' || status === 'RESUMED' || status === 'REOPENED') return 'IN_PROGRESS';
  if (status === 'CANCELLED') return 'NOT_APPLICABLE';
  return 'MET';
}

export function toLoadingUnloadingOperation(task: TaskRecord): LoadingUnloadingOperationRecord | undefined {
  const operationType = classifyLoadingUnloadingTask(task);
  if (!operationType) return undefined;
  const boxesAssigned = task.boxesPlanned ?? (Number.parseInt(task.quantity, 10) || 0);
  const boxesHandled = Math.max(0, Math.min(task.boxesCompleted ?? 0, boxesAssigned));
  const timing = calculateTimerDurations(task.timerEvents ?? []);
  return {
    id: `loading-unloading-${task.id}`, taskId: task.id, taskCode: task.taskCode, operationType, warehouse: task.source.split(' · ').slice(0, 2).join(' · '), employee: task.employee,
    supervisor: task.supervisor, employeeId: task.employeeId, status: task.v1Status ?? 'ASSIGNED', boxesAssigned, boxesHandled, boxesRemaining: Math.max(0, boxesAssigned - boxesHandled),
    startedAt: task.startedAt, completedAt: task.completedAt, activeDurationSeconds: timing.activeSeconds, pausedDurationSeconds: timing.pausedSeconds, totalDurationSeconds: timing.totalSeconds,
    slaTargetSeconds: task.slaTargetSeconds, slaStatus: operationalSlaStatus(task), evidence: task.evidence ?? [], activity: task.activity ?? [], task,
  };
}

export function loadingUnloadingOperations(tasks: TaskRecord[], filters: LoadingUnloadingFilters = {}): LoadingUnloadingOperationRecord[] {
  const search = filters.search?.trim().toLowerCase();
  return tasks.flatMap((task) => { const operation = toLoadingUnloadingOperation(task); return operation ? [operation] : []; }).filter((operation) =>
    (!search || loadingUnloadingSearchText(operation).includes(search)) &&
    (!filters.operationType || filters.operationType === 'all' || operation.operationType === filters.operationType) &&
    (!filters.status || filters.status === 'all' || operation.status === filters.status) &&
    (!filters.employee || filters.employee === 'all' || operation.employee === filters.employee) &&
    (!filters.warehouse || filters.warehouse === 'all' || operation.warehouse === filters.warehouse) &&
    (!filters.slaStatus || filters.slaStatus === 'all' || operation.slaStatus === filters.slaStatus),
  );
}

export function findLoadingUnloadingOperation(tasks: TaskRecord[], taskId: string): LoadingUnloadingOperationRecord | undefined {
  const task = tasks.find((candidate) => candidate.id === taskId);
  return task ? toLoadingUnloadingOperation(task) : undefined;
}
