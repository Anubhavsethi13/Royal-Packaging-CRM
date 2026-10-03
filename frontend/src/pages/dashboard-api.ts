import { z } from 'zod';
import { apiRequest } from '../api/client';
import { parseContract } from '../api/contract-validation';
import { BACKEND_TASK_STATUSES } from './warehouse-api';

type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;

/**
 * `GET /dashboard` (`DashboardSummaryDTO`). Only the two fields with an unambiguous meaning are read:
 * task counts by backend status and the BOX quantity of completed tasks, both over all recorded tasks
 * in the caller's server-side scope (Others: their own depot). Every other field (quality inspection
 * counts, inventory status counts, the SLA placeholder, incentive totals) is deliberately ignored:
 * the dashboard must not present them as KPIs while SLA and Quality are not configured.
 */
export const dashboardSummaryEnvelopeSchema = z.object({
  data: z.object({
    tasksByStatus: z.record(z.string(), z.number().int().nonnegative()),
    boxesHandled: z.string().regex(/^\d+$/),
  }),
});

export interface DashboardOverview {
  readonly taskCounts: ReadonlyArray<{ status: string; count: number }>;
  readonly totalTasks: number;
  readonly completedTasks: number;
  readonly boxesHandled: number;
}

export function mapDashboardSummary(payload: unknown): DashboardOverview {
  const { tasksByStatus, boxesHandled } = parseContract(dashboardSummaryEnvelopeSchema, payload, 'dashboard').data;
  const known: readonly string[] = BACKEND_TASK_STATUSES;
  const statuses = [...known.filter((status) => status in tasksByStatus), ...Object.keys(tasksByStatus).filter((status) => !known.includes(status)).sort()];
  return {
    taskCounts: statuses.map((status) => ({ status, count: tasksByStatus[status] ?? 0 })),
    totalTasks: Object.values(tasksByStatus).reduce((total, count) => total + count, 0),
    completedTasks: tasksByStatus.COMPLETED ?? 0,
    boxesHandled: Number(boxesHandled),
  };
}

export async function loadDashboardOverview(request: RequestFn = apiRequest): Promise<DashboardOverview> {
  return mapDashboardSummary(await request<unknown>('/dashboard'));
}
