// Domain types, validation, mapping, and formatting for the employee shift entry + personal KPI screens.
// Client-side validation here is a usability aid only; the backend re-validates every field and stays authoritative.

export interface ShiftOption {
  id: string;
  code: string;
  name: string;
}

export interface ShiftOptions {
  warehouses: ShiftOption[];
  truckTypes: ShiftOption[];
}

export interface ShiftEntryRecord {
  id: string;
  employeeId: string;
  workDate: string;
  shiftStart: string;
  shiftEnd: string;
  labourCount: number;
  unloadingTotal: number;
  loadingTotal: number;
  totalBoxes: number;
  durationSeconds: number;
  warehouses: ShiftOption[];
  truckTypes: ShiftOption[];
  createdAt: string;
}

/** Metrics as returned by the backend KPI summary. Ratios are null when not calculable (never fabricated). */
export interface ShiftKpiMetrics {
  shiftCount: number;
  totalUnloading: number;
  totalLoading: number;
  totalBoxes: number;
  averageBoxesPerShift: number | null;
  totalLabour: number;
  averageLabour: number | null;
  totalDurationSeconds: number;
  averageDurationSeconds: number | null;
  loadingProductivity: number | null;
  unloadingProductivity: number | null;
  warehouseAssociations: number;
  distinctWarehouses: number;
}

