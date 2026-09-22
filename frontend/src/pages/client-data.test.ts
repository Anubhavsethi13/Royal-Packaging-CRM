import { describe, expect, it, vi } from 'vitest';
import { loadClientDetail, loadClientList } from './client-data';
import type { ClientRecord } from '../types/domain';

const client = (id: string, name: string, status: ClientRecord['status'] = 'Active'): ClientRecord => ({ id, accountCode: `CL-${id}`, name, contactName: 'Contact', phone: '+91 80 1234 5678', status, orderCount: 0, openOrders: 0, lastActivity: 'Today', segment: 'Retail' });

describe('client API-mode data loading', () => {
  it('preserves API pagination and sends filters to the repository', async () => {
    const list = vi.fn().mockResolvedValue({ items: [client('1', 'Kaveri Foods')], page: 2, pageSize: 5, total: 6, stale: false });
    await expect(loadClientList({ list }, 'api', { page: 2, pageSize: 5, search: 'Kaveri', status: 'Active', sort: 'name' })).resolves.toMatchObject({ page: 2, total: 6, stale: false });
    expect(list).toHaveBeenCalledWith({ page: 2, pageSize: 5, search: 'Kaveri', sortBy: 'name', sortDirection: 'asc', filters: { status: 'Active' } });
  });

  it('returns a successful empty result without converting it to an error', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0, stale: false });
    await expect(loadClientList({ list }, 'api', { page: 1, pageSize: 5, search: '', status: 'all', sort: 'name' })).resolves.toEqual({ items: [], page: 1, pageSize: 5, total: 0, stale: false });
  });

  it('propagates API failures without falling back to mock records', async () => {
    const failure = new Error('API unavailable');
    const list = vi.fn().mockRejectedValue(failure);
    await expect(loadClientList({ list }, 'api', { page: 1, pageSize: 5, search: '', status: 'all', sort: 'name' })).rejects.toBe(failure);
  });

  it('propagates detail success, not-found, and error results', async () => {
    const getById = vi.fn().mockResolvedValueOnce(client('1', 'Kaveri Foods')).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Detail unavailable'));
    await expect(loadClientDetail({ getById }, '1')).resolves.toMatchObject({ id: '1' });
    await expect(loadClientDetail({ getById }, 'missing')).resolves.toBeUndefined();
    await expect(loadClientDetail({ getById }, 'broken')).rejects.toThrow('Detail unavailable');
  });
});
