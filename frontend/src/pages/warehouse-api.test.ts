import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { filterWarehouseOperations, warehouseSummary } from './warehouse-data';
import { loadingUnloadingOperations } from './loading-unloading-data';
import { ContractValidationError, mapWarehouseOperationToTask, toV1Status, warehouseOperationDtoSchema, type WarehouseOperationDto } from './warehouse-api';
import { createApiWarehouseGateway, createMockWarehouseGateway, describeWarehouseError, fetchLocations, MAX_WAREHOUSE_PAGES } from './warehouse-gateway';

function dto(overrides: Partial<WarehouseOperationDto> = {}): WarehouseOperationDto {
  return {
    id: '3f2a9c1e-0000-4000-8000-000000000001',
    task_code: 'TSK-3F2A9C1E',
    task_type: 'LOADING',
    operation_type: 'LOADING',
    status: 'COMPLETED',
    warehouse: { id: 'd1', code: 'DEP-01', name: 'Main Depot' },
    source_location: { id: 'l1', code: 'A-01', name: 'Receiving bay' },
    destination_location: { id: 'l2', code: 'A-02', name: 'Dispatch hold' },
    inventory_item: { id: 'i1', product_code: 'CB-500', name: 'Corrugated box 500' },
    order: { id: 'o1', order_code: 'ORD-1', priority: 'high' },
    assignees: [{ employee_id: 'e1', employee_code: 'EMP-1', name: 'Asha Rao' }],
    planned_box_quantity: 100,
    completed_box_quantity: 90,
    started_at: '2026-09-29T08:00:00.000Z',
    paused_at: null,
    completed_at: '2026-09-29T10:00:00.000Z',
    created_at: '2026-09-29T07:00:00.000Z',
    timing_events: [
      { id: 't1', event_type: 'TASK_STARTED', event_at: '2026-09-29T08:00:00.000Z' },
      { id: 't2', event_type: 'TASK_PAUSED', event_at: '2026-09-29T09:00:00.000Z' },
      { id: 't3', event_type: 'TASK_RESUMED', event_at: '2026-09-29T09:15:00.000Z' },
      { id: 't4', event_type: 'TASK_COMPLETED', event_at: '2026-09-29T10:00:00.000Z' },
    ],
    sla: { target_seconds: null, status: 'NOT_DEFINED' },
    ...overrides,
  };
}

const envelope = (items: WarehouseOperationDto[], meta: Partial<{ page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean }> = {}) => ({
  success: true,
  data: items,
  meta: { page: 1, pageSize: 200, total: items.length, totalPages: items.length ? 1 : 0, hasNext: false, hasPrevious: false, ...meta },
});

describe('warehouse operation mapping', () => {
  it('maps backend references, BOX quantities, and timing onto the task record', () => {
    const task = mapWarehouseOperationToTask(dto());
    expect(task).toMatchObject({
      id: dto().id, taskCode: 'TSK-3F2A9C1E', type: 'Loading', priority: 'High', source: 'Main Depot · DEP-01 · A-01', destination: 'A-02 · Dispatch hold',
      material: 'Corrugated box 500', barcode: 'CB-500', quantity: '100 BOX', employee: 'Asha Rao', employeeId: 'e1', status: 'Completed', v1Status: 'COMPLETED',
      boxesPlanned: 100, boxesCompleted: 90, sla: 'Not defined', timer: '02h 00m', // total = 1h45 active + 15m paused
    });
    expect(task.timerEvents?.map((event) => event.eventType)).toEqual(['START', 'PAUSE', 'RESUME', 'END']);
    expect(task.slaTargetSeconds).toBeUndefined();
    expect(task.supervisor).toBeUndefined();
  });

  it('projects into the existing warehouse operation read model', () => {
    const operation = filterWarehouseOperations([mapWarehouseOperationToTask(dto())])[0]!;
    expect(operation).toMatchObject({ operation: 'DISPATCH', warehouse: 'Main Depot · DEP-01', status: 'COMPLETED', boxesAssigned: 100, boxesHandled: 90, boxesRemaining: 10, sla: 'Not defined' });
    expect(operation.activeDurationSeconds).toBe(6300);
    expect(operation.pausedDurationSeconds).toBe(900);
  });

  it('classifies loading and unloading, and keeps unmapped types as OTHER', () => {
    const tasks = [
      mapWarehouseOperationToTask(dto()),
      mapWarehouseOperationToTask(dto({ id: 'u', operation_type: 'UNLOADING', task_type: 'unloading' })),
      mapWarehouseOperationToTask(dto({ id: 'o', operation_type: 'OTHER', task_type: 'UNPACKING' })),
    ];
    expect(filterWarehouseOperations(tasks).map((operation) => operation.operation)).toEqual(['DISPATCH', 'RECEIVING', 'OTHER']);
    expect(loadingUnloadingOperations(tasks).map((operation) => operation.operationType)).toEqual(['LOADING', 'UNLOADING']);
  });

  it('maps backend statuses to real lifecycle states only', () => {
    expect(toV1Status(dto({ status: 'ASSIGNED', timing_events: [] }))).toBe('ASSIGNED');
    expect(toV1Status(dto({ status: 'IN_PROGRESS', timing_events: [{ id: 'a', event_type: 'TASK_STARTED', event_at: '2026-09-29T08:00:00Z' }] }))).toBe('STARTED');
    expect(toV1Status(dto({ status: 'IN_PROGRESS' }))).toBe('RESUMED');
    expect(toV1Status(dto({ status: 'PAUSED' }))).toBe('PAUSED');
    expect(toV1Status(dto({ status: 'CANCELLED' }))).toBe('CANCELLED');
    expect(toV1Status(dto({ status: 'PENDING' }))).toBeUndefined();
  });

  it('shows unassigned, unlocated, itemless tasks honestly', () => {
    const task = mapWarehouseOperationToTask(dto({ status: 'PENDING', assignees: [], warehouse: null, source_location: null, destination_location: null, inventory_item: null, order: null, planned_box_quantity: null, completed_box_quantity: null, timing_events: [] }));
    expect(task).toMatchObject({ employee: 'Unassigned', employeeId: undefined, source: 'No warehouse', destination: '—', material: '—', quantity: '—', status: 'Queued', v1Status: undefined, priority: 'Normal' });
    const operation = filterWarehouseOperations([task])[0]!;
    expect(operation.status).toBe('UNASSIGNED');
    expect(operation.boxesAssigned).toBe(0);
    expect(warehouseSummary([operation]).pending).toBe(1);
  });

  it('joins multiple assignees and falls back to the employee code', () => {
    const task = mapWarehouseOperationToTask(dto({ assignees: [{ employee_id: 'e1', employee_code: 'EMP-1', name: 'Asha Rao' }, { employee_id: 'e2', employee_code: 'EMP-2', name: null }] }));
    expect(task.employee).toBe('Asha Rao, EMP-2');
  });
});

