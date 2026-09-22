import type { ListQuery, ListResponse } from '../mock/repositories';
import type { DataMode } from '../state/repositories';
import type { TaskRecord } from '../types/domain';

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
