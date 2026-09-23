import { describe, expect, it, vi } from 'vitest';
import {
  loadClientDetail,
  loadClientList,
  mapClientCreateBody,
  mapClientDtoToRecord,
  mapClientUpdateBody
} from './client-data';
import type { ClientRecord } from '../types/domain';

const client = (id: string, name: string, status: ClientRecord['status'] = 'Active'): ClientRecord => ({
  id,
  accountCode: `CL-${id}`,
  name,
  contactName: `Contact ${id}`,
  phone: '+91 80 1234 5678',
  status,
  orderCount: 0,
  openOrders: 0,
  lastActivity: 'Today',
  segment: 'Retail'
});

describe('client DTO mapping', () => {
  it('maps backend snake_case / camelCase DTO to ClientRecord', () => {
    const rawDto = {
      id: 'uuid-1234',
      account_code: 'CL-001',
      name: 'Acme Packaging',
      contact_name: 'John Doe',
      phone: '+91 80 9999 8888',
      status: 'active',
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-02T10:00:00Z',
    };

    const record = mapClientDtoToRecord(rawDto);
    expect(record.id).toBe('uuid-1234');
    expect(record.accountCode).toBe('CL-001');
    expect(record.name).toBe('Acme Packaging');
    expect(record.contactName).toBe('John Doe');
    expect(record.phone).toBe('+91 80 9999 8888');
    expect(record.status).toBe('Active');
  });

  it('maps inactive status to On hold and other to Prospect', () => {
    expect(mapClientDtoToRecord({ status: 'inactive' }).status).toBe('On hold');
    expect(mapClientDtoToRecord({ status: 'prospect' }).status).toBe('Prospect');
  });

  it('handles wrapped envelope { data: { ... } }', () => {
    const wrapped = { data: { id: 'uuid-2', name: 'Beta Ltd', accountCode: 'CL-BETA', status: 'active' } };
    const record = mapClientDtoToRecord(wrapped);
    expect(record.id).toBe('uuid-2');
    expect(record.accountCode).toBe('CL-BETA');
    expect(record.name).toBe('Beta Ltd');
  });

  it('maps ClientRecord to CreateClientRequest body', () => {
    const body = mapClientCreateBody({
      id: 'ignore',
      accountCode: 'CL-NEW',
      name: 'New Corp',
      contactName: 'Alice',
      phone: '+91 80 1111 2222',
      status: 'Active',
      orderCount: 0,
      openOrders: 0,
      lastActivity: 'now',
      segment: 'General'
    });

    expect(body).toEqual({
      name: 'New Corp',
      account_code: 'CL-NEW',
      contact_name: 'Alice',
      phone: '+91 80 1111 2222',
      status: 'active'
    });
  });

  it('maps partial updates to UpdateClientRequest body', () => {
    const body = mapClientUpdateBody({
      name: 'Updated Corp',
      phone: '+91 99 8888 7777',
      status: 'On hold'
    });

    expect(body).toEqual({
      name: 'Updated Corp',
      phone: '+91 99 8888 7777',
      status: 'inactive'
    });
  });
});

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

describe('client mock-mode regression', () => {
  const mockClients: ClientRecord[] = [
    client('1', 'Beta Supplies', 'Active'),
    client('2', 'Alpha Packaging', 'Active'),
    client('3', 'Gamma Retail', 'On hold'),
    client('4', 'Delta Logistics', 'Prospect'),
    client('5', 'Epsilon Pharma', 'Active'),
  ];

  it('performs local pagination and sorting in mock mode', async () => {
    const mockRepo = { list: vi.fn().mockResolvedValue({ items: mockClients, page: 1, pageSize: 100, total: 5, stale: false }) };
    const result = await loadClientList(mockRepo, 'mock', {
      page: 1,
      pageSize: 2,
      search: '',
      status: 'all',
      sort: 'name'
    });

    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
    expect(result.items.length).toBe(2);
    expect(result.items[0]?.name).toBe('Alpha Packaging');
    expect(result.items[1]?.name).toBe('Beta Supplies');
  });

  it('performs status filtering in mock mode', async () => {
    const mockRepo = { list: vi.fn().mockResolvedValue({ items: mockClients, page: 1, pageSize: 100, total: 5, stale: false }) };
    const result = await loadClientList(mockRepo, 'mock', {
      page: 1,
      pageSize: 10,
      search: '',
      status: 'On hold',
      sort: 'name'
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.name).toBe('Gamma Retail');
  });
});

