import type { ListQuery, ListResponse } from '../mock/repositories';
import type { DataMode } from '../state/repositories';
import type { EmployeeRecord } from '../types/domain';

type EmployeeListRepository = Pick<{ list(query?: ListQuery): Promise<ListResponse<EmployeeRecord>> }, 'list'>;
type EmployeeDetailRepository = Pick<{ getById(id: string): Promise<EmployeeRecord | undefined> }, 'getById'>;

export interface EmployeeListRequest {
  page: number;
  pageSize: number;
  search: string;
  depot: string;
  status: string;
  sort: string;
}

export async function loadEmployeeList(repository: EmployeeListRepository, mode: DataMode, request: EmployeeListRequest): Promise<ListResponse<EmployeeRecord>> {
  if (mode === 'api') {
    return repository.list({
      page: request.page,
      pageSize: request.pageSize,
      search: request.search,
      sortBy: request.sort,
      sortDirection: 'asc',
      filters: {
        depot: request.depot === 'all' ? undefined : request.depot,
        status: request.status === 'all' ? undefined : request.status,
      },
    });
  }

  const result = await repository.list({ page: 1, pageSize: Number.MAX_SAFE_INTEGER, search: request.search });
  const filtered = result.items
    .filter((employee) => (request.depot === 'all' || employee.depot.endsWith(request.depot)) && (request.status === 'all' || employee.status === request.status))
    .sort((a, b) => String(a[request.sort as keyof EmployeeRecord]).localeCompare(String(b[request.sort as keyof EmployeeRecord])));
  const totalPages = Math.max(1, Math.ceil(filtered.length / request.pageSize));
  const page = Math.min(request.page, totalPages);
  return { items: filtered.slice((page - 1) * request.pageSize, page * request.pageSize), page, pageSize: request.pageSize, total: filtered.length, stale: result.stale };
}

/**
 * Maps the backend EmployeeDTO (`employee_code`, `is_active`, `depot_id`, `currentShift`, ...)
 * to the EmployeeRecord the pages render. The API has no job role, task count,
 * productivity or KPI figure for an employee, so those are shown as not recorded
 * rather than invented.
 */
export function mapEmployeeDtoToRecord(payload: unknown): EmployeeRecord {
  const dto = ((payload as { data?: unknown })?.data ?? payload) as Record<string, unknown>;
  const isActive = dto.is_active ?? dto.isActive;
  const depotId = dto.depot_id ?? dto.depotId;
  const shift = dto.currentShift as { shift_name?: unknown } | null | undefined;
  return {
    id: String(dto.id ?? ''),
    code: String(dto.employee_code ?? dto.employeeCode ?? ''),
    name: String(dto.name ?? ''),
    role: 'Not recorded',
    depot: typeof depotId === 'string' ? depotId : 'No depot assigned',
    status: isActive === false ? 'Inactive' : 'Active',
    productivity: '—',
    kpi: '—',
    shift: typeof shift?.shift_name === 'string' ? shift.shift_name : 'No shift assigned',
    tasks: null,
  };
}

/** Incentives and Payroll tabs are Super Admin only, like the incentive cards (`visible` from the INCENTIVES permission). */
export function employeeDetailTabs(canViewIncentives: boolean): string[] {
  return ['Assigned tasks', 'Performance', 'KPI', ...(canViewIncentives ? ['Incentives', 'Payroll'] : []), 'Activity'];
}

export function loadEmployeeDetail(repository: EmployeeDetailRepository, id: string): Promise<EmployeeRecord | undefined> {
  return repository.getById(id);
}
