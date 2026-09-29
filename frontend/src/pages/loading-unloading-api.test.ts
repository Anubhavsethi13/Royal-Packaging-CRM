import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { tasks as mockTasks } from '../mock/data';
import { loadingUnloadingOperations, operationalSlaStatus, slaVarianceSeconds, toLoadingUnloadingOperation } from './loading-unloading-data';
import { ContractValidationError, mapWarehouseOperationToTask, type WarehouseOperationDto } from './warehouse-api';
import { createApiWarehouseGateway, describeWarehouseError } from './warehouse-gateway';

function dto(overrides: Partial<WarehouseOperationDto> = {}): WarehouseOperationDto {
  return {
    id: 'task-load-1', task_code: 'TSK-LOAD0001', task_type: 'LOADING', operation_type: 'LOADING', status: 'COMPLETED',
    warehouse: { id: 'd1', code: 'DOCK-01', name: 'Dock Depot' }, source_location: null, destination_location: null, inventory_item: null, order: null,
    assignees: [{ employee_id: 'e1', employee_code: 'EMP-1', name: 'Lena Loader' }],
    planned_box_quantity: 120, completed_box_quantity: 118,
    started_at: '2026-09-29T08:00:00.000Z', paused_at: null, completed_at: '2026-09-29T09:30:00.000Z', created_at: '2026-09-29T07:00:00.000Z',
    timing_events: [
      { id: 't1', event_type: 'TASK_STARTED', event_at: '2026-09-29T08:00:00.000Z' },
      { id: 't2', event_type: 'TASK_PAUSED', event_at: '2026-09-29T08:30:00.000Z' },
      { id: 't3', event_type: 'TASK_RESUMED', event_at: '2026-09-29T08:40:00.000Z' },
      { id: 't4', event_type: 'TASK_COMPLETED', event_at: '2026-09-29T09:30:00.000Z' },
    ],
    sla: { target_seconds: null, status: 'NOT_DEFINED' },
    ...overrides,
  };
}

const envelope = (items: WarehouseOperationDto[]) => ({ success: true, data: items, meta: { page: 1, pageSize: 200, total: items.length, totalPages: items.length ? 1 : 0, hasNext: false, hasPrevious: false } });

describe('loading and unloading from the API read model', () => {
  it('projects a LOADING task with task id, warehouse, employee, BOX quantities, times, and duration', () => {
    const operation = toLoadingUnloadingOperation(mapWarehouseOperationToTask(dto()))!;
    expect(operation).toMatchObject({
      taskId: 'task-load-1', taskCode: 'TSK-LOAD0001', operationType: 'LOADING', warehouse: 'Dock Depot · DOCK-01', employee: 'Lena Loader', employeeId: 'e1', status: 'COMPLETED',
      boxesAssigned: 120, boxesHandled: 118, boxesRemaining: 2, startedAt: '2026-09-29T08:00:00.000Z', completedAt: '2026-09-29T09:30:00.000Z',
      activeDurationSeconds: 4800, pausedDurationSeconds: 600, totalDurationSeconds: 5400,
    });
  });

  it('projects UNLOADING tasks and ignores everything else', () => {
    const records = [
      mapWarehouseOperationToTask(dto()),
      mapWarehouseOperationToTask(dto({ id: 'u1', task_type: 'RECEIVING', operation_type: 'UNLOADING', status: 'IN_PROGRESS', completed_box_quantity: null, completed_at: null, timing_events: [{ id: 's', event_type: 'TASK_STARTED', event_at: '2026-09-29T08:00:00.000Z' }] })),
      mapWarehouseOperationToTask(dto({ id: 'p1', operation_type: 'PICKING' })),
      mapWarehouseOperationToTask(dto({ id: 'o1', operation_type: 'OTHER' })),
    ];
    const operations = loadingUnloadingOperations(records);
    expect(operations.map((operation) => [operation.taskId, operation.operationType, operation.status])).toEqual([['task-load-1', 'LOADING', 'COMPLETED'], ['u1', 'UNLOADING', 'STARTED']]);
    expect(loadingUnloadingOperations(records, { operationType: 'UNLOADING' }).map((operation) => operation.taskId)).toEqual(['u1']);
  });

  it('never reports an SLA as met or breached when no target exists', () => {
    for (const status of ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const) {
      const task = mapWarehouseOperationToTask(dto({ status }));
      expect(operationalSlaStatus(task)).toBe('NOT_APPLICABLE');
    }
    const operation = toLoadingUnloadingOperation(mapWarehouseOperationToTask(dto()))!;
    expect(operation.slaTargetSeconds).toBeUndefined();
    expect(slaVarianceSeconds(operation)).toBeUndefined();
  });

  it('keeps the existing SLA behaviour for preview data that has targets', () => {
    const withTarget = mockTasks.find((task) => task.type === 'Loading' && task.slaTargetSeconds !== undefined);
    expect(withTarget).toBeDefined();
    expect(operationalSlaStatus(withTarget!)).not.toBe('NOT_APPLICABLE');
  });

  it('shows unassigned tasks as UNASSIGNED, not ASSIGNED', () => {
    const operation = toLoadingUnloadingOperation(mapWarehouseOperationToTask(dto({ status: 'PENDING', assignees: [], timing_events: [], started_at: null, completed_at: null, completed_box_quantity: null })))!;
    expect(operation).toMatchObject({ status: 'UNASSIGNED', employee: 'Unassigned', boxesHandled: 0, totalDurationSeconds: 0 });
  });

  it('never shows more BOX handled than assigned', () => {
    const operation = toLoadingUnloadingOperation(mapWarehouseOperationToTask(dto({ planned_box_quantity: 10, completed_box_quantity: 12 })))!;
    expect(operation.boxesHandled).toBe(10);
    expect(operation.boxesRemaining).toBe(0);
  });
});

