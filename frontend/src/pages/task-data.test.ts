import { describe, expect, it, vi } from 'vitest';
import { decodeTaskDetail, decodeTaskListItem, loadTaskDetail, loadTaskList, mapTaskListQuery, taskActivityTimeline } from './task-data';
import { ContractValidationError } from './warehouse-api';
import type { TaskRecord } from '../types/domain';

const task = (id: string, status: TaskRecord['status'] = 'Queued'): TaskRecord => ({ id, taskCode: `TSK-${id}`, type: 'Picking', priority: 'High', source: 'D1-A01', destination: 'D1-Dock', material: 'Board', barcode: `BC-${id}`, quantity: '100 BOX', timer: '00:10', employee: 'Unassigned', status, sla: 'On track' });

describe('task API-mode data loading', () => {
  it('forwards pagination, search, filters, and sorting', async () => {
    const list = vi.fn().mockResolvedValue({ items: [task('1')], page: 2, pageSize: 5, total: 6, stale: false });
    await expect(loadTaskList({ list }, 'api', { page: 2, pageSize: 5, search: 'board', status: 'Queued', priority: 'High', sort: 'taskCode' })).resolves.toMatchObject({ page: 2, total: 6, stale: false });
    expect(list).toHaveBeenCalledWith({ page: 2, pageSize: 5, search: 'board', sortBy: 'taskCode', sortDirection: 'asc', filters: { status: 'Queued', priority: 'High' } });
  });

  it('preserves successful empty responses', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0, stale: false });
    await expect(loadTaskList({ list }, 'api', { page: 1, pageSize: 5, search: '', status: 'all', priority: 'all', sort: 'taskCode' })).resolves.toEqual({ items: [], page: 1, pageSize: 5, total: 0, stale: false });
  });

  it('propagates errors without falling back to mock data', async () => {
    const failure = new Error('Tasks unavailable');
    const list = vi.fn().mockRejectedValue(failure);
    await expect(loadTaskList({ list }, 'api', { page: 1, pageSize: 5, search: '', status: 'all', priority: 'all', sort: 'taskCode' })).rejects.toBe(failure);
  });

  it('preserves detail success, not-found, and error behavior', async () => {
    const getById = vi.fn().mockResolvedValueOnce(task('1')).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Detail unavailable'));
    await expect(loadTaskDetail({ getById }, '1')).resolves.toMatchObject({ id: '1' });
    await expect(loadTaskDetail({ getById }, 'missing')).resolves.toBeUndefined();
    await expect(loadTaskDetail({ getById }, 'broken')).rejects.toThrow('Detail unavailable');
  });

  it('projects V1 mock status changes into the directory without losing the task', async () => {
    const list = vi.fn().mockResolvedValue({ items: [{ ...task('cancelled'), v1Status: 'CANCELLED' }], page: 1, pageSize: 5, total: 1, stale: true });
    const result = await loadTaskList({ list }, 'mock', { page: 1, pageSize: 5, search: '', status: 'CANCELLED', priority: 'all', sort: 'taskCode' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].status).toBe('Cancelled');
  });
});

