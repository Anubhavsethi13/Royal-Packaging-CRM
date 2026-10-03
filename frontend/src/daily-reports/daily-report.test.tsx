import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { permissionForPath, visibleNavigation } from '../app/navigation';
import { routes } from '../app/routes';
import { canAccessRoute, hasPermission, rolePermissions } from '../state/authorization';
import type { Role } from '../types/v1';
import {
  buildDailyReportBody,
  describeDailyReportError,
  emptyDailyReportForm,
  formatClock,
  formatLabour,
  formatMinutes,
  mapDailyReportDto,
  previewFigures,
  validateDailyReportForm,
} from './daily-report-data';
import { createApiDailyReportGateway, createMockDailyReportGateway } from './daily-report-gateway';
import { DailyReportErrorPanel, OperationsSummary } from './daily-report-pages';

const html = (node: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const subject = (role: Role) => ({ role, roles: [role], permissions: rolePermissions(role) });

const EXAMPLE_DTO = {
  id: 'r-1', depot: { id: 'd-4', code: 'DEP-04', name: 'Depot Four' }, report_date: '2026-09-30',
  loading_count: 11, unloading_count: 10, total_operations: 21, start_time: '10:00:00', end_time: '22:30:00', duration_minutes: 750,
  labour_required: 23, labour_present: 23,
  vehicles: [{ truck_type: { id: 't1', code: '32FT', name: '32ft' }, count: 5 }, { truck_type: { id: 't2', code: 'CROSSING', name: 'Crossing' }, count: 0 }],
  status: 'DRAFT', submitted_at: null, updated_at: '2026-09-30T17:12:00Z', version: '3',
  registered_tasks: { loading_tasks_completed: 4, unloading_tasks_completed: 2, loading_boxes: 1200, unloading_boxes: 600, timezone: 'Asia/Kolkata' },
};

describe('derived daily report figures (client example)', () => {
  it('derives total operations and duration rather than accepting them', () => {
    expect(previewFigures(11, 10, '10:00', '22:30')).toEqual({ totalOperations: 21, durationMinutes: 750 });
    expect(formatMinutes(750)).toBe('12h 30m');
    expect(previewFigures(1, 1, '10:00', null).durationMinutes).toBeNull();
    expect(previewFigures(1, 1, '22:30', '10:00').durationMinutes).toBeNull();
  });

  it('formats times and labour like the supervisor writes them', () => {
    expect(formatClock('10:00:00')).toBe('10:00 AM');
    expect(formatClock('22:30')).toBe('10:30 PM');
    expect(formatClock('00:15')).toBe('12:15 AM');
    expect(formatLabour(23, 23)).toBe('23/23');
    expect(formatLabour(null, null)).toBe('—');
  });

  it('renders the example as structured operations, not static text', () => {
    const report = mapDailyReportDto(EXAMPLE_DTO);
    const markup = html(<OperationsSummary title="Today's operations" status="DRAFT" figures={{ ...report }} />);
    for (const fragment of ['Loading', '>11<', 'Unloading', '>10<', '>21<', '32ft: 5', 'Crossing: 0', '10:00 AM', '10:30 PM', '12h 30m', '23/23']) expect(markup).toContain(fragment);
  });
});

describe('daily report form', () => {
  const filled = { ...emptyDailyReportForm('2026-09-30', 'd-4'), loadingCount: '11', unloadingCount: '10', startTime: '10:00', endTime: '22:30', labourRequired: '23', labourPresent: '23', vehicleCounts: { '32FT': '5', CROSSING: '0' } };

  it('lets a draft omit times and labour but requires them for submission', () => {
    const draft = { ...emptyDailyReportForm('2026-09-30'), loadingCount: '3', unloadingCount: '4' };
    expect(validateDailyReportForm(draft, { requireDepot: false, forSubmission: false })).toEqual({});
    expect(Object.keys(validateDailyReportForm(draft, { requireDepot: false, forSubmission: true })).sort()).toEqual(['endTime', 'labourPresent', 'labourRequired', 'startTime']);
  });

  it('rejects negative, fractional, and reversed values', () => {
    const errors = validateDailyReportForm({ ...filled, loadingCount: '-1', unloadingCount: '1.5', endTime: '09:00' }, { requireDepot: true, forSubmission: true });
    expect(errors.loadingCount).toMatch(/negative/);
    expect(errors.unloadingCount).toMatch(/whole number/);
    expect(errors.endTime).toMatch(/later/);
    expect(validateDailyReportForm({ ...filled, depotId: '' }, { requireDepot: true, forSubmission: false }).depotId).toBeDefined();
  });

  it('never sends derived values', () => {
    const body = buildDailyReportBody(filled, true);
    expect(body).toEqual({ report_date: '2026-09-30', depot_id: 'd-4', loading_count: 11, unloading_count: 10, start_time: '10:00', end_time: '22:30', labour_required: 23, labour_present: 23, vehicles: [{ truck_type_code: '32FT', count: 5 }, { truck_type_code: 'CROSSING', count: 0 }] });
    expect(body).not.toHaveProperty('total_operations');
    expect(body).not.toHaveProperty('duration_minutes');
  });
});

describe('daily report errors', () => {
  it('maps server outcomes to clear states', () => {
    expect(describeDailyReportError(new ApiError(403, { code: 'DEPOT_ASSIGNMENT_REQUIRED', message: 'x' })).kind).toBe('depot');
    expect(describeDailyReportError(new ApiError(409, { code: 'DAILY_REPORT_LOCKED', message: 'x' })).kind).toBe('locked');
    expect(describeDailyReportError(new ApiError(409, { code: 'DAILY_REPORT_VERSION_CONFLICT', message: 'x' })).kind).toBe('conflict');
    expect(describeDailyReportError(new ApiError(422, { code: 'DAILY_REPORT_INCOMPLETE', message: 'x', errors: [{ field: 'start_time', code: 'required', message: 'start_time is required' }]})).fieldErrors.startTime).toBe('start_time is required');
    expect(describeDailyReportError(new TypeError('fetch failed')).kind).toBe('network');
    expect(html(<DailyReportErrorPanel view={describeDailyReportError(new ApiError(403, { code: 'DEPOT_ASSIGNMENT_REQUIRED', message: 'x' }))} />)).toContain('No depot assigned');
  });
});

describe('daily report gateways', () => {
  it('API gateway calls the backend contract and sends only operational fields on update', async () => {
    const request = vi.fn(async (path: string) => (path.startsWith('/daily-reports?') ? { data: [EXAMPLE_DTO], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } } : { data: EXAMPLE_DTO }));
    const gateway = createApiDailyReportGateway(request as never);
    const page = await gateway.list({ page: 1, pageSize: 10, from: '2026-09-30', to: '2026-09-30' });
    expect(page.items[0]?.totalOperations).toBe(21);
    expect(request).toHaveBeenCalledWith('/daily-reports?page=1&pageSize=10&from=2026-09-30&to=2026-09-30');
    await gateway.update('r-1', '3', { depot_id: 'd-9', report_date: '2026-01-01', loading_count: 1, unloading_count: 2, start_time: null, end_time: null, labour_required: null, labour_present: null, vehicles: [] });
    const [path, init] = request.mock.calls.at(-1) as unknown as [string, RequestInit];
    expect(path).toBe('/daily-reports/r-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ version: '3', loading_count: 1, unloading_count: 2, start_time: null, end_time: null, labour_required: null, labour_present: null, vehicles: [] });
    await gateway.submit('r-1', '4');
    expect(request).toHaveBeenLastCalledWith('/daily-reports/r-1/submit', { method: 'POST', body: JSON.stringify({ version: '4' }) });
  });

  it('preview gateway follows the same lifecycle: draft → submitted → locked', async () => {
    const gateway = createMockDailyReportGateway();
    const draft = await gateway.create({ report_date: '2026-09-30', loading_count: 11, unloading_count: 10, start_time: null, end_time: null, labour_required: null, labour_present: null, vehicles: [{ truck_type_code: '32FT', count: 5 }] });
    expect(draft.totalOperations).toBe(21);
    await expect(gateway.submit(draft.id, draft.version)).rejects.toMatchObject({ status: 422 });
    const updated = await gateway.update(draft.id, draft.version, { loading_count: 11, unloading_count: 10, start_time: '10:00', end_time: '22:30', labour_required: 23, labour_present: 23, vehicles: [] });
    expect(updated.durationMinutes).toBe(750);
    await expect(gateway.update(draft.id, draft.version, { loading_count: 1, unloading_count: 1, start_time: null, end_time: null, labour_required: null, labour_present: null, vehicles: [] })).rejects.toMatchObject({ status: 409 });
    const submitted = await gateway.submit(updated.id, updated.version);
    expect(submitted.status).toBe('SUBMITTED');
    await expect(gateway.update(submitted.id, submitted.version, { loading_count: 1, unloading_count: 1, start_time: null, end_time: null, labour_required: null, labour_present: null, vehicles: [] })).rejects.toMatchObject({ status: 409 });
    await expect(gateway.create({ report_date: '2026-09-30', loading_count: 0, unloading_count: 0, start_time: null, end_time: null, labour_required: null, labour_present: null, vehicles: [] })).rejects.toMatchObject({ status: 409 });
  });
});

describe('daily report access by role', () => {
  const navIds = (role: Role) => visibleNavigation(subject(role)).flatMap((group) => group.items).map((item) => item.id);

  it('supervisors and admins can open and record daily reports', () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'] as Role[]) {
      expect(navIds(role)).toContain('daily-reports');
      expect(hasPermission(subject(role), { module: 'DAILY_REPORTS', action: 'CREATE' })).toBe(true);
    }
  });

  it('accountants can read but not record; others cannot open them', () => {
    expect(navIds('ACCOUNTANT')).toContain('daily-reports');
    expect(hasPermission(subject('ACCOUNTANT'), { module: 'DAILY_REPORTS', action: 'CREATE' })).toBe(false);
    expect(navIds('EMPLOYEE')).not.toContain('daily-reports');
    expect(canAccessRoute(subject('EMPLOYEE'), permissionForPath(routes.dailyReports))).toBe(false);
  });

  it('puts the warehouse first and keeps KPI configuration to administrators', () => {
    const groups = visibleNavigation(subject('SUPER_ADMIN')).map((group) => group.id);
    expect(groups.slice(0, 3)).toEqual(['workspace', 'warehouse', 'people-performance']);
    expect(groups.at(-1)).toBe('crm');
    expect(navIds('SUPERVISOR')).not.toContain('kpis');
    expect(navIds('ACCOUNTANT')).not.toContain('kpis');
    expect(navIds('ADMIN')).toContain('kpis');
  });
});
