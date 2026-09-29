import { BarChart3, RotateCcw } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { routes } from '../app/routes';
import { ApiError } from '../api/client';
import { describeApiError } from '../api/contract-validation';
import { Alert, Badge, Button, Card, DataTable, DemoNotice, EmptyState, ErrorState, FilterBar, Input, LoadingState, PageHeader, SearchField, Select } from '../components/ui';
import type { SessionState } from '../state/auth';
import { useAuth } from '../state/auth';
import { useRepositories } from '../state/repositories';
import type { ListQuery, ListResponse } from '../mock/repositories';
import type { KpiResultFilters } from './kpi-result-repository';
import type { KpiResultReadModel, KpiResultStatus, KpiResultValue } from './kpi-result-domain';
import { groupSourceReferences, validateKpiResultTraceability, type SourceReferenceGroup, type TraceabilityIssue } from './source-traceability';
import type { TaskRecord } from '../types/domain';

const resultStatuses: KpiResultStatus[] = ['PENDING', 'AVAILABLE', 'NOT_AVAILABLE'];
const metrics = ['BOXES_HANDLED', 'TASKS_COMPLETED', 'TIME_TAKEN', 'AVERAGE_BOXES_PER_TASK', 'SLA_COMPLIANCE'] as const;
const operations = ['TASK', 'LOADING', 'UNLOADING', 'WAREHOUSE'] as const;
const periods = ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'] as const;
/** Periods the backend calculates; it defaults to DAILY. */
const apiPeriods = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;

const initialResponse: ListResponse<KpiResultReadModel> = { items: [], page: 1, pageSize: 100, total: 0, stale: false };

/** Displays a supplied value; DURATION values are minutes. Never calculates. */
export function formatResultValue(value: KpiResultValue | undefined, missing = '—'): string {
  if (!value) return missing;
  return value.unit === 'DURATION' ? `${value.value} min` : `${value.value} ${value.unit}`;
}

export function employeeScopeId(session: SessionState | null): string | undefined {
  return session?.scopes.includes('OWN') && session.employeeIdentifier ? session.employeeIdentifier : undefined;
}

export function resultVisibleToSession(result: KpiResultReadModel, session: SessionState | null): boolean {
  const scopedEmployeeId = employeeScopeId(session);
  return !scopedEmployeeId || result.employeeId === scopedEmployeeId;
}

export function sourceDetailLabel(reference: KpiResultReadModel['sourceReferences'][number]): string {
  const details = [
    reference.quantity ? `Quantity: ${reference.quantity.value} ${reference.quantity.unit}` : undefined,
    reference.participants && reference.participants > 1 ? `Shared by ${reference.participants} employees` : undefined,
    reference.durationSeconds === undefined ? undefined : `Duration: ${reference.durationSeconds} seconds`,
    reference.slaStatus ? `SLA: ${reference.slaStatus}` : undefined,
    reference.slaTarget ? `SLA target: ${reference.slaTarget.value} ${reference.slaTarget.unit}` : undefined,
    reference.warehouse ? `Warehouse: ${reference.warehouse}` : undefined,
    reference.location ? `Location: ${reference.location}` : undefined,
    reference.employeeName ? `Employee: ${reference.employeeName}` : undefined,
  ].filter(Boolean);
  return details.length ? details.join(' · ') : 'No additional supplied source fields';
}

/** Preview mode resolves source tasks from the local task repository. In API mode the backend supplies scoped references directly. */
function useSourceTaskResolution(result: KpiResultReadModel) {
  const { mode, repositories } = useRepositories();
  const [tasks, setTasks] = useState<Map<string, TaskRecord | undefined>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const taskIds = mode === 'api' ? [] : Array.from(new Set(result.sourceReferences.map((reference) => reference.taskId).filter((taskId): taskId is string => Boolean(taskId))));
    if (!taskIds.length) { setTasks(new Map()); setLoading(false); setError(null); return () => { active = false; }; }
    setLoading(true);
    setError(null);
    Promise.all(taskIds.map(async (taskId) => [taskId, await repositories.tasks.getById(taskId)] as const))
      .then((entries) => { if (active) setTasks(new Map(entries)); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Source tasks could not be resolved.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, repositories.tasks, result.sourceReferences]);
  return { tasks, loading, error };
}

