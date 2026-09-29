import { describe, expect, it } from 'vitest';
import {
  buildCreateRequest,
  describeShiftError,
  emptyShiftForm,
  formatDuration,
  formatRate,
  formatTimeRange,
  hasErrors,
  isValidCalendarDate,
  mapKpiMetricsDto,
  mapShiftEntryDto,
  mapShiftOptionsDto,
  rangeForPreset,
  timeToSeconds,
  todayIso,
  validateShiftForm,
  type ShiftFormValues,
  type ShiftOptions,
} from './shift-data';

const options: ShiftOptions = {
  warehouses: [{ id: 'w1', code: 'DEP-01', name: 'Main Depot' }, { id: 'w2', code: 'DEP-02', name: 'Annex Depot' }],
  truckTypes: [{ id: 't1', code: '32FT', name: '32ft' }, { id: 't2', code: 'OTHER', name: 'Other' }],
};

const valid: ShiftFormValues = {
  workDate: '2026-09-28',
  shiftStart: '08:00',
  shiftEnd: '16:30',
  labourCount: '6',
  unloadingTotal: '120',
  loadingTotal: '340',
  warehouseCodes: ['DEP-01'],
  truckTypeCodes: ['32FT'],
};

describe('shift form validation', () => {
  it('accepts a valid form', () => {
    expect(validateShiftForm(valid, options)).toEqual({});
    expect(hasErrors(validateShiftForm(valid, options))).toBe(false);
  });

  it('accepts zero counts and an empty truck type selection', () => {
    expect(validateShiftForm({ ...valid, labourCount: '0', unloadingTotal: '0', loadingTotal: '0', truckTypeCodes: [] }, options)).toEqual({});
  });

  it('reports every missing required field', () => {
    const errors = validateShiftForm({ ...emptyShiftForm(''), workDate: '' }, options);
    expect(Object.keys(errors).sort()).toEqual(['labourCount', 'loadingTotal', 'shiftEnd', 'shiftStart', 'unloadingTotal', 'warehouses', 'workDate']);
    expect(errors.workDate).toBe('Work date is required.');
    expect(errors.warehouses).toBe('Select at least one warehouse.');
  });

  it('rejects impossible calendar dates', () => {
    expect(validateShiftForm({ ...valid, workDate: '2026-02-30' }, options).workDate).toBe('Enter a valid date.');
    expect(isValidCalendarDate('2028-02-29')).toBe(true);
    expect(isValidCalendarDate('2027-02-29')).toBe(false);
  });

  it('rejects negative, fractional, and non-numeric counts with clear messages', () => {
    const errors = validateShiftForm({ ...valid, labourCount: '-1', unloadingTotal: '2.5', loadingTotal: 'abc' }, options);
    expect(errors.labourCount).toBe('Labour count cannot be negative.');
    expect(errors.unloadingTotal).toBe('Unloading total must be a whole number.');
    expect(errors.loadingTotal).toBe('Loading total must be a number.');
  });

  it('rejects counts beyond the backend integer range', () => {
    expect(validateShiftForm({ ...valid, loadingTotal: '2147483648' }, options).loadingTotal).toBe('Loading total is too large.');
    expect(validateShiftForm({ ...valid, loadingTotal: '2147483647' }, options).loadingTotal).toBeUndefined();
  });

  it('requires shift end to be later than shift start', () => {
    expect(validateShiftForm({ ...valid, shiftStart: '16:00', shiftEnd: '08:00' }, options).shiftEnd).toContain('later than shift start');
    expect(validateShiftForm({ ...valid, shiftStart: '08:00', shiftEnd: '08:00' }, options).shiftEnd).toContain('later than shift start');
    expect(validateShiftForm({ ...valid, shiftStart: '08:00', shiftEnd: '08:01' }, options).shiftEnd).toBeUndefined();
  });

  it('rejects malformed times', () => {
    expect(validateShiftForm({ ...valid, shiftStart: '25:00' }, options).shiftStart).toBe('Enter a valid start time.');
    expect(validateShiftForm({ ...valid, shiftEnd: 'noon' }, options).shiftEnd).toBe('Enter a valid end time.');
    expect(timeToSeconds('08:30')).toBe(30600);
    expect(timeToSeconds('08:30:15')).toBe(30615);
    expect(timeToSeconds('24:00')).toBeNull();
  });

  it('requires at least one warehouse and only known warehouse and truck type codes', () => {
    expect(validateShiftForm({ ...valid, warehouseCodes: [] }, options).warehouses).toBe('Select at least one warehouse.');
    expect(validateShiftForm({ ...valid, warehouseCodes: ['NOPE'] }, options).warehouses).toBe('Select warehouses from the list.');
    expect(validateShiftForm({ ...valid, truckTypeCodes: ['BOGUS'] }, options).truckTypes).toBe('Select truck types from the list.');
  });
});

