import type { ListResponse } from '../mock/repositories';
import type { TaskRecord, WarehouseOperationRecord, WarehouseOperationType } from '../types/domain';
import { calculateTimerDurations, formatDuration } from './task-workflow';

const operationByTaskType: Record<TaskRecord['type'], WarehouseOperationType> = {
  Loading: 'DISPATCH', Unloading: 'RECEIVING', Putaway: 'STORAGE', Picking: 'PICKING', Wrapping: 'PACKING',
};

export interface WarehouseFilters { search?: string; operation?: string; status?: string; employee?: string; warehouse?: string; }

export function toWarehouseOperation(task: TaskRecord): WarehouseOperationRecord {
  const boxesAssigned = task.boxesPlanned ?? (Number.parseInt(task.quantity, 10) || 0);
  const boxesHandled = task.boxesCompleted ?? 0;
  const timing = calculateTimerDurations(task.timerEvents ?? []);
  return {
    id: `warehouse-${task.id}`, taskId: task.id, taskCode: task.taskCode, operation: operationByTaskType[task.type], employee: task.employee, employeeId: task.employeeId,
    supervisor: task.supervisor, warehouse: task.source.split(' · ').slice(0, 2).join(' · '), status: task.v1Status ?? 'ASSIGNED',
    boxesAssigned, boxesHandled, boxesRemaining: Math.max(0, boxesAssigned - boxesHandled), startedAt: task.startedAt, completedAt: task.completedAt, sla: task.sla, task,
    activeDurationSeconds: timing.activeSeconds, pausedDurationSeconds: timing.pausedSeconds, totalDurationSeconds: timing.totalSeconds,
    slaTargetSeconds: task.slaTargetSeconds, evidence: task.evidence ?? [], activity: task.activity ?? [],
  };
}

export function filterWarehouseOperations(tasks: TaskRecord[], filters: WarehouseFilters = {}): WarehouseOperationRecord[] {
  const search = filters.search?.trim().toLowerCase();
  return tasks.map(toWarehouseOperation).filter((operation) =>
    (!search || `${operation.taskCode} ${operation.operation} ${operation.employee} ${operation.warehouse}`.toLowerCase().includes(search)) &&
    (!filters.operation || filters.operation === 'all' || operation.operation === filters.operation) &&
    (!filters.status || filters.status === 'all' || operation.status === filters.status) &&
    (!filters.employee || filters.employee === 'all' || operation.employee === filters.employee) &&
    (!filters.warehouse || filters.warehouse === 'all' || operation.warehouse === filters.warehouse),
  );
}

export function warehouseSummary(operations: WarehouseOperationRecord[]) {
  return {
    boxesHandled: operations.reduce((total, operation) => total + operation.boxesHandled, 0),
    completed: operations.filter((operation) => operation.status === 'COMPLETED' || operation.status === 'VERIFIED').length,
    active: operations.filter((operation) => operation.status === 'STARTED' || operation.status === 'RESUMED').length,
    pending: operations.filter((operation) => operation.status === 'ASSIGNED' || operation.status === 'ACCEPTED').length,
    paused: operations.filter((operation) => operation.status === 'PAUSED').length,
  };
}

export function warehouseDuration(task: TaskRecord): string {
  return formatDuration(calculateTimerDurations(task.timerEvents ?? []).totalSeconds);
}

export function validateWarehouseBoxes(value: string, assigned: number): string | undefined {
  if (!/^\d+$/.test(value.trim())) return 'Enter a whole BOX quantity.';
  const handled = Number(value);
  if (handled < 0) return 'BOX quantity cannot be negative.';
  if (handled > assigned) return 'Handled BOX quantity cannot exceed assigned BOX quantity.';
  return undefined;
}

export function asWarehouseResponse(tasks: TaskRecord[]): ListResponse<WarehouseOperationRecord> {
  const items = tasks.map(toWarehouseOperation);
  return { items, page: 1, pageSize: items.length || 1, total: items.length, stale: true };
}