function sourceIssueTone(issue: TraceabilityIssue): 'warning' | 'error' {
  return issue.severity === 'error' ? 'error' : 'warning';
}

function SourceTraceabilityPanel({ result }: { result: KpiResultReadModel }) {
  const { tasks, loading, error } = useSourceTaskResolution(result);
  const groups = groupSourceReferences(result.sourceReferences);
  const issues = validateKpiResultTraceability(result, tasks);
  const taskFor = (taskId?: string) => taskId ? tasks.get(taskId) : undefined;
  const taskLabel = (reference: KpiResultReadModel['sourceReferences'][number]) => {
    if (!reference.taskId) return 'Source task unavailable';
    if (reference.taskCode) return reference.taskCode;
    const task = taskFor(reference.taskId);
    return task ? `${task.taskCode} · resolved` : loading ? 'Resolving source task' : 'Source task unavailable';
  };
  return <Card><div className="section-heading"><div><span className="section-kicker">Source references</span><h2>Operational traceability</h2></div><Badge tone="neutral">{result.sourceReferences.length} supplied</Badge></div>
    {error && <ErrorState title="Source task resolution failed" description={error} />}
    {issues.length > 0 && <div className="stack-list">{issues.map((issue, index) => <Alert key={`${issue.code}-${issue.sourceRecordId ?? index}`} tone={sourceIssueTone(issue)} title={issue.sourceRecordId ? `Traceability issue · ${issue.sourceRecordId}` : 'Traceability issue'}>{issue.message}</Alert>)}</div>}
    {!result.sourceReferences.length ? <EmptyState title="No source references" description="This result contains no supplied operational source references." /> : groups.map((group: SourceReferenceGroup) => <div className="source-group" key={group.key}><div className="section-heading"><div><span className="section-kicker">{group.sourceType}</span><h3>{group.operation}</h3></div><Badge tone="neutral">{group.count} record{group.count === 1 ? '' : 's'}</Badge></div><DataTable caption={`${group.sourceType} ${group.operation} source references`} headers={['Source record', 'Task', 'Employee', 'Source type', 'Operation', 'Timestamp', 'Supplied details']} rows={group.references.map((reference) => [<span className="mono">{reference.sourceRecordId || 'Unavailable'}</span>, taskLabel(reference), reference.employeeName ?? reference.employeeId ?? result.employeeId, reference.sourceType, reference.operationType ?? 'Not supplied', dateLabel(reference.timestamp), sourceDetailLabel(reference)])} /></div>)}
  </Card>;
}

export interface KpiResultTrendPoint {
  id: string;
  label: string;
  actual: KpiResultValue;
  target?: KpiResultValue;
  periodStart: string;
}

export function orderKpiResultHistory(results: KpiResultReadModel[]): KpiResultReadModel[] {
  return results.slice().sort((left, right) => right.period.start.localeCompare(left.period.start));
}

/** Only periods with a supplied actual value are plotted; nothing is filled in. */
export function toKpiResultTrendPoints(results: KpiResultReadModel[]): KpiResultTrendPoint[] {
  return orderKpiResultHistory(results).reverse().flatMap((result) => result.actual ? [{
    id: result.id,
    label: result.period.displayLabel ?? result.period.start,
    actual: result.actual,
    ...(result.target ? { target: result.target } : {}),
    periodStart: result.period.start,
  }] : []);
}

function dateLabel(value?: string): string {
  if (!value) return 'Not supplied';
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}

function statusTone(status: KpiResultStatus): 'success' | 'warning' | 'error' | 'neutral' {
  return status === 'AVAILABLE' ? 'success' : status === 'PENDING' ? 'warning' : status === 'NOT_AVAILABLE' ? 'error' : 'neutral';
}