describe('create request', () => {
  it('maps the form to the backend contract and never carries an employee id', () => {
    const body = buildCreateRequest({ ...valid, warehouseCodes: ['DEP-01', 'DEP-02'], truckTypeCodes: ['32FT', 'OTHER'] });
    expect(body).toEqual({
      work_date: '2026-09-28',
      shift_start: '08:00',
      shift_end: '16:30',
      labour_count: 6,
      unloading_total: 120,
      loading_total: 340,
      warehouses: [{ warehouse_code: 'DEP-01' }, { warehouse_code: 'DEP-02' }],
      truck_types: ['32FT', 'OTHER'],
    });
    expect(Object.keys(body)).not.toContain('employee_id');
  });
});

describe('API error interpretation', () => {
  it('maps backend validation issues to form fields (including indexed paths)', () => {
    const view = describeShiftError({
      status: 400,
      code: 'INVALID_WAREHOUSE',
      message: "Warehouse 'X' does not exist or is inactive.",
      validationErrors: [
        { field: 'warehouses.0.warehouse_code', code: 'invalid_warehouse', message: "Warehouse 'X' does not exist or is inactive." },
        { field: 'shift_end', code: 'custom', message: 'shift_end must be later than shift_start' },
        { field: 'truck_types.1', code: 'invalid_truck_type', message: "Truck type 'Z' does not exist." },
        { field: 'labour_count', code: 'too_small', message: 'labour_count cannot be negative' },
      ],
    });
    expect(view.kind).toBe('validation');
    expect(view.fieldErrors).toEqual({
      warehouses: "Warehouse 'X' does not exist or is inactive.",
      shiftEnd: 'shift_end must be later than shift_start',
      truckTypes: "Truck type 'Z' does not exist.",
      labourCount: 'labour_count cannot be negative',
    });
  });

  it('keeps unmapped validation messages visible at form level', () => {
    const view = describeShiftError({ status: 400, message: 'Unrecognized key: "employee_id"', validationErrors: [{ field: '', code: 'unrecognized_keys', message: 'Unrecognized key: "employee_id"' }] });
    expect(view.fieldErrors).toEqual({});
    expect(view.message).toContain('employee_id');
  });

  it('classifies duplicate, unauthorized, forbidden, profile, server, and network failures', () => {
    expect(describeShiftError({ status: 409, code: 'SHIFT_ENTRY_DUPLICATE', message: 'exists' })).toMatchObject({ kind: 'duplicate', fieldErrors: { workDate: expect.any(String) } });
    expect(describeShiftError({ status: 401 }).kind).toBe('unauthorized');
    expect(describeShiftError({ status: 403, code: 'FORBIDDEN' }).kind).toBe('forbidden');
    expect(describeShiftError({ status: 403, code: 'EMPLOYEE_PROFILE_REQUIRED' }).kind).toBe('profile');
    expect(describeShiftError({ status: 500 }).kind).toBe('server');
    expect(describeShiftError(new TypeError('Failed to fetch')).kind).toBe('network');
    expect(describeShiftError(undefined).kind).toBe('network');
  });

  it('never shows raw server internals for 5xx errors', () => {
    expect(describeShiftError({ status: 500, message: 'SELECT * FROM secret_table failed' }).message).not.toContain('secret_table');
  });
});

