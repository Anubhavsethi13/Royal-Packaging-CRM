import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { permissionForPath, visibleNavigation } from '../app/navigation';
import { hasPermission, rolePermissions } from '../state/authorization';
import {
  EMPTY_MANAGEMENT_FILTERS,
  employeeLabel,
  formatHours,
  formatWarehouseInvolvement,
  hasActiveFilters,
  mapEmployeeKpiRowDto,
  mapEmployeeOptionDto,
  validateManagementFilters,
  type ManagementKpiSummary,
} from './management-kpi-data';
import { createApiManagementKpiGateway, createMockManagementKpiGateway, MOCK_EMPLOYEES } from './management-kpi-gateway';
import { EmployeeKpiTable, ManagementKpiFiltersBar, ManagementKpiNotes, ManagementKpiTotals } from './management-kpi-pages';
import { ShiftErrorPanel } from './shift-pages';
import { describeShiftError, mapKpiMetricsDto, type ShiftOptions } from './shift-data';

const html = (node: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

const options: ShiftOptions = {
  warehouses: [{ id: 'w1', code: 'DEP-01', name: 'Main Depot' }, { id: 'w2', code: 'DEP-02', name: 'Annex Depot' }],
  truckTypes: [{ id: 't1', code: '32FT', name: '32ft' }, { id: 't2', code: 'CROSSING', name: 'Crossing' }],
};

const metricsDto = {
  shift_count: 3, total_unloading: 150, total_loading: 350, total_boxes: 500, average_boxes_per_shift: 166.67, total_labour_count: 15, average_labour_count: 5,
  total_shift_duration_seconds: 73800, average_shift_duration_seconds: 24600, loading_productivity_boxes_per_hour: 17.07, unloading_productivity_boxes_per_hour: 7.32,
  warehouse_associations: 4, distinct_warehouses: 2,
};

const summary: ManagementKpiSummary = {
  metrics: mapKpiMetricsDto(metricsDto),
  employees: [mapEmployeeKpiRowDto({ employee_id: 'e1', employee_code: 'EMP-001', employee_name: 'Asha Rao', metrics: metricsDto })],
  page: 1, pageSize: 10, totalEmployees: 1, totalPages: 1,
};

describe('filter validation', () => {
  it('accepts empty and valid ranges, and rejects bad or reversed dates', () => {
    expect(validateManagementFilters(EMPTY_MANAGEMENT_FILTERS)).toEqual({});
    expect(validateManagementFilters({ ...EMPTY_MANAGEMENT_FILTERS, from: '2026-09-01', to: '2026-09-30' })).toEqual({});
    expect(validateManagementFilters({ ...EMPTY_MANAGEMENT_FILTERS, from: '2026-02-31' }).from).toBe('Enter a valid start date.');
    expect(validateManagementFilters({ ...EMPTY_MANAGEMENT_FILTERS, from: '2026-09-30', to: '2026-09-01' }).to).toContain('must not be earlier');
  });

  it('knows when filters are active', () => {
    expect(hasActiveFilters(EMPTY_MANAGEMENT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_MANAGEMENT_FILTERS, truckType: '32FT' })).toBe(true);
  });
});

describe('mapping and formatting', () => {
  it('maps employee rows and options, falling back to the employee code when there is no name', () => {
    const row = mapEmployeeKpiRowDto({ employee_id: 'e2', employee_code: 'EMP-002', employee_name: null, metrics: {} });
    expect(row.employeeName).toBeNull();
    expect(employeeLabel(row)).toBe('EMP-002');
    expect(mapEmployeeOptionDto({ id: 'e1', employee_code: 'EMP-001', name: 'Asha Rao' })).toEqual({ id: 'e1', code: 'EMP-001', name: 'Asha Rao' });
    expect(mapEmployeeOptionDto({ id: 'e3', employee_code: 'EMP-003' }).name).toBe('EMP-003');
  });

  it('formats shift hours and warehouse involvement as counts', () => {
    expect(formatHours(73800)).toBe('20.5 h');
    expect(formatHours(0)).toBe('0 h');
    expect(formatHours(null)).toBe('—');
    expect(formatWarehouseInvolvement({ warehouseAssociations: 4, distinctWarehouses: 2 })).toBe('2 warehouses · 4 entry links');
    expect(formatWarehouseInvolvement({ warehouseAssociations: 1, distinctWarehouses: 1 })).toBe('1 warehouse · 1 entry link');
    expect(formatWarehouseInvolvement({ warehouseAssociations: 0, distinctWarehouses: 0 })).toBe('—');
  });
});

