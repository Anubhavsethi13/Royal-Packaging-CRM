import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiDetailRequest, apiListRequest, createApiMutableRepository, createApiRepository, toListResponse } from './repositories';

const fetchMock = vi.spyOn(globalThis, 'fetch');

afterEach(() => fetchMock.mockReset());

describe('frontend API repository adapter', () => {
  it('converts the frozen list envelope without losing pagination', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'cl-1' }], meta: { page: 2, pageSize: 10, total: 11, totalPages: 2, hasNext: false, hasPrevious: true } }), { status: 200 }));
    const result = await apiListRequest<{ id: string }>('/clients', { page: 2, pageSize: 10, filters: { status: 'Active' } });
    expect(result).toEqual({ items: [{ id: 'cl-1' }], page: 2, pageSize: 10, total: 11, stale: false });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/clients?page=2&pageSize=10&status=Active', expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) }));
  });

  it('allows the caller to choose the detail envelope', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { id: 'cl-1' } }), { status: 200 }));
    const repository = createApiRepository({ resourcePath: '/clients', decodeDetail: (payload) => (payload as { data: { id: string } }).data });
    await expect(repository.getById('cl/1')).resolves.toEqual({ id: 'cl-1' });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/clients/cl%2F1', expect.anything());
  });

  it('returns mutation data and supports configurable request-body mapping', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { id: 'cl-1' }, requestId: 'req-1' }), { status: 200 }));
    const repository = createApiMutableRepository({
      resourcePath: '/clients',
      decodeDetail: (payload) => (payload as { data: { id: string } }).data,
      mapCreate: (record: { id: string }) => ({ sourceId: record.id }),
    });
    await expect(repository.create({ id: 'cl-1' })).resolves.toEqual({ id: 'cl-1' });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/clients', expect.objectContaining({ method: 'POST', body: JSON.stringify({ sourceId: 'cl-1' }) }));
  });

  it('propagates ApiError from the shared client', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'FORBIDDEN', message: 'Not allowed.' }), { status: 403 }));
    await expect(apiDetailRequest('/clients/cl-1', (payload) => payload as { id: string })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('maps the list envelope directly for callers that already fetched it', () => {
    expect(toListResponse({ data: [{ id: 'x' }], meta: { page: 1, pageSize: 1, total: 1, totalPages: 1, hasNext: false, hasPrevious: false } })).toEqual({ items: [{ id: 'x' }], page: 1, pageSize: 1, total: 1, stale: false });
  });
});
