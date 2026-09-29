import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { createApiShiftGateway, createMockShiftGateway, summarizeEntries } from './shift-gateway';
import { buildCreateRequest, type ShiftEntryRecord, type ShiftFormValues } from './shift-data';

const dto = {
  id: 'e1', employee_id: 'emp', work_date: '2026-09-28', shift_start: '08:00:00', shift_end: '16:00:00',
  labour_count: 4, unloading_total: 100, loading_total: 200,
  warehouses: [{ id: 'w1', code: 'DEP-01', name: 'Main Depot' }], truck_types: [], created_at: '2026-09-28T17:00:00.000Z',
};

const form: ShiftFormValues = { workDate: '2026-09-28', shiftStart: '08:00', shiftEnd: '16:00', labourCount: '4', unloadingTotal: '100', loadingTotal: '200', warehouseCodes: ['DEP-01'], truckTypeCodes: [] };

describe('API shift gateway', () => {
  it('loads selectable warehouses and truck types', async () => {
    const request = vi.fn().mockResolvedValue({ data: { warehouses: [{ id: 'w1', code: 'DEP-01', name: 'Main Depot' }], truck_types: [{ id: 't1', code: '32FT', name: '32ft' }] } });
    const options = await createApiShiftGateway(request).getOptions();
    expect(request).toHaveBeenCalledWith('/shift-entries/options');
    expect(options).toEqual({ warehouses: [{ id: 'w1', code: 'DEP-01', name: 'Main Depot' }], truckTypes: [{ id: 't1', code: '32FT', name: '32ft' }] });
  });

  it('POSTs the create body as JSON and maps the created entry', async () => {
    const request = vi.fn().mockResolvedValue({ success: true, data: dto });
    const entry = await createApiShiftGateway(request).createEntry(buildCreateRequest(form));
    const [path, init] = request.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/shift-entries');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({ work_date: '2026-09-28', labour_count: 4, warehouses: [{ warehouse_code: 'DEP-01' }] });
    expect(JSON.parse(init.body as string)).not.toHaveProperty('employee_id');
    expect(entry).toMatchObject({ id: 'e1', totalBoxes: 300, durationSeconds: 28800 });
  });

  it('lists the caller\'s entries with pagination and date filters, omitting empty params', async () => {
    const request = vi.fn().mockResolvedValue({ data: [dto], meta: { page: 2, pageSize: 10, total: 11, totalPages: 2 } });
    const page = await createApiShiftGateway(request).listMine({ page: 2, pageSize: 10, from: '2026-09-01' });
    expect(request).toHaveBeenCalledWith('/shift-entries/me?page=2&pageSize=10&from=2026-09-01');
    expect(page).toMatchObject({ page: 2, pageSize: 10, total: 11, totalPages: 2 });
    expect(page.items).toHaveLength(1);
  });

  it('returns an empty page unchanged', async () => {
    const request = vi.fn().mockResolvedValue({ data: [], meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 } });
    await expect(createApiShiftGateway(request).listMine({ page: 1, pageSize: 10 })).resolves.toEqual({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 });
  });

  it('reads the personal KPI summary metrics', async () => {
    const request = vi.fn().mockResolvedValue({ data: { source: 'SHIFT_ENTRY', metrics: { shift_count: 2, total_boxes: 500, average_boxes_per_shift: 250 } } });
    const metrics = await createApiShiftGateway(request).getMySummary({ from: '2026-09-01', to: '2026-09-05' });
    expect(request).toHaveBeenCalledWith('/kpi/me/summary?from=2026-09-01&to=2026-09-05');
    expect(metrics).toMatchObject({ shiftCount: 2, totalBoxes: 500, averageBoxesPerShift: 250 });
  });

  it('propagates API errors untouched (no mock fallback)', async () => {
    const failure = new ApiError(403, { code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'no profile' });
    const request = vi.fn().mockRejectedValue(failure);
    await expect(createApiShiftGateway(request).getMySummary({})).rejects.toBe(failure);
    await expect(createApiShiftGateway(request).createEntry(buildCreateRequest(form))).rejects.toBe(failure);
  });
});

describe('summarizeEntries (preview mode; mirrors the backend formulas)', () => {
  const entry = (workDate: string, start: number, end: number, labour: number, unloading: number, loading: number, warehouseIds: string[]): ShiftEntryRecord => ({
    id: workDate, employeeId: 'e', workDate, shiftStart: '', shiftEnd: '', labourCount: labour, unloadingTotal: unloading, loadingTotal: loading,
    totalBoxes: unloading + loading, durationSeconds: end - start, warehouses: warehouseIds.map((id) => ({ id, code: id, name: id })), truckTypes: [], createdAt: '',
  });

  it('matches the documented backend example (3 shifts: 8h, 4h, 8.5h)', () => {
    const metrics = summarizeEntries([
      entry('2026-09-01', 0, 28800, 4, 100, 200, ['a']),
      entry('2026-09-02', 0, 14400, 6, 50, 150, ['a', 'b']),
      entry('2026-09-10', 0, 30600, 5, 0, 0, ['b']),
    ]);
    expect(metrics).toMatchObject({
      shiftCount: 3, totalUnloading: 150, totalLoading: 350, totalBoxes: 500, averageBoxesPerShift: 166.67, totalLabour: 15, averageLabour: 5,
      totalDurationSeconds: 73800, averageDurationSeconds: 24600, loadingProductivity: 17.07, unloadingProductivity: 7.32, warehouseAssociations: 4, distinctWarehouses: 2,
    });
  });

  it('gives zero totals and null ratios for no shifts', () => {
    const metrics = summarizeEntries([]);
    expect(metrics).toMatchObject({ shiftCount: 0, totalBoxes: 0, totalDurationSeconds: 0, averageBoxesPerShift: null, averageLabour: null, averageDurationSeconds: null, loadingProductivity: null, unloadingProductivity: null });
  });
});

describe('preview shift gateway', () => {
  it('creates an entry, lists it newest first, and summarizes it', async () => {
    const gateway = createMockShiftGateway();
    await gateway.createEntry(buildCreateRequest(form));
    await gateway.createEntry(buildCreateRequest({ ...form, workDate: '2026-09-29', warehouseCodes: ['DEP-01', 'DEP-02'], truckTypeCodes: ['32FT'] }));
    const page = await gateway.listMine({ page: 1, pageSize: 10 });
    expect(page.items.map((item) => item.workDate)).toEqual(['2026-09-29', '2026-09-28']);
    expect(page.items[0]?.warehouses).toHaveLength(2);
    expect(page.items[0]?.truckTypes[0]?.code).toBe('32FT');
    expect((await gateway.getMySummary({})).shiftCount).toBe(2);
    expect((await gateway.getMySummary({ from: '2026-09-29', to: '2026-09-29' })).shiftCount).toBe(1);
    expect((await gateway.listMine({ page: 1, pageSize: 1 })).totalPages).toBe(2);
  });

  it('rejects a second entry for the same date like the server does', async () => {
    const gateway = createMockShiftGateway();
    await gateway.createEntry(buildCreateRequest(form));
    await expect(gateway.createEntry(buildCreateRequest(form))).rejects.toMatchObject({ status: 409, code: 'SHIFT_ENTRY_DUPLICATE' });
  });

  it('offers warehouse and truck type options', async () => {
    const options = await createMockShiftGateway().getOptions();
    expect(options.warehouses.length).toBeGreaterThan(0);
    expect(options.truckTypes.map((option) => option.code)).toEqual(['32FT', 'CROSSING', 'OTHER']);
  });
});