describe('API management gateway', () => {
  it('sends only backend-supported filters and maps the response', async () => {
    const request = vi.fn().mockResolvedValue({ data: { metrics: metricsDto, employees: [{ employee_id: 'e1', employee_code: 'EMP-001', employee_name: 'Asha Rao', metrics: metricsDto }] }, meta: { page: 2, pageSize: 10, total: 11, totalPages: 2 } });
    const result = await createApiManagementKpiGateway(request).getSummary({ from: '2026-09-01', to: '2026-09-30', employeeId: 'e1', warehouseCode: 'DEP-01', truckType: '32FT', page: 2, pageSize: 10 });
    expect(request).toHaveBeenCalledWith('/kpi/summary?from=2026-09-01&to=2026-09-30&employee_id=e1&warehouse_code=DEP-01&truck_type=32FT&page=2&pageSize=10');
    expect(result).toMatchObject({ page: 2, pageSize: 10, totalEmployees: 11, totalPages: 2 });
    expect(result.metrics.totalBoxes).toBe(500);
    expect(result.employees[0]).toMatchObject({ employeeId: 'e1', employeeCode: 'EMP-001', employeeName: 'Asha Rao' });
  });

  it('omits empty filters', async () => {
    const request = vi.fn().mockResolvedValue({ data: { metrics: {}, employees: [] }, meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 } });
    const result = await createApiManagementKpiGateway(request).getSummary({ from: '', to: '', employeeId: '', warehouseCode: '', truckType: '', page: 1, pageSize: 10 });
    expect(request).toHaveBeenCalledWith('/kpi/summary?page=1&pageSize=10');
    expect(result.employees).toEqual([]);
    expect(result.metrics.shiftCount).toBe(0);
  });

  it('lists active employees for the employee filter', async () => {
    const request = vi.fn().mockResolvedValue({ data: [{ id: 'e1', employee_code: 'EMP-001', name: 'Asha Rao' }] });
    await expect(createApiManagementKpiGateway(request).listEmployees()).resolves.toEqual([{ id: 'e1', code: 'EMP-001', name: 'Asha Rao' }]);
    expect(request.mock.calls[0]?.[0]).toContain('/employees?');
    expect(request.mock.calls[0]?.[0]).toContain('is_active=true');
  });

  it('propagates a 403 without falling back to any data', async () => {
    const failure = new ApiError(403, { code: 'FORBIDDEN', message: 'no' });
    const request = vi.fn().mockRejectedValue(failure);
    await expect(createApiManagementKpiGateway(request).getSummary({ ...EMPTY_MANAGEMENT_FILTERS, page: 1, pageSize: 10 })).rejects.toBe(failure);
    expect(describeShiftError(failure).kind).toBe('forbidden');
  });
});

describe('preview management gateway', () => {
  const base = { ...EMPTY_MANAGEMENT_FILTERS, page: 1, pageSize: 10 };

  it('aggregates across employees with per-employee rows ordered by name', async () => {
    const result = await createMockManagementKpiGateway().getSummary(base);
    expect(result.metrics).toMatchObject({ shiftCount: 4, totalLoading: 420, totalUnloading: 180, totalBoxes: 600, averageBoxesPerShift: 150 });
    expect(result.employees.map((row) => row.employeeName)).toEqual(['Asha Rao', 'Ravi Kumar']);
    expect(result.employees[0]?.metrics).toMatchObject({ shiftCount: 3, totalBoxes: 500, averageBoxesPerShift: 166.67, warehouseAssociations: 4, distinctWarehouses: 2 });
  });

  it('applies the date, employee, warehouse, and truck type filters', async () => {
    const gateway = createMockManagementKpiGateway();
    expect((await gateway.getSummary({ ...base, from: '2026-09-01', to: '2026-09-01' })).metrics.shiftCount).toBe(2);
    expect((await gateway.getSummary({ ...base, employeeId: 'mock-emp-2' })).employees.map((row) => row.employeeCode)).toEqual(['EMP-002']);
    expect((await gateway.getSummary({ ...base, warehouseCode: 'DEP-02' })).metrics.shiftCount).toBe(2);
    expect((await gateway.getSummary({ ...base, truckType: 'CROSSING' })).metrics.shiftCount).toBe(1);
  });

  it('returns an empty result (and only employees with entries) when nothing matches', async () => {
    const result = await createMockManagementKpiGateway().getSummary({ ...base, from: '2027-01-01' });
    expect(result.employees).toEqual([]);
    expect(result.metrics.shiftCount).toBe(0);
    expect(result.metrics.averageBoxesPerShift).toBeNull();
    expect(result.totalPages).toBe(0);
  });

  it('paginates employee rows while keeping the aggregate over everyone', async () => {
    const gateway = createMockManagementKpiGateway();
    const first = await gateway.getSummary({ ...base, pageSize: 1 });
    const second = await gateway.getSummary({ ...base, pageSize: 1, page: 2 });
    expect(first.employees).toHaveLength(1);
    expect(second.employees[0]?.employeeName).toBe('Ravi Kumar');
    expect(first.totalPages).toBe(2);
    expect(first.metrics.shiftCount).toBe(4);
  });

  it('lists employees for the filter', async () => {
    await expect(createMockManagementKpiGateway().listEmployees()).resolves.toEqual(MOCK_EMPLOYEES);
  });
});

