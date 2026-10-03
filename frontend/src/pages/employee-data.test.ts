import { describe, expect, it, vi } from 'vitest';
import { loadEmployeeDetail, loadEmployeeList, mapEmployeeDtoToRecord } from './employee-data';
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

describe('employee API mapping', () => {
  // Regression: the raw EmployeeDTO has no `status`, which crashed the Employees page (StatusBadge: undefined.toLowerCase()).
  const dto = { id: 'e1', employee_code: 'EMP-1', employeeCode: 'EMP-1', name: 'Asha Rao', department: 'Warehouse', depot_id: 'd1', user_id: 'u1', is_active: true, currentShift: { shift_id: 's1', shift_name: 'Morning', effective_from: '2026-09-01', effective_to: null }, version: '1' };

  it('maps backend fields to the rendered record', () => {
    expect(mapEmployeeDtoToRecord(dto)).toEqual({ id: 'e1', code: 'EMP-1', name: 'Asha Rao', role: 'Not recorded', depot: 'd1', status: 'Active', productivity: '—', kpi: '—', shift: 'Morning', tasks: null });
    expect(mapEmployeeDtoToRecord({ data: dto }).id).toBe('e1');
  });

  it('maps inactive employees, missing depot and missing shift without inventing values', () => {
    const record = mapEmployeeDtoToRecord({ ...dto, is_active: false, depot_id: null, currentShift: null });
    expect(record.status).toBe('Inactive');
    expect(record.depot).toBe('No depot assigned');
    expect(record.shift).toBe('No shift assigned');
    expect(record.tasks).toBeNull();
  });

  it('always yields a defined status string', () => {
    expect(typeof mapEmployeeDtoToRecord({ id: 'x' }).status).toBe('string');
  });
});
