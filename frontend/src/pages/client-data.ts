import type { ListQuery, ListResponse } from '../mock/repositories';
import type { ClientRecord } from '../types/domain';
import type { DataMode } from '../state/repositories';

type ClientRepositoryReader = Pick<{ list(query?: ListQuery): Promise<ListResponse<ClientRecord>> }, 'list'>;
type ClientDetailReader = Pick<{ getById(id: string): Promise<ClientRecord | undefined> }, 'getById'>;

export interface ClientListRequest {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  sort: string;
}

export async function loadClientList(repository: ClientRepositoryReader, mode: DataMode, request: ClientListRequest): Promise<ListResponse<ClientRecord>> {
  if (mode === 'api') {
    return repository.list({
      page: request.page,
      pageSize: request.pageSize,
      search: request.search,
      sortBy: request.sort,
      sortDirection: 'asc',
      filters: { status: request.status === 'all' ? undefined : request.status },
    });
  }

  const result = await repository.list({ page: 1, pageSize: Number.MAX_SAFE_INTEGER, search: request.search });
  const filtered = result.items
    .filter((client) => request.status === 'all' || client.status === request.status)
    .sort((a, b) => String(a[request.sort as keyof ClientRecord]).localeCompare(String(b[request.sort as keyof ClientRecord])));
  const totalPages = Math.max(1, Math.ceil(filtered.length / request.pageSize));
  const page = Math.min(request.page, totalPages);
  return { items: filtered.slice((page - 1) * request.pageSize, page * request.pageSize), page, pageSize: request.pageSize, total: filtered.length, stale: result.stale };
}

export function loadClientDetail(repository: ClientDetailReader, id: string): Promise<ClientRecord | undefined> {
  return repository.getById(id);
}
