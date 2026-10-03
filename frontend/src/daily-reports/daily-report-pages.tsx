import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, CalendarClock, ClipboardList, Clock, PackageCheck, Plus, Send, Truck, Users } from 'lucide-react';
import { routes } from '../app/routes';
import { useAuth } from '../state/auth';
import { useRepositories } from '../state/repositories';
import { Alert, Badge, Button, Card, DataTable, DemoNotice, EmptyState, ErrorState, FormField, Input, LoadingState, MetricCard, PageHeader, Pagination, Select } from '../components/ui';
import { useLoad, type LoadState } from '../shifts/use-load';
import { todayIso } from '../shifts/shift-data';
import { useDailyReportGateway } from './use-daily-report-gateway';
import { DepotTaskPanel } from './task-registration';
import {
  buildDailyReportBody,
  describeDailyReportError,
  emptyDailyReportForm,
  formatClock,
  formatLabour,
  formatMinutes,
  formFromReport,
  hasFormErrors,
  previewFigures,
  validateDailyReportForm,
  type DailyReportErrorView,
  type DailyReportFormErrors,
  type DailyReportFormValues,
  type DailyReportOptions,
  type DailyReportPage,
  type DailyReportRecord,
  type DailyReportTruckType,
} from './daily-report-data';

const HISTORY_PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Presentational pieces (props only, so they render without a browser or providers)
// ---------------------------------------------------------------------------

export function DailyReportErrorPanel({ view }: { view: DailyReportErrorView }) {
  if (view.kind === 'depot' || view.kind === 'forbidden' || view.kind === 'locked' || view.kind === 'incomplete' || view.kind === 'conflict') {
    return <Alert tone="warning" title={view.title}>{view.message}</Alert>;
  }
  return <ErrorState title={view.title} description={view.message} />;
}

export interface OperationsFigures {
  loadingCount: number;
  unloadingCount: number;
  totalOperations: number;
  vehicles: Array<{ truckType: DailyReportTruckType; count: number }>;
  labourPresent: number | null;
  labourRequired: number | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
}

/** "Today's operations" figures: loading, unloading, derived total, vehicles, labour, start/end and derived duration. */
export function OperationsSummary({ figures, title, status }: { figures: OperationsFigures; title: string; status?: 'DRAFT' | 'SUBMITTED' | 'PREVIEW' }) {
  return <Card>
    <div className="section-heading"><div><span className="section-kicker">Operations</span><h2>{title}</h2></div>{status && <Badge tone={status === 'SUBMITTED' ? 'success' : status === 'DRAFT' ? 'warning' : 'neutral'}>{status === 'SUBMITTED' ? 'Submitted' : status === 'DRAFT' ? 'Draft' : 'Preview'}</Badge>}</div>
    <div className="metric-grid">
      <MetricCard label="Loading" value={String(figures.loadingCount)} detail="Operations" icon={<Truck size={16} />} />
      <MetricCard label="Unloading" value={String(figures.unloadingCount)} detail="Operations" accent="slate" icon={<PackageCheck size={16} />} />
      <MetricCard label="Total" value={String(figures.totalOperations)} detail="Loading + unloading (calculated)" accent="indigo" icon={<Boxes size={16} />} />
      <MetricCard label="Labour" value={formatLabour(figures.labourPresent, figures.labourRequired)} detail="Present / required" accent="green" icon={<Users size={16} />} />
    </div>
    <div className="detail-facts four">
      <span><small>Vehicles</small><strong>{figures.vehicles.length ? figures.vehicles.map((vehicle) => `${vehicle.truckType.name}: ${vehicle.count}`).join(' · ') : '—'}</strong></span>
      <span><small>Start</small><strong>{formatClock(figures.startTime)}</strong></span>
      <span><small>End</small><strong>{formatClock(figures.endTime)}</strong></span>
      <span><small>Duration (calculated)</small><strong>{formatMinutes(figures.durationMinutes)}</strong></span>
    </div>
  </Card>;
}

