import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, CalendarClock, ClipboardList, PackageCheck, Plus, Truck, Users } from 'lucide-react';
import { routes } from '../app/routes';
import { useRepositories } from '../state/repositories';
import { Alert, Badge, Button, Card, DataTable, DemoNotice, EmptyState, ErrorState, FormField, Input, LoadingState, MetricCard, PageHeader, Pagination, Select } from '../components/ui';
import { useExpireOnUnauthorized, useLoad } from './use-load';
import { useShiftGateway } from './use-shift-gateway';
import {
  HISTORY_PRESETS,
  HISTORY_PRESET_LABELS,
  buildCreateRequest,
  describeShiftError,
  emptyShiftForm,
  formatBoxes,
  formatCount,
  formatDecimal,
  formatDuration,
  formatRate,
  formatTimeRange,
  hasErrors,
  rangeForPreset,
  todayIso,
  validateShiftForm,
  type HistoryPreset,
  type ShiftEntryRecord,
  type ShiftErrorView,
  type ShiftFormErrors,
  type ShiftFormValues,
  type ShiftKpiMetrics,
  type ShiftOptions,
  type ShiftPage,
} from './shift-data';

const HISTORY_PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Presentational pieces (props only, so they render without a browser or providers)
// ---------------------------------------------------------------------------

export function ShiftErrorPanel({ view }: { view: ShiftErrorView }) {
  if (view.kind === 'profile' || view.kind === 'forbidden') {
    return <Alert tone="warning" title={view.title}>{view.message}</Alert>;
  }
  return <ErrorState title={view.title} description={view.message} />;
}

export function TodayPanel({ today, entry, metrics }: { today: string; entry: ShiftEntryRecord | null; metrics: ShiftKpiMetrics }) {
  if (!entry || metrics.shiftCount === 0) {
    return <Card><EmptyState icon={ClipboardList} title="No shift logged for today" description={`Nothing has been recorded for ${today} yet. Log your shift when it ends.`} action={<Link className="button button-primary" to={routes.shiftEntryNew}><Plus size={15} /> Log today&apos;s shift</Link>} /></Card>;
  }
  return <>
    <div className="metric-grid">
      <MetricCard label="Loading" value={formatBoxes(metrics.totalLoading)} detail={`Today · ${formatRate(metrics.loadingProductivity)}`} icon={<Truck size={16} />} />
      <MetricCard label="Unloading" value={formatBoxes(metrics.totalUnloading)} detail={`Today · ${formatRate(metrics.unloadingProductivity)}`} accent="slate" icon={<PackageCheck size={16} />} />
      <MetricCard label="Total boxes" value={formatBoxes(metrics.totalBoxes)} detail="Loading + unloading" accent="indigo" icon={<Boxes size={16} />} />
      <MetricCard label="Labour" value={formatCount(metrics.totalLabour)} detail="People on shift" accent="green" icon={<Users size={16} />} />
    </div>
    <Card>
      <div className="section-heading"><div><span className="section-kicker">Today&apos;s shift</span><h2>{entry.workDate}</h2></div><Badge tone="success">Logged</Badge></div>
      <div className="detail-facts four">
        <span><small>Shift start</small><strong>{entry.shiftStart.slice(0, 5)}</strong></span>
        <span><small>Shift end</small><strong>{entry.shiftEnd.slice(0, 5)}</strong></span>
        <span><small>Shift duration</small><strong>{formatDuration(metrics.totalDurationSeconds)}</strong></span>
        <span><small>Warehouses</small><strong>{entry.warehouses.map((warehouse) => warehouse.name).join(', ') || '—'}</strong></span>
      </div>
    </Card>
  </>;
}

