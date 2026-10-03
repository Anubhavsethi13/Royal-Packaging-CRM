// Depot KPI dashboard: frontend model and DTO mapping. Every number is computed by the
// server from registered tasks, task timing and daily depot reports; the client only formats.

export interface NotConfiguredMetric { status: 'NOT_CONFIGURED'; reason: string }

export interface DepotRef { id: string; code: string; name: string }

export interface DepotKpiEmployeeRow {
  employee: { id: string; code: string; name: string | null };
  boxes: number;
  tasksCompleted: number;
  activeMinutes: number | null;
  averageTaskMinutes: number | null;
  sla: NotConfiguredMetric;
  quality: NotConfiguredMetric;
  sourceTaskIds: string[];
}

export interface DepotKpiSourceTask {
  id: string;
  taskCode: string;
  operation: 'LOADING' | 'UNLOADING' | 'OTHER';
  boxes: number;
  completedAt: string;
  warehouse: string | null;
  activeMinutes: number | null;
  assignees: Array<{ id: string; name: string | null }>;
}

export interface DepotKpiSourceReport {
  id: string;
  reportDate: string;
  depotCode: string;
  status: string;
  loadingCount: number;
  unloadingCount: number;
  totalOperations: number;
  labourRequired: number | null;
  labourPresent: number | null;
  durationMinutes: number | null;
}

export interface DepotKpiDashboard {
  overview: { from: string; to: string; timezone: string; depot: DepotRef | null; availableDepots: DepotRef[]; supervisors: Array<{ employeeId: string; name: string | null }> };
  operations: {
    loadingTasks: number; unloadingTasks: number; otherTasks: number; totalTasks: number;
    completedTasks: number; completedLoadingTasks: number; completedUnloadingTasks: number;
    boxes: number; loadingBoxes: number; unloadingBoxes: number;
  };
  time: { totalOperationalMinutes: number | null; averageTaskMinutes: number | null; timedTasks: number };
  labour: { required: number | null; present: number | null; attendancePercent: number | null; reportsWithLabour: number };
  performance: { sla: NotConfiguredMetric; quality: NotConfiguredMetric };
  employees: DepotKpiEmployeeRow[];
  sources: { dailyReports: DepotKpiSourceReport[]; completedTasks: DepotKpiSourceTask[] };
}

export interface DepotKpiQuery { from: string; to: string; depotId?: string }

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (typeof value === 'object' && value !== null ? value as Json : {});
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const strOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const numOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const ref = (value: unknown): DepotRef => { const item = obj(value); return { id: str(item.id), code: str(item.code), name: str(item.name) }; };

/** SLA/Quality are never numbers until a business rule is approved; anything else from the server is treated as not configured. */
function notConfigured(value: unknown, fallbackReason: string): NotConfiguredMetric {
  return { status: 'NOT_CONFIGURED', reason: str(obj(value).reason, fallbackReason) };
}
const SLA_REASON = 'No SLA formula or target has been approved.';
const QUALITY_REASON = 'No quality KPI formula or target has been approved.';

const operation = (value: unknown): DepotKpiSourceTask['operation'] => (value === 'LOADING' || value === 'UNLOADING' ? value : 'OTHER');

export function mapDepotDashboardDto(value: unknown): DepotKpiDashboard {
  const dto = obj(value);
  const overview = obj(dto.overview);
  const operations = obj(dto.operations);
  const time = obj(dto.time);
  const labour = obj(dto.labour);
  const performance = obj(dto.performance);
  const sources = obj(dto.sources);
  return {
    overview: {
      from: str(overview.from), to: str(overview.to), timezone: str(overview.timezone, 'UTC'),
      depot: overview.depot ? ref(overview.depot) : null,
      availableDepots: arr(overview.available_depots).map(ref),
      supervisors: arr(overview.supervisors).map((item) => ({ employeeId: str(obj(item).employee_id), name: strOrNull(obj(item).name) })),
    },
    operations: {
      loadingTasks: num(operations.loading_tasks), unloadingTasks: num(operations.unloading_tasks), otherTasks: num(operations.other_tasks), totalTasks: num(operations.total_tasks),
      completedTasks: num(operations.completed_tasks), completedLoadingTasks: num(operations.completed_loading_tasks), completedUnloadingTasks: num(operations.completed_unloading_tasks),
      boxes: num(operations.boxes), loadingBoxes: num(operations.loading_boxes), unloadingBoxes: num(operations.unloading_boxes),
    },
    time: { totalOperationalMinutes: numOrNull(time.total_operational_minutes), averageTaskMinutes: numOrNull(time.average_task_minutes), timedTasks: num(time.timed_tasks) },
    labour: { required: numOrNull(labour.required), present: numOrNull(labour.present), attendancePercent: numOrNull(labour.attendance_percent), reportsWithLabour: num(labour.reports_with_labour) },
    performance: { sla: notConfigured(performance.sla, SLA_REASON), quality: notConfigured(performance.quality, QUALITY_REASON) },
    employees: arr(dto.employees).map((item) => {
      const row = obj(item);
      const employee = obj(row.employee);
      return {
        employee: { id: str(employee.id), code: str(employee.code), name: strOrNull(employee.name) },
        boxes: num(row.boxes), tasksCompleted: num(row.tasks_completed),
        activeMinutes: numOrNull(row.active_minutes), averageTaskMinutes: numOrNull(row.average_task_minutes),
        sla: notConfigured(row.sla, SLA_REASON), quality: notConfigured(row.quality, QUALITY_REASON),
        sourceTaskIds: arr(row.source_task_ids).map((id) => str(id)),
      };
    }),
    sources: {
      dailyReports: arr(sources.daily_reports).map((item) => {
        const report = obj(item);
        return {
          id: str(report.id), reportDate: str(report.report_date).slice(0, 10), depotCode: str(report.depot_code), status: str(report.status),
          loadingCount: num(report.loading_count), unloadingCount: num(report.unloading_count), totalOperations: num(report.total_operations),
          labourRequired: numOrNull(report.labour_required), labourPresent: numOrNull(report.labour_present), durationMinutes: numOrNull(report.duration_minutes),
        };
      }),
      completedTasks: arr(sources.completed_tasks).map((item) => {
        const source = obj(item);
        return {
          id: str(source.id), taskCode: str(source.task_code), operation: operation(source.operation), boxes: num(source.boxes),
          completedAt: str(source.completed_at), warehouse: strOrNull(source.warehouse), activeMinutes: numOrNull(source.active_minutes),
          assignees: arr(source.assignees).map((assignee) => ({ id: str(obj(assignee).id), name: strOrNull(obj(assignee).name) })),
        };
      }),
    },
  };
}

/** Recorded active time: '—' when untimed, '<1m' for under a minute (never a misleading 0m), else hours and minutes. */
export function formatActiveMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes > 0 && minutes < 1) return '<1m';
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export const formatBox = (value: number): string => `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} BOX`;
export const formatPercent = (value: number | null): string => (value === null ? 'Not recorded' : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`);
