import { apiRequest, ApiError } from '../api/client';
import { withQuery } from '../shifts/shift-gateway';
import {
  mapDailyReportDto,
  mapDailyReportOptionsDto,
  previewFigures,
  type DailyReportBody,
  type DailyReportListQuery,
  type DailyReportOptions,
  type DailyReportPage,
  type DailyReportRecord,
} from './daily-report-data';

/** Data access for daily depot reports: the API implementation talks to the backend, the mock one keeps preview mode usable. */
export interface DailyReportGateway {
  getOptions(): Promise<DailyReportOptions>;
  list(query: DailyReportListQuery): Promise<DailyReportPage>;
  get(id: string): Promise<DailyReportRecord>;
  create(body: DailyReportBody): Promise<DailyReportRecord>;
  update(id: string, version: string, body: DailyReportBody): Promise<DailyReportRecord>;
  submit(id: string, version: string): Promise<DailyReportRecord>;
}

type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;
interface Envelope<T> { data: T }
interface ListEnvelope { data: unknown[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }

export function createApiDailyReportGateway(request: RequestFn = apiRequest): DailyReportGateway {
  return {
    async getOptions() {
      return mapDailyReportOptionsDto((await request<Envelope<unknown>>('/daily-reports/options')).data);
    },
    async list(query) {
      const response = await request<ListEnvelope>(withQuery('/daily-reports', { page: query.page, pageSize: query.pageSize, depot_id: query.depotId, from: query.from, to: query.to, status: query.status }));
      return { items: response.data.map(mapDailyReportDto), page: response.meta.page, pageSize: response.meta.pageSize, total: response.meta.total, totalPages: response.meta.totalPages };
    },
    async get(id) {
      return mapDailyReportDto((await request<Envelope<unknown>>(`/daily-reports/${encodeURIComponent(id)}`)).data);
    },
    async create(body) {
      return mapDailyReportDto((await request<Envelope<unknown>>('/daily-reports', { method: 'POST', body: JSON.stringify(body) })).data);
    },
    async update(id, version, body) {
      // Depot and date identify the report and cannot change; only operational fields are sent.
      const changes = { loading_count: body.loading_count, unloading_count: body.unloading_count, start_time: body.start_time, end_time: body.end_time, labour_required: body.labour_required, labour_present: body.labour_present, vehicles: body.vehicles };
      return mapDailyReportDto((await request<Envelope<unknown>>(`/daily-reports/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ version, ...changes }) })).data);
    },
    async submit(id, version) {
      return mapDailyReportDto((await request<Envelope<unknown>>(`/daily-reports/${encodeURIComponent(id)}/submit`, { method: 'POST', body: JSON.stringify({ version }) })).data);
    },
  };
}

// ---------------------------------------------------------------------------
// Preview-mode gateway (in memory). Mirrors the server rules; the server stays the source of truth.
// ---------------------------------------------------------------------------

const MOCK_OPTIONS: DailyReportOptions = {
  depots: [{ id: 'mock-dep-04', code: 'DEP-04', name: 'Depot Four (preview)' }],
  truckTypes: [
    { id: 'mock-tt-1', code: '32FT', name: '32ft' },
    { id: 'mock-tt-2', code: 'CROSSING', name: 'Crossing' },
    { id: 'mock-tt-3', code: 'OTHER', name: 'Other' },
  ],
};

const withSeconds = (value: string | null): string | null => (value && value.length === 5 ? `${value}:00` : value);

export function createMockDailyReportGateway(seed: DailyReportRecord[] = []): DailyReportGateway {
  const reports: DailyReportRecord[] = structuredClone(seed);
  const find = (id: string): DailyReportRecord => {
    const report = reports.find((item) => item.id === id);
    if (!report) throw new ApiError(404, { code: 'DAILY_REPORT_NOT_FOUND', message: 'Daily report not found.' });
    return report;
  };
  const apply = (report: DailyReportRecord, body: DailyReportBody): void => {
    report.loadingCount = body.loading_count;
    report.unloadingCount = body.unloading_count;
    report.startTime = withSeconds(body.start_time);
    report.endTime = withSeconds(body.end_time);
    report.labourRequired = body.labour_required;
    report.labourPresent = body.labour_present;
    report.vehicles = body.vehicles.flatMap((vehicle) => {
      const truckType = MOCK_OPTIONS.truckTypes.find((type) => type.code === vehicle.truck_type_code.toUpperCase());
      return truckType ? [{ truckType, count: vehicle.count }] : [];
    });
    const figures = previewFigures(report.loadingCount, report.unloadingCount, report.startTime, report.endTime);
    report.totalOperations = figures.totalOperations;
    report.durationMinutes = figures.durationMinutes;
    report.updatedAt = new Date().toISOString();
  };
  const editable = (id: string, version: string): DailyReportRecord => {
    const report = find(id);
    if (report.status !== 'DRAFT') throw new ApiError(409, { code: 'DAILY_REPORT_LOCKED', message: 'Submitted reports are read-only.' });
    if (report.version !== version) throw new ApiError(409, { code: 'DAILY_REPORT_VERSION_CONFLICT', message: 'This report was changed elsewhere.' });
    return report;
  };

  return {
    async getOptions() { return structuredClone(MOCK_OPTIONS); },
    async list(query) {
      const matching = reports
        .filter((report) => (!query.from || report.reportDate >= query.from) && (!query.to || report.reportDate <= query.to) && (!query.status || report.status === query.status))
        .sort((a, b) => b.reportDate.localeCompare(a.reportDate));
      const start = (query.page - 1) * query.pageSize;
      return { items: structuredClone(matching.slice(start, start + query.pageSize)), page: query.page, pageSize: query.pageSize, total: matching.length, totalPages: Math.ceil(matching.length / query.pageSize) };
    },
    async get(id) { return structuredClone(find(id)); },
    async create(body) {
      const reportDate = body.report_date ?? '';
      if (reports.some((report) => report.reportDate === reportDate)) {
        throw new ApiError(409, { code: 'DAILY_REPORT_DUPLICATE', message: `A daily report already exists for ${reportDate}.` });
      }
      const report: DailyReportRecord = {
        id: `mock-report-${reports.length + 1}`,
        depot: MOCK_OPTIONS.depots[0]!,
        reportDate,
        loadingCount: 0, unloadingCount: 0, totalOperations: 0, startTime: null, endTime: null, durationMinutes: null,
        labourRequired: null, labourPresent: null, vehicles: [], status: 'DRAFT', submittedAt: null, updatedAt: '', version: '1',
        registeredTasks: { loadingTasksCompleted: 0, unloadingTasksCompleted: 0, loadingBoxes: 0, unloadingBoxes: 0, timezone: 'preview' },
      };
      apply(report, body);
      reports.push(report);
      return structuredClone(report);
    },
    async update(id, version, body) {
      const report = editable(id, version);
      apply(report, body);
      report.version = String(Number(report.version) + 1);
      return structuredClone(report);
    },
    async submit(id, version) {
      const report = editable(id, version);
      const missing = (['startTime', 'endTime', 'labourRequired', 'labourPresent'] as const).filter((field) => report[field] === null);
      if (missing.length > 0) throw new ApiError(422, { code: 'DAILY_REPORT_INCOMPLETE', message: 'Record times and labour before submitting.' });
      report.status = 'SUBMITTED';
      report.submittedAt = new Date().toISOString();
      report.version = String(Number(report.version) + 1);
      return structuredClone(report);
    },
  };
}
