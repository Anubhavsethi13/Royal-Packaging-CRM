// Types, filters, and mapping for the management shift KPI summary.
// Purely descriptive operational figures: no ranking, scoring, or "best employee" logic lives here.
import { isValidCalendarDate, mapKpiMetricsDto, type ShiftKpiMetrics } from './shift-data';

export interface EmployeeOption {
  id: string;
  code: string;
  name: string;
}

export interface EmployeeKpiRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string | null;
  metrics: ShiftKpiMetrics;
}

export interface ManagementKpiFilters {
  from: string;
  to: string;
  employeeId: string;
  warehouseCode: string;
  truckType: string;
}

export const EMPTY_MANAGEMENT_FILTERS: ManagementKpiFilters = { from: '', to: '', employeeId: '', warehouseCode: '', truckType: '' };

export interface ManagementKpiQuery extends ManagementKpiFilters {
  page: number;
  pageSize: number;
}

export interface ManagementKpiSummary {
  metrics: ShiftKpiMetrics;
  employees: EmployeeKpiRow[];
  page: number;
  pageSize: number;
  totalEmployees: number;
  totalPages: number;
}

export function hasActiveFilters(filters: ManagementKpiFilters): boolean {
  return Object.values(filters).some((value) => value !== '');
}

export type ManagementFilterErrors = Partial<Record<'from' | 'to', string>>;

/** Client-side check only; the backend validates the same rules. */
export function validateManagementFilters(filters: ManagementKpiFilters): ManagementFilterErrors {
  const errors: ManagementFilterErrors = {};
  if (filters.from && !isValidCalendarDate(filters.from)) errors.from = 'Enter a valid start date.';
  if (filters.to && !isValidCalendarDate(filters.to)) errors.to = 'Enter a valid end date.';
  if (!errors.from && !errors.to && filters.from && filters.to && filters.to < filters.from) errors.to = 'End date must not be earlier than the start date.';
  return errors;
}

type Json = Record<string, unknown>;
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

export function mapEmployeeKpiRowDto(raw: unknown): EmployeeKpiRow {
  const dto = (raw ?? {}) as Json;
  return {
    employeeId: str(dto.employee_id),
    employeeCode: str(dto.employee_code),
    employeeName: typeof dto.employee_name === 'string' ? dto.employee_name : null,
    metrics: mapKpiMetricsDto(dto.metrics),
  };
}

export function mapEmployeeOptionDto(raw: unknown): EmployeeOption {
  const dto = (raw ?? {}) as Json;
  const code = str(dto.employee_code);
  return { id: str(dto.id), code, name: str(dto.name, code) };
}

export function employeeLabel(row: { employeeName: string | null; employeeCode: string }): string {
  return row.employeeName?.trim() || row.employeeCode;
}

/** Warehouse involvement is only available as counts from the backend, so it is shown as counts. */
export function formatWarehouseInvolvement(metrics: Pick<ShiftKpiMetrics, 'warehouseAssociations' | 'distinctWarehouses'>): string {
  if (metrics.warehouseAssociations === 0) return '—';
  const distinct = metrics.distinctWarehouses;
  const links = metrics.warehouseAssociations;
  return `${distinct} warehouse${distinct === 1 ? '' : 's'} · ${links} entry link${links === 1 ? '' : 's'}`;
}

/** Total shift time as decimal hours, e.g. 73800 s -> "20.5 h". */
export function formatHours(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  return `${(Math.round((seconds / 3600) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} h`;
}
