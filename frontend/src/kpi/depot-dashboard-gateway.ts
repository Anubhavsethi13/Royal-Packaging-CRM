import { useMemo } from 'react';
import { apiRequest } from '../api/client';
import { withQuery } from '../shifts/shift-gateway';
import { useRepositories } from '../state/repositories';
import { mapDepotDashboardDto, type DepotKpiDashboard, type DepotKpiQuery } from './depot-dashboard-data';

/** The API implementation reads GET /kpi/depot-dashboard; the preview one returns clearly illustrative data. */
export interface DepotDashboardGateway {
  load(query: DepotKpiQuery): Promise<DepotKpiDashboard>;
}

type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;

export function createApiDepotDashboardGateway(request: RequestFn = apiRequest): DepotDashboardGateway {
  return {
    async load(query) {
      const response = await request<{ data: unknown }>(withQuery('/kpi/depot-dashboard', { from: query.from, to: query.to, depot_id: query.depotId }));
      return mapDepotDashboardDto(response.data);
    },
  };
}

/** Preview data shaped like the client example (11 loading + 10 unloading operations, 23/23 labour). Not real. */
export function createMockDepotDashboardGateway(): DepotDashboardGateway {
  return {
    async load(query) {
      return mapDepotDashboardDto({
        overview: { from: query.from, to: query.to, timezone: 'preview', depot: { id: 'mock-dep-04', code: 'DEP-04', name: 'Depot Four (preview)' }, available_depots: [{ id: 'mock-dep-04', code: 'DEP-04', name: 'Depot Four (preview)' }], supervisors: [{ employee_id: 'mock-sup', name: 'Preview Supervisor' }] },
        operations: { loading_tasks: 2, unloading_tasks: 1, other_tasks: 0, total_tasks: 3, completed_tasks: 3, completed_loading_tasks: 2, completed_unloading_tasks: 1, boxes: 238, loading_boxes: 158, unloading_boxes: 80 },
        time: { total_operational_minutes: 90, average_task_minutes: 45, timed_tasks: 2 },
        labour: { required: 23, present: 23, attendance_percent: 100, reports_with_labour: 1 },
        performance: {},
        employees: [
          { employee: { id: 'mock-emp-1', code: 'EMP-101', name: 'Asha Rao' }, boxes: 139, tasks_completed: 2, active_minutes: 90, average_task_minutes: 45, source_task_ids: ['mock-task-1', 'mock-task-2'] },
          { employee: { id: 'mock-emp-2', code: 'EMP-102', name: 'Ravi Kumar' }, boxes: 99, tasks_completed: 2, active_minutes: 60, average_task_minutes: 60, source_task_ids: ['mock-task-1', 'mock-task-3'] },
        ],
        sources: {
          daily_reports: [{ id: 'mock-report-1', report_date: query.to, depot_code: 'DEP-04', status: 'SUBMITTED', loading_count: 11, unloading_count: 10, total_operations: 21, labour_required: 23, labour_present: 23, duration_minutes: 750 }],
          completed_tasks: [
            { id: 'mock-task-1', task_code: 'TSK-PREVIEW1', operation: 'LOADING', boxes: 118, completed_at: `${query.to}T05:30:00Z`, warehouse: 'DEP-04', active_minutes: 60, assignees: [{ id: 'mock-emp-1', name: 'Asha Rao' }, { id: 'mock-emp-2', name: 'Ravi Kumar' }] },
            { id: 'mock-task-2', task_code: 'TSK-PREVIEW2', operation: 'UNLOADING', boxes: 80, completed_at: `${query.to}T07:20:00Z`, warehouse: 'DEP-04', active_minutes: 30, assignees: [{ id: 'mock-emp-1', name: 'Asha Rao' }] },
            { id: 'mock-task-3', task_code: 'TSK-PREVIEW3', operation: 'LOADING', boxes: 40, completed_at: `${query.to}T08:30:00Z`, warehouse: 'DEP-04', active_minutes: null, assignees: [{ id: 'mock-emp-2', name: 'Ravi Kumar' }] },
          ],
        },
      });
    },
  };
}

export function useDepotDashboardGateway(): DepotDashboardGateway {
  const { mode } = useRepositories();
  return useMemo(() => (mode === 'api' ? createApiDepotDashboardGateway() : createMockDepotDashboardGateway()), [mode]);
}