/** Completed tasks registered in the CRM for the same depot and date, shown beside the supervisor's figures. */
export function RegisteredTasksPanel({ report }: { report: DailyReportRecord }) {
  const tasks = report.registeredTasks;
  return <Card>
    <div className="section-heading"><div><span className="section-kicker">Traceability</span><h2>Registered tasks for {report.reportDate}</h2></div><Badge tone="neutral">{tasks.timezone}</Badge></div>
    <div className="detail-facts four">
      <span><small>Loading tasks completed</small><strong>{tasks.loadingTasksCompleted}</strong></span>
      <span><small>Loading BOX</small><strong>{tasks.loadingBoxes.toLocaleString('en-US')}</strong></span>
      <span><small>Unloading tasks completed</small><strong>{tasks.unloadingTasksCompleted}</strong></span>
      <span><small>Unloading BOX</small><strong>{tasks.unloadingBoxes.toLocaleString('en-US')}</strong></span>
    </div>
    <p className="muted">These come from completed tasks registered in the CRM, which are the source for KPI results. Report counts are the supervisor&apos;s figures for the day.</p>
  </Card>;
}

export function DailyReportHistoryTable({ page, onPageChange }: { page: DailyReportPage; onPageChange?: (page: number) => void }) {
  return <Card>
    <div className="section-heading"><div><span className="section-kicker">History</span><h2>Daily depot reports</h2></div><Badge tone="neutral">{page.total} total</Badge></div>
    <DataTable
      caption="Daily depot reports"
      headers={['Date', 'Depot', 'Loading', 'Unloading', 'Total', 'Vehicles', 'Labour', 'Start – end', 'Duration', 'Status']}
      rows={page.items.map((report) => [
        <strong key="d" className="mono">{report.reportDate}</strong>,
        report.depot.code,
        <span key="l" className="mono">{report.loadingCount}</span>,
        <span key="u" className="mono">{report.unloadingCount}</span>,
        <span key="t" className="mono">{report.totalOperations}</span>,
        report.vehicles.map((vehicle) => `${vehicle.truckType.name}: ${vehicle.count}`).join(', ') || '—',
        formatLabour(report.labourPresent, report.labourRequired),
        `${formatClock(report.startTime)} – ${formatClock(report.endTime)}`,
        formatMinutes(report.durationMinutes),
        <Badge key="s" tone={report.status === 'SUBMITTED' ? 'success' : 'warning'}>{report.status === 'SUBMITTED' ? 'Submitted' : 'Draft'}</Badge>,
      ])}
      empty={<EmptyState icon={ClipboardList} title="No daily reports yet" description="Reports appear here once a supervisor records the day's operations." />}
    />
    {page.totalPages > 1 && <Pagination page={page.page} totalPages={page.totalPages} onChange={onPageChange} />}
  </Card>;
}

interface DailyReportFormViewProps {
  values: DailyReportFormValues;
  errors: DailyReportFormErrors;
  options: DailyReportOptions;
  existing: DailyReportRecord | null;
  saving: boolean;
  onChange: (changes: Partial<DailyReportFormValues>) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitReport: () => void;
}

