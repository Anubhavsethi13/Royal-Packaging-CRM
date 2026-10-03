// Supervisor daily depot report: frontend model, mapping, validation and formatting.
// Totals and duration shown while typing are a preview only; the server derives
// and returns the authoritative values (total_operations, duration_minutes).

export type DailyReportStatus = 'DRAFT' | 'SUBMITTED';

export interface DailyReportDepot { id: string; code: string; name: string }
export interface DailyReportTruckType { id: string; code: string; name: string }
export interface DailyReportVehicle { truckType: DailyReportTruckType; count: number }

export interface RegisteredTasks {
  loadingTasksCompleted: number;
  unloadingTasksCompleted: number;
  loadingBoxes: number;
  unloadingBoxes: number;
  timezone: string;
}

export interface DailyReportRecord {
  id: string;
  depot: DailyReportDepot;
  reportDate: string;
  loadingCount: number;
  unloadingCount: number;
  totalOperations: number;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  labourRequired: number | null;
  labourPresent: number | null;
  vehicles: DailyReportVehicle[];
  status: DailyReportStatus;
  submittedAt: string | null;
  updatedAt: string;
  version: string;
  registeredTasks: RegisteredTasks;
}

export interface DailyReportOptions { depots: DailyReportDepot[]; truckTypes: DailyReportTruckType[] }

export interface DailyReportPage { items: DailyReportRecord[]; page: number; pageSize: number; total: number; totalPages: number }
export interface DailyReportListQuery { page: number; pageSize: number; depotId?: string; from?: string; to?: string; status?: DailyReportStatus }

export interface DailyReportBody {
  depot_id?: string;
  report_date?: string;
  loading_count: number;
  unloading_count: number;
  start_time: string | null;
  end_time: string | null;
  labour_required: number | null;
  labour_present: number | null;
  vehicles: Array<{ truck_type_code: string; count: number }>;
}

// ---------------------------------------------------------------------------
// DTO mapping (snake_case API → camelCase view model)
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (typeof value === 'object' && value !== null ? value as Json : {});
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const strOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const numOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const mapRef = (value: unknown): DailyReportDepot => { const item = obj(value); return { id: str(item.id), code: str(item.code), name: str(item.name) }; };

export function mapDailyReportDto(value: unknown): DailyReportRecord {
  const dto = obj(value);
  const tasks = obj(dto.registered_tasks);
  return {
    id: str(dto.id),
    depot: mapRef(dto.depot),
    reportDate: str(dto.report_date).slice(0, 10),
    loadingCount: num(dto.loading_count),
    unloadingCount: num(dto.unloading_count),
    totalOperations: num(dto.total_operations),
    startTime: strOrNull(dto.start_time),
    endTime: strOrNull(dto.end_time),
    durationMinutes: numOrNull(dto.duration_minutes),
    labourRequired: numOrNull(dto.labour_required),
    labourPresent: numOrNull(dto.labour_present),
    vehicles: (Array.isArray(dto.vehicles) ? dto.vehicles : []).map((vehicle) => { const item = obj(vehicle); return { truckType: mapRef(item.truck_type), count: num(item.count) }; }),
    status: dto.status === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT',
    submittedAt: strOrNull(dto.submitted_at),
    updatedAt: str(dto.updated_at),
    version: str(dto.version, '1'),
    registeredTasks: {
      loadingTasksCompleted: num(tasks.loading_tasks_completed),
      unloadingTasksCompleted: num(tasks.unloading_tasks_completed),
      loadingBoxes: num(tasks.loading_boxes),
      unloadingBoxes: num(tasks.unloading_boxes),
      timezone: str(tasks.timezone, 'UTC'),
    },
  };
}

export function mapDailyReportOptionsDto(value: unknown): DailyReportOptions {
  const dto = obj(value);
  return {
    depots: (Array.isArray(dto.depots) ? dto.depots : []).map(mapRef),
    truckTypes: (Array.isArray(dto.truck_types) ? dto.truck_types : []).map(mapRef),
  };
}