export function HistoricalKpiPanel({ metrics }: { metrics: ShiftKpiMetrics }) {
  return <>
    <div className="metric-grid">
      <MetricCard label="Shifts" value={formatCount(metrics.shiftCount)} detail="In the selected period" icon={<CalendarClock size={16} />} />
      <MetricCard label="Total boxes" value={formatBoxes(metrics.totalBoxes)} detail={`Avg ${formatBoxes(metrics.averageBoxesPerShift)} per shift`} accent="indigo" icon={<Boxes size={16} />} />
      <MetricCard label="Total loading" value={formatBoxes(metrics.totalLoading)} detail={formatRate(metrics.loadingProductivity)} icon={<Truck size={16} />} />
      <MetricCard label="Total unloading" value={formatBoxes(metrics.totalUnloading)} detail={formatRate(metrics.unloadingProductivity)} accent="slate" icon={<PackageCheck size={16} />} />
    </div>
    <Card>
      <div className="detail-facts four">
        <span><small>Average boxes per shift</small><strong>{metrics.averageBoxesPerShift === null ? '—' : formatDecimal(metrics.averageBoxesPerShift)}</strong></span>
        <span><small>Average labour</small><strong>{metrics.averageLabour === null ? '—' : formatDecimal(metrics.averageLabour)}</strong></span>
        <span><small>Total shift duration</small><strong>{formatDuration(metrics.totalDurationSeconds)}</strong></span>
        <span><small>Average shift duration</small><strong>{formatDuration(metrics.averageDurationSeconds)}</strong></span>
      </div>
    </Card>
  </>;
}

export function ShiftHistoryTable({ page, onPageChange }: { page: ShiftPage; onPageChange?: (page: number) => void }) {
  return <Card>
    <div className="section-heading"><div><span className="section-kicker">History</span><h2>Your shifts</h2></div><Badge tone="neutral">{page.total} total</Badge></div>
    <DataTable
      caption="Your recorded shifts"
      headers={['Date', 'Shift', 'Duration', 'Labour', 'Loading', 'Unloading', 'Total boxes', 'Warehouses', 'Truck types']}
      rows={page.items.map((entry) => [
        <strong key="d" className="mono">{entry.workDate}</strong>,
        formatTimeRange(entry.shiftStart, entry.shiftEnd),
        formatDuration(entry.durationSeconds),
        formatCount(entry.labourCount),
        <span key="l" className="mono">{formatCount(entry.loadingTotal)}</span>,
        <span key="u" className="mono">{formatCount(entry.unloadingTotal)}</span>,
        <span key="t" className="mono">{formatCount(entry.totalBoxes)}</span>,
        entry.warehouses.map((warehouse) => warehouse.code).join(', ') || '—',
        entry.truckTypes.map((truckType) => truckType.name).join(', ') || '—',
      ])}
      empty={<EmptyState icon={ClipboardList} title="No shifts in this period" description="Try a longer period, or log a shift." />}
    />
    {page.totalPages > 1 && <Pagination page={page.page} totalPages={page.totalPages} onChange={onPageChange} />}
  </Card>;
}

