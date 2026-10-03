import { describe, expect, it, vi } from 'vitest';
import { loadInventoryDetail, loadInventoryList, mapInventoryDtoToRecord } from './inventory-data';
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

describe('inventory API mapping', () => {
  // Regression: the raw catalogue DTO has no `status`, which crashed the Inventory page (StatusBadge: undefined.toLowerCase()).
  const dto = { id: 'i1', product_code: 'PKG-CTN-001', productCode: 'PKG-CTN-001', name: 'Corrugated carton 5-ply', total_box_quantity: '590', totalBoxQuantity: '590', created_at: '2026-10-02T11:02:45.100Z', updated_at: '2026-10-02T11:02:45.100Z', version: '1' };

  it('maps catalogue fields and marks unrecorded fields without inventing values', () => {
    expect(mapInventoryDtoToRecord(dto)).toEqual({ id: 'i1', barcode: '—', sku: 'PKG-CTN-001', materialName: 'Corrugated carton 5-ply', quantity: '590', unit: 'BOX', location: '—', status: 'Not recorded', clientName: '—', lastMovement: '—' });
  });

  it('maps the detail envelope and a nameless, empty item', () => {
    expect(mapInventoryDtoToRecord({ data: { ...dto, balances: [{ batch_id: 'b1', batch_number: 'B1', location_id: 'l1', box_quantity: '590' }] } }).quantity).toBe('590');
    const empty = mapInventoryDtoToRecord({ id: 'i3', product_code: 'PKG-UNK-003', name: null, total_box_quantity: '0' });
    expect(empty.materialName).toBe('Not recorded');
    expect(empty.quantity).toBe('0');
    expect(typeof mapInventoryDtoToRecord({ id: 'x' }).status).toBe('string');
    expect(mapInventoryDtoToRecord({ id: 'x' }).quantity).toBe('—');
  });
});
