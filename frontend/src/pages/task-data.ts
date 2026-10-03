import type { ListQuery, ListResponse } from '../mock/repositories';
import type { DataMode } from '../state/repositories';
import type { TaskRecord } from '../types/domain';
import { mapWarehouseOperationToTask, parseContract, warehouseOperationDetailEnvelopeSchema, warehouseOperationDtoSchema } from './warehouse-api';

type TaskRepositoryReader = Pick<{ list(query?: ListQuery): Promise<ListResponse<TaskRecord>> }, 'list'>;
type TaskDetailReader = Pick<{ getById(id: string): Promise<TaskRecord | undefined> }, 'getById'>;

export interface TaskListRequest {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  priority: string;
  sort: string;
}

function displayStatus(task: TaskRecord): TaskRecord['status'] {
  if (task.v1Status === 'CANCELLED') return 'Cancelled';
  if (task.v1Status === 'COMPLETED' || task.v1Status === 'VERIFIED') return 'Completed';
  if (task.v1Status === 'STARTED' || task.v1Status === 'PAUSED' || task.v1Status === 'RESUMED') return 'In progress';
  return task.status;
}

/**
 * API mode reads tasks from the backend task read model (`/warehouse/operations`), the same
 * contract-validated source the warehouse pages use: the raw `/tasks` DTO has no task code,
 * assignee names or location names.
 */
const BACKEND_STATUS_FILTER: Record<string, string> = { ASSIGNED: 'ASSIGNED', PAUSED: 'PAUSED', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' };

/**
 * Task page filters -> read-model query. Only status values with an exact backend status are
 * sent; any other status (e.g. ACCEPTED, VERIFIED, Queued) has no backend equivalent and cannot
 * match a backend task (null = empty page, no request). Priority is not a backend filter.
 */
export function mapTaskListQuery(query: ListQuery | undefined): ListQuery | undefined | null {
  if (!query?.filters) return query;
  const rest = Object.fromEntries(Object.entries(query.filters).filter(([key]) => key !== 'status' && key !== 'priority'));
  const status = query.filters.status;
  if (status === undefined) return { ...query, filters: rest };
  const backendStatus = BACKEND_STATUS_FILTER[status];
  return backendStatus ? { ...query, filters: { ...rest, status: backendStatus } } : null;
}

/**
 * Timeline entries from recorded task events only (API: the read model's `activity`; mock: events
 * the preview actions record). No synthetic entries or timestamps; empty when nothing is recorded.
 */
export function taskActivityTimeline(task: Pick<TaskRecord, 'activity'>): Array<{ id: string; title: string; meta: string }> {
  return [...(task.activity ?? [])]
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
    .map((event) => {
      const words = event.eventType.toLowerCase().replace(/_/g, ' ');
      return { id: event.id, title: words.charAt(0).toUpperCase() + words.slice(1), meta: `${event.actor} · ${new Date(event.timestamp).toLocaleString()}` };
    });
}

export const decodeTaskListItem = (item: unknown): TaskRecord => mapWarehouseOperationToTask(parseContract(warehouseOperationDtoSchema, item, 'task'));
export const decodeTaskDetail = (payload: unknown): TaskRecord => mapWarehouseOperationToTask(parseContract(warehouseOperationDetailEnvelopeSchema, payload, 'task').data);

export async function loadTaskList(repository: TaskRepositoryReader, mode: DataMode, request: TaskListRequest): Promise<ListResponse<TaskRecord>> {
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
    .filter((task) => (request.status === 'all' || task.status === request.status || task.v1Status === request.status) && (request.priority === 'all' || task.priority === request.priority))
    .sort((a, b) => String(a[request.sort as keyof TaskRecord]).localeCompare(String(b[request.sort as keyof TaskRecord])));
  const totalPages = Math.max(1, Math.ceil(filtered.length / request.pageSize));
  const page = Math.min(request.page, totalPages);
  return { items: filtered.slice((page - 1) * request.pageSize, page * request.pageSize).map((task) => ({ ...task, status: displayStatus(task) })), page, pageSize: request.pageSize, total: filtered.length, stale: result.stale };
}

export function loadTaskDetail(repository: TaskDetailReader, id: string): Promise<TaskRecord | undefined> {
  return repository.getById(id);
}
