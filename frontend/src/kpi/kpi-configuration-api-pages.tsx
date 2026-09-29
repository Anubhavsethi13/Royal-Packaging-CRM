import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { routes } from '../app/routes';
import { ApiError } from '../api/client';
import { describeApiError } from '../api/contract-validation';
import { Alert, Badge, Button, Card, DataTable, EmptyState, ErrorState, FilterBar, LoadingState, PageHeader, Pagination, SearchField, Select } from '../components/ui';
import { useAuth } from '../state/auth';
import {
  fetchKpiDefinition,
  fetchKpiDefinitions,
  formatEffectiveRange,
  formatKpiValue,
  KPI_DEFINITION_STATUSES,
  statusTone,
  targetScopeLabel,
  type KpiDefinitionDetailView,
  type KpiDefinitionPage,
  type KpiDefinitionStatus,
  type KpiTargetView,
} from './kpi-configuration-api';

const PAGE_SIZE = 25;
const detailPath = (id: string) => routes.kpiDetail.replace(':kpiId', id);

const readOnlyNotice = <Alert tone="info" title="Read-only configuration">Definitions, targets, and thresholds come from the backend. Creating, editing, and lifecycle changes are not available through the API yet, and rules, versions, and scopes are not stored by the backend.</Alert>;

function currentTargetSummary(targets: KpiTargetView[], unit: string | null): string {
  if (targets.length === 0) return 'No current target';
  if (targets.length === 1) return `${formatKpiValue(targets[0]!.targetValue, unit)} · ${targetScopeLabel(targets[0]!)}`;
  return `${targets.length} current targets`;
}

// ---------------------------------------------------------------------------
// Presentational (props only)
// ---------------------------------------------------------------------------

export function KpiDefinitionTable({ page, onPageChange }: { page: KpiDefinitionPage; onPageChange?: (page: number) => void }) {
  return <Card>
    <div className="section-heading"><div><span className="section-kicker">Configuration</span><h2>KPI definitions</h2></div><Badge tone="neutral">{page.total} definition{page.total === 1 ? '' : 's'}</Badge></div>
    <DataTable
      caption="Configured KPI definitions"
      headers={['KPI', 'Pillar', 'Unit', 'Status', 'Effective', 'Current target', 'Targets']}
      rows={page.items.map((definition) => [
        <Link key="k" className="table-link" to={detailPath(definition.id)}><strong>{definition.name}</strong><small className="table-sub mono">{definition.code}</small></Link>,
        definition.pillar ?? '—',
        definition.unit ?? '—',
        <Badge key="s" tone={statusTone(definition.status)}>{definition.status}</Badge>,
        formatEffectiveRange(definition.effectiveFrom, definition.effectiveTo),
        currentTargetSummary(definition.currentTargets, definition.unit),
        String(definition.targetCount),
      ])}
      empty={<EmptyState icon={BarChart3} title="No KPI definitions configured" description="The backend has no KPI definitions matching these filters. Definitions and targets appear here once they are recorded in the system." />}
    />
    {page.totalPages > 1 && <Pagination page={page.page} totalPages={page.totalPages} onChange={onPageChange} />}
  </Card>;
}

export function KpiDefinitionDetailView({ definition }: { definition: KpiDefinitionDetailView }) {
  return <>
    <Card>
      <div className="section-heading"><div><span className="section-kicker">Definition</span><h2>{definition.name}</h2></div><Badge tone={statusTone(definition.status)}>{definition.status}</Badge></div>
      {definition.description && <p className="body-copy">{definition.description}</p>}
      <div className="detail-facts four">
        <span><small>Code</small><strong className="mono">{definition.code}</strong></span>
        <span><small>Pillar</small><strong>{definition.pillar ?? '—'}</strong></span>
        <span><small>Unit</small><strong>{definition.unit ?? '—'}</strong></span>
        <span><small>Effective</small><strong>{formatEffectiveRange(definition.effectiveFrom, definition.effectiveTo)}</strong></span>
        <span><small>Formula reference</small><strong className="mono">{definition.formulaReference ?? '—'}</strong></span>
        <span><small>Enabled</small><strong>{definition.active ? 'Yes' : 'No'}</strong></span>
        <span><small>Record version</small><strong>{definition.version}</strong></span>
        <span><small>Last updated</small><strong>{new Date(definition.updatedAt).toLocaleString()}</strong></span>
      </div>
    </Card>
    <Card>
      <div className="section-heading"><div><span className="section-kicker">Targets and thresholds</span><h2>Target history</h2></div><Badge tone="neutral">{definition.targets.length} target{definition.targets.length === 1 ? '' : 's'}</Badge></div>
      <DataTable
        caption="KPI target and threshold history"
        headers={['Applies to', 'Target', 'Warning threshold', 'Critical threshold', 'Effective', 'In force']}
        rows={definition.targets.map((target) => [
          targetScopeLabel(target),
          <span key="t" className="mono">{formatKpiValue(target.targetValue, definition.unit)}</span>,
          <span key="w" className="mono">{formatKpiValue(target.warningThreshold, definition.unit)}</span>,
          <span key="c" className="mono">{formatKpiValue(target.criticalThreshold, definition.unit)}</span>,
          formatEffectiveRange(target.effectiveFrom, target.effectiveTo),
          <Badge key="i" tone={target.isCurrent ? 'success' : 'neutral'}>{target.isCurrent ? 'Current' : 'Not in force'}</Badge>,
        ])}
        empty={<EmptyState icon={BarChart3} title="No targets recorded" description="This KPI has no target or threshold values yet." />}
      />
    </Card>
  </>;
}

