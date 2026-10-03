import { useMemo } from 'react';
import { apiRequest, ApiError } from '../api/client';
import { withQuery } from '../shifts/shift-gateway';
import { useRepositories } from '../state/repositories';

// Supervisor task registration on the existing task lifecycle:
// register (POST /tasks) → assign labour (POST /tasks/:id/assignments) → start → complete with BOX quantity.
// The registered, completed task is the source record the KPI engine reads.

export type DepotTaskType = 'LOADING' | 'UNLOADING';
export const OPEN_TASK_STATUSES = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED'] as const;

export interface DepotTask {
  id: string;
  taskType: string;
  status: string;
  plannedBoxes: number | null;
  completedBoxes: number | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface DepotEmployee { id: string; code: string; name: string }

export interface RegisterTaskInput { depotId: string; taskType: DepotTaskType; plannedBoxes: number | null; employeeIds: string[]; startNow: boolean }

export interface TaskRegistrationGateway {
  listEmployees(depotId: string): Promise<DepotEmployee[]>;
  listOpenTasks(depotId: string): Promise<DepotTask[]>;
  register(input: RegisterTaskInput): Promise<DepotTask>;
  start(taskId: string): Promise<DepotTask>;
  complete(taskId: string, completedBoxes: number): Promise<DepotTask>;
}

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (typeof value === 'object' && value !== null ? value as Json : {});
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const strOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const boxes = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
};

export function mapDepotTaskDto(value: unknown): DepotTask {
  const dto = obj(value);
  return {
    id: str(dto.id),
    taskType: str(dto.task_type).toUpperCase(),
    status: str(dto.status),
    plannedBoxes: boxes(dto.planned_box_quantity),
    completedBoxes: boxes(dto.completed_box_quantity),
    startedAt: strOrNull(dto.started_at),
    completedAt: strOrNull(dto.completed_at),
  };
}

const isDepotOperation = (task: DepotTask) => task.taskType === 'LOADING' || task.taskType === 'UNLOADING';

type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;
interface Envelope<T> { data: T }

export function createApiTaskRegistrationGateway(request: RequestFn = apiRequest): TaskRegistrationGateway {
  const post = async (path: string, body: unknown) => mapDepotTaskDto((await request<Envelope<unknown>>(path, { method: 'POST', body: JSON.stringify(body) })).data);
  return {
    async listEmployees(depotId) {
      const response = await request<{ data: unknown[] }>(withQuery('/employees', { depot_id: depotId, is_active: 'true', page: 1, pageSize: 100 }));
      return response.data.map((value) => { const dto = obj(value); return { id: str(dto.id), code: str(dto.employee_code), name: str(dto.name, str(dto.employee_code)) }; });
    },
    async listOpenTasks(depotId) {
      const response = await request<{ data: unknown[] }>(withQuery('/tasks', { depot_id: depotId, page: 1, pageSize: 100 }));
      return response.data.map(mapDepotTaskDto).filter((task) => isDepotOperation(task) && (OPEN_TASK_STATUSES as readonly string[]).includes(task.status));
    },
    async register(input) {
      let task = await post('/tasks', { depot_id: input.depotId, task_type: input.taskType, ...(input.plannedBoxes !== null ? { planned_box_quantity: input.plannedBoxes } : {}) });
      if (input.employeeIds.length > 0) task = await post(`/tasks/${encodeURIComponent(task.id)}/assignments`, { employeeIds: input.employeeIds });
      if (input.startNow) task = await post(`/tasks/${encodeURIComponent(task.id)}/start`, {});
      return task;
    },
    start: (taskId) => post(`/tasks/${encodeURIComponent(taskId)}/start`, {}),
    complete: (taskId, completedBoxes) => post(`/tasks/${encodeURIComponent(taskId)}/complete`, { completed_box_quantity: completedBoxes }),
  };
}

// ---------------------------------------------------------------------------
// Preview-mode gateway (in memory), following the same transitions as the server.
// ---------------------------------------------------------------------------

const MOCK_EMPLOYEES: DepotEmployee[] = [
  { id: 'mock-emp-1', code: 'EMP-101', name: 'Asha Rao' },
  { id: 'mock-emp-2', code: 'EMP-102', name: 'Ravi Kumar' },
  { id: 'mock-emp-3', code: 'EMP-103', name: 'Meena Iyer' },
];

export function createMockTaskRegistrationGateway(): TaskRegistrationGateway {
  const tasks: DepotTask[] = [];
  const find = (id: string) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) throw new ApiError(404, { code: 'TASK_NOT_FOUND', message: 'Task not found.' });
    return task;
  };
  const start = (task: DepotTask) => {
    if (task.status !== 'PENDING' && task.status !== 'ASSIGNED') throw new ApiError(409, { code: 'INVALID_TRANSITION', message: 'Only pending or assigned tasks can be started.' });
    task.status = 'IN_PROGRESS';
    task.startedAt = new Date().toISOString();
  };
  return {
    async listEmployees() { return structuredClone(MOCK_EMPLOYEES); },
    async listOpenTasks() { return structuredClone(tasks.filter((task) => (OPEN_TASK_STATUSES as readonly string[]).includes(task.status))); },
    async register(input) {
      const task: DepotTask = { id: `mock-task-${tasks.length + 1}`, taskType: input.taskType, status: input.employeeIds.length > 0 ? 'ASSIGNED' : 'PENDING', plannedBoxes: input.plannedBoxes, completedBoxes: null, startedAt: null, completedAt: null };
      tasks.push(task);
      if (input.startNow) start(task);
      return structuredClone(task);
    },
    async start(taskId) { const task = find(taskId); start(task); return structuredClone(task); },
    async complete(taskId, completedBoxes) {
      const task = find(taskId);
      if (task.status !== 'IN_PROGRESS' && task.status !== 'PAUSED') throw new ApiError(409, { code: 'INVALID_TRANSITION', message: 'Only started tasks can be completed.' });
      task.status = 'COMPLETED';
      task.completedBoxes = completedBoxes;
      task.completedAt = new Date().toISOString();
      return structuredClone(task);
    },
  };
}

/** Non-negative whole BOX quantity, or an error message. */
export function parseBoxQuantity(raw: string, required: boolean): { value: number | null; error?: string } {
  const value = raw.trim();
  if (value === '') return required ? { value: null, error: 'Enter the BOX quantity.' } : { value: null };
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) return { value: null, error: 'BOX quantity must be a whole number of 0 or more.' };
  return { value: parsed };
}

let sharedMockGateway: TaskRegistrationGateway | null = null;

export function useTaskRegistrationGateway(): TaskRegistrationGateway {
  const { mode } = useRepositories();
  return useMemo(() => {
    if (mode === 'api') return createApiTaskRegistrationGateway();
    sharedMockGateway ??= createMockTaskRegistrationGateway();
    return sharedMockGateway;
  }, [mode]);
}