describe('task API read-model adapter', () => {
  // A real /warehouse/operations item captured from a populated local backend (ids shortened).
  const operation = {
    id: 't-a1', task_code: 'TSK-496ADEFF', task_type: 'LOADING', operation_type: 'LOADING', status: 'COMPLETED',
    warehouse: { id: 'd-a', code: 'DEP-A', name: 'Bhiwandi Depot A' },
    source_location: { id: 'l-1', code: 'A-RACK-1', name: 'Depot A rack 1' }, destination_location: { id: 'l-2', code: 'A-DOCK-1', name: 'Depot A dock 1' },
    inventory_item: { id: 'i-1', product_code: 'PKG-CTN-001', name: 'Corrugated carton 5-ply' }, order: { id: 'o-1', order_code: 'RP-20481', priority: 'high' },
    assignees: [{ employee_id: 'e-1', employee_code: 'RP-EA1', name: 'Asha Loader' }, { employee_id: 'e-2', employee_code: 'RP-EA2', name: 'Imran Picker' }],
    planned_box_quantity: 120, completed_box_quantity: 120,
    started_at: '2026-10-02T11:02:46.065Z', paused_at: null, completed_at: '2026-10-02T11:02:46.143Z', created_at: '2026-10-02T11:02:45.968Z', updated_at: '2026-10-02T11:02:46.143Z',
    timing_events: [{ id: 'ev1', event_type: 'TASK_STARTED', event_at: '2026-10-02T11:02:46.065Z' }, { id: 'ev2', event_type: 'TASK_COMPLETED', event_at: '2026-10-02T11:02:46.143Z' }],
    sla: { target_seconds: null, status: 'NOT_DEFINED' },
  };
  const depotless = { ...operation, id: 't-none', task_code: 'TSK-1C9A3EDF', task_type: 'OTHER', operation_type: 'OTHER', status: 'PENDING', warehouse: null, source_location: null, destination_location: null, inventory_item: null, order: null, assignees: [], planned_box_quantity: null, completed_box_quantity: null, started_at: null, completed_at: null, timing_events: [] };

  it('decodes read-model items into renderable task records', () => {
    const record = decodeTaskListItem(operation);
    expect(record).toMatchObject({ taskCode: 'TSK-496ADEFF', type: 'Loading', priority: 'High', status: 'Completed', v1Status: 'COMPLETED', employee: 'Asha Loader, Imran Picker', quantity: '120 BOX', sla: 'Not defined' });
    expect(decodeTaskListItem(depotless)).toMatchObject({ type: 'Other', priority: 'Normal', status: 'Queued', employee: 'Unassigned', source: 'No warehouse', quantity: '—' });
    expect(decodeTaskDetail({ success: true, data: { ...operation, activity: [{ id: 'ev2', event_type: 'TASK_COMPLETED', event_at: '2026-10-02T11:02:46.143Z', actor: 'superadmin' }] } }).activity).toHaveLength(1);
  });

  it('rejects the raw /tasks DTO as a contract violation instead of rendering it', () => {
    expect(() => decodeTaskListItem({ id: 't-1', depot_id: null, task_type: 'OTHER', status: 'PENDING' })).toThrow(ContractValidationError);
  });

  it('sends only status filters with an exact backend status', () => {
    const base = { page: 1, pageSize: 5, search: '', sortBy: 'taskCode', sortDirection: 'asc' as const };
    expect(mapTaskListQuery({ ...base, filters: { status: 'COMPLETED', priority: 'High' } })).toEqual({ ...base, filters: { status: 'COMPLETED' } });
    expect(mapTaskListQuery({ ...base, filters: { status: undefined, priority: undefined } })).toEqual({ ...base, filters: {} });
    for (const status of ['ACCEPTED', 'VERIFIED', 'STARTED', 'Queued', 'In progress']) expect(mapTaskListQuery({ ...base, filters: { status } })).toBeNull();
    expect(mapTaskListQuery(undefined)).toBeUndefined();
  });
});

describe('task activity timeline', () => {
  it('lists recorded events only, oldest first, with their recorded time and actor', () => {
    const timeline = taskActivityTimeline({ activity: [
      { id: 'e2', eventType: 'TASK_COMPLETED', timestamp: '2026-10-02T11:02:46.143Z', actor: 'superadmin', taskId: 't', details: {} },
      { id: 'e1', eventType: 'TASK_STARTED', timestamp: '2026-10-02T11:02:46.065Z', actor: 'superadmin', taskId: 't', details: {} },
    ] });
    expect(timeline.map((entry) => [entry.id, entry.title])).toEqual([['e1', 'Task started'], ['e2', 'Task completed']]);
    expect(timeline[0]?.meta).toBe(`superadmin · ${new Date('2026-10-02T11:02:46.065Z').toLocaleString()}`);
  });

  it('is empty when no event has been recorded (no synthetic entries)', () => {
    expect(taskActivityTimeline({})).toEqual([]);
    expect(taskActivityTimeline({ activity: [] })).toEqual([]);
  });
});
