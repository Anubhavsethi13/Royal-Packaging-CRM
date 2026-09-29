import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { defaultDashboardPath, permissionForPath, visibleNavigation } from '../app/navigation';
import { hasPermission, rolePermissions } from '../state/authorization';
import {
  HistoricalKpiPanel,
  ShiftEntryFormView,
  ShiftErrorPanel,
  ShiftHistoryTable,
  TodayPanel,
} from './shift-pages';
import { describeShiftError, emptyShiftForm, mapKpiMetricsDto, type ShiftEntryRecord, type ShiftKpiMetrics, type ShiftOptions } from './shift-data';

const html = (node: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

const options: ShiftOptions = {
  warehouses: [{ id: 'w1', code: 'DEP-01', name: 'Main Depot' }, { id: 'w2', code: 'DEP-02', name: 'Annex Depot' }],
  truckTypes: [{ id: 't1', code: '32FT', name: '32ft' }],
};

const entry: ShiftEntryRecord = {
  id: 'e1', employeeId: 'emp', workDate: '2026-09-28', shiftStart: '08:00:00', shiftEnd: '16:30:00', labourCount: 6, unloadingTotal: 120, loadingTotal: 340,
  totalBoxes: 460, durationSeconds: 30600, warehouses: [options.warehouses[0]!], truckTypes: [options.truckTypes[0]!], createdAt: '',
};

const metrics: ShiftKpiMetrics = mapKpiMetricsDto({
  shift_count: 3, total_unloading: 150, total_loading: 350, total_boxes: 500, average_boxes_per_shift: 166.67, total_labour_count: 15, average_labour_count: 5,
  total_shift_duration_seconds: 73800, average_shift_duration_seconds: 24600, loading_productivity_boxes_per_hour: 17.07, unloading_productivity_boxes_per_hour: 7.32,
  warehouse_associations: 4, distinct_warehouses: 2,
});

describe('today panel', () => {
  it('shows the empty state with a call to action when nothing is logged', () => {
    const output = html(<TodayPanel today="2026-09-28" entry={null} metrics={mapKpiMetricsDto({})} />);
    expect(output).toContain('No shift logged for today');
    expect(output).toContain('/my-shifts/new');
  });

  it("shows today's loading, unloading, boxes, labour, and duration", () => {
    const today = mapKpiMetricsDto({ shift_count: 1, total_unloading: 120, total_loading: 340, total_boxes: 460, total_labour_count: 6, total_shift_duration_seconds: 30600, loading_productivity_boxes_per_hour: 40, unloading_productivity_boxes_per_hour: 14.12 });
    const output = html(<TodayPanel today="2026-09-28" entry={entry} metrics={today} />);
    expect(output).toContain('340 BOX');
    expect(output).toContain('120 BOX');
    expect(output).toContain('460 BOX');
    expect(output).toContain('8h 30m');
    expect(output).toContain('08:00');
    expect(output).toContain('16:30');
    expect(output).toContain('Main Depot');
    expect(output).toContain('40 BOX/h');
  });
});

describe('historical KPI panel', () => {
  it('shows every requested historical figure', () => {
    const output = html(<HistoricalKpiPanel metrics={metrics} />);
    for (const expected of ['500 BOX', '350 BOX', '150 BOX', '166.67', '20h 30m', '6h 50m', 'Average labour', 'Average boxes per shift', 'Total shift duration', 'Average shift duration']) {
      expect(output).toContain(expected);
    }
  });

  it('shows dashes and "Not calculable" for empty periods instead of invented numbers', () => {
    const output = html(<HistoricalKpiPanel metrics={mapKpiMetricsDto({})} />);
    expect(output).toContain('—');
    expect(output).toContain('Not calculable');
    expect(output).not.toContain('NaN');
  });
});

describe('history table', () => {
  it('renders rows with date, times, boxes, warehouses, and truck types', () => {
    const output = html(<ShiftHistoryTable page={{ items: [entry], page: 1, pageSize: 10, total: 1, totalPages: 1 }} />);
    expect(output).toContain('2026-09-28');
    expect(output).toContain('08:00 – 16:30');
    expect(output).toContain('460');
    expect(output).toContain('DEP-01');
    expect(output).toContain('32ft');
    expect(output).not.toContain('Page 1 of');
  });

  it('shows an empty message and paginates when there are several pages', () => {
    expect(html(<ShiftHistoryTable page={{ items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 }} />)).toContain('No shifts in this period');
    expect(html(<ShiftHistoryTable page={{ items: [entry], page: 1, pageSize: 10, total: 25, totalPages: 3 }} />)).toContain('Page 1 of 3');
  });
});

describe('shift entry form', () => {
  const render = (errors = {}, values = emptyShiftForm('2026-09-28'), submitting = false) =>
    html(<ShiftEntryFormView values={values} errors={errors} options={options} submitting={submitting} onChange={vi.fn()} onSubmit={vi.fn()} />);

  it('renders every field, the warehouse list, and the truck type list', () => {
    const output = render();
    for (const label of ['Work date', 'Shift start', 'Shift end', 'Labour count', 'Unloading total (BOX)', 'Loading total (BOX)', 'Warehouses', 'Truck types', 'Main Depot', 'Annex Depot', '32ft', 'Submit shift']) {
      expect(output).toContain(label);
    }
    expect(output).toContain('value="2026-09-28"');
    expect(output).toContain('min="0"');
  });

  it('shows validation messages next to their fields', () => {
    const output = render({ shiftEnd: 'Shift end must be later than shift start (overnight shifts are not supported).', warehouses: 'Select at least one warehouse.', loadingTotal: 'Loading total cannot be negative.' });
    expect(output).toContain('Shift end must be later than shift start');
    expect(output).toContain('Select at least one warehouse.');
    expect(output).toContain('Loading total cannot be negative.');
    expect(output).toContain('aria-invalid="true"');
  });

  it('groups the checkbox lists accessibly without browser fieldset chrome', () => {
    const output = render({ warehouses: 'Select at least one warehouse.' });
    expect(output).not.toContain('<fieldset');
    expect((output.match(/role="group"/g) ?? []).length).toBe(2);
    expect(output).toMatch(/aria-labelledby="[^"]+"/);
    expect(output).toMatch(/aria-describedby="[^"]+"/);
  });

  it('disables submit while a request is in flight', () => {
    expect(render({}, emptyShiftForm('2026-09-28'), true)).toContain('disabled');
  });

  it('reflects selected warehouses', () => {
    const output = render({}, { ...emptyShiftForm('2026-09-28'), warehouseCodes: ['DEP-02'] });
    expect(output).toMatch(/checked=""[^>]*\/?>Annex Depot/);
  });
});

describe('error panel', () => {
  it('shows a warning for a missing employee profile and an error state otherwise', () => {
    expect(html(<ShiftErrorPanel view={describeShiftError({ status: 403, code: 'EMPLOYEE_PROFILE_REQUIRED' })} />)).toContain('No employee profile');
    expect(html(<ShiftErrorPanel view={describeShiftError({ status: 401 })} />)).toContain('Session expired');
    expect(html(<ShiftErrorPanel view={describeShiftError({ status: 500 })} />)).toContain('Something went wrong');
    expect(html(<ShiftErrorPanel view={describeShiftError(new TypeError('x'))} />)).toContain('Could not reach the server');
  });
});

describe('shift routing and permissions', () => {
  const subject = (role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE') => ({ role, roles: [role], permissions: rolePermissions(role) });

  it('shows "My shifts" navigation to every role', () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'EMPLOYEE'] as const) {
      const ids = visibleNavigation(subject(role)).flatMap((group) => group.items).map((item) => item.id);
      expect(ids).toContain('my-shifts');
    }
  });

  it('protects the routes with shift permissions, matching the more specific path first', () => {
    expect(permissionForPath('/my-shifts')).toEqual({ module: 'SHIFTS', action: 'VIEW' });
    expect(permissionForPath('/my-shifts/new')).toEqual({ module: 'SHIFTS', action: 'CREATE' });
  });

  it('maps live backend permissions: read_own allows viewing only; create allows submitting', () => {
    const viewer = { role: 'EMPLOYEE' as const, roles: ['EMPLOYEE' as const], permissions: ['shift:read_own'] };
    const submitter = { role: 'EMPLOYEE' as const, roles: ['EMPLOYEE' as const], permissions: ['shift:read_own', 'shift:create'] };
    expect(hasPermission(viewer, { module: 'SHIFTS', action: 'VIEW' })).toBe(true);
    expect(hasPermission(viewer, { module: 'SHIFTS', action: 'CREATE' })).toBe(false);
    expect(hasPermission(submitter, { module: 'SHIFTS', action: 'CREATE' })).toBe(true);
    expect(hasPermission({ role: 'EMPLOYEE', roles: ['EMPLOYEE'], permissions: [] }, { module: 'SHIFTS', action: 'VIEW' })).toBe(false);
  });

  it('leaves the default dashboard decision unchanged', () => {
    expect(defaultDashboardPath('EMPLOYEE')).toBe('/');
  });
});