export function DailyReportFormView({ values, errors, options, existing, saving, onChange, onSave, onSubmitReport }: DailyReportFormViewProps) {
  const singleDepot = options.depots.length === 1 ? options.depots[0] : undefined;
  return <form onSubmit={onSave} noValidate aria-label="Daily depot report">
    <div className="form-grid">
      {singleDepot
        ? <FormField label="Depot" hint="The only depot available."><Input value={`${singleDepot.name} (${singleDepot.code})`} readOnly /></FormField>
        : <FormField label="Depot" error={errors.depotId}><Select value={values.depotId} onChange={(event) => onChange({ depotId: event.target.value })} disabled={Boolean(existing)} aria-invalid={Boolean(errors.depotId)}><option value="">Select a depot</option>{options.depots.map((depot) => <option key={depot.id} value={depot.id}>{depot.name} ({depot.code})</option>)}</Select></FormField>}
      <FormField label="Date" error={errors.reportDate}><Input type="date" value={values.reportDate} onChange={(event) => onChange({ reportDate: event.target.value })} aria-invalid={Boolean(errors.reportDate)} required /></FormField>
      <FormField label="Loading (operations)" error={errors.loadingCount}><Input type="number" inputMode="numeric" min={0} step={1} value={values.loadingCount} onChange={(event) => onChange({ loadingCount: event.target.value })} aria-invalid={Boolean(errors.loadingCount)} required /></FormField>
      <FormField label="Unloading (operations)" error={errors.unloadingCount}><Input type="number" inputMode="numeric" min={0} step={1} value={values.unloadingCount} onChange={(event) => onChange({ unloadingCount: event.target.value })} aria-invalid={Boolean(errors.unloadingCount)} required /></FormField>
      <FormField label="Starting time" error={errors.startTime}><Input type="time" value={values.startTime} onChange={(event) => onChange({ startTime: event.target.value })} aria-invalid={Boolean(errors.startTime)} /></FormField>
      <FormField label="Ending time" hint="Must be later than the starting time." error={errors.endTime}><Input type="time" value={values.endTime} onChange={(event) => onChange({ endTime: event.target.value })} aria-invalid={Boolean(errors.endTime)} /></FormField>
      <FormField label="Labour required" error={errors.labourRequired}><Input type="number" inputMode="numeric" min={0} step={1} value={values.labourRequired} onChange={(event) => onChange({ labourRequired: event.target.value })} aria-invalid={Boolean(errors.labourRequired)} /></FormField>
      <FormField label="Labour present" error={errors.labourPresent}><Input type="number" inputMode="numeric" min={0} step={1} value={values.labourPresent} onChange={(event) => onChange({ labourPresent: event.target.value })} aria-invalid={Boolean(errors.labourPresent)} /></FormField>
      {options.truckTypes.map((truckType) => <FormField key={truckType.id} label={`Vehicles: ${truckType.name}`} error={errors.vehicles}><Input type="number" inputMode="numeric" min={0} step={1} value={values.vehicleCounts[truckType.code] ?? ''} placeholder="0" onChange={(event) => onChange({ vehicleCounts: { ...values.vehicleCounts, [truckType.code]: event.target.value } })} /></FormField>)}
    </div>
    <div className="page-actions">
      <Button type="submit" variant="secondary" loading={saving}>{existing ? 'Save changes' : 'Save draft'}</Button>
      <Button type="button" loading={saving} onClick={onSubmitReport}><Send size={15} /> Submit daily report</Button>
    </div>
  </form>;
}

function figuresFromForm(values: DailyReportFormValues, options: DailyReportOptions): OperationsFigures {
  const count = (raw: string) => (raw.trim() === '' || !Number.isFinite(Number(raw)) ? 0 : Number(raw));
  const optional = (raw: string) => (raw.trim() === '' || !Number.isFinite(Number(raw)) ? null : Number(raw));
  const loadingCount = count(values.loadingCount);
  const unloadingCount = count(values.unloadingCount);
  const derived = previewFigures(loadingCount, unloadingCount, values.startTime || null, values.endTime || null);
  return {
    loadingCount, unloadingCount, totalOperations: derived.totalOperations, durationMinutes: derived.durationMinutes,
    vehicles: options.truckTypes.filter((type) => (values.vehicleCounts[type.code] ?? '').trim() !== '').map((truckType) => ({ truckType, count: count(values.vehicleCounts[truckType.code] ?? '') })),
    labourPresent: optional(values.labourPresent), labourRequired: optional(values.labourRequired),
    startTime: values.startTime || null, endTime: values.endTime || null,
  };
}

const figuresFromReport = (report: DailyReportRecord): OperationsFigures => ({
  loadingCount: report.loadingCount, unloadingCount: report.unloadingCount, totalOperations: report.totalOperations, durationMinutes: report.durationMinutes,
  vehicles: report.vehicles, labourPresent: report.labourPresent, labourRequired: report.labourRequired, startTime: report.startTime, endTime: report.endTime,
});

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/** Supervisor dashboard panel: today's depot operations and the supervisor's actions. */
export function SupervisorTodayPanel() {
  const gateway = useDailyReportGateway();
  const today = useMemo(() => todayIso(), []);
  const state = useLoad(() => gateway.list({ page: 1, pageSize: 1, from: today, to: today }), [gateway, today]);
  const actions = <div className="page-actions">
    <Link className="button button-primary" to={routes.dailyReports}><Plus size={15} /> {state.status === 'ready' && state.data.items[0] ? 'Update daily report' : 'Start today’s report'}</Link>
    <Link className="button button-secondary" to={routes.loadingUnloading}><Truck size={15} /> Loading &amp; unloading tasks</Link>
    <Link className="button button-ghost" to={routes.dailyReports}><Send size={15} /> Submit daily report</Link>
  </div>;
  if (state.status === 'loading') return <LoadingState label="Loading today's operations" />;
  if (state.status === 'error') return <DailyReportErrorPanel view={describeDailyReportError(state.error)} />;
  const report = state.data.items[0];
  if (!report) return <Card><EmptyState icon={CalendarClock} title="No operations recorded today" description={`Nothing has been recorded for ${today} yet.`} action={actions} /></Card>;
  return <>
    <OperationsSummary figures={figuresFromReport(report)} title={`Today's operations · ${report.depot.code}`} status={report.status} />
    {actions}
  </>;
}