describe('DTO mapping', () => {
  it('maps a shift entry, deriving total boxes and duration for display', () => {
    const entry = mapShiftEntryDto({
      id: 'e1', employee_id: 'emp', work_date: '2026-09-28', shift_start: '08:00:00', shift_end: '16:30:00',
      labour_count: 6, unloading_total: 120, loading_total: 340,
      warehouses: [{ id: 'w1', code: 'DEP-01', name: 'Main Depot' }], truck_types: [{ id: 't1', code: '32FT', name: '32ft' }],
      created_at: '2026-09-28T17:00:00.000Z',
    });
    expect(entry).toMatchObject({ id: 'e1', workDate: '2026-09-28', totalBoxes: 460, durationSeconds: 30600, labourCount: 6 });
    expect(entry.warehouses[0]).toEqual({ id: 'w1', code: 'DEP-01', name: 'Main Depot' });
    expect(entry.truckTypes[0]?.code).toBe('32FT');
  });

  it('tolerates missing fields without throwing', () => {
    expect(mapShiftEntryDto(undefined)).toMatchObject({ id: '', totalBoxes: 0, durationSeconds: 0, warehouses: [], truckTypes: [] });
    expect(mapShiftOptionsDto(null)).toEqual({ warehouses: [], truckTypes: [] });
  });

  it('keeps null ratios null instead of turning them into zero', () => {
    const metrics = mapKpiMetricsDto({ shift_count: 0, total_boxes: 0, average_boxes_per_shift: null, average_labour_count: null, average_shift_duration_seconds: null, loading_productivity_boxes_per_hour: null, unloading_productivity_boxes_per_hour: null });
    expect(metrics.averageBoxesPerShift).toBeNull();
    expect(metrics.averageLabour).toBeNull();
    expect(metrics.averageDurationSeconds).toBeNull();
    expect(metrics.loadingProductivity).toBeNull();
    expect(metrics.shiftCount).toBe(0);
  });

  it('maps populated metrics', () => {
    const metrics = mapKpiMetricsDto({ shift_count: 3, total_unloading: 150, total_loading: 350, total_boxes: 500, average_boxes_per_shift: 166.67, total_labour_count: 15, average_labour_count: 5, total_shift_duration_seconds: 73800, average_shift_duration_seconds: 24600, loading_productivity_boxes_per_hour: 17.07, unloading_productivity_boxes_per_hour: 7.32, warehouse_associations: 4, distinct_warehouses: 2 });
    expect(metrics).toMatchObject({ shiftCount: 3, totalBoxes: 500, averageBoxesPerShift: 166.67, totalLabour: 15, averageLabour: 5, totalDurationSeconds: 73800, loadingProductivity: 17.07, warehouseAssociations: 4 });
  });
});

describe('periods and formatting', () => {
  it('computes local-date ranges for the history presets', () => {
    expect(todayIso(new Date(2026, 8, 28))).toBe('2026-09-28');
    expect(rangeForPreset('last7', '2026-09-28')).toEqual({ from: '2026-09-22', to: '2026-09-28' });
    expect(rangeForPreset('last30', '2026-09-28')).toEqual({ from: '2026-08-30', to: '2026-09-28' });
    expect(rangeForPreset('thisMonth', '2026-09-28')).toEqual({ from: '2026-09-01', to: '2026-09-28' });
    expect(rangeForPreset('all', '2026-09-28')).toEqual({});
    expect(rangeForPreset('last7', '2026-01-03')).toEqual({ from: '2025-12-28', to: '2026-01-03' });
  });

  it('formats durations, rates, and time ranges', () => {
    expect(formatDuration(30600)).toBe('8h 30m');
    expect(formatDuration(28800)).toBe('8h');
    expect(formatDuration(1500)).toBe('25m');
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(null)).toBe('—');
    expect(formatRate(17.07)).toBe('17.07 BOX/h');
    expect(formatRate(null)).toBe('Not calculable');
    expect(formatTimeRange('08:00:00', '16:30:00')).toBe('08:00 – 16:30');
  });
});
