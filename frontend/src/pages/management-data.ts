import type { ListQuery, ListResponse } from '../mock/repositories';
import type { DataMode } from '../state/repositories';

type ListRepository<T> = Pick<{ list(query?: ListQuery): Promise<ListResponse<T>> }, 'list'>;
type DetailRepository<T> = Pick<{ getById(id: string): Promise<T | undefined> }, 'getById'>;

export interface ManagementListRequest {
  page: number;
  pageSize: number;
  search?: string;
  sort?: string;
  filters?: Record<string, string>;
}

export async function loadManagementList<T>(repository: ListRepository<T>, mode: DataMode, request: ManagementListRequest, matches?: (item: T, request: ManagementListRequest) => boolean, compare?: (left: T, right: T, sort: string) => number): Promise<ListResponse<T>> {
  if (mode === 'api') {
    return repository.list({
      page: request.page,
      pageSize: request.pageSize,
      search: request.search,
      sortBy: request.sort,
      sortDirection: 'asc',
      filters: request.filters,
    });
  }

  const result = await repository.list({ page: 1, pageSize: Number.MAX_SAFE_INTEGER, search: request.search });
  const filtered = result.items.filter((item) => !matches || matches(item, request));
  const sorted = request.sort && compare ? [...filtered].sort((left, right) => compare(left, right, request.sort ?? '')) : filtered;
  const totalPages = Math.max(1, Math.ceil(sorted.length / request.pageSize));
  const page = Math.min(request.page, totalPages);
  return { items: sorted.slice((page - 1) * request.pageSize, page * request.pageSize), page, pageSize: request.pageSize, total: sorted.length, stale: result.stale };
}

export function loadManagementDetail<T>(repository: DetailRepository<T>, id: string): Promise<T | undefined> {
  return repository.getById(id);
}
