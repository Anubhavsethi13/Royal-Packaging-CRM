import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, CalendarRange, ClipboardCheck, Clock, PackageCheck, Truck, Users } from 'lucide-react';
import { routes } from '../app/routes';
import { useRepositories } from '../state/repositories';
import { Badge, Button, Card, DataTable, DemoNotice, EmptyState, ErrorState, FormField, Input, LoadingState, MetricCard, PageHeader, Select } from '../components/ui';
import { useLoad } from '../shifts/use-load';
import { todayIso } from '../shifts/shift-data';
import { formatLabour, formatMinutes } from '../daily-reports/daily-report-data';
import { useDepotDashboardGateway } from './depot-dashboard-gateway';
import { formatActiveMinutes, formatBox, formatPercent, type DepotKpiDashboard, type DepotKpiEmployeeRow, type DepotKpiSourceTask, type NotConfiguredMetric } from './depot-dashboard-data';

const taskPath = (id: string) => routes.warehouseDetail.replace(':taskId', encodeURIComponent(id));
const operationLabel = (operation: DepotKpiSourceTask['operation']) => (operation === 'LOADING' ? 'Loading' : operation === 'UNLOADING' ? 'Unloading' : 'Other');

interface ApiErrorLike { status?: number; code?: string; message?: string }
function describeError(error: unknown): { title: string; message: string } {
  const candidate = (typeof error === 'object' && error !== null ? error : {}) as ApiErrorLike;
  if (candidate.status === undefined) return { title: 'Could not reach the server', message: 'Check your connection and try again.' };
  if (candidate.code === 'DEPOT_ASSIGNMENT_REQUIRED') return { title: 'No depot assigned', message: 'Your employee profile is not assigned to a depot. Ask an administrator to assign one.' };
  if (candidate.status === 403) return { title: 'Not permitted', message: 'You do not have access to this depot’s KPI dashboard.' };
  if (candidate.status === 400) return { title: 'Check the dates', message: candidate.message || 'The selected range is not valid.' };
  return { title: 'Depot KPIs could not be loaded', message: 'Try again shortly.' };
}

// ---------------------------------------------------------------------------
// Presentational pieces (props only)
// ---------------------------------------------------------------------------

/** SLA and Quality have no approved rule: they are shown as "Not configured", never as a number. */
export function NotConfigured({ metric }: { metric: NotConfiguredMetric }) {
  return <span title={metric.reason}><Badge tone="neutral">Not configured</Badge></span>;
}

export function DepotKpiStrip({ dashboard }: { dashboard: DepotKpiDashboard }) {
  return <Card>
    <div className="section-heading"><div><span className="section-kicker">Depot KPI</span><h2>{dashboard.overview.depot?.code ?? 'All depots'} · {dashboard.overview.from === dashboard.overview.to ? dashboard.overview.from : `${dashboard.overview.from} – ${dashboard.overview.to}`}</h2></div><Link className="button button-ghost" to={routes.depotKpi}>Open depot KPI dashboard</Link></div>
    <div className="detail-facts four">
      <span><small>Boxes handled</small><strong>{formatBox(dashboard.operations.boxes)}</strong></span>
      <span><small>Tasks completed</small><strong>{dashboard.operations.completedTasks}</strong></span>
      <span><small>Avg task time</small><strong>{formatActiveMinutes(dashboard.time.averageTaskMinutes)}</strong></span>
      <span><small>SLA</small><strong><NotConfigured metric={dashboard.performance.sla} /></strong></span>
      <span><small>Quality</small><strong><NotConfigured metric={dashboard.performance.quality} /></strong></span>
    </div>
  </Card>;
}


