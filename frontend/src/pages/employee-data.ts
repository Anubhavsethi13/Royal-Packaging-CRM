import type { ListQuery, ListResponse } from '../mock/repositories';
import type { DataMode } from '../state/repositories';
import type { EmployeeRecord } from '../types/domain';

type EmployeeListRepository = Pick<{ list(query?: ListQuery): Promise<ListResponse<EmployeeRecord>> }, 'list'>;
type EmployeeDetailRepository = Pick<{ getById(id: string): Promise<EmployeeRecord | undefined> }, 'getById'>;

export interface EmployeeListRequest {
  page: number;
  pageSize: number;
  search: string;
  depot: string;
  status: string;
  sort: string;
}

export async function loadEmployeeList(repository: EmployeeListRepository, mode: DataMode, request: EmployeeListRequest): Promise<ListResponse<EmployeeRecord>> {
  if (mode === 'api') {
    return repository.list({
      page: request.page,
      pageSize: request.pageSize,
      search: request.search,
      sortBy: request.sort,
      sortDirection: 'asc',
      filters: {
        depot: request.depot === 'all' ? undefined : request.depot,
        status: request.status === 'all' ? undefined : request.status,
      },
    });
  }

  const result = await repository.list({ page: 1, pageSize: Number.MAX_SAFE_INTEGER, search: request.search });
  const filtered = result.items
    .filter((employee) => (request.depot === 'all' || employee.depot.endsWith(request.depot)) && (request.status === 'all' || employee.status === request.status))
    .sort((a, b) => String(a[request.sort as keyof EmployeeRecord]).localeCompare(String(b[request.sort as keyof EmployeeRecord])));
  const totalPages = Math.max(1, Math.ceil(filtered.length / request.pageSize));
  const page = Math.min(request.page, totalPages);
  return { items: filtered.slice((page - 1) * request.pageSize, page * request.pageSize), page, pageSize: request.pageSize, total: filtered.length, stale: result.stale };
}

export function loadEmployeeDetail(repository: EmployeeDetailRepository, id: string): Promise<EmployeeRecord | undefined> {
  return repository.getById(id);
}
