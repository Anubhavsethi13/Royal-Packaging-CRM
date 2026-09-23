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
  sortDirection?: 'asc' | 'desc';
}

export function mapBackendStatusToOrderRecordStatus(status: string): OrderRecord['status'] {
  const normalized = status.toLowerCase().trim();
  switch (normalized) {
    case 'draft': return 'Draft';
    case 'confirmed': return 'Confirmed';
    case 'in_production': return 'In production';
    case 'ready': return 'Ready';
    case 'dispatched': return 'Dispatched';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    default: return 'Draft';
  }
}

export function mapOrderRecordStatusToBackendStatus(status: string): string {
  const normalized = status.toLowerCase().trim();
  switch (normalized) {
    case 'draft': return 'draft';
    case 'confirmed': return 'confirmed';
    case 'in production':
    case 'in_production':
    case 'partially fulfilled':
    case 'partially_fulfilled':
      return 'in_production';
    case 'ready': return 'ready';
    case 'dispatched': return 'dispatched';
    case 'completed': return 'completed';
    case 'cancelled': return 'cancelled';
    default: return normalized.replace(/\s+/g, '_');
  }
}

export function mapBackendPriorityToFrontend(priority: string): OrderRecord['priority'] {
  const normalized = priority.toLowerCase().trim();
  switch (normalized) {
    case 'urgent': return 'Urgent';
    case 'high': return 'High';
    case 'low': return 'Low';
    default: return 'Normal';
  }
}

export function mapFrontendPriorityToBackend(priority: string): string {
  return priority.toLowerCase().trim();
}

export function mapOrderDtoToRecord(payload: unknown): OrderRecord {
  const dto = ((payload as { data?: unknown })?.data ?? payload) as Record<string, unknown>;
  const rawStatus = String(dto.status ?? 'draft');
  const rawPriority = String(dto.priority ?? 'normal');
  const status = mapBackendStatusToOrderRecordStatus(rawStatus);
  const priority = mapBackendPriorityToFrontend(rawPriority);

  const quantityStr = dto.quantity !== undefined && dto.quantity !== null ? String(dto.quantity) : '0';
  const unit = String(dto.unit ?? 'BOX');
  const materialName = String(dto.materialName ?? dto.material_name ?? 'Corrugated board 5-ply');
  const orderCode = String(dto.orderCode ?? dto.order_code ?? '');
  const id = String(dto.id ?? '');
  const clientId = String(dto.clientId ?? dto.client_id ?? '');

  const clientName = typeof dto.clientName === 'string' && dto.clientName
    ? dto.clientName
    : (typeof dto.client_name === 'string' && dto.client_name
        ? dto.client_name
        : (clientId ? `Client ${clientId.slice(0, 8)}` : 'Customer Account'));

  const rawDueAt = dto.dueAt ?? dto.due_at;
  const dueAt = typeof rawDueAt === 'string' && rawDueAt
    ? (!isNaN(Date.parse(rawDueAt)) ? new Date(rawDueAt).toLocaleDateString() : rawDueAt)
    : (rawDueAt instanceof Date
        ? rawDueAt.toLocaleDateString()
        : 'Pending schedule');

  const fulfillment = typeof dto.fulfillment === 'number'
    ? dto.fulfillment
    : (status === 'Completed' || status === 'Dispatched' ? 100 : status === 'Ready' ? 80 : status === 'In production' ? 40 : 0);

  const sla = typeof dto.sla === 'string'
    ? (dto.sla as OrderRecord['sla'])
    : (priority === 'Urgent' ? 'At risk' : 'On track');

  const items = Array.isArray(dto.items) && dto.items.length > 0
    ? (dto.items as Array<Record<string, unknown>>).map((item, index) => ({
        id: String(item.id ?? `${id}-item-${index}`),
        sku: String(item.sku ?? 'SKU pending'),
        materialName: String(item.materialName ?? item.material_name ?? materialName),
        quantity: String(item.quantity ?? quantityStr),
        unit: String(item.unit ?? unit)
      }))
    : [{
        id: `${id}-item-0`,
        sku: 'SKU pending',
        materialName,
        quantity: quantityStr,
        unit
      }];

  return {
    id,
    orderCode,
    clientId,
    clientName,
    materialName,
    quantity: quantityStr,
    unit,
    status,
    priority,
    dueAt,
    fulfillment,
    sla,
    items,
    activity: []
  };
}

export function mapOrderCreateBody(record: OrderRecord): Record<string, unknown> {
  const parsedQuantity = record.quantity ? parseInt(record.quantity.replace(/\D/g, ''), 10) : undefined;
  const rawDue = record.dueAt ? record.dueAt.replace('·', ' ') : '';
  const dueParsed = rawDue ? Date.parse(rawDue) : NaN;
  return {
    client_id: record.clientId,
    order_code: record.orderCode,
    material_name: record.materialName || undefined,
    quantity: !isNaN(Number(parsedQuantity)) && Number(parsedQuantity) > 0 ? Number(parsedQuantity) : undefined,
    unit: record.unit || 'BOX',
    priority: mapFrontendPriorityToBackend(record.priority || 'Normal'),
    due_at: !isNaN(dueParsed) ? new Date(dueParsed).toISOString() : undefined,
  };
}

export function mapOrderUpdateBody(changes: Partial<Omit<OrderRecord, 'id'>>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (changes.materialName !== undefined) body.material_name = changes.materialName;
  if (changes.quantity !== undefined) {
    const parsed = parseInt(String(changes.quantity).replace(/\D/g, ''), 10);
    if (!isNaN(parsed) && parsed >= 0) body.quantity = parsed;
  }
  if (changes.unit !== undefined) body.unit = changes.unit;
  if (changes.status !== undefined) body.status = mapOrderRecordStatusToBackendStatus(changes.status);
  if (changes.priority !== undefined) body.priority = mapFrontendPriorityToBackend(changes.priority);
  if (changes.dueAt !== undefined) {
    body.due_at = changes.dueAt && !isNaN(Date.parse(changes.dueAt)) ? new Date(changes.dueAt).toISOString() : null;
  }
  return body;
}

export async function loadOrderList(repository: OrderRepositoryReader, mode: DataMode, request: OrderListRequest): Promise<ListResponse<OrderRecord>> {
  const sortDirection = request.sortDirection ?? 'asc';
  if (mode === 'api') {
    return repository.list({
      page: request.page,
      pageSize: request.pageSize,
      search: request.search,
      sortBy: request.sort,
      sortDirection,
      filters: {
        status: request.status === 'all' ? undefined : mapOrderRecordStatusToBackendStatus(request.status),
        priority: request.priority === 'all' ? undefined : mapFrontendPriorityToBackend(request.priority),
      },
    });
  }

  const result = await repository.list({ page: 1, pageSize: Number.MAX_SAFE_INTEGER, search: request.search });
  const filtered = result.items
    .filter((order) => (request.status === 'all' || order.status === request.status) && (request.priority === 'all' || order.priority === request.priority))
    .sort((a, b) => {
      const cmp = String(a[request.sort as keyof OrderRecord]).localeCompare(String(b[request.sort as keyof OrderRecord]));
      return sortDirection === 'desc' ? -cmp : cmp;
    });
  const totalPages = Math.max(1, Math.ceil(filtered.length / request.pageSize));
  const page = Math.min(request.page, totalPages);
  return { items: filtered.slice((page - 1) * request.pageSize, page * request.pageSize), page, pageSize: request.pageSize, total: filtered.length, stale: result.stale };
}

export function loadOrderDetail(repository: OrderDetailReader, id: string): Promise<OrderRecord | undefined> {
  return repository.getById(id);
}
