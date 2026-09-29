import type {
  EmployeeKpiRowDTO,
  KpiSummarySource,
  ShiftKpiMetrics
} from "@royal-packaging/contracts";

/**
 * Filters a KPI data source understands. Resolved (validated, existing)
 * references only: services translate request codes to ids before calling.
 */
export interface KpiSourceFilter {
  readonly employeeId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly depotId?: string;
  readonly truckTypeId?: string;
}

export interface KpiSourceEmployeePage {
  readonly rows: EmployeeKpiRowDTO[];
  readonly totalEmployees: number;
}

/**
 * A KPI data source turns operational records into KPI metrics. Shift
 * entries are the first source registered with `KpiService`; task-event
 * derived KPIs (kpi_snapshots) keep their own path and can be exposed
 * through this same interface later without changing consumers.
 */
export interface KpiDataSource {
  readonly sourceId: KpiSummarySource;
  aggregate(filter: KpiSourceFilter): Promise<ShiftKpiMetrics>;
  aggregateByEmployee(filter: KpiSourceFilter, page: { limit: number; offset: number }): Promise<KpiSourceEmployeePage>;
}