function queryFilters(filters: KpiResultFilters): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, value === undefined ? undefined : String(value)]));
}

function describeResultError(reason: unknown, fallback: string): string {
  return describeApiError(reason, fallback);
}

function useKpiResults(filters: KpiResultFilters, search: string, scopedEmployeeId?: string) {
  const { mode, repositories } = useRepositories();
  const { expireSession } = useAuth();
  const [response, setResponse] = useState(initialResponse);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const effectiveFilters = scopedEmployeeId ? { ...filters, employeeId: scopedEmployeeId } : filters;
    const query: ListQuery = { page: 1, pageSize: 100, search: search.trim() || undefined, filters: queryFilters(effectiveFilters) };
    repositories.kpiResults.list(query).then((next) => {
      if (active) setResponse(next);
    }).catch((reason: unknown) => {
      if (!active) return;
      if (reason instanceof ApiError && reason.status === 401) expireSession();
      setError(describeResultError(reason, 'KPI results could not be loaded.'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [expireSession, filters, mode, repositories.kpiResults, scopedEmployeeId, search]);

  return { mode, response, loading, error };
}

function useKpiResultHistory(result: KpiResultReadModel) {
  const { mode, repositories } = useRepositories();
  const [history, setHistory] = useState<KpiResultReadModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    // The API calculates one period kind per request, so history stays on the result's own period kind.
    const filters: Record<string, string | undefined> = { employeeId: result.employeeId, kpiId: result.kpiId, ...(mode === 'api' ? { period: result.period.kind } : {}) };
    repositories.kpiResults.list({ page: 1, pageSize: 100, filters }).then((response) => {
      if (active) setHistory(orderKpiResultHistory(response.items));
    }).catch((reason: unknown) => {
      if (active) setError(describeResultError(reason, 'KPI result history could not be loaded.'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [mode, repositories.kpiResults, result.employeeId, result.kpiId, result.period.kind]);

  return { history, loading, error };
}

function TrendPlot({ points }: { points: KpiResultTrendPoint[] }) {
  if (points.length < 2) return <EmptyState title="Trend unavailable" description="At least two supplied reporting periods are needed to show a visual history." />;
  const values = points.map((point) => point.actual.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum || 1;
  const plotted = points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? 50 : 8 + (index / (points.length - 1)) * 84,
    y: 12 + ((maximum - point.actual.value) / spread) * 70,
  }));
  const line = plotted.map((point) => `${point.x},${point.y}`).join(' ');
  return <div className="trend-plot-wrap"><svg className="trend-plot" viewBox="0 0 100 100" role="img" aria-label="Historical supplied actual values by reporting period" preserveAspectRatio="none"><line x1="8" y1="82" x2="92" y2="82" stroke="currentColor" opacity="0.22" /><polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />{plotted.map((point) => <circle key={point.id} cx={point.x} cy={point.y} r="2" fill="currentColor"><title>{point.label}: {formatResultValue(point.actual)}</title></circle>)}</svg><div className="trend-labels" aria-hidden="true">{plotted.map((point) => <span key={point.id}>{point.label}</span>)}</div><p className="muted-note">The line connects actual values supplied by the KPI result repository. It does not calculate achievement, change, or score.</p></div>;
}

function KpiResultHistoryPanel({ result }: { result: KpiResultReadModel }) {
  const { history, loading, error } = useKpiResultHistory(result);
  const points = toKpiResultTrendPoints(history);
  return <Card><div className="section-heading"><div><span className="section-kicker">History and trend</span><h2>Supplied reporting periods</h2></div><Badge tone="neutral">{history.length} period{history.length === 1 ? '' : 's'}</Badge></div>{loading ? <LoadingState label="Loading KPI result history" /> : error ? <ErrorState title="KPI result history could not be loaded" description={error} /> : history.length === 0 ? <EmptyState title="No history available" description="No historical result records match this employee and KPI." /> : <><TrendPlot points={points} /><DataTable caption="KPI result history" headers={['Period', 'Target', 'Actual', 'Unit', 'Status', 'Operation', 'KPI', 'Rule version', 'Calculated', 'Source']} rows={orderKpiResultHistory(history).map((historical) => [<Link className="table-link" to={routes.kpiResultDetail.replace(':resultId', encodeURIComponent(historical.id))}>{historical.period.displayLabel ?? historical.period.kind}<small className="table-sub">{historical.period.start} - {historical.period.end}</small></Link>, formatResultValue(historical.target, 'Not configured'), formatResultValue(historical.actual, 'Not calculable'), historical.unit, <Badge tone={statusTone(historical.status)}>{historical.status}</Badge>, historical.operation, historical.kpiName, <span className="mono">{historical.ruleVersionId}</span>, dateLabel(historical.calculatedAt), historical.isMock ? <Badge tone="info">DEMO</Badge> : <Badge tone="neutral">API</Badge>])} /></>}</Card>;
}

/** Results body (props only): loading, error, empty, or the results table. Values are displayed, never calculated. */
export function KpiResultsView({ loading, error, items, emptyTitle, emptyDescription, emptyAction }: { loading: boolean; error: string | null; items: KpiResultReadModel[]; emptyTitle: string; emptyDescription: string; emptyAction?: ReactNode }) {
  if (loading) return <LoadingState label="Loading KPI results" />;
  if (error) return <ErrorState title="KPI results could not be loaded" description={error} />;
  if (items.length === 0) return <EmptyState icon={BarChart3} title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  return <Card><DataTable caption="Employee KPI results" headers={['Employee', 'KPI', 'Metric', 'Operation', 'Period', 'Target', 'Actual', 'Status', 'Calculated', 'Source']} rows={items.map((result) => [<Link className="table-link" to={routes.kpiResultDetail.replace(':resultId', encodeURIComponent(result.id))}>{result.employee?.name ?? result.employeeId}<small className="table-sub mono">{result.employee?.code ?? result.employeeId}</small></Link>, <Link className="table-link" to={routes.kpiResultDetail.replace(':resultId', encodeURIComponent(result.id))}>{result.kpiName}<small className="table-sub mono">{result.kpiCode ?? result.resultId}</small></Link>, result.metric, result.operation, result.period.displayLabel ?? `${result.period.kind}: ${result.period.start} - ${result.period.end}`, formatResultValue(result.target, 'Not configured'), formatResultValue(result.actual, 'Not calculable'), <Badge tone={statusTone(result.status)}>{result.status}</Badge>, dateLabel(result.calculatedAt), result.isMock ? <Badge tone="info">DEMO</Badge> : <Badge tone="neutral">{result.sourceCount === undefined ? 'API' : `API · ${result.sourceCount} task${result.sourceCount === 1 ? '' : 's'}`}</Badge>])} /></Card>;
}

export function KpiResultsPage() {
  const { session } = useAuth();
  const { mode } = useRepositories();
  // Preview mode narrows to the mock session's identity; in API mode the backend decides scope.
  const scopedEmployeeId = mode === 'mock' ? employeeScopeId(session) : undefined;
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<KpiResultFilters>({});
  const { response, loading, error } = useKpiResults(filters, search, scopedEmployeeId);
  const activeFilterCount = Object.values(filters).filter(Boolean).length + (search.trim() ? 1 : 0);
  const clear = () => { setSearch(''); setFilters({}); };
  const employeeOptions = Array.from(new Map(response.items.map((result) => [result.employeeId, result.employee?.name ?? result.employeeId])).entries());
  const kpiOptions = Array.from(new Map(response.items.map((result) => [result.kpiId, result.kpiName])).entries());
  const emptyDescription = mode === 'api'
    ? 'No KPI results for this period. Results are calculated from completed tasks for active KPI definitions with a supported calculation (see KPI configuration).'
    : scopedEmployeeId ? 'The current preview has no result mapped to this session identity. Other employees are not shown.' : activeFilterCount ? 'Adjust the filters or clear them to inspect the available read-only results.' : 'No result records are present in the current read model.';

  return <>
    <PageHeader eyebrow="Performance management" title="KPI results" description="Inspect supplied KPI values, periods, and operational traceability without recalculating them." />
    {mode === 'mock'
      ? <DemoNotice>{scopedEmployeeId ? 'Only results matching the current session identity are shown.' : 'These are deterministic DEMO/MOCK results. Values are read-only and not calculated in this frontend.'}</DemoNotice>
      : <Alert tone="info" title="Calculated by the server">Results are calculated by the backend from completed tasks, per employee and period, and limited to what your role may see. BOX quantities on shared tasks are split equally between the employees assigned at completion. Nothing is ranked or scored.</Alert>}
    <FilterBar resultLabel={`${response.total} result${response.total === 1 ? '' : 's'}${activeFilterCount ? ' matching filters' : ''}`}>
      <SearchField placeholder="Search employee, KPI, metric, or operation" value={search} onChange={setSearch} />
      {!scopedEmployeeId && <Select aria-label="Filter result employee" value={filters.employeeId ?? ''} onChange={(event) => setFilters((current) => ({ ...current, employeeId: event.target.value || undefined }))}><option value="">All employees</option>{employeeOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select>}
      <Select aria-label="Filter result KPI" value={filters.kpiId ?? ''} onChange={(event) => setFilters((current) => ({ ...current, kpiId: event.target.value || undefined }))}><option value="">All KPIs</option>{kpiOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select>
      <Select aria-label="Filter result metric" value={filters.metric ?? ''} onChange={(event) => setFilters((current) => ({ ...current, metric: event.target.value as KpiResultFilters['metric'] || undefined }))}><option value="">All metrics</option>{metrics.map((metric) => <option key={metric} value={metric}>{metric}</option>)}</Select>
      <Select aria-label="Filter result operation" value={filters.operation ?? ''} onChange={(event) => setFilters((current) => ({ ...current, operation: event.target.value as KpiResultFilters['operation'] || undefined }))}><option value="">All operations</option>{operations.map((operation) => <option key={operation} value={operation}>{operation}</option>)}</Select>
      {mode === 'api'
        ? <Select aria-label="Filter result period" value={filters.period ?? 'DAILY'} onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value as KpiResultFilters['period'] }))}>{apiPeriods.map((period) => <option key={period} value={period}>{period}</option>)}</Select>
        : <Select aria-label="Filter result period" value={filters.period ?? ''} onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value as KpiResultFilters['period'] || undefined }))}><option value="">All periods</option>{periods.map((period) => <option key={period} value={period}>{period}</option>)}</Select>}
      <Select aria-label="Filter result status" value={filters.status ?? ''} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as KpiResultStatus || undefined }))}><option value="">All statuses</option>{resultStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</Select>
      <Input aria-label="Filter result start date" type="date" value={filters.periodStart ?? ''} onChange={(event) => setFilters((current) => ({ ...current, periodStart: event.target.value || undefined }))} />
      <Input aria-label="Filter result end date" type="date" value={filters.periodEnd ?? ''} onChange={(event) => setFilters((current) => ({ ...current, periodEnd: event.target.value || undefined }))} />
      <Button variant="ghost" onClick={clear}><RotateCcw size={15} /> Clear</Button>
    </FilterBar>
    <KpiResultsView loading={loading} error={error} items={response.items} emptyTitle={scopedEmployeeId ? 'Your KPI results are unavailable' : activeFilterCount ? 'No KPI results match' : 'No KPI results available'} emptyDescription={emptyDescription} emptyAction={activeFilterCount && !scopedEmployeeId ? <Button variant="secondary" onClick={clear}>Clear filters</Button> : undefined} />
  </>;
}

