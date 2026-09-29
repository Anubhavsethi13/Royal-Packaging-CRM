import { apiRequest, ApiError } from '../api/client';
import {
  mapKpiMetricsDto,
  mapShiftEntryDto,
  mapShiftOptionsDto,
  timeToSeconds,
  type CreateShiftEntryBody,
  type ShiftEntryRecord,
  type ShiftKpiMetrics,
  type ShiftListQuery,
  type ShiftOptions,
  type ShiftPage,
  type ShiftSummaryQuery,
} from './shift-data';

/** Data access for the shift screens. The API implementation talks to the backend; the mock one keeps preview mode usable offline. */
export interface ShiftGateway {
  getOptions(): Promise<ShiftOptions>;
  createEntry(body: CreateShiftEntryBody): Promise<ShiftEntryRecord>;
  listMine(query: ShiftListQuery): Promise<ShiftPage>;
  getMySummary(query: ShiftSummaryQuery): Promise<ShiftKpiMetrics>;
}

type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;

interface Envelope<T> { data: T }
interface ListEnvelope { data: unknown[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }

export function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function createApiShiftGateway(request: RequestFn = apiRequest): ShiftGateway {
  return {
    async getOptions() {
      const response = await request<Envelope<unknown>>('/shift-entries/options');
      return mapShiftOptionsDto(response.data);
    },
    async createEntry(body) {
      const response = await request<Envelope<unknown>>('/shift-entries', { method: 'POST', body: JSON.stringify(body) });
      return mapShiftEntryDto(response.data);
    },
    async listMine(query) {
      const response = await request<ListEnvelope>(withQuery('/shift-entries/me', { page: query.page, pageSize: query.pageSize, from: query.from, to: query.to }));
      return {
        items: response.data.map(mapShiftEntryDto),
        page: response.meta.page,
        pageSize: response.meta.pageSize,
        total: response.meta.total,
        totalPages: response.meta.totalPages,
      };
    },
    async getMySummary(query) {
      const response = await request<Envelope<{ metrics: unknown }>>(withQuery('/kpi/me/summary', { from: query.from, to: query.to }));
      return mapKpiMetricsDto(response.data.metrics);
    },
  };
}

// ---------------------------------------------------------------------------
// Preview-mode gateway (in memory). Its summary mirrors the backend formulas, but the backend stays the source of truth.
// ---------------------------------------------------------------------------

/** numerator / denominator rounded half-up to 2 decimals with exact integer arithmetic (mirrors the backend). */
function ratio2(numerator: number, denominator: number): number {
  const num = BigInt(Math.round(numerator));
  const den = BigInt(Math.round(denominator));
  return Number((num * 200n + den) / (2n * den)) / 100;
}

export function summarizeEntries(entries: ShiftEntryRecord[]): ShiftKpiMetrics {
  const shiftCount = entries.length;
  const totalLoading = entries.reduce((sum, entry) => sum + entry.loadingTotal, 0);
  const totalUnloading = entries.reduce((sum, entry) => sum + entry.unloadingTotal, 0);
  const totalLabour = entries.reduce((sum, entry) => sum + entry.labourCount, 0);
  const totalDurationSeconds = entries.reduce((sum, entry) => sum + entry.durationSeconds, 0);
  const totalBoxes = totalLoading + totalUnloading;
  const links = entries.flatMap((entry) => entry.warehouses.map((warehouse) => warehouse.id));
  return {
    shiftCount,
    totalUnloading,
    totalLoading,
    totalBoxes,
    averageBoxesPerShift: shiftCount ? ratio2(totalBoxes, shiftCount) : null,
    totalLabour,
    averageLabour: shiftCount ? ratio2(totalLabour, shiftCount) : null,
    totalDurationSeconds,
    averageDurationSeconds: shiftCount ? ratio2(totalDurationSeconds, shiftCount) : null,
    loadingProductivity: totalDurationSeconds > 0 ? ratio2(totalLoading * 3600, totalDurationSeconds) : null,
    unloadingProductivity: totalDurationSeconds > 0 ? ratio2(totalUnloading * 3600, totalDurationSeconds) : null,
    warehouseAssociations: links.length,
    distinctWarehouses: new Set(links).size,
  };
}

const MOCK_OPTIONS: ShiftOptions = {
  warehouses: [
    { id: 'mock-wh-1', code: 'DEP-01', name: 'Main Depot' },
    { id: 'mock-wh-2', code: 'DEP-02', name: 'Annex Depot' },
  ],
  truckTypes: [
    { id: 'mock-tt-1', code: '32FT', name: '32ft' },
    { id: 'mock-tt-2', code: 'CROSSING', name: 'Crossing' },
    { id: 'mock-tt-3', code: 'OTHER', name: 'Other' },
  ],
};

function inRange(date: string, query: ShiftSummaryQuery): boolean {
  return (!query.from || date >= query.from) && (!query.to || date <= query.to);
}

export function createMockShiftGateway(seed: ShiftEntryRecord[] = []): ShiftGateway {
  const entries: ShiftEntryRecord[] = structuredClone(seed);
  return {
    async getOptions() {
      return structuredClone(MOCK_OPTIONS);
    },
    async createEntry(body) {
      if (entries.some((entry) => entry.workDate === body.work_date)) {
        throw new ApiError(409, { code: 'SHIFT_ENTRY_DUPLICATE', message: `A shift entry already exists for work_date '${body.work_date}'.` });
      }
      const start = timeToSeconds(body.shift_start) ?? 0;
      const end = timeToSeconds(body.shift_end) ?? 0;
      const record: ShiftEntryRecord = {
        id: `mock-shift-${entries.length + 1}`,
        employeeId: 'mock-employee',
        workDate: body.work_date,
        shiftStart: body.shift_start.length === 5 ? `${body.shift_start}:00` : body.shift_start,
        shiftEnd: body.shift_end.length === 5 ? `${body.shift_end}:00` : body.shift_end,
        labourCount: body.labour_count,
        unloadingTotal: body.unloading_total,
        loadingTotal: body.loading_total,
        totalBoxes: body.loading_total + body.unloading_total,
        durationSeconds: end > start ? end - start : 0,
        warehouses: MOCK_OPTIONS.warehouses.filter((option) => body.warehouses.some((warehouse) => warehouse.warehouse_code === option.code)),
        truckTypes: MOCK_OPTIONS.truckTypes.filter((option) => body.truck_types.includes(option.code)),
        createdAt: new Date().toISOString(),
      };
      entries.push(record);
      return structuredClone(record);
    },
    async listMine(query) {
      const matching = entries.filter((entry) => inRange(entry.workDate, query)).sort((a, b) => b.workDate.localeCompare(a.workDate));
      const totalPages = Math.ceil(matching.length / query.pageSize);
      const start = (query.page - 1) * query.pageSize;
      return { items: structuredClone(matching.slice(start, start + query.pageSize)), page: query.page, pageSize: query.pageSize, total: matching.length, totalPages };
    },
    async getMySummary(query) {
      return summarizeEntries(entries.filter((entry) => inRange(entry.workDate, query)));
    },
  };
}
