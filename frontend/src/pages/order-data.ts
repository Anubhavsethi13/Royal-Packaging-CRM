import type { ListQuery, ListResponse } from '../mock/repositories';
import type { DataMode } from '../state/repositories';
import type { OrderRecord } from '../types/domain';

type OrderRepositoryReader = Pick<{ list(query?: ListQuery): Promise<ListResponse<OrderRecord>> }, 'list'>;
type OrderDetailReader = Pick<{ getById(id: string): Promise<OrderRecord | undefined> }, 'getById'>;

export interface OrderListRequest {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  priority: string;
  sort: string;
}

export async function loadOrderList(repository: OrderRepositoryReader, mode: DataMode, request: OrderListRequest): Promise<ListResponse<OrderRecord>> {
  if (mode === 'api') {
    return repository.list({
      page: request.page,
      pageSize: request.pageSize,
      search: request.search,
      sortBy: request.sort,
      sortDirection: 'asc',
      filters: {
        status: request.status === 'all' ? undefined : request.status,
        priority: request.priority === 'all' ? undefined : request.priority,
      },
    });
  }

  const result = await repository.list({ page: 1, pageSize: Number.MAX_SAFE_INTEGER, search: request.search });
  const filtered = result.items
    .filter((order) => (request.status === 'all' || order.status === request.status) && (request.priority === 'all' || order.priority === request.priority))
    .sort((a, b) => String(a[request.sort as keyof OrderRecord]).localeCompare(String(b[request.sort as keyof OrderRecord])));
  const totalPages = Math.max(1, Math.ceil(filtered.length / request.pageSize));
  const page = Math.min(request.page, totalPages);
  return { items: filtered.slice((page - 1) * request.pageSize, page * request.pageSize), page, pageSize: request.pageSize, total: filtered.length, stale: result.stale };
}

export function loadOrderDetail(repository: OrderDetailReader, id: string): Promise<OrderRecord | undefined> {
  return repository.getById(id);
}