export function DepotKpiSummary({ dashboard }: { dashboard: DepotKpiDashboard }) {
  const { overview, operations, time, labour, performance } = dashboard;
  return <>
    <Card>
      <div className="section-heading"><div><span className="section-kicker">Depot overview</span><h2>{overview.depot ? `${overview.depot.name} (${overview.depot.code})` : 'All depots'}</h2></div><Badge tone="neutral">{overview.timezone}</Badge></div>
      <div className="detail-facts four">
        <span><small>Date</small><strong>{overview.from === overview.to ? overview.from : `${overview.from} – ${overview.to}`}</strong></span>
        <span><small>Depot</small><strong>{overview.depot?.code ?? 'All depots'}</strong></span>
        <span><small>Supervisor</small><strong>{overview.supervisors.map((supervisor) => supervisor.name ?? supervisor.employeeId).join(', ') || '—'}</strong></span>
      </div>
    </Card>
    <div className="section-heading"><div><span className="section-kicker">Operational KPIs</span><h2>Tasks and BOX</h2></div></div>
    <div className="metric-grid">
      <MetricCard label="Loading tasks" value={String(operations.loadingTasks)} detail={`${operations.completedLoadingTasks} completed`} icon={<Truck size={16} />} />
      <MetricCard label="Unloading tasks" value={String(operations.unloadingTasks)} detail={`${operations.completedUnloadingTasks} completed`} accent="slate" icon={<PackageCheck size={16} />} />
      <MetricCard label="Total tasks" value={String(operations.totalTasks)} detail="Registered in the period" accent="indigo" icon={<ClipboardCheck size={16} />} />
      <MetricCard label="BOX quantity" value={formatBox(operations.boxes)} detail={`Loading ${formatBox(operations.loadingBoxes)} · Unloading ${formatBox(operations.unloadingBoxes)}`} accent="green" icon={<Boxes size={16} />} />
      <MetricCard label="Completed tasks" value={String(operations.completedTasks)} detail="Completed in the period" accent="amber" icon={<ClipboardCheck size={16} />} />
    </div>
    <div className="detail-grid">
      <Card>
        <div className="section-heading"><div><span className="section-kicker"><Clock size={13} /> Time</span><h2>Operational time</h2></div></div>
        <div className="detail-facts">
          <span><small>Total operational time</small><strong>{formatActiveMinutes(time.totalOperationalMinutes)}</strong></span>
          <span><small>Average task time</small><strong>{formatActiveMinutes(time.averageTaskMinutes)}</strong></span>
          <span><small>Timed tasks</small><strong>{time.timedTasks} of {operations.completedTasks}</strong></span>
        </div>
      </Card>
      <Card>
        <div className="section-heading"><div><span className="section-kicker"><Users size={13} /> Labour</span><h2>From daily depot reports</h2></div></div>
        <div className="detail-facts">
          <span><small>Required labour</small><strong>{labour.required ?? 'Not recorded'}</strong></span>
          <span><small>Present labour</small><strong>{labour.present ?? 'Not recorded'}</strong></span>
          <span><small>Attendance (present ÷ required)</small><strong>{formatPercent(labour.attendancePercent)}</strong></span>
        </div>
      </Card>
      <Card>
        <div className="section-heading"><div><span className="section-kicker">Performance</span><h2>SLA and quality</h2></div></div>
        <div className="detail-facts">
          <span><small>SLA</small><strong><NotConfigured metric={performance.sla} /></strong></span>
          <span><small>Quality</small><strong><NotConfigured metric={performance.quality} /></strong></span>
        </div>
        <p className="muted">{performance.sla.reason}</p>
      </Card>
    </div>
  </>;
}

function EmployeeRowSources({ row, tasks }: { row: DepotKpiEmployeeRow; tasks: Map<string, DepotKpiSourceTask> }) {
  return <ul className="inline-list">{row.sourceTaskIds.map((id) => { const task = tasks.get(id); return <li key={id}><Link className="inline-link" to={taskPath(id)}>{task?.taskCode ?? id}</Link>{task ? ` · ${operationLabel(task.operation)} · ${formatBox(task.boxes)} shared by ${task.assignees.length}` : ''}</li>; })}</ul>;
}

export function EmployeeKpiTable({ dashboard }: { dashboard: DepotKpiDashboard }) {
  const [open, setOpen] = useState<string | null>(null);
  const tasks = useMemo(() => new Map(dashboard.sources.completedTasks.map((task) => [task.id, task])), [dashboard]);
  return <Card>
    <div className="section-heading"><div><span className="section-kicker">Performance</span><h2>Employee KPI</h2></div><Badge tone="neutral">{dashboard.employees.length} employees</Badge></div>
    <DataTable
      caption="Employee KPI for the selected depot and period"
      headers={['Employee', 'BOX', 'Tasks', 'Avg time', 'SLA', 'Quality', 'Source']}
      rows={dashboard.employees.flatMap((row) => [[
        <span key="e"><strong>{row.employee.name ?? row.employee.code}</strong> <small>{row.employee.code}</small></span>,
        <span key="b" className="mono">{formatBox(row.boxes)}</span>,
        <span key="t" className="mono">{row.tasksCompleted}</span>,
        formatActiveMinutes(row.averageTaskMinutes),
        <NotConfigured key="s" metric={row.sla} />,
        <NotConfigured key="q" metric={row.quality} />,
        <Button key="v" type="button" variant="ghost" onClick={() => setOpen(open === row.employee.id ? null : row.employee.id)} aria-expanded={open === row.employee.id}>{open === row.employee.id ? 'Hide source tasks' : 'View source tasks'}</Button>,
      ], ...(open === row.employee.id ? [[<span key="src-label"><small>Source tasks</small></span>, <EmployeeRowSources key="src" row={row} tasks={tasks} />, '', '', '', '', '']] : [])])}
      empty={<EmptyState icon={Users} title="No completed tasks" description="Employee KPIs appear once tasks registered in this depot are completed." />}
    />
    <p className="muted">BOX of a shared task is split equally between the employees assigned when it was completed. Average time uses recorded start/pause/resume/complete events only.</p>
  </Card>;
}

