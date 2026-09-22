import { describe, expect, it, vi } from 'vitest';
import { loadInventoryDetail, loadInventoryList } from './inventory-data';
import type { InventoryRecord } from '../types/domain';

const item = (id: string, status: InventoryRecord['status'] = 'Available'): InventoryRecord => ({ id, barcode: `BC-${id}`, sku: `SKU-${id}`, materialName: 'Corrugated board', quantity: '100', unit: 'BOX', location: 'D1-A01', status, clientName: 'Kaveri Foods', lastMovement: 'Today' });

describe('inventory API-mode data loading', () => {
  it('forwards pagination, search, filters, and sorting', async () => {
    const list = vi.fn().mockResolvedValue({ items: [item('1')], page: 2, pageSize: 5, total: 6, stale: false });
    await expect(loadInventoryList({ list }, 'api', { page: 2, pageSize: 5, search: 'board', status: 'Available', location: 'D1', sort: 'sku' })).resolves.toMatchObject({ page: 2, total: 6, stale: false });
    expect(list).toHaveBeenCalledWith({ page: 2, pageSize: 5, search: 'board', sortBy: 'sku', sortDirection: 'asc', filters: { status: 'Available', location: 'D1' } });
  });

  it('preserves successful empty responses', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0, stale: false });
    await expect(loadInventoryList({ list }, 'api', { page: 1, pageSize: 5, search: '', status: 'all', location: 'all', sort: 'sku' })).resolves.toEqual({ items: [], page: 1, pageSize: 5, total: 0, stale: false });
  });

  it('propagates errors without falling back to mock data', async () => {
    const failure = new Error('Inventory unavailable');
    const list = vi.fn().mockRejectedValue(failure);
    await expect(loadInventoryList({ list }, 'api', { page: 1, pageSize: 5, search: '', status: 'all', location: 'all', sort: 'sku' })).rejects.toBe(failure);
  });

  it('preserves detail success, not-found, and error behavior', async () => {
    const getById = vi.fn().mockResolvedValueOnce(item('1')).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Detail unavailable'));
    await expect(loadInventoryDetail({ getById }, '1')).resolves.toMatchObject({ id: '1' });
    await expect(loadInventoryDetail({ getById }, 'missing')).resolves.toBeUndefined();
    await expect(loadInventoryDetail({ getById }, 'broken')).rejects.toThrow('Detail unavailable');
  });
});