interface ShiftFormViewProps {
  values: ShiftFormValues;
  errors: ShiftFormErrors;
  options: ShiftOptions;
  submitting: boolean;
  onChange: (changes: Partial<ShiftFormValues>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function toggle(list: string[], code: string): string[] {
  return list.includes(code) ? list.filter((item) => item !== code) : [...list, code];
}

/** Labelled group of checkboxes (a div with role="group", so it takes the app's form styling rather than a browser fieldset border). */
function CheckboxGroup({ label, hint, error, children }: { label: string; hint: string; error?: string; children: ReactNode }) {
  const labelId = useId();
  const messageId = useId();
  return <div className="form-field" role="group" aria-labelledby={labelId} aria-describedby={messageId}>
    <span id={labelId}>{label}</span>
    {children}
    {error ? <small id={messageId} className="field-error">{error}</small> : <small id={messageId}>{hint}</small>}
  </div>;
}

export function ShiftEntryFormView({ values, errors, options, submitting, onChange, onSubmit }: ShiftFormViewProps) {
  return <form onSubmit={onSubmit} noValidate aria-label="Log a shift">
    <div className="form-grid">
      <FormField label="Work date" error={errors.workDate}><Input type="date" name="workDate" value={values.workDate} onChange={(event) => onChange({ workDate: event.target.value })} aria-invalid={Boolean(errors.workDate)} required /></FormField>
      <FormField label="Labour count" error={errors.labourCount}><Input type="number" inputMode="numeric" min={0} step={1} name="labourCount" value={values.labourCount} onChange={(event) => onChange({ labourCount: event.target.value })} aria-invalid={Boolean(errors.labourCount)} required /></FormField>
      <FormField label="Shift start" error={errors.shiftStart}><Input type="time" name="shiftStart" value={values.shiftStart} onChange={(event) => onChange({ shiftStart: event.target.value })} aria-invalid={Boolean(errors.shiftStart)} required /></FormField>
      <FormField label="Shift end" hint="Must be later than the start time." error={errors.shiftEnd}><Input type="time" name="shiftEnd" value={values.shiftEnd} onChange={(event) => onChange({ shiftEnd: event.target.value })} aria-invalid={Boolean(errors.shiftEnd)} required /></FormField>
      <FormField label="Unloading total (BOX)" error={errors.unloadingTotal}><Input type="number" inputMode="numeric" min={0} step={1} name="unloadingTotal" value={values.unloadingTotal} onChange={(event) => onChange({ unloadingTotal: event.target.value })} aria-invalid={Boolean(errors.unloadingTotal)} required /></FormField>
      <FormField label="Loading total (BOX)" error={errors.loadingTotal}><Input type="number" inputMode="numeric" min={0} step={1} name="loadingTotal" value={values.loadingTotal} onChange={(event) => onChange({ loadingTotal: event.target.value })} aria-invalid={Boolean(errors.loadingTotal)} required /></FormField>
    </div>
    <CheckboxGroup label="Warehouses" hint="Select every warehouse worked during the shift." error={errors.warehouses}>
      {options.warehouses.map((warehouse) => <label className="checkbox-field" key={warehouse.id}><input type="checkbox" checked={values.warehouseCodes.includes(warehouse.code)} onChange={() => onChange({ warehouseCodes: toggle(values.warehouseCodes, warehouse.code) })} />{warehouse.name} <small>({warehouse.code})</small></label>)}
    </CheckboxGroup>
    <CheckboxGroup label="Truck types" hint="Optional." error={errors.truckTypes}>
      {options.truckTypes.map((truckType) => <label className="checkbox-field" key={truckType.id}><input type="checkbox" checked={values.truckTypeCodes.includes(truckType.code)} onChange={() => onChange({ truckTypeCodes: toggle(values.truckTypeCodes, truckType.code) })} />{truckType.name}</label>)}
    </CheckboxGroup>
    <div className="page-actions"><Button type="submit" loading={submitting}>Submit shift</Button><Link className="button button-ghost" to={routes.myShifts}>Cancel</Link></div>
  </form>;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export function MyShiftsPage() {
  const gateway = useShiftGateway();
  const { mode } = useRepositories();
  const today = useMemo(() => todayIso(), []);
  const [preset, setPreset] = useState<HistoryPreset>('last30');
  const [pageNumber, setPageNumber] = useState(1);
  const range = useMemo(() => rangeForPreset(preset, today), [preset, today]);

  const todayState = useLoad(async () => {
    const [list, metrics] = await Promise.all([
      gateway.listMine({ page: 1, pageSize: 1, from: today, to: today }),
      gateway.getMySummary({ from: today, to: today }),
    ]);
    return { entry: list.items[0] ?? null, metrics };
  }, [gateway, today]);

  const historyState = useLoad(async () => {
    const [metrics, page] = await Promise.all([
      gateway.getMySummary(range),
      gateway.listMine({ page: pageNumber, pageSize: HISTORY_PAGE_SIZE, ...range }),
    ]);
    return { metrics, page };
  }, [gateway, range, pageNumber]);

  useExpireOnUnauthorized(todayState.status === 'error' ? todayState.error : historyState.status === 'error' ? historyState.error : undefined);

  const header = <PageHeader eyebrow="Performance" title="My shifts" description="Your daily shift entries and personal KPI figures." actions={<Link className="button button-primary" to={routes.shiftEntryNew}><Plus size={15} /> Log shift</Link>} />;

  if (todayState.status === 'error') return <>{header}<ShiftErrorPanel view={describeShiftError(todayState.error)} /></>;
  if (historyState.status === 'error') return <>{header}<ShiftErrorPanel view={describeShiftError(historyState.error)} /></>;

  return <>
    {header}
    {mode === 'mock' && <DemoNotice>Shift entries are kept in memory in preview mode and are not sent to the server.</DemoNotice>}
    <div className="section-heading"><div><span className="section-kicker">Today</span><h2>Today at a glance</h2></div></div>
    {todayState.status === 'loading' ? <LoadingState label="Loading today's shift" /> : <TodayPanel today={today} entry={todayState.data.entry} metrics={todayState.data.metrics} />}
    <div className="section-heading"><div><span className="section-kicker">History</span><h2>Performance over time</h2></div>
      <Select aria-label="History period" value={preset} onChange={(event) => { setPreset(event.target.value as HistoryPreset); setPageNumber(1); }}>{HISTORY_PRESETS.map((item) => <option key={item} value={item}>{HISTORY_PRESET_LABELS[item]}</option>)}</Select>
    </div>
    {historyState.status === 'loading' ? <LoadingState label="Loading shift history" /> : <>
      <HistoricalKpiPanel metrics={historyState.data.metrics} />
      <ShiftHistoryTable page={historyState.data.page} onPageChange={setPageNumber} />
    </>}
  </>;
}

export function ShiftEntryPage() {
  const gateway = useShiftGateway();
  const optionsState = useLoad(() => gateway.getOptions(), [gateway]);
  const [values, setValues] = useState<ShiftFormValues>(() => emptyShiftForm());
  const [errors, setErrors] = useState<ShiftFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ShiftErrorView | null>(null);
  const [savedDate, setSavedDate] = useState<string | null>(null);

  useExpireOnUnauthorized(optionsState.status === 'error' ? optionsState.error : failure?.kind === 'unauthorized' ? { status: 401 } : undefined);

  const header = <PageHeader breadcrumbs={['My shifts', 'Log shift']} eyebrow="Performance" title="Log a shift" description="Record what you worked today. Totals are in BOX." />;

  if (optionsState.status === 'loading') return <>{header}<LoadingState label="Loading warehouses and truck types" /></>;
  if (optionsState.status === 'error') return <>{header}<ShiftErrorPanel view={describeShiftError(optionsState.error)} /></>;
  const options = optionsState.data;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavedDate(null);
    setFailure(null);
    const clientErrors = validateShiftForm(values, options);
    setErrors(clientErrors);
    if (hasErrors(clientErrors)) return;
    setSubmitting(true);
    try {
      const entry = await gateway.createEntry(buildCreateRequest(values));
      setSavedDate(entry.workDate);
      setValues(emptyShiftForm());
    } catch (error) {
      const view = describeShiftError(error);
      setErrors(view.fieldErrors);
      setFailure(view);
    } finally {
      setSubmitting(false);
    }
  };

  return <>
    {header}
    {savedDate && <Alert tone="success" title="Shift recorded">Your shift for {savedDate} was saved. <Link className="inline-link" to={routes.myShifts}>View my shifts</Link></Alert>}
    {failure && <ShiftErrorPanel view={failure} />}
    <Card>
      <ShiftEntryFormView values={values} errors={errors} options={options} submitting={submitting} onChange={(changes) => setValues((current) => ({ ...current, ...changes }))} onSubmit={(event) => void onSubmit(event)} />
    </Card>
  </>;
}
