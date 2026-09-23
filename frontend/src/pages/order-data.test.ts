import { describe, expect, it, vi } from 'vitest';
import {
  loadOrderDetail,
  loadOrderList,
  mapBackendPriorityToFrontend,
  mapBackendStatusToOrderRecordStatus,
  mapFrontendPriorityToBackend,
  mapOrderCreateBody,
  mapOrderDtoToRecord,
  mapOrderRecordStatusToBackendStatus,
  mapOrderUpdateBody
} from './order-data';
import type { OrderRecord } from '../types/domain';

const order = (id: string, status: OrderRecord['status'] = 'Ready', priority: OrderRecord['priority'] = 'High'): OrderRecord => ({
  id,
  orderCode: `RP-${id}`,
  clientId: 'client-1',
  clientName: 'Kaveri Foods',
  materialName: 'Board',
  quantity: '100',
  unit: 'BOX',
  status,
  priority,
  dueAt: 'Today',
  fulfillment: 50,
  sla: 'On track',
  items: [],
  activity: []
});

describe('order DTO mapping', () => {
  it('maps backend snake_case / camelCase DTO to OrderRecord', () => {
    const rawDto = {
      id: 'uuid-ord-1',
      client_id: 'uuid-cli-1',
      client_name: 'Kaveri Foods',
      order_code: 'RP-10001',
      material_name: 'Corrugated 5-ply',
      quantity: '500',
      unit: 'BOX',
      status: 'in_production',
      priority: 'urgent',
      due_at: '2026-09-30T10:00:00.000Z',
      notes: 'Urgent festival delivery'
    };

    const record = mapOrderDtoToRecord(rawDto);
    expect(record.id).toBe('uuid-ord-1');
    expect(record.clientId).toBe('uuid-cli-1');
    expect(record.clientName).toBe('Kaveri Foods');
    expect(record.orderCode).toBe('RP-10001');
    expect(record.materialName).toBe('Corrugated 5-ply');
    expect(record.quantity).toBe('500');
    expect(record.unit).toBe('BOX');
    expect(record.status).toBe('In production');
    expect(record.priority).toBe('Urgent');
    expect(record.sla).toBe('At risk');
  });

  it('maps all status transitions correctly', () => {
    expect(mapBackendStatusToOrderRecordStatus('draft')).toBe('Draft');
    expect(mapBackendStatusToOrderRecordStatus('confirmed')).toBe('Confirmed');
    expect(mapBackendStatusToOrderRecordStatus('in_production')).toBe('In production');
    expect(mapBackendStatusToOrderRecordStatus('ready')).toBe('Ready');
    expect(mapBackendStatusToOrderRecordStatus('dispatched')).toBe('Dispatched');
    expect(mapBackendStatusToOrderRecordStatus('completed')).toBe('Completed');
    expect(mapBackendStatusToOrderRecordStatus('cancelled')).toBe('Cancelled');

    expect(mapOrderRecordStatusToBackendStatus('Draft')).toBe('draft');
    expect(mapOrderRecordStatusToBackendStatus('Confirmed')).toBe('confirmed');
    expect(mapOrderRecordStatusToBackendStatus('In production')).toBe('in_production');
    expect(mapOrderRecordStatusToBackendStatus('Ready')).toBe('ready');
    expect(mapOrderRecordStatusToBackendStatus('Dispatched')).toBe('dispatched');
    expect(mapOrderRecordStatusToBackendStatus('Completed')).toBe('completed');
    expect(mapOrderRecordStatusToBackendStatus('Cancelled')).toBe('cancelled');
  });

  it('maps priorities correctly', () => {
    expect(mapBackendPriorityToFrontend('urgent')).toBe('Urgent');
    expect(mapBackendPriorityToFrontend('high')).toBe('High');
    expect(mapBackendPriorityToFrontend('normal')).toBe('Normal');
    expect(mapBackendPriorityToFrontend('low')).toBe('Low');

    expect(mapFrontendPriorityToBackend('Urgent')).toBe('urgent');
    expect(mapFrontendPriorityToBackend('High')).toBe('high');
    expect(mapFrontendPriorityToBackend('Normal')).toBe('normal');
    expect(mapFrontendPriorityToBackend('Low')).toBe('low');
  });

  it('handles wrapped envelope { data: { ... } } and client fallback display', () => {
    const wrapped = {
      data: {
        id: 'uuid-ord-2',
        client_id: '12345678-abcd-ef00',
        order_code: 'RP-10002',
        status: 'ready'
      }
    };
    const record = mapOrderDtoToRecord(wrapped);
    expect(record.id).toBe('uuid-ord-2');
    expect(record.clientName).toBe('Client 12345678');
    expect(record.status).toBe('Ready');
  });

  it('maps OrderRecord to CreateOrderRequest body with parsed quantity and date', () => {
    const body = mapOrderCreateBody({
      id: 'ignore',
      orderCode: 'RP-20001',
      clientId: 'uuid-cli-99',
      clientName: 'Nexon',
      materialName: 'Die-cut boxes',
      quantity: '2,500',
      unit: 'BOX',
      status: 'Draft',
      priority: 'Urgent',
      dueAt: '2026-10-15T12:00:00.000Z',
      fulfillment: 0,
      sla: 'On track',
      items: [],
      activity: []
    });

    expect(body).toEqual({
      client_id: 'uuid-cli-99',
      order_code: 'RP-20001',
      material_name: 'Die-cut boxes',
      quantity: 2500,
      unit: 'BOX',
      priority: 'urgent',
      due_at: '2026-10-15T12:00:00.000Z'
    });
  });

  it('maps partial updates to UpdateOrderRequest body', () => {
    const body = mapOrderUpdateBody({
      materialName: 'Heavy Duty 7-ply',
      quantity: '1200',
      status: 'Confirmed',
      priority: 'High'
    });

    expect(body).toEqual({
      material_name: 'Heavy Duty 7-ply',
      quantity: 1200,
      status: 'confirmed',
      priority: 'high'
    });
  });
});

