import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { permissionForPath, visibleNavigation } from '../app/navigation';
import { routes } from '../app/routes';
import { canAccessRoute, rolePermissions } from '../state/authorization';
import type { Role } from '../types/v1';
import { formatActiveMinutes, mapDepotDashboardDto } from './depot-dashboard-data';
import { createApiDepotDashboardGateway, createMockDepotDashboardGateway } from './depot-dashboard-gateway';
import { DepotKpiSources, DepotKpiStrip, DepotKpiSummary, EmployeeKpiTable } from './depot-dashboard-pages';

const html = (node: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const subject = (role: Role) => ({ role, roles: [role], permissions: rolePermissions(role) });

const DTO = {
  overview: { from: '2026-09-30', to: '2026-09-30', timezone: 'Asia/Kolkata', depot: { id: 'd4', code: 'DEP-04', name: 'Depot Four' }, available_depots: [{ id: 'd4', code: 'DEP-04', name: 'Depot Four' }], supervisors: [{ employee_id: 's1', name: 'Sam Supervisor' }] },
  operations: { loading_tasks: 2, unloading_tasks: 1, other_tasks: 0, total_tasks: 3, completed_tasks: 3, completed_loading_tasks: 2, completed_unloading_tasks: 1, boxes: 238, loading_boxes: 158, unloading_boxes: 80 },
  time: { total_operational_minutes: 90, average_task_minutes: 45, timed_tasks: 2 },
  labour: { required: 23, present: 23, attendance_percent: 100, reports_with_labour: 1 },
  // A server can never smuggle a number in here: SLA/Quality always map to "not configured".
  performance: { sla: { status: 'NOT_CONFIGURED', value: null, reason: 'No SLA rule.' }, quality: { status: 'AVAILABLE', value: 97 } },
  employees: [{ employee: { id: 'e1', code: 'EMP-1', name: 'Asha Rao' }, boxes: 139, tasks_completed: 2, active_minutes: 90, average_task_minutes: 45, sla: { value: 99 }, quality: null, source_task_ids: ['t1', 't2'] }],
  sources: {
    daily_reports: [{ id: 'r1', report_date: '2026-09-30', depot_code: 'DEP-04', status: 'SUBMITTED', loading_count: 11, unloading_count: 10, total_operations: 21, labour_required: 23, labour_present: 23, duration_minutes: 750 }],
    completed_tasks: [
      { id: 't1', task_code: 'TSK-AAAA0001', operation: 'LOADING', boxes: 118, completed_at: '2026-09-30T05:30:00Z', warehouse: 'DEP-04', active_minutes: 60, assignees: [{ id: 'e1', name: 'Asha Rao' }, { id: 'e2', name: 'Ravi Kumar' }] },
      { id: 't2', task_code: 'TSK-AAAA0002', operation: 'UNLOADING', boxes: 80, completed_at: '2026-09-30T07:20:00Z', warehouse: 'DEP-04', active_minutes: 30, assignees: [{ id: 'e1', name: 'Asha Rao' }] },
    ],
  },
};

describe('depot KPI dashboard data', () => {
  it('maps the server figures without recomputing them', () => {
    const dashboard = mapDepotDashboardDto(DTO);
    expect(dashboard.operations).toMatchObject({ totalTasks: 3, completedTasks: 3, boxes: 238 });
    expect(dashboard.time).toEqual({ totalOperationalMinutes: 90, averageTaskMinutes: 45, timedTasks: 2 });
    expect(dashboard.labour.attendancePercent).toBe(100);
    expect(dashboard.employees[0]).toMatchObject({ boxes: 139, tasksCompleted: 2, sourceTaskIds: ['t1', 't2'] });
  });

  it('formats recorded active time without hiding short tasks as 0m', () => {
    expect(formatActiveMinutes(null)).toBe('—');
    expect(formatActiveMinutes(0.13)).toBe('<1m');
    expect(formatActiveMinutes(0)).toBe('0m');
    expect(formatActiveMinutes(45)).toBe('45m');
    expect(formatActiveMinutes(90)).toBe('1h 30m');
    expect(formatActiveMinutes(750)).toBe('12h 30m');
  });

  it('never turns SLA or Quality into numbers', () => {
    const dashboard = mapDepotDashboardDto(DTO);
    expect(dashboard.performance.sla.status).toBe('NOT_CONFIGURED');
    expect(dashboard.performance.quality).toEqual({ status: 'NOT_CONFIGURED', reason: expect.any(String) });
    expect(dashboard.employees[0]?.sla.status).toBe('NOT_CONFIGURED');
    expect(dashboard.employees[0]?.quality.status).toBe('NOT_CONFIGURED');
  });
});

describe('depot KPI dashboard rendering', () => {
  const dashboard = mapDepotDashboardDto(DTO);

  it('shows overview, operations, time, labour and Not configured performance', () => {
    const markup = html(<DepotKpiSummary dashboard={dashboard} />);
    for (const fragment of ['Depot Four (DEP-04)', 'Sam Supervisor', '2026-09-30', 'Loading tasks', 'Unloading tasks', 'Total tasks', '238 BOX', 'Completed tasks', '1h 30m', '45m', '100%', 'Not configured']) {
      expect(markup).toContain(fragment);
    }
    // The smuggled quality value (97) is never rendered as a figure.
    expect(markup).not.toMatch(/>97(%|<| )/);
  });

  it('employee KPI table shows BOX, tasks, average time and Not configured SLA/Quality, with a source drill-down', () => {
    const markup = html(<EmployeeKpiTable dashboard={dashboard} />);
    for (const fragment of ['Asha Rao', '139 BOX', '>2<', '45m', 'Not configured', 'View source tasks']) expect(markup).toContain(fragment);
    expect(markup).not.toMatch(/>99(%|<| )/);
  });

  it('traceability lists the daily report and the source tasks with links to the task records', () => {
    const markup = html(<DepotKpiSources dashboard={dashboard} />);
    for (const fragment of ['2026-09-30', '>21<', '23/23', '12h 30m', 'TSK-AAAA0001', '118 BOX', 'Asha Rao, Ravi Kumar', `href="${routes.warehouseDetail.replace(':taskId', 't1')}"`]) expect(markup).toContain(fragment);
  });

  it('the supervisor strip shows BOXES HANDLED, TASKS COMPLETED, AVG TASK TIME, SLA and QUALITY', () => {
    const markup = html(<DepotKpiStrip dashboard={dashboard} />);
    for (const fragment of ['Boxes handled', '238 BOX', 'Tasks completed', 'Avg task time', '45m', 'SLA', 'Quality', 'Not configured']) expect(markup).toContain(fragment);
    expect(markup).not.toMatch(/incentive|payroll/i);
  });
});

describe('depot KPI dashboard access and gateway', () => {
  const navIds = (role: Role) => visibleNavigation(subject(role)).flatMap((group) => group.items).map((item) => item.id);

  it('is offered to Super Admin, Admin, Accountant and Supervisor, not to Others', () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'SUPERVISOR'] as Role[]) expect(navIds(role)).toContain('depot-kpi');
    expect(navIds('EMPLOYEE')).not.toContain('depot-kpi');
    expect(canAccessRoute(subject('EMPLOYEE'), permissionForPath(routes.depotKpi))).toBe(false);
  });

  it('asks the server for the range and depot; the depot is enforced server-side', async () => {
    const request = vi.fn(async () => ({ data: DTO }));
    await createApiDepotDashboardGateway(request as never).load({ from: '2026-09-01', to: '2026-09-30', depotId: 'd4' });
    expect(request).toHaveBeenCalledWith('/kpi/depot-dashboard?from=2026-09-01&to=2026-09-30&depot_id=d4');
  });

  it('preview data keeps SLA and Quality not configured', async () => {
    const preview = await createMockDepotDashboardGateway().load({ from: '2026-09-30', to: '2026-09-30' });
    expect(preview.performance.sla.status).toBe('NOT_CONFIGURED');
    expect(preview.employees.every((row) => row.quality.status === 'NOT_CONFIGURED')).toBe(true);
  });
});
