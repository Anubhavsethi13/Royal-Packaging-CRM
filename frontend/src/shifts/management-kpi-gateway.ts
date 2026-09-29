import { apiRequest } from '../api/client';
import { mapEmployeeKpiRowDto, mapEmployeeOptionDto, type EmployeeOption, type ManagementKpiQuery, type ManagementKpiSummary } from './management-kpi-data';
import { summarizeEntries, withQuery } from './shift-gateway';
import { mapKpiMetricsDto, type ShiftEntryRecord } from './shift-data';

/** Data access for the management summary. Authorization is enforced by the backend (`kpi:read_all`); the UI only hides what it cannot use. */
export interface ManagementKpiGateway {
  getSummary(query: ManagementKpiQuery): Promise<ManagementKpiSummary>;
  listEmployees(): Promise<EmployeeOption[]>;
}

type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;

interface SummaryEnvelope {
  data: { metrics: unknown; employees: unknown[] };
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export function createApiManagementKpiGateway(request: RequestFn = apiRequest): ManagementKpiGateway {
  return {
    async getSummary(query) {
      const response = await request<SummaryEnvelope>(withQuery('/kpi/summary', {
        from: query.from,
        to: query.to,
        employee_id: query.employeeId,
        warehouse_code: query.warehouseCode,
        truck_type: query.truckType,
        page: query.page,
        pageSize: query.pageSize,
      }));
      return {
        metrics: mapKpiMetricsDto(response.data.metrics),
        employees: response.data.employees.map(mapEmployeeKpiRowDto),
        page: response.meta.page,
        pageSize: response.meta.pageSize,
        totalEmployees: response.meta.total,
        totalPages: response.meta.totalPages,
      };
    },
    async listEmployees() {
      const response = await request<{ data: unknown[] }>(withQuery('/employees', { pageSize: 200, is_active: 'true', sortBy: 'name', sortDirection: 'asc' }));
      return response.data.map(mapEmployeeOptionDto);
    },
  };
}

// ---------------------------------------------------------------------------
// Preview-mode gateway (in-memory sample data; mirrors the backend filter semantics)
// ---------------------------------------------------------------------------

export const MOCK_EMPLOYEES: EmployeeOption[] = [
  { id: 'mock-emp-1', code: 'EMP-001', name: 'Asha Rao' },
  { id: 'mock-emp-2', code: 'EMP-002', name: 'Ravi Kumar' },
  { id: 'mock-emp-3', code: 'EMP-003', name: 'Meera Nair' },
];

const wh = (code: string) => ({ id: `wh-${code}`, code, name: code === 'DEP-01' ? 'Main Depot' : 'Annex Depot' });
const tt = (code: string) => ({ id: `tt-${code}`, code, name: code === '32FT' ? '32ft' : code === 'CROSSING' ? 'Crossing' : 'Other' });

function sample(employeeId: string, workDate: string, seconds: number, labour: number, unloading: number, loading: number, warehouses: string[], trucks: string[]): ShiftEntryRecord {
  return {
    id: `${employeeId}-${workDate}`, employeeId, workDate, shiftStart: '08:00:00', shiftEnd: '', labourCount: labour, unloadingTotal: unloading, loadingTotal: loading,
    totalBoxes: unloading + loading, durationSeconds: seconds, warehouses: warehouses.map(wh), truckTypes: trucks.map(tt), createdAt: '',
  };
}

export const MOCK_SHIFT_ENTRIES: ShiftEntryRecord[] = [
  sample('mock-emp-1', '2026-09-01', 28800, 4, 100, 200, ['DEP-01'], ['32FT']),
  sample('mock-emp-1', '2026-09-02', 14400, 6, 50, 150, ['DEP-01', 'DEP-02'], ['CROSSING', '32FT']),
  sample('mock-emp-1', '2026-09-10', 30600, 5, 0, 0, ['DEP-02'], ['OTHER']),
  sample('mock-emp-2', '2026-09-01', 7200, 2, 30, 70, ['DEP-01'], ['32FT']),
];

export function createMockManagementKpiGateway(entries: ShiftEntryRecord[] = MOCK_SHIFT_ENTRIES, employees: EmployeeOption[] = MOCK_EMPLOYEES): ManagementKpiGateway {
  return {
    async listEmployees() {
      return structuredClone(employees);
    },
    async getSummary(query) {
      const matching = entries.filter((entry) =>
        (!query.from || entry.workDate >= query.from)
        && (!query.to || entry.workDate <= query.to)
        && (!query.employeeId || entry.employeeId === query.employeeId)
        && (!query.warehouseCode || entry.warehouses.some((warehouse) => warehouse.code === query.warehouseCode))
        && (!query.truckType || entry.truckTypes.some((truckType) => truckType.code === query.truckType)));
      const rows = employees
        .filter((employee) => matching.some((entry) => entry.employeeId === employee.id))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((employee) => ({ employeeId: employee.id, employeeCode: employee.code, employeeName: employee.name, metrics: summarizeEntries(matching.filter((entry) => entry.employeeId === employee.id)) }));
      const totalPages = Math.ceil(rows.length / query.pageSize);
      const start = (query.page - 1) * query.pageSize;
      return { metrics: summarizeEntries(matching), employees: rows.slice(start, start + query.pageSize), page: query.page, pageSize: query.pageSize, totalEmployees: rows.length, totalPages };
    },
  };
}