export function DepotKpiSources({ dashboard }: { dashboard: DepotKpiDashboard }) {
  return <Card>
    <div className="section-heading" id="source-records"><div><span className="section-kicker">Traceability</span><h2>Source records</h2></div></div>
    <p className="muted">Daily report → registered tasks → BOX quantities → employee KPI. Every figure above is derived from these records.</p>
    <DataTable
      caption="Daily depot reports in the period"
      headers={['Date', 'Depot', 'Loading', 'Unloading', 'Total operations', 'Labour', 'Duration', 'Status']}
      rows={dashboard.sources.dailyReports.map((report) => [
        <Link key="d" className="inline-link mono" to={routes.dailyReports}>{report.reportDate}</Link>, report.depotCode, String(report.loadingCount), String(report.unloadingCount),
        <strong key="t">{report.totalOperations}</strong>, formatLabour(report.labourPresent, report.labourRequired), formatMinutes(report.durationMinutes),
        <Badge key="s" tone={report.status === 'SUBMITTED' ? 'success' : 'warning'}>{report.status === 'SUBMITTED' ? 'Submitted' : 'Draft'}</Badge>,
      ])}
      empty={<EmptyState icon={CalendarRange} title="No daily report" description="No daily depot report was recorded for this period." />}
    />
    <div id="source-tasks" />
    <DataTable
      caption="Completed tasks (source of BOX, time and employee KPI)"
      headers={['Task', 'Operation', 'BOX', 'Active time', 'Employees', 'Completed']}
      rows={dashboard.sources.completedTasks.map((task) => [
        <Link key="c" className="inline-link mono" to={taskPath(task.id)}>{task.taskCode}</Link>, operationLabel(task.operation),
        <span key="b" className="mono">{formatBox(task.boxes)}</span>, formatActiveMinutes(task.activeMinutes),
        task.assignees.map((assignee) => assignee.name ?? assignee.id).join(', ') || '—',
        task.completedAt ? new Date(task.completedAt).toLocaleString() : '—',
      ])}
      empty={<EmptyState icon={ClipboardCheck} title="No completed tasks" description="No registered task was completed in this period." />}
    />
  </Card>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DepotKpiDashboardPage() {
  const gateway = useDepotDashboardGateway();
  const { mode } = useRepositories();
  const today = useMemo(() => todayIso(), []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [depotId, setDepotId] = useState('');
  const state = useLoad(() => gateway.load({ from, to, ...(depotId ? { depotId } : {}) }), [gateway, from, to, depotId]);

  const header = <PageHeader eyebrow="KPI" title="Depot KPI dashboard" description="Depot operations, time, labour and employee KPI for the selected period, traceable to daily reports and registered tasks." />;
  const depots = state.status === 'ready' ? state.data.overview.availableDepots : [];
  const filters = <Card><div className="form-grid">
    <FormField label="From"><Input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value || today)} /></FormField>
    <FormField label="To"><Input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value || today)} /></FormField>
    {depots.length > 1 && <FormField label="Depot"><Select value={depotId} onChange={(event) => setDepotId(event.target.value)}><option value="">All depots</option>{depots.map((depot) => <option key={depot.id} value={depot.id}>{depot.name} ({depot.code})</option>)}</Select></FormField>}
  </div></Card>;

  return <>
    {header}
    {mode === 'mock' && <DemoNotice>Preview data: these depot KPIs are illustrative and not read from the server.</DemoNotice>}
    {filters}
    {state.status === 'loading' && <LoadingState label="Loading depot KPIs" />}
    {state.status === 'error' && (() => { const view = describeError(state.error); return <ErrorState title={view.title} description={view.message} />; })()}
    {state.status === 'ready' && <>
      <DepotKpiSummary dashboard={state.data} />
      <EmployeeKpiTable dashboard={state.data} />
      <DepotKpiSources dashboard={state.data} />
    </>}
  </>;
}

/** Supervisor dashboard: today's KPI strip; the server decides the depot scope (Supervisors: organization-wide). */
export function SupervisorDepotKpiPanel() {
  const gateway = useDepotDashboardGateway();
  const today = useMemo(() => todayIso(), []);
  const state = useLoad(() => gateway.load({ from: today, to: today }), [gateway, today]);
  if (state.status === 'loading') return <LoadingState label="Loading depot KPIs" />;
  if (state.status === 'error') { const view = describeError(state.error); return <ErrorState title={view.title} description={view.message} />; }
  return <DepotKpiStrip dashboard={state.data} />;
}