export function KpiResultDetailPage() {
  const { resultId } = useParams<{ resultId: string }>();
  const { session, expireSession } = useAuth();
  const { mode, repositories } = useRepositories();
  const [result, setResult] = useState<KpiResultReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!resultId) { setLoading(false); return () => { active = false; }; }
    setLoading(true);
    setError(null);
    repositories.kpiResults.getById(resultId).then((next) => {
      // Preview mode filters by the mock session identity; in API mode the backend has already enforced scope.
      if (active) setResult(next && (mode === 'api' || resultVisibleToSession(next, session)) ? next : null);
    }).catch((reason: unknown) => {
      if (!active) return;
      if (reason instanceof ApiError && reason.status === 400) { setResult(null); return; }
      if (reason instanceof ApiError && reason.status === 401) expireSession();
      setError(describeResultError(reason, 'KPI result could not be loaded.'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [expireSession, mode, repositories.kpiResults, resultId, session]);

  if (loading) return <LoadingState label="Loading KPI result" />;
  if (error) return <><PageHeader title="KPI result" /><ErrorState title="KPI result could not be loaded" description={error} /></>;
  if (!result) return <><PageHeader title="KPI result not found" /><EmptyState icon={BarChart3} title="KPI result not found" description="The requested result is not available for the current read model or session scope." action={<Link className="button button-primary" to={routes.kpiResults}>Back to KPI results</Link>} /></>;

  return <>
    <PageHeader breadcrumbs={['KPI results', result.employee?.name ?? result.employeeId]} eyebrow={result.metric} title={result.kpiName} description="Read-only result detail and supplied operational traceability." actions={<Link className="button button-secondary" to={routes.kpiResults}>Back to results</Link>} />
    {result.isMock && <DemoNotice>This is a deterministic DEMO/MOCK result. Target and actual values are supplied read-model fields; no frontend calculation is performed.</DemoNotice>}
    {result.status === 'NOT_AVAILABLE' && <Alert tone="warning" title="Not calculable">{result.notAvailableReason ?? 'The source data needed for this metric is not available.'}</Alert>}
    <div className="detail-grid">
      <Card><div className="section-heading"><div><span className="section-kicker">Employee</span><h2>{result.employee?.name ?? result.employeeId}</h2></div><Badge tone={statusTone(result.status)}>{result.status}</Badge></div><div className="detail-facts"><span><small>Employee ID</small><strong className="mono">{result.employeeId}</strong></span><span><small>Employee code</small><strong className="mono">{result.employee?.code ?? 'Not supplied'}</strong></span><span><small>Result ID</small><strong className="mono">{result.resultId}</strong></span></div></Card>
      <Card><div className="section-heading"><div><span className="section-kicker">KPI metadata</span><h2>{result.kpiName}</h2></div></div><div className="detail-facts"><span><small>KPI ID</small><strong className="mono">{result.kpiId}</strong></span><span><small>Metric</small><strong>{result.metric}</strong></span><span><small>Operation</small><strong>{result.operation}</strong></span><span><small>Scope</small><strong>{result.scope}</strong></span><span><small>Rule version</small><strong className="mono">{result.ruleVersionId}</strong></span><span><small>Calculation version</small><strong>{result.calculationVersion ?? 'Not supplied'}</strong></span></div></Card>
    </div>
    <div className="detail-grid">
      <Card><div className="section-heading"><div><span className="section-kicker">Supplied values</span><h2>Target and actual</h2></div></div><div className="detail-facts"><span><small>Target</small><strong>{formatResultValue(result.target, 'Not configured')}</strong></span><span><small>Actual</small><strong>{formatResultValue(result.actual, 'Not calculable')}</strong></span><span><small>Unit</small><strong>{result.unit}</strong></span><span><small>Direction</small><strong>{result.direction}</strong></span><span><small>Period</small><strong>{result.period.displayLabel ?? result.period.kind}</strong></span><span><small>Period dates</small><strong>{result.period.start} - {result.period.end}{result.period.timezone ? ` (${result.period.timezone})` : ''}</strong></span><span><small>Calculated at</small><strong>{dateLabel(result.calculatedAt)}</strong></span></div></Card>
      <SourceTraceabilityPanel result={result} />
    </div>
    <KpiResultHistoryPanel result={result} />
  </>;
}