describe('management components', () => {
  it('renders the requested columns and per-employee figures without any ranking', () => {
    const output = html(<EmployeeKpiTable summary={summary} />);
    for (const header of ['Employee', 'Shifts', 'Loading', 'Unloading', 'Total boxes', 'Avg boxes / shift', 'Labour', 'Shift hours', 'Warehouses']) {
      expect(output).toContain(header);
    }
    for (const value of ['Asha Rao', 'EMP-001', '350', '150', '500', '166.67', '15 (avg 5)', '20.5 h', '2 warehouses · 4 entry links']) {
      expect(output).toContain(value);
    }
    expect(output).not.toMatch(/rank|score|best|top performer/i);
  });

  it('shows an empty state when no employee has matching shifts', () => {
    const output = html(<EmployeeKpiTable summary={{ employees: [], page: 1, totalPages: 0, totalEmployees: 0 }} />);
    expect(output).toContain('No shift entries match');
    expect(output).toContain('0 employees');
  });

  it('paginates only when there is more than one page', () => {
    expect(html(<EmployeeKpiTable summary={summary} />)).not.toContain('Page 1 of');
    expect(html(<EmployeeKpiTable summary={{ ...summary, totalPages: 3, totalEmployees: 25 }} />)).toContain('Page 1 of 3');
  });

  it('shows aggregate totals with null ratios as dashes', () => {
    expect(html(<ManagementKpiTotals metrics={summary.metrics} />)).toContain('500 BOX');
    const empty = html(<ManagementKpiTotals metrics={mapKpiMetricsDto({})} />);
    expect(empty).toContain('—');
    expect(empty).toContain('Not calculable');
    expect(empty).not.toContain('NaN');
  });

  it('offers exactly the backend-supported filters', () => {
    const output = html(<ManagementKpiFiltersBar filters={EMPTY_MANAGEMENT_FILTERS} errors={{}} employees={[{ id: 'e1', code: 'EMP-001', name: 'Asha Rao' }]} options={options} onChange={vi.fn()} onClear={vi.fn()} />);
    for (const label of ['From date', 'To date', 'Filter by employee', 'Filter by warehouse', 'Filter by truck type', 'Asha Rao (EMP-001)', 'Main Depot (DEP-01)', 'Crossing']) {
      expect(output).toContain(label);
    }
    expect(output).toContain('disabled'); // "Clear filters" is disabled with no active filters
  });

  it('shows date range errors next to the field', () => {
    const output = html(<ManagementKpiFiltersBar filters={{ ...EMPTY_MANAGEMENT_FILTERS, from: '2026-09-30', to: '2026-09-01' }} errors={{ to: 'End date must not be earlier than the start date.' }} employees={[]} options={options} onChange={vi.fn()} onClear={vi.fn()} />);
    expect(output).toContain('End date must not be earlier than the start date.');
  });

  it('explains how figures are computed and names active filters', () => {
    const output = html(<ManagementKpiNotes filters={{ ...EMPTY_MANAGEMENT_FILTERS, warehouseCode: 'DEP-01', truckType: '32FT' }} options={options} />);
    expect(output).toContain('nothing is ranked or scored');
    expect(output).toContain('warehouse Main Depot');
    expect(output).toContain('truck type 32ft');
  });

  it('shows API errors, including a forbidden warning', () => {
    expect(html(<ShiftErrorPanel view={describeShiftError({ status: 403, code: 'FORBIDDEN' })} />)).toContain('Not permitted');
    expect(html(<ShiftErrorPanel view={describeShiftError({ status: 500 })} />)).toContain('Something went wrong');
  });
});

describe('management RBAC', () => {
  const subject = (role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE') => ({ role, roles: [role], permissions: rolePermissions(role) });
  const navIds = (role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE') => visibleNavigation(subject(role)).flatMap((group) => group.items).map((item) => item.id);

  it('shows the summary in navigation to management roles only', () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'] as const) expect(navIds(role)).toContain('shift-kpi-summary');
    expect(navIds('EMPLOYEE')).not.toContain('shift-kpi-summary');
    expect(navIds('EMPLOYEE')).toContain('my-shifts');
  });

  it('guards the route with the management permission', () => {
    expect(permissionForPath('/shift-kpi-summary')).toEqual({ module: 'KPI_SUMMARY', action: 'VIEW' });
  });

  it('follows the backend kpi:read_all permission for live sessions', () => {
    const management = { role: 'ADMIN' as const, roles: ['ADMIN' as const], permissions: ['kpi:read_all', 'kpi:read_own'] };
    const employee = { role: 'EMPLOYEE' as const, roles: ['EMPLOYEE' as const], permissions: ['kpi:read_own', 'shift:read_own', 'kpi:read'] };
    expect(hasPermission(management, { module: 'KPI_SUMMARY', action: 'VIEW' })).toBe(true);
    expect(hasPermission(employee, { module: 'KPI_SUMMARY', action: 'VIEW' })).toBe(false);
    expect(hasPermission({ role: 'ADMIN', roles: ['ADMIN'], permissions: [] }, { module: 'KPI_SUMMARY', action: 'VIEW' })).toBe(false);
  });

  it('does not let the existing employee KPI permission unlock the summary', () => {
    expect(hasPermission(subject('EMPLOYEE'), { module: 'KPI', action: 'VIEW' })).toBe(true);
    expect(hasPermission(subject('EMPLOYEE'), { module: 'KPI_SUMMARY', action: 'VIEW' })).toBe(false);
  });
});
