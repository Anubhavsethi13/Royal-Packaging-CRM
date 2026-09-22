import { describe, expect, it, vi } from 'vitest';
import { loadTaskDetail, loadTaskList } from './task-data';
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