describe('runtime validation', () => {
  it('accepts a real envelope including the camelCase mirror keys', () => {
    expect(warehouseOperationDtoSchema.safeParse({ ...dto(), taskCode: 'TSK-3F2A9C1E', operationType: 'LOADING' }).success).toBe(true);
  });

  it('rejects unknown statuses, operation types, negative boxes, and invented SLA targets', () => {
    expect(warehouseOperationDtoSchema.safeParse({ ...dto(), status: 'STARTED' }).success).toBe(false);
    expect(warehouseOperationDtoSchema.safeParse({ ...dto(), operation_type: 'DOCKING' }).success).toBe(false);
    expect(warehouseOperationDtoSchema.safeParse({ ...dto(), planned_box_quantity: -1 }).success).toBe(false);
    expect(warehouseOperationDtoSchema.safeParse({ ...dto(), sla: { target_seconds: 3600, status: 'MET' } }).success).toBe(false);
  });

  it('surfaces a contract error instead of rendering a malformed response', async () => {
    const request = vi.fn().mockResolvedValue({ data: [{ id: 'x' }], meta: { page: 1 } });
    await expect(createApiWarehouseGateway(request).listTasks()).rejects.toBeInstanceOf(ContractValidationError);
    await expect(createApiWarehouseGateway(request).listTasks()).rejects.toThrow(/warehouse operations response did not match/);
  });
});