export function DailyReportsPage() {
  const gateway = useDailyReportGateway();
  const { mode } = useRepositories();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission({ module: 'DAILY_REPORTS', action: 'CREATE' });
  const canRegisterTasks = canWrite && hasPermission({ module: 'TASKS', action: 'ASSIGN' });
  const [reportDate, setReportDate] = useState(() => todayIso());
  const [depotId, setDepotId] = useState('');
  const [pageNumber, setPageNumber] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  // Lives here (not in the editor) because the editor remounts after every save.
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const optionsState = useLoad(() => (canWrite ? gateway.getOptions() : Promise.resolve<DailyReportOptions>({ depots: [], truckTypes: [] })), [gateway, canWrite]);
  const options = optionsState.status === 'ready' ? optionsState.data : null;
  const effectiveDepotId = options && options.depots.length === 1 ? options.depots[0]!.id : depotId;

  const currentState = useLoad(async () => {
    if (!canWrite || (options && options.depots.length > 1 && !effectiveDepotId)) return null;
    const page = await gateway.list({ page: 1, pageSize: 1, from: reportDate, to: reportDate, ...(effectiveDepotId ? { depotId: effectiveDepotId } : {}) });
    return page.items[0] ?? null;
  }, [gateway, canWrite, reportDate, effectiveDepotId, refreshKey]);

  const historyState = useLoad(() => gateway.list({ page: pageNumber, pageSize: HISTORY_PAGE_SIZE }), [gateway, pageNumber, refreshKey]);

  const header = <PageHeader eyebrow="Warehouse" title="Daily depot report" description="Record the day's loading and unloading operations, vehicles, labour and working hours for the depot. Totals and duration are calculated." />;
  const firstError = [optionsState, historyState].find((state) => state.status === 'error');
  if (firstError && firstError.status === 'error') return <>{header}<DailyReportErrorPanel view={describeDailyReportError(firstError.error)} /></>;

  return <>
    {header}
    {mode === 'mock' && <DemoNotice>Daily reports are kept in memory in preview mode and are not sent to the server.</DemoNotice>}
    {savedNotice && <Alert tone="success" title="Saved">{savedNotice}</Alert>}
    {canWrite && (optionsState.status === 'loading' || !options
      ? <LoadingState label="Loading depot and vehicle types" />
      : <DailyReportEditor key={`${reportDate}:${effectiveDepotId}:${refreshKey}`} options={options} reportDate={reportDate} depotId={effectiveDepotId} current={currentState}
          onDateChange={(date) => { setSavedNotice(null); setReportDate(date); }} onDepotChange={(id) => { setSavedNotice(null); setDepotId(id); }} onSaved={(message) => { setSavedNotice(message); setRefreshKey((key) => key + 1); }} />)}
    {canRegisterTasks && effectiveDepotId && <DepotTaskPanel depotId={effectiveDepotId} onTaskCompleted={() => setRefreshKey((key) => key + 1)} />}
    {historyState.status === 'loading' ? <LoadingState label="Loading daily reports" /> : historyState.status === 'ready' && <DailyReportHistoryTable page={historyState.data} onPageChange={setPageNumber} />}
  </>;
}

type CurrentState = LoadState<DailyReportRecord | null>;