// ---------------------------------------------------------------------------
// Pages (API mode)
// ---------------------------------------------------------------------------

export function ApiKpiConfigurationPage() {
  const { expireSession } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | KpiDefinitionStatus>('all');
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<KpiDefinitionPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPage(null);
    setError(null);
    fetchKpiDefinitions({ page: pageNumber, pageSize: PAGE_SIZE, search, status: status === 'all' ? undefined : status }).then((result) => { if (active) setPage(result); }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof ApiError && cause.status === 401) expireSession();
      setError(describeApiError(cause, 'KPI configuration could not be loaded.'));
    });
    return () => { active = false; };
  }, [expireSession, pageNumber, search, status]);

  return <>
    <PageHeader eyebrow="Performance management" title="KPI configuration" description="KPI definitions with their targets, thresholds, and effective dates." />
    {readOnlyNotice}
    <FilterBar resultLabel={page ? `${page.total} definition${page.total === 1 ? '' : 's'}` : undefined}>
      <SearchField placeholder="Search KPI code or name" value={search} onChange={(value) => { setSearch(value); setPageNumber(1); }} />
      <Select aria-label="Filter KPI status" value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPageNumber(1); }}><option value="all">All statuses</option>{KPI_DEFINITION_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}</Select>
      <Button variant="ghost" disabled={!search && status === 'all'} onClick={() => { setSearch(''); setStatus('all'); setPageNumber(1); }}>Clear filters</Button>
    </FilterBar>
    {error ? <ErrorState title="KPI configuration could not be loaded" description={error} /> : !page ? <LoadingState label="Loading KPI configuration" /> : <KpiDefinitionTable page={page} onPageChange={setPageNumber} />}
  </>;
}

export function ApiKpiConfigurationDetailPage() {
  const { kpiId } = useParams();
  const { expireSession } = useAuth();
  const [definition, setDefinition] = useState<KpiDefinitionDetailView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setState('loading');
    if (!kpiId) { setState('missing'); return undefined; }
    fetchKpiDefinition(kpiId).then((result) => { if (active) { setDefinition(result); setState('ready'); } }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof ApiError && (cause.status === 404 || cause.status === 400)) { setState('missing'); return; }
      if (cause instanceof ApiError && cause.status === 401) expireSession();
      setError(describeApiError(cause, 'KPI definition could not be loaded.'));
      setState('error');
    });
    return () => { active = false; };
  }, [expireSession, kpiId]);

  const back = <Link className="button button-secondary" to={routes.kpis}>Back to KPI configuration</Link>;
  if (state === 'loading') return <LoadingState label="Loading KPI definition" />;
  if (state === 'error') return <><PageHeader breadcrumbs={['KPI configuration']} title="KPI definition" actions={back} /><ErrorState title="KPI definition could not be loaded" description={error} /></>;
  if (state === 'missing' || !definition) return <EmptyState icon={BarChart3} title="KPI definition not found" description="The requested KPI definition does not exist." action={back} />;
  return <><PageHeader breadcrumbs={['KPI configuration', definition.name]} eyebrow={definition.code} title={definition.name} description={definition.description ?? undefined} actions={back} />{readOnlyNotice}<KpiDefinitionDetailView definition={definition} /></>;
}