describe('API warehouse gateway', () => {
  it('reads the operations directory', async () => {
    const request = vi.fn().mockResolvedValue(envelope([dto()]));
    const result = await createApiWarehouseGateway(request).listTasks();
    expect(request).toHaveBeenCalledWith('/warehouse/operations?page=1&pageSize=200');
    expect(result).toMatchObject({ total: 1, truncated: false });
    expect(result.tasks[0]?.taskCode).toBe('TSK-3F2A9C1E');
  });

  it('follows pagination and reports truncation beyond the page cap', async () => {
    const twoPages = vi.fn()
      .mockResolvedValueOnce(envelope([dto({ id: 'a' })], { total: 2, totalPages: 2, hasNext: true }))
      .mockResolvedValueOnce(envelope([dto({ id: 'b' })], { page: 2, total: 2, totalPages: 2, hasNext: false, hasPrevious: true }));
    const result = await createApiWarehouseGateway(twoPages).listTasks();
    expect(result.tasks.map((task) => task.id)).toEqual(['a', 'b']);
    expect(twoPages).toHaveBeenLastCalledWith('/warehouse/operations?page=2&pageSize=200');

    const endless = vi.fn().mockImplementation(async () => envelope([dto()], { total: 5000, totalPages: 25, hasNext: true }));
    const capped = await createApiWarehouseGateway(endless).listTasks();
    expect(endless).toHaveBeenCalledTimes(MAX_WAREHOUSE_PAGES);
    expect(capped).toMatchObject({ total: 5000, truncated: true });
  });

  it('returns an empty directory unchanged', async () => {
    const result = await createApiWarehouseGateway(vi.fn().mockResolvedValue(envelope([]))).listTasks();
    expect(result).toEqual({ tasks: [], total: 0, truncated: false });
  });

  it('loads detail with the activity timeline, and treats 404 as not found', async () => {
    const detail = { ...dto(), activity: [
      { id: 'e0', event_type: 'TASK_CREATED', event_at: '2026-09-29T07:00:00.000Z', actor: 'Sam Supervisor' },
      { id: 'e1', event_type: 'TASK_ASSIGNED', event_at: '2026-09-29T07:05:00.000Z', actor: 'Sam Supervisor' },
      { id: 'e2', event_type: 'TASK_STARTED', event_at: '2026-09-29T08:00:00.000Z', actor: null },
    ] };
    const request = vi.fn().mockResolvedValue({ success: true, data: detail });
    const task = await createApiWarehouseGateway(request).getTask('abc');
    expect(request).toHaveBeenCalledWith('/warehouse/operations/abc');
    expect(task?.activity?.map((event) => [event.eventType, event.actor])).toEqual([['TASK_ASSIGNED', 'Sam Supervisor'], ['TASK_STARTED', 'System']]);

    const missing = vi.fn().mockRejectedValue(new ApiError(404, { code: 'NOT_FOUND' }));
    await expect(createApiWarehouseGateway(missing).getTask('abc')).resolves.toBeUndefined();
  });

  it('propagates 401 and 403 instead of falling back to any data', async () => {
    for (const status of [401, 403]) {
      const failure = new ApiError(status, { code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN', message: 'no' });
      await expect(createApiWarehouseGateway(vi.fn().mockRejectedValue(failure)).listTasks()).rejects.toBe(failure);
      await expect(createApiWarehouseGateway(vi.fn().mockRejectedValue(failure)).getTask('x')).rejects.toBe(failure);
    }
  });

  it('keeps preview mode on the in-memory task repository', async () => {
    const tasks = { list: vi.fn().mockResolvedValue({ items: [mapWarehouseOperationToTask(dto())], total: 1 }), getById: vi.fn().mockResolvedValue(undefined) };
    const gateway = createMockWarehouseGateway(tasks);
    await expect(gateway.listTasks()).resolves.toMatchObject({ total: 1, truncated: false });
    await expect(gateway.getTask('x')).resolves.toBeUndefined();
    expect(tasks.list).toHaveBeenCalledWith({ page: 1, pageSize: Number.MAX_SAFE_INTEGER });
  });
});

describe('locations', () => {
  const location = { id: 'l1', code: 'A-01', name: 'Receiving bay', active: true, warehouse: { id: 'd1', code: 'DEP-01', name: 'Main Depot', active: true }, parent: { id: 'z', code: 'A', name: 'Zone A' }, box_on_hand: 120 };

  it('requests with filters and maps the page', async () => {
    const request = vi.fn().mockResolvedValue({ success: true, data: [{ ...location, boxOnHand: 120 }], meta: { page: 2, pageSize: 24, total: 25, totalPages: 2, hasNext: false, hasPrevious: true } });
    const page = await fetchLocations({ page: 2, pageSize: 24, search: ' recv ', active: 'true' }, request);
    expect(request).toHaveBeenCalledWith('/locations?page=2&pageSize=24&search=recv&active=true');
    expect(page).toMatchObject({ page: 2, total: 25, totalPages: 2 });
    expect(page.items[0]).toEqual({ id: 'l1', code: 'A-01', name: 'Receiving bay', active: true, warehouse: location.warehouse, parent: location.parent, boxOnHand: 120 });
  });

  it('rejects malformed location responses', async () => {
    const request = vi.fn().mockResolvedValue({ data: [{ ...location, box_on_hand: -5 }], meta: { page: 1, pageSize: 24, total: 1, totalPages: 1, hasNext: false, hasPrevious: false } });
    await expect(fetchLocations({ page: 1, pageSize: 24 }, request)).rejects.toBeInstanceOf(ContractValidationError);
  });
});

describe('error descriptions', () => {
  it('explains session, permission, server, and network failures', () => {
    expect(describeWarehouseError(new ApiError(401, { code: 'UNAUTHORIZED' }), 'x')).toContain('session');
    expect(describeWarehouseError(new ApiError(403, { code: 'FORBIDDEN', message: 'This task is not assigned to you.' }), 'x')).toBe('This task is not assigned to you.');
    expect(describeWarehouseError(new ApiError(500, { code: 'INTERNAL', message: 'SELECT secret' }), 'x')).not.toContain('secret');
    expect(describeWarehouseError(new TypeError('Failed to fetch'), 'x')).toContain('Could not reach');
  });
});
