import { describe, expect, it, vi } from 'vitest';
import { loadManagementDetail, loadManagementList } from './management-data';

interface TestItem { id: string; name: string; category: string }
const item = (id: string, category = 'Operations'): TestItem => ({ id, name: `Report ${id}`, category });
const request = { page: 1, pageSize: 5, search: 'report', sort: 'name', filters: { category: 'Operations' } };

describe('management data loading', () => {
  it('forwards API list queries without fallback', async () => {
    const list = vi.fn().mockResolvedValue({ items: [item('1')], page: 1, pageSize: 5, total: 1, stale: false });
    await loadManagementList({ list }, 'api', request);
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 5, search: 'report', sortBy: 'name', sortDirection: 'asc', filters: { category: 'Operations' } });
  });

  it('preserves empty responses and API errors', async () => {
    const empty = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0, stale: false });
    await expect(loadManagementList({ list: empty }, 'api', request)).resolves.toMatchObject({ items: [], total: 0 });
    const failure = new Error('Management data unavailable');
    await expect(loadManagementList({ list: vi.fn().mockRejectedValue(failure) }, 'api', request)).rejects.toBe(failure);
  });

  it('keeps mock mode filtering and pagination functional', async () => {
    const list = vi.fn().mockResolvedValue({ items: [item('1'), item('2', 'People')], page: 1, pageSize: 2, total: 2, stale: true });
    await expect(loadManagementList<TestItem>({ list }, 'mock', request, (value, current) => value.category === current.filters?.category, (left, right) => left.name.localeCompare(right.name))).resolves.toMatchObject({ items: [item('1')], total: 1, stale: true });
  });

  it('preserves detail success and not-found behavior', async () => {
    const getById = vi.fn().mockResolvedValueOnce(item('1')).mockResolvedValueOnce(undefined);
    await expect(loadManagementDetail({ getById }, '1')).resolves.toMatchObject({ id: '1' });
    await expect(loadManagementDetail({ getById }, 'missing')).resolves.toBeUndefined();
  });
});