describe('order API-mode data loading', () => {
  it('forwards pagination, search, filters, and sorting in API mode with backend casing', async () => {
    const list = vi.fn().mockResolvedValue({ items: [order('1')], page: 2, pageSize: 5, total: 6, stale: false });
    await expect(
      loadOrderList({ list }, 'api', { page: 2, pageSize: 5, search: 'Kaveri', status: 'Ready', priority: 'High', sort: 'orderCode' })
    ).resolves.toMatchObject({ page: 2, total: 6, stale: false });

    expect(list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 5,
      search: 'Kaveri',
      sortBy: 'orderCode',
      sortDirection: 'asc',
      filters: { status: 'ready', priority: 'high' }
    });
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

describe('order mock-mode regression', () => {
  const mockOrders: OrderRecord[] = [
    order('1', 'Draft', 'Low'),
    order('2', 'Confirmed', 'Normal'),
    order('3', 'In production', 'High'),
    order('4', 'Ready', 'Urgent'),
    order('5', 'Dispatched', 'Normal'),
  ];

  it('performs local pagination and sorting in mock mode', async () => {
    const mockRepo = { list: vi.fn().mockResolvedValue({ items: mockOrders, page: 1, pageSize: 100, total: 5, stale: false }) };
    const result = await loadOrderList(mockRepo, 'mock', {
      page: 1,
      pageSize: 2,
      search: '',
      status: 'all',
      priority: 'all',
      sort: 'orderCode'
    });

    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
    expect(result.items.length).toBe(2);
    expect(result.items[0]?.orderCode).toBe('RP-1');
    expect(result.items[1]?.orderCode).toBe('RP-2');
  });

  it('performs status and priority filtering in mock mode', async () => {
    const mockRepo = { list: vi.fn().mockResolvedValue({ items: mockOrders, page: 1, pageSize: 100, total: 5, stale: false }) };
    const result = await loadOrderList(mockRepo, 'mock', {
      page: 1,
      pageSize: 10,
      search: '',
      status: 'Ready',
      priority: 'Urgent',
      sort: 'orderCode'
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.orderCode).toBe('RP-4');
    expect(result.items[0]?.status).toBe('Ready');
    expect(result.items[0]?.priority).toBe('Urgent');
  });
});