// ---------------------------------------------------------------------------
// Derived figures (preview) and formatting
// ---------------------------------------------------------------------------

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export function minutesOfDay(value: string | null): number | null {
  if (!value) return null;
  const match = TIME_PATTERN.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Mirrors the server: total = loading + unloading; duration = end - start (same day). */
export function previewFigures(loading: number, unloading: number, start: string | null, end: string | null): { totalOperations: number; durationMinutes: number | null } {
  const startMinutes = minutesOfDay(start);
  const endMinutes = minutesOfDay(end);
  const duration = startMinutes !== null && endMinutes !== null ? endMinutes - startMinutes : null;
  return { totalOperations: loading + unloading, durationMinutes: duration !== null && duration > 0 ? duration : null };
}

/** 750 → "12h 30m" */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "22:30:00" → "10:30 PM" */
export function formatClock(value: string | null): string {
  const minutes = minutesOfDay(value);
  if (minutes === null) return '—';
  const hours24 = Math.floor(minutes / 60);
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes % 60).padStart(2, '0')} ${suffix}`;
}

export function formatLabour(present: number | null, required: number | null): string {
  if (present === null && required === null) return '—';
  return `${present ?? '—'}/${required ?? '—'}`;
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

export interface DailyReportFormValues {
  depotId: string;
  reportDate: string;
  loadingCount: string;
  unloadingCount: string;
  startTime: string;
  endTime: string;
  labourRequired: string;
  labourPresent: string;
  vehicleCounts: Record<string, string>;
}

export type DailyReportFormField = 'depotId' | 'reportDate' | 'loadingCount' | 'unloadingCount' | 'startTime' | 'endTime' | 'labourRequired' | 'labourPresent' | 'vehicles';
export type DailyReportFormErrors = Partial<Record<DailyReportFormField, string>>;

export function emptyDailyReportForm(reportDate: string, depotId = ''): DailyReportFormValues {
  return { depotId, reportDate, loadingCount: '0', unloadingCount: '0', startTime: '', endTime: '', labourRequired: '', labourPresent: '', vehicleCounts: {} };
}

export function formFromReport(report: DailyReportRecord): DailyReportFormValues {
  return {
    depotId: report.depot.id,
    reportDate: report.reportDate,
    loadingCount: String(report.loadingCount),
    unloadingCount: String(report.unloadingCount),
    startTime: report.startTime?.slice(0, 5) ?? '',
    endTime: report.endTime?.slice(0, 5) ?? '',
    labourRequired: report.labourRequired === null ? '' : String(report.labourRequired),
    labourPresent: report.labourPresent === null ? '' : String(report.labourPresent),
    vehicleCounts: Object.fromEntries(report.vehicles.map((vehicle) => [vehicle.truckType.code, String(vehicle.count)])),
  };
}

function countError(raw: string, label: string, required: boolean): string | undefined {
  const value = raw.trim();
  if (value === '') return required ? `${label} is required.` : undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return `${label} must be a number.`;
  if (parsed < 0) return `${label} cannot be negative.`;
  if (!Number.isInteger(parsed)) return `${label} must be a whole number.`;
  return undefined;
}

/** `forSubmission` additionally requires the fields the server needs before a report can be submitted. */
export function validateDailyReportForm(values: DailyReportFormValues, options: { requireDepot: boolean; forSubmission: boolean }): DailyReportFormErrors {
  const errors: DailyReportFormErrors = {};
  if (options.requireDepot && !values.depotId) errors.depotId = 'Select a depot.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.reportDate)) errors.reportDate = 'Enter the report date.';
  const loading = countError(values.loadingCount, 'Loading', true);
  if (loading) errors.loadingCount = loading;
  const unloading = countError(values.unloadingCount, 'Unloading', true);
  if (unloading) errors.unloadingCount = unloading;
  const required = countError(values.labourRequired, 'Labour required', options.forSubmission);
  if (required) errors.labourRequired = required;
  const present = countError(values.labourPresent, 'Labour present', options.forSubmission);
  if (present) errors.labourPresent = present;
  if (options.forSubmission && !values.startTime) errors.startTime = 'Starting time is required to submit.';
  if (options.forSubmission && !values.endTime) errors.endTime = 'Ending time is required to submit.';
  const start = minutesOfDay(values.startTime || null);
  const end = minutesOfDay(values.endTime || null);
  if (start !== null && end !== null && end <= start) errors.endTime = 'Ending time must be later than the starting time.';
  for (const [code, raw] of Object.entries(values.vehicleCounts)) {
    const problem = countError(raw, `${code} vehicles`, false);
    if (problem) { errors.vehicles = problem; break; }
  }
  return errors;
}

export const hasFormErrors = (errors: DailyReportFormErrors): boolean => Object.values(errors).some(Boolean);

const toCount = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw));

export function buildDailyReportBody(values: DailyReportFormValues, includeDepotAndDate: boolean): DailyReportBody {
  return {
    ...(includeDepotAndDate ? { report_date: values.reportDate, ...(values.depotId ? { depot_id: values.depotId } : {}) } : {}),
    loading_count: Number(values.loadingCount),
    unloading_count: Number(values.unloadingCount),
    start_time: values.startTime || null,
    end_time: values.endTime || null,
    labour_required: toCount(values.labourRequired),
    labour_present: toCount(values.labourPresent),
    vehicles: Object.entries(values.vehicleCounts).filter(([, raw]) => raw.trim() !== '').map(([code, raw]) => ({ truck_type_code: code, count: Number(raw) })),
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface DailyReportErrorView {
  kind: 'network' | 'unauthorized' | 'forbidden' | 'depot' | 'conflict' | 'locked' | 'incomplete' | 'validation' | 'not_found' | 'server';
  title: string;
  message: string;
  fieldErrors: DailyReportFormErrors;
}

interface ApiErrorLike { status?: number; code?: string; message?: string; validationErrors?: Array<{ field?: string; message: string }>; fieldErrors?: Record<string, string[]> }

const FIELD_MAP: Record<string, DailyReportFormField> = {
  depot_id: 'depotId', report_date: 'reportDate', loading_count: 'loadingCount', unloading_count: 'unloadingCount',
  start_time: 'startTime', end_time: 'endTime', labour_required: 'labourRequired', labour_present: 'labourPresent',
};

function fieldErrorsFrom(candidate: ApiErrorLike): DailyReportFormErrors {
  const errors: DailyReportFormErrors = {};
  const issues = candidate.validationErrors ?? Object.entries(candidate.fieldErrors ?? {}).map(([field, messages]) => ({ field, message: messages[0] ?? '' }));
  for (const issue of issues) {
    const key = issue.field ?? '';
    const field = FIELD_MAP[key] ?? (key.startsWith('vehicles') ? 'vehicles' : undefined);
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

export function describeDailyReportError(error: unknown): DailyReportErrorView {
  const candidate = (typeof error === 'object' && error !== null ? error : {}) as ApiErrorLike;
  const status = candidate.status;
  if (status === undefined) return { kind: 'network', title: 'Could not reach the server', message: 'Check your connection and try again. Nothing was saved.', fieldErrors: {} };
  if (status === 401) return { kind: 'unauthorized', title: 'Session expired', message: 'Please sign in again.', fieldErrors: {} };
  if (status === 403) {
    if (candidate.code === 'DEPOT_ASSIGNMENT_REQUIRED') return { kind: 'depot', title: 'No depot assigned', message: 'Your employee profile is not assigned to a depot. Ask an administrator to assign one before submitting daily reports.', fieldErrors: {} };
    if (candidate.code === 'DEPOT_FORBIDDEN') return { kind: 'forbidden', title: 'Another depot', message: 'You can only work with daily reports for your own depot.', fieldErrors: {} };
    return { kind: 'forbidden', title: 'Not permitted', message: 'You do not have permission to do this.', fieldErrors: {} };
  }
  if (status === 404) return { kind: 'not_found', title: 'Report not found', message: 'This daily report no longer exists.', fieldErrors: {} };
  if (status === 409) {
    if (candidate.code === 'DAILY_REPORT_LOCKED') return { kind: 'locked', title: 'Report already submitted', message: 'Submitted reports are read-only.', fieldErrors: {} };
    if (candidate.code === 'DAILY_REPORT_VERSION_CONFLICT') return { kind: 'conflict', title: 'Report changed elsewhere', message: 'Someone else updated this report. Reload it and apply your changes again.', fieldErrors: {} };
    return { kind: 'conflict', title: 'Report already exists', message: candidate.message || 'A daily report already exists for this depot and date.', fieldErrors: { reportDate: 'A report already exists for this date.' } };
  }
  if (status === 422) return { kind: 'incomplete', title: 'Report is incomplete', message: 'Record the starting and ending time and labour before submitting.', fieldErrors: fieldErrorsFrom(candidate) };
  if (status === 400) return { kind: 'validation', title: 'Check the highlighted fields', message: candidate.message || 'The server rejected the submitted values.', fieldErrors: fieldErrorsFrom(candidate) };
  return { kind: 'server', title: 'Something went wrong', message: 'The request could not be completed. Try again shortly.', fieldErrors: {} };
}