export interface ShiftPage {
  items: ShiftEntryRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ShiftListQuery {
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
}

export interface ShiftSummaryQuery {
  from?: string;
  to?: string;
}

// ---------------------------------------------------------------------------
// Form model
// ---------------------------------------------------------------------------

export interface ShiftFormValues {
  workDate: string;
  shiftStart: string;
  shiftEnd: string;
  labourCount: string;
  unloadingTotal: string;
  loadingTotal: string;
  warehouseCodes: string[];
  truckTypeCodes: string[];
}

export const SHIFT_FORM_FIELDS = ['workDate', 'shiftStart', 'shiftEnd', 'labourCount', 'unloadingTotal', 'loadingTotal', 'warehouses', 'truckTypes'] as const;
export type ShiftFormField = (typeof SHIFT_FORM_FIELDS)[number];
export type ShiftFormErrors = Partial<Record<ShiftFormField, string>>;

export function emptyShiftForm(today: string = todayIso()): ShiftFormValues {
  return { workDate: today, shiftStart: '', shiftEnd: '', labourCount: '', unloadingTotal: '', loadingTotal: '', warehouseCodes: [], truckTypeCodes: [] };
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
/** Largest value the backend's 32-bit integer columns accept. */
export const MAX_COUNT = 2_147_483_647;

export function isValidCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Seconds since midnight for "HH:MM" or "HH:MM:SS"; null when malformed. */
export function timeToSeconds(value: string): number | null {
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
}

function validateCount(raw: string, label: string): string | undefined {
  const value = raw.trim();
  if (value === '') return `${label} is required.`;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return `${label} must be a number.`;
  if (parsed < 0) return `${label} cannot be negative.`;
  if (!Number.isInteger(parsed)) return `${label} must be a whole number.`;
  if (parsed > MAX_COUNT) return `${label} is too large.`;
  return undefined;
}

export function validateShiftForm(values: ShiftFormValues, options: ShiftOptions): ShiftFormErrors {
  const errors: ShiftFormErrors = {};

  if (!values.workDate) errors.workDate = 'Work date is required.';
  else if (!isValidCalendarDate(values.workDate)) errors.workDate = 'Enter a valid date.';

  const start = values.shiftStart ? timeToSeconds(values.shiftStart) : null;
  const end = values.shiftEnd ? timeToSeconds(values.shiftEnd) : null;
  if (!values.shiftStart) errors.shiftStart = 'Shift start is required.';
  else if (start === null) errors.shiftStart = 'Enter a valid start time.';
  if (!values.shiftEnd) errors.shiftEnd = 'Shift end is required.';
  else if (end === null) errors.shiftEnd = 'Enter a valid end time.';
  else if (start !== null && end <= start) errors.shiftEnd = 'Shift end must be later than shift start (overnight shifts are not supported).';

  const labour = validateCount(values.labourCount, 'Labour count');
  if (labour) errors.labourCount = labour;
  const unloading = validateCount(values.unloadingTotal, 'Unloading total');
  if (unloading) errors.unloadingTotal = unloading;
  const loading = validateCount(values.loadingTotal, 'Loading total');
  if (loading) errors.loadingTotal = loading;

  const knownWarehouses = new Set(options.warehouses.map((option) => option.code));
  if (values.warehouseCodes.length === 0) errors.warehouses = 'Select at least one warehouse.';
  else if (values.warehouseCodes.some((code) => !knownWarehouses.has(code))) errors.warehouses = 'Select warehouses from the list.';

  const knownTruckTypes = new Set(options.truckTypes.map((option) => option.code));
  if (values.truckTypeCodes.some((code) => !knownTruckTypes.has(code))) errors.truckTypes = 'Select truck types from the list.';

  return errors;
}

export function hasErrors(errors: ShiftFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

export interface CreateShiftEntryBody {
  work_date: string;
  shift_start: string;
  shift_end: string;
  labour_count: number;
  unloading_total: number;
  loading_total: number;
  warehouses: Array<{ warehouse_code: string }>;
  truck_types: string[];
}

/** Builds the request body. Never includes an employee id: the server derives it from the session. */
export function buildCreateRequest(values: ShiftFormValues): CreateShiftEntryBody {
  return {
    work_date: values.workDate,
    shift_start: values.shiftStart,
    shift_end: values.shiftEnd,
    labour_count: Number(values.labourCount),
    unloading_total: Number(values.unloadingTotal),
    loading_total: Number(values.loadingTotal),
    warehouses: values.warehouseCodes.map((warehouse_code) => ({ warehouse_code })),
    truck_types: [...values.truckTypeCodes],
  };
}

// ---------------------------------------------------------------------------
// API error interpretation
// ---------------------------------------------------------------------------

export interface ApiErrorLike {
  status?: number;
  code?: string;
  message?: string;
  validationErrors?: Array<{ field?: string; code?: string; message: string }>;
}

export type ShiftErrorKind = 'validation' | 'duplicate' | 'unauthorized' | 'forbidden' | 'profile' | 'server' | 'network';

export interface ShiftErrorView {
  kind: ShiftErrorKind;
  title: string;
  message: string;
  fieldErrors: ShiftFormErrors;
}

const FIELD_MAP: Record<string, ShiftFormField> = {
  work_date: 'workDate',
  shift_start: 'shiftStart',
  shift_end: 'shiftEnd',
  labour_count: 'labourCount',
  unloading_total: 'unloadingTotal',
  loading_total: 'loadingTotal',
  warehouses: 'warehouses',
  truck_types: 'truckTypes',
  warehouse_code: 'warehouses',
  warehouse_name: 'warehouses',
  truck_type: 'truckTypes',
};

export function formFieldForApiField(field: string | undefined): ShiftFormField | undefined {
  if (!field) return undefined;
  const root = field.split('.')[0] ?? '';
  return FIELD_MAP[root];
}

/** Translates any thrown value into something the screens can show. */
export function describeShiftError(error: unknown): ShiftErrorView {
  const candidate = (typeof error === 'object' && error !== null ? error : {}) as ApiErrorLike;
  const status = candidate.status;

  if (status === undefined) {
    return { kind: 'network', title: 'Could not reach the server', message: 'Check your connection and try again. Nothing was saved.', fieldErrors: {} };
  }
  if (status === 401) {
    return { kind: 'unauthorized', title: 'Session expired', message: 'Your session is no longer valid. Please sign in again.', fieldErrors: {} };
  }
  if (status === 403) {
    if (candidate.code === 'EMPLOYEE_PROFILE_REQUIRED') {
      return { kind: 'profile', title: 'No employee profile', message: 'Your account is not linked to an active employee profile, so shifts cannot be recorded. Contact an administrator.', fieldErrors: {} };
    }
    return { kind: 'forbidden', title: 'Not permitted', message: 'You do not have permission to do this.', fieldErrors: {} };
  }
  if (status === 409) {
    return { kind: 'duplicate', title: 'Shift already recorded', message: candidate.message || 'A shift entry already exists for this work date.', fieldErrors: { workDate: 'A shift is already recorded for this date.' } };
  }
  if (status === 400) {
    const fieldErrors: ShiftFormErrors = {};
    for (const issue of candidate.validationErrors ?? []) {
      const field = formFieldForApiField(issue.field);
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { kind: 'validation', title: 'Check the highlighted fields', message: candidate.message || 'The server rejected the submitted values.', fieldErrors };
  }
  return { kind: 'server', title: 'Something went wrong', message: 'The request could not be completed. Try again shortly.', fieldErrors: {} };
}

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const numOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

function mapOption(raw: unknown): ShiftOption {
  const item = (raw ?? {}) as Json;
  return { id: str(item.id), code: str(item.code), name: str(item.name) };
}

export function mapShiftOptionsDto(raw: unknown): ShiftOptions {
  const dto = (raw ?? {}) as Json;
  return {
    warehouses: Array.isArray(dto.warehouses) ? dto.warehouses.map(mapOption) : [],
    truckTypes: Array.isArray(dto.truck_types) ? dto.truck_types.map(mapOption) : [],
  };
}

export function mapShiftEntryDto(raw: unknown): ShiftEntryRecord {
  const dto = (raw ?? {}) as Json;
  const shiftStart = str(dto.shift_start);
  const shiftEnd = str(dto.shift_end);
  const start = timeToSeconds(shiftStart);
  const end = timeToSeconds(shiftEnd);
  const loadingTotal = num(dto.loading_total);
  const unloadingTotal = num(dto.unloading_total);
  return {
    id: str(dto.id),
    employeeId: str(dto.employee_id),
    workDate: str(dto.work_date),
    shiftStart,
    shiftEnd,
    labourCount: num(dto.labour_count),
    unloadingTotal,
    loadingTotal,
    totalBoxes: loadingTotal + unloadingTotal,
    durationSeconds: start !== null && end !== null && end > start ? end - start : 0,
    warehouses: Array.isArray(dto.warehouses) ? dto.warehouses.map(mapOption) : [],
    truckTypes: Array.isArray(dto.truck_types) ? dto.truck_types.map(mapOption) : [],
    createdAt: str(dto.created_at),
  };
}

export function mapKpiMetricsDto(raw: unknown): ShiftKpiMetrics {
  const dto = (raw ?? {}) as Json;
  return {
    shiftCount: num(dto.shift_count),
    totalUnloading: num(dto.total_unloading),
    totalLoading: num(dto.total_loading),
    totalBoxes: num(dto.total_boxes),
    averageBoxesPerShift: numOrNull(dto.average_boxes_per_shift),
    totalLabour: num(dto.total_labour_count),
    averageLabour: numOrNull(dto.average_labour_count),
    totalDurationSeconds: num(dto.total_shift_duration_seconds),
    averageDurationSeconds: numOrNull(dto.average_shift_duration_seconds),
    loadingProductivity: numOrNull(dto.loading_productivity_boxes_per_hour),
    unloadingProductivity: numOrNull(dto.unloading_productivity_boxes_per_hour),
    warehouseAssociations: num(dto.warehouse_associations),
    distinctWarehouses: num(dto.distinct_warehouses),
  };
}

// ---------------------------------------------------------------------------
// Dates / periods
// ---------------------------------------------------------------------------

export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The user's local calendar date. The operational timezone is not yet defined by the business rules. */
export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

export const HISTORY_PRESETS = ['last7', 'last30', 'thisMonth', 'all'] as const;
export type HistoryPreset = (typeof HISTORY_PRESETS)[number];

export const HISTORY_PRESET_LABELS: Record<HistoryPreset, string> = {
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  thisMonth: 'This month',
  all: 'All time',
};

export function rangeForPreset(preset: HistoryPreset, today: string = todayIso()): ShiftSummaryQuery {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  if (preset === 'all') return {};
  if (preset === 'thisMonth') return { from: toIsoDate(new Date(year, month - 1, 1)), to: today };
  const back = preset === 'last7' ? 6 : 29;
  return { from: toIsoDate(new Date(year, month - 1, day - back)), to: today };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function formatCount(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('en-US');
}

export function formatDecimal(value: number | null, fractionDigits = 2): string {
  return value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: fractionDigits });
}

export function formatBoxes(value: number | null): string {
  return value === null ? '—' : `${formatCount(value)} BOX`;
}

export function formatRate(value: number | null): string {
  return value === null ? 'Not calculable' : `${formatDecimal(value)} BOX/h`;
}

export function formatTimeRange(start: string, end: string): string {
  return `${start.slice(0, 5)} – ${end.slice(0, 5)}`;
}