describe('loading and unloading gateway calls', () => {
  it('asks the server for LOADING and UNLOADING only', async () => {
    const request = vi.fn().mockResolvedValue(envelope([dto()]));
    const result = await createApiWarehouseGateway(request).listTasks({ operationTypes: ['LOADING', 'UNLOADING'] });
    expect(request).toHaveBeenCalledWith('/warehouse/operations?page=1&pageSize=200&operation_type=LOADING%2CUNLOADING');
    expect(result.tasks).toHaveLength(1);
  });

  it('handles an empty dock directory', async () => {
    const result = await createApiWarehouseGateway(vi.fn().mockResolvedValue(envelope([]))).listTasks({ operationTypes: ['LOADING', 'UNLOADING'] });
    expect(result).toEqual({ tasks: [], total: 0, truncated: false });
    expect(loadingUnloadingOperations(result.tasks)).toEqual([]);
  });

  it('rejects an invalid response rather than rendering it', async () => {
    const request = vi.fn().mockResolvedValue(envelope([{ ...dto(), operation_type: 'DOCKING' } as unknown as WarehouseOperationDto]));
    await expect(createApiWarehouseGateway(request).listTasks({ operationTypes: ['LOADING'] })).rejects.toBeInstanceOf(ContractValidationError);
  });

  it('surfaces unauthorized, forbidden, invalid-warehouse, and server failures', async () => {
    const unauthorized = new ApiError(401, { code: 'UNAUTHORIZED', message: 'Session is invalid or expired.' });
    await expect(createApiWarehouseGateway(vi.fn().mockRejectedValue(unauthorized)).listTasks({ operationTypes: ['LOADING'] })).rejects.toBe(unauthorized);
    expect(describeWarehouseError(unauthorized, 'x')).toBe('Your session has expired. Sign in again.');
    expect(describeWarehouseError(new ApiError(403, { code: 'FORBIDDEN', message: 'You may only view your own warehouse tasks.' }), 'x')).toBe('You may only view your own warehouse tasks.');
    expect(describeWarehouseError(new ApiError(400, { code: 'INVALID_WAREHOUSE', message: "Warehouse 'NOPE' does not exist." }), 'x')).toBe("Warehouse 'NOPE' does not exist.");
    expect(describeWarehouseError(new ApiError(503, { code: 'X' }), 'x')).toContain('could not complete');
  });

  it('treats a missing dock task as not found', async () => {
    const missing = vi.fn().mockRejectedValue(new ApiError(404, { code: 'NOT_FOUND' }));
    await expect(createApiWarehouseGateway(missing).getTask('nope')).resolves.toBeUndefined();
  });
});
