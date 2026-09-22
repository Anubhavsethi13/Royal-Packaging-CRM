import type { ListQuery, ListResponse, Repository } from '../mock/repositories';
import type { DataScope } from '../types/v1';
import type { KpiMeasurementPeriod, KpiMetricCode, KpiOperation } from './kpi-domain';
import type { KpiResultReadModel, KpiResultStatus } from './kpi-result-domain';

export interface KpiResultFilters {
  employeeId?: string;
  kpiId?: string;
  metric?: KpiMetricCode;
  operation?: KpiOperation;
  period?: KpiMeasurementPeriod;
  periodStart?: string;
  periodEnd?: string;
  status?: KpiResultStatus;
  scope?: DataScope;
}

export function filterKpiResults(results: KpiResultReadModel[], filters: KpiResultFilters = {}): KpiResultReadModel[] {
  return results.filter((result) => (!filters.employeeId || result.employeeId === filters.employeeId)
    && (!filters.kpiId || result.kpiId === filters.kpiId)
    && (!filters.metric || result.metric === filters.metric)
    && (!filters.operation || result.operation === filters.operation)
    && (!filters.period || result.period.kind === filters.period)
    && (!filters.periodStart || result.period.start >= filters.periodStart)
    && (!filters.periodEnd || result.period.end <= filters.periodEnd)
    && (!filters.status || result.status === filters.status)
    && (!filters.scope || result.scope === filters.scope));
}

function queryFilters(query: ListQuery): KpiResultFilters {
  const filters = query.filters ?? {};
  return { employeeId: filters.employeeId, kpiId: filters.kpiId, metric: filters.metric as KpiMetricCode | undefined, operation: filters.operation as KpiOperation | undefined, period: filters.period as KpiMeasurementPeriod | undefined, periodStart: filters.periodStart, periodEnd: filters.periodEnd, status: filters.status as KpiResultStatus | undefined, scope: filters.scope as KpiResultFilters['scope'] };
}

export function createMockKpiResultRepository(records: KpiResultReadModel[]): Repository<KpiResultReadModel> {
  const source = structuredClone(records);
  return {
    peek() { return structuredClone(source); },
    async list(query = {}): Promise<ListResponse<KpiResultReadModel>> {
      const search = query.search?.trim().toLowerCase();
      const filtered = filterKpiResults(source, queryFilters(query)).filter((result) => !search || `${result.resultId} ${result.kpiId} ${result.kpiName} ${result.employee?.name ?? ''} ${result.metric} ${result.operation}`.toLowerCase().includes(search));
      const page = Math.max(1, query.page ?? 1); const pageSize = Math.max(1, query.pageSize ?? (filtered.length || 1)); const start = (page - 1) * pageSize;
      return { items: structuredClone(filtered.slice(start, start + pageSize)), page, pageSize, total: filtered.length, stale: true };
    },
    async getById(id) { const result = source.find((candidate) => candidate.id === id || candidate.resultId === id); return result ? structuredClone(result) : undefined; },
  };
}
