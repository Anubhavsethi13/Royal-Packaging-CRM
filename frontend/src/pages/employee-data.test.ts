import { describe, expect, it, vi } from 'vitest';
import { loadEmployeeDetail, loadEmployeeList } from './employee-data';
import type { EmployeeRecord } from '../types/domain';

const employee = (id: string, status: EmployeeRecord['status'] = 'Active'): EmployeeRecord => ({ id, code: `EMP-${id}`, name: 'Asha Rao', role: 'Operator', depot: 'Bengaluru · D1', status, productivity: '92%', kpi: '105', shift: 'Morning', tasks: 3 });
const request = { page: 1, pageSize: 5, search: '', depot: 'all', status: 'all', sort: 'name' };

describe('employee data loading', () => {
  it('forwards API pagination, search, filters, and sorting', async () => {
    const list = vi.fn().mockResolvedValue({ items: [employee('1')], page: 2, pageSize: 5, total: 6, stale: false });
    await loadEmployeeList({ list }, 'api', { ...request, page: 2, search: 'Asha', depot: 'D1', status: 'Active' });
    expect(list).toHaveBeenCalledWith({ page: 2, pageSize: 5, search: 'Asha', sortBy: 'name', sortDirection: 'asc', filters: { depot: 'D1', status: 'Active' } });
  });

  it('preserves empty responses and propagates API errors without mock fallback', async () => {
    const empty = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0, stale: false });
    await expect(loadEmployeeList({ list: empty }, 'api', request)).resolves.toEqual({ items: [], page: 1, pageSize: 5, total: 0, stale: false });
    const failure = new Error('Employees unavailable');
    const list = vi.fn().mockRejectedValue(failure);
    await expect(loadEmployeeList({ list }, 'api', request)).rejects.toBe(failure);
  });

  it('keeps mock mode functional with local filtering and pagination', async () => {
    const list = vi.fn().mockResolvedValue({ items: [employee('1'), employee('2', 'On leave')], page: 1, pageSize: 2, total: 2, stale: true });
    await expect(loadEmployeeList({ list }, 'mock', { ...request, status: 'Active' })).resolves.toMatchObject({ items: [employee('1')], total: 1, stale: true });
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: Number.MAX_SAFE_INTEGER, search: '' });
  });

  it('preserves detail success, not-found, and error behavior', async () => {
    const getById = vi.fn().mockResolvedValueOnce(employee('1')).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Detail unavailable'));
    await expect(loadEmployeeDetail({ getById }, '1')).resolves.toMatchObject({ id: '1' });
    await expect(loadEmployeeDetail({ getById }, 'missing')).resolves.toBeUndefined();
    await expect(loadEmployeeDetail({ getById }, 'broken')).rejects.toThrow('Detail unavailable');
  });
});