function DailyReportEditor({ options, reportDate, depotId, current, onDateChange, onDepotChange, onSaved }: { options: DailyReportOptions; reportDate: string; depotId: string; current: CurrentState; onDateChange: (date: string) => void; onDepotChange: (depotId: string) => void; onSaved: (message: string) => void }) {
  const gateway = useDailyReportGateway();
  const existing = current.status === 'ready' ? current.data : null;
  const [values, setValues] = useState<DailyReportFormValues>(() => (existing ? formFromReport(existing) : emptyDailyReportForm(reportDate, depotId)));
  const [errors, setErrors] = useState<DailyReportFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<DailyReportErrorView | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(existing?.id ?? null);

  // The current report arrives asynchronously: load it into the form once.
  if (existing && loadedId !== existing.id) { setLoadedId(existing.id); setValues(formFromReport(existing)); }

  if (current.status === 'loading') return <LoadingState label="Loading the report for this date" />;
  if (current.status === 'error') return <DailyReportErrorPanel view={describeDailyReportError(current.error)} />;

  const change = (changes: Partial<DailyReportFormValues>) => {
    if (changes.reportDate !== undefined && changes.reportDate !== reportDate) { onDateChange(changes.reportDate); return; }
    if (changes.depotId !== undefined && changes.depotId !== depotId) { onDepotChange(changes.depotId); return; }
    setValues((previous) => ({ ...previous, ...changes }));
  };

  const persist = async (forSubmission: boolean): Promise<DailyReportRecord | null> => {
    setFailure(null);
    const clientErrors = validateDailyReportForm(values, { requireDepot: options.depots.length > 1 && !existing, forSubmission });
    setErrors(clientErrors);
    if (hasFormErrors(clientErrors)) return null;
    const body = buildDailyReportBody({ ...values, depotId: values.depotId || depotId }, !existing);
    return existing ? gateway.update(existing.id, existing.version, body) : gateway.create(body);
  };

  const run = async (submit: boolean) => {
    setSaving(true);
    let saved: DailyReportRecord | null = null;
    try {
      saved = await persist(submit);
      if (!saved) return;
      if (submit) {
        await gateway.submit(saved.id, saved.version);
        onSaved(`Daily report for ${saved.reportDate} submitted.`);
      } else {
        onSaved(`Draft saved for ${saved.reportDate}.`);
      }
    } catch (error) {
      const view = describeDailyReportError(error);
      if (saved) {
        // The draft was saved (new version) but submission failed: reload it so a retry uses the current version.
        onSaved(`Draft saved for ${saved.reportDate}, but it was not submitted: ${view.message}`);
        return;
      }
      setErrors(view.fieldErrors);
      setFailure(view);
    } finally {
      setSaving(false);
    }
  };

  if (existing?.status === 'SUBMITTED') {
    return <>
      <Card><div className="form-grid"><FormField label="Date"><Input type="date" value={reportDate} onChange={(event) => onDateChange(event.target.value)} /></FormField></div></Card>
      <Alert tone="success" title="Report submitted">This report was submitted{existing.submittedAt ? ` on ${new Date(existing.submittedAt).toLocaleString()}` : ''} and is read-only.</Alert>
      <OperationsSummary figures={figuresFromReport(existing)} title={`${existing.depot.code} · ${existing.reportDate}`} status="SUBMITTED" />
      <RegisteredTasksPanel report={existing} />
    </>;
  }

  return <>
    {failure && <DailyReportErrorPanel view={failure} />}
    <OperationsSummary figures={figuresFromForm(values, options)} title={existing ? `${existing.depot.code} · ${existing.reportDate}` : `New report · ${reportDate}`} status={existing ? 'DRAFT' : 'PREVIEW'} />
    <Card>
      <div className="section-heading"><div><span className="section-kicker"><Clock size={13} /> {existing ? 'Draft' : 'New report'}</span><h2>{existing ? 'Update the daily report' : 'Record the day’s operations'}</h2></div></div>
      <DailyReportFormView values={values} errors={errors} options={options} existing={existing} saving={saving} onChange={change} onSave={(event) => { event.preventDefault(); void run(false); }} onSubmitReport={() => void run(true)} />
    </Card>
    {existing && <RegisteredTasksPanel report={existing} />}
  </>;
}
