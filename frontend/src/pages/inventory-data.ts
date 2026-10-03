import type { ListQuery, ListResponse } from '../mock/repositories';
import type { DataMode } from '../state/repositories';
import type { InventoryRecord } from '../types/domain';

type InventoryRepositoryReader = Pick<{ list(query?: ListQuery): Promise<ListResponse<InventoryRecord>> }, 'list'>;
type InventoryDetailReader = Pick<{ getById(id: string): Promise<InventoryRecord | undefined> }, 'getById'>;

export interface InventoryListRequest {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  location: string;
  sort: string;
}

export async function loadInventoryList(repository: InventoryRepositoryReader, mode: DataMode, request: InventoryListRequest): Promise<ListResponse<InventoryRecord>> {
  if (mode === 'api') {
    return repository.list({
      page: request.page,
      pageSize: request.pageSize,
      search: request.search,
      sortBy: request.sort,
      sortDirection: 'asc',
      filters: {
        status: request.status === 'all' ? undefined : request.status,
        location: request.location === 'all' ? undefined : request.location,
      },
    });
  }

  const result = await repository.list({ page: 1, pageSize: Number.MAX_SAFE_INTEGER, search: request.search });
  const filtered = result.items
    .filter((item) => (request.status === 'all' || item.status === request.status) && (request.location === 'all' || item.location.startsWith(request.location)))
    .sort((a, b) => String(a[request.sort as keyof InventoryRecord]).localeCompare(String(b[request.sort as keyof InventoryRecord])));
  const totalPages = Math.max(1, Math.ceil(filtered.length / request.pageSize));
  const page = Math.min(request.page, totalPages);
  return { items: filtered.slice((page - 1) * request.pageSize, page * request.pageSize), page, pageSize: request.pageSize, total: filtered.length, stale: result.stale };
}

/**
 * Maps the backend inventory catalogue DTO (`product_code`, `name`, `total_box_quantity`,
 * detail adds `balances`) to the InventoryRecord the pages render. The catalogue has no
 * barcode, status, client, location name or last-movement time, so those are shown as
 * not recorded rather than invented. Quantities are BOX (`total_box_quantity`).
 */
export function mapInventoryDtoToRecord(payload: unknown): InventoryRecord {
  const dto = ((payload as { data?: unknown })?.data ?? payload) as Record<string, unknown>;
  const name = dto.name;
  const quantity = dto.total_box_quantity ?? dto.totalBoxQuantity;
  return {
    id: String(dto.id ?? ''),
    barcode: '—',
    sku: String(dto.product_code ?? dto.productCode ?? ''),
    materialName: typeof name === 'string' && name.trim() ? name : 'Not recorded',
    quantity: quantity === undefined || quantity === null ? '—' : String(quantity),
    unit: 'BOX',
    location: '—',
    status: 'Not recorded',
    clientName: '—',
    lastMovement: '—',
  };
}

export function loadInventoryDetail(repository: InventoryDetailReader, id: string): Promise<InventoryRecord | undefined> {
  return repository.getById(id);
}
