import { describe, expect, it, vi } from 'vitest';
import { loadOrderDetail, loadOrderList } from './order-data';
import type { OrderRecord } from '../types/domain';

const order = (id: string, status: OrderRecord['status'] = 'Ready'): OrderRecord => ({ id, orderCode: `RP-${id}`, clientId: 'client-1', clientName: 'Kaveri Foods', materialName: 'Board', quantity: '100', unit: 'BOX', status, priority: 'High', dueAt: 'Today', fulfillment: 50, sla: 'On track', items: [], activity: [] });

describe('order API-mode data loading', () => {
  it('forwards pagination, search, filters, and sorting in API mode', async () => {
    const list = vi.fn().mockResolvedValue({ items: [order('1')], page: 2, pageSize: 5, total: 6, stale: false });
    await expect(loadOrderList({ list }, 'api', { page: 2, pageSize: 5, search: 'Kaveri', status: 'Ready', priority: 'High', sort: 'orderCode' })).resolves.toMatchObject({ page: 2, total: 6, stale: false });
    expect(list).toHaveBeenCalledWith({ page: 2, pageSize: 5, search: 'Kaveri', sortBy: 'orderCode', sortDirection: 'asc', filters: { status: 'Ready', priority: 'High' } });
  });

  it('preserves successful empty results', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0, stale: false });
    await expect(loadOrderList({ list }, 'api', { page: 1, pageSize: 5, search: '', status: 'all', priority: 'all', sort: 'orderCode' })).resolves.toEqual({ items: [], page: 1, pageSize: 5, total: 0, stale: false });
  });

  it('propagates list failures without mock fallback', async () => {
    const failure = new Error('Orders unavailable');
    const list = vi.fn().mockRejectedValue(failure);
    await expect(loadOrderList({ list }, 'api', { page: 1, pageSize: 5, search: '', status: 'all', priority: 'all', sort: 'orderCode' })).rejects.toBe(failure);
  });

  it('preserves detail success, not-found, and error behavior', async () => {
    const getById = vi.fn().mockResolvedValueOnce(order('1')).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Detail unavailable'));
    await expect(loadOrderDetail({ getById }, '1')).resolves.toMatchObject({ id: '1' });
    await expect(loadOrderDetail({ getById }, 'missing')).resolves.toBeUndefined();
    await expect(loadOrderDetail({ getById }, 'broken')).rejects.toThrow('Detail unavailable');
  });
});
