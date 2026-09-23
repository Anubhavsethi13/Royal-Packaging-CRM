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
  sortDirection?: 'asc' | 'desc';
}

export async function loadClientList(repository: ClientRepositoryReader, mode: DataMode, request: ClientListRequest): Promise<ListResponse<ClientRecord>> {
  const sortDirection = request.sortDirection ?? 'asc';
  if (mode === 'api') {
    return repository.list({
      page: request.page,
      pageSize: request.pageSize,
      search: request.search,
      sortBy: request.sort,
      sortDirection,
      filters: { status: request.status === 'all' ? undefined : request.status },
    });
  }

  const result = await repository.list({ page: 1, pageSize: Number.MAX_SAFE_INTEGER, search: request.search });
  const filtered = result.items
    .filter((client) => request.status === 'all' || client.status === request.status)
    .sort((a, b) => {
      const cmp = String(a[request.sort as keyof ClientRecord]).localeCompare(String(b[request.sort as keyof ClientRecord]));
      return sortDirection === 'desc' ? -cmp : cmp;
    });
  const totalPages = Math.max(1, Math.ceil(filtered.length / request.pageSize));
  const page = Math.min(request.page, totalPages);
  return { items: filtered.slice((page - 1) * request.pageSize, page * request.pageSize), page, pageSize: request.pageSize, total: filtered.length, stale: result.stale };
}

export function loadClientDetail(repository: ClientDetailReader, id: string): Promise<ClientRecord | undefined> {
  return repository.getById(id);
}

export function mapClientDtoToRecord(payload: unknown): ClientRecord {
  const dto = ((payload as { data?: unknown })?.data ?? payload) as Record<string, unknown>;
  const statusRaw = String(dto.status ?? 'active').toLowerCase();
  const status: 'Active' | 'On hold' | 'Prospect' =
    statusRaw === 'active' ? 'Active' : statusRaw === 'inactive' ? 'On hold' : 'Prospect';

  return {
    id: String(dto.id ?? ''),
    accountCode: String(dto.accountCode ?? dto.account_code ?? ''),
    name: String(dto.name ?? ''),
    contactName: String(dto.contactName ?? dto.contact_name ?? ''),
    phone: String(dto.phone ?? ''),
    status,
    orderCount: typeof dto.orderCount === 'number' ? dto.orderCount : (typeof dto.order_count === 'number' ? dto.order_count : 0),
    openOrders: typeof dto.openOrders === 'number' ? dto.openOrders : (typeof dto.open_orders === 'number' ? dto.open_orders : 0),
    lastActivity: typeof dto.lastActivity === 'string'
      ? dto.lastActivity
      : (typeof dto.updatedAt === 'string'
          ? new Date(dto.updatedAt).toLocaleDateString()
          : (typeof dto.updated_at === 'string' ? new Date(dto.updated_at).toLocaleDateString() : 'Recently')),
    segment: typeof dto.segment === 'string' ? dto.segment : 'General'
  };
}

export function mapClientCreateBody(record: ClientRecord): Record<string, unknown> {
  return {
    name: record.name,
    account_code: record.accountCode,
    contact_name: record.contactName || undefined,
    phone: record.phone || undefined,
    status: record.status?.toLowerCase() === 'active' ? 'active' : 'inactive',
  };
}

export function mapClientUpdateBody(changes: Partial<Omit<ClientRecord, 'id'>>): Record<string, unknown> {
  return {
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.contactName !== undefined ? { contact_name: changes.contactName } : {}),
    ...(changes.phone !== undefined ? { phone: changes.phone } : {}),
    ...(changes.status !== undefined ? { status: changes.status.toLowerCase() === 'active' ? 'active' : 'inactive' } : {}),
  };
}
