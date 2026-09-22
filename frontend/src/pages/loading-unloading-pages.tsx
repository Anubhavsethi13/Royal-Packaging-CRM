import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Boxes, CheckCircle2, PackageCheck, Truck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { routes } from '../app/routes';
import { Alert, Badge, Button, Card, DataTable, EmptyState, ErrorState, FilterBar, FormField, Input, LoadingState, MetricCard, PageHeader, SearchField, Select, StatusBadge, Tabs } from '../components/ui';
import { applyTaskPreviewAction, type TaskPreviewAction } from '../mock/task-preview';
import { useRepositories } from '../state/repositories';
import type { EmployeeRecord, LoadingUnloadingOperationRecord, TaskRecord } from '../types/domain';
import { formatDuration } from './task-workflow';
import { loadingUnloadingOperations, slaVarianceSeconds, validateLoadingUnloadingBoxes } from './loading-unloading-data';
import { TaskWorkflowPanel } from './TaskWorkflowPanel';

const statuses = ['ASSIGNED', 'ACCEPTED', 'STARTED', 'PAUSED', 'RESUMED', 'COMPLETED', 'VERIFIED', 'REJECTED', 'REASSIGNED', 'CANCELLED', 'REOPENED', 'FAILED'];
const slaStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'MET', 'AT_RISK', 'BREACHED', 'NOT_APPLICABLE'];
const detailPath = (id: string) => routes.loadingUnloadingDetail.replace(':taskId', id);

function useLoadingUnloadingTasks() {
  const { mode, repositories } = useRepositories();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void repositories.tasks.list({ page: 1, pageSize: Number.MAX_SAFE_INTEGER }).then((result) => {
      if (active) { setTasks(result.items); setLoading(false); }
    }).catch((cause: unknown) => {
      if (active) { setError(cause instanceof Error ? cause.message : 'Loading and unloading operations could not be loaded.'); setLoading(false); }
    });
    return () => { active = false; };
  }, [repositories.tasks]);
  return { mode, repositories, tasks, loading, error };
}

function slaLabel(status: LoadingUnloadingOperationRecord['slaStatus']) { return status.replaceAll('_', ' '); }

function SlaPanel({ operation }: { operation: LoadingUnloadingOperationRecord }) {
  const variance = slaVarianceSeconds(operation);
  const varianceLabel = variance === undefined ? 'Not available' : `${variance <= 0 ? 'Within target by' : 'Over target by'} ${formatDuration(Math.abs(variance))}`;
  return <Card><div className="section-heading"><div><span className="section-kicker">Operational SLA</span><h2>Timing against target</h2></div><StatusBadge status={slaLabel(operation.slaStatus)} /></div><div className="detail-facts"><span><small>SLA target</small><strong>{operation.slaTargetSeconds === undefined ? 'Not set' : formatDuration(operation.slaTargetSeconds)}</strong></span><span><small>Time taken</small><strong>{formatDuration(operation.totalDurationSeconds)}</strong></span><span><small>Status</small><strong>{slaLabel(operation.slaStatus)}</strong></span><span><small>Variance</small><strong>{varianceLabel}</strong></span></div><p className="muted-note">Preview comparison only. Authoritative SLA rules and persistence remain backend-owned.</p></Card>;
}

function BoxHandling({ operation, mode, onSubmit }: { operation: LoadingUnloadingOperationRecord; mode: 'mock' | 'api'; onSubmit: (action: TaskPreviewAction) => Promise<string | undefined> }) {
  const [value, setValue] = useState(String(operation.boxesHandled));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setValue(String(operation.boxesHandled)); }, [operation.boxesHandled]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(''); setMessage('');
    const validation = validateLoadingUnloadingBoxes(value, operation.boxesAssigned);
    if (validation) { setError(validation); return; }
    if (mode !== 'mock') { setError('BOX updates require a confirmed backend contract.'); return; }
    setSaving(true);
    const result = await onSubmit({ type: 'update', boxesCompleted: Number(value) });
    setSaving(false);
    if (result) setError(result); else setMessage('BOX handling updated in preview.');
  };
  return <Card><div className="section-heading"><div><span className="section-kicker">BOX handling</span><h2>Operational quantity</h2></div><Badge tone="neutral">BOX only</Badge></div><div className="detail-facts"><span><small>Assigned</small><strong>{operation.boxesAssigned} BOX</strong></span><span><small>Handled</small><strong>{operation.boxesHandled} BOX</strong></span><span><small>Remaining</small><strong>{operation.boxesRemaining} BOX</strong></span></div><form className="form-grid" onSubmit={save} noValidate><FormField label="Handled BOX"><Input value={value} inputMode="numeric" pattern="[0-9]*" onChange={(event) => setValue(event.target.value)} aria-describedby={error ? 'box-update-error' : undefined} /></FormField><div className="dialog-actions"><Button type="submit" loading={saving} disabled={mode !== 'mock'}>{mode === 'mock' ? 'Update BOX' : 'Backend contract pending'}</Button></div></form>{error && <Alert tone="error" title="BOX update not applied"><span id="box-update-error">{error}</span></Alert>}{message && <Alert tone="success" title="Preview updated">{message}</Alert>}<p className="muted-note">Whole numbers only. Handled BOX cannot exceed assigned BOX.</p></Card>;
}

export function LoadingUnloadingPage() {
  const { mode, tasks, loading, error } = useLoadingUnloadingTasks();
  const [tab, setTab] = useState('All');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [employee, setEmployee] = useState('all');
  const [warehouse, setWarehouse] = useState('all');
  const [slaStatus, setSlaStatus] = useState('all');
  const operations = useMemo(() => loadingUnloadingOperations(tasks, { search, operationType: tab === 'All' ? 'all' : tab.toUpperCase(), status, employee, warehouse, slaStatus }), [employee, search, slaStatus, status, tab, tasks, warehouse]);
  const employees = [...new Set(tasks.filter((task) => task.type === 'Loading' || task.type === 'Unloading').map((task) => task.employee))].sort();
  const warehouses = [...new Set(loadingUnloadingOperations(tasks).map((operation) => operation.warehouse))].sort();
  const summary = { loading: operations.filter((item) => item.operationType === 'LOADING').length, unloading: operations.filter((item) => item.operationType === 'UNLOADING').length, handled: operations.reduce((total, item) => total + item.boxesHandled, 0), completed: operations.filter((item) => item.status === 'COMPLETED' || item.status === 'VERIFIED').length };
  if (loading) return <LoadingState label="Loading loading and unloading operations" />;
  if (error) return <ErrorState title="Operations could not be loaded" description={error} />;
  return <><PageHeader title="Loading & unloading" description="Run dock operations through the shared task workflow, with BOX handling, timing, evidence, and SLA context." actions={<Badge tone={mode === 'mock' ? 'info' : 'neutral'}>{mode === 'mock' ? 'Mock operations' : 'API readiness'}</Badge>} /><Alert tone="info" title="Operational preview">This surface uses the shared task repository. Inventory movement, SLA authority, and server authorization remain backend-owned.</Alert><div className="metric-grid"><MetricCard label="Loading" value={String(summary.loading)} detail="Selected view" icon={<Truck size={16} />} /><MetricCard label="Unloading" value={String(summary.unloading)} detail="Selected view" accent="slate" icon={<PackageCheck size={16} />} /><MetricCard label="BOX handled" value={`${summary.handled} BOX`} detail="Selected operations" accent="indigo" icon={<Boxes size={16} />} /><MetricCard label="Completed" value={String(summary.completed)} detail="Completed or verified" accent="green" icon={<CheckCircle2 size={16} />} /></div><Tabs tabs={['All', 'Loading', 'Unloading']} active={tab} onChange={setTab} /><FilterBar resultLabel={`${operations.length} operations`}><SearchField placeholder="Search task, employee, warehouse" value={search} onChange={setSearch} /><Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter operation status"><option value="all">All states</option>{statuses.map((item) => <option key={item}>{item}</option>)}</Select><Select value={employee} onChange={(event) => setEmployee(event.target.value)} aria-label="Filter operation employee"><option value="all">All employees</option>{employees.map((item) => <option key={item}>{item}</option>)}</Select><Select value={warehouse} onChange={(event) => setWarehouse(event.target.value)} aria-label="Filter operation warehouse"><option value="all">All warehouses</option>{warehouses.map((item) => <option key={item}>{item}</option>)}</Select><Select value={slaStatus} onChange={(event) => setSlaStatus(event.target.value)} aria-label="Filter operation SLA"><option value="all">All SLA states</option>{slaStatuses.map((item) => <option key={item}>{slaLabel(item as LoadingUnloadingOperationRecord['slaStatus'])}</option>)}</Select><Button variant="ghost" onClick={() => { setTab('All'); setSearch(''); setStatus('all'); setEmployee('all'); setWarehouse('all'); setSlaStatus('all'); }}>Clear filters</Button></FilterBar><Card><div className="section-heading"><h2>Operation directory</h2><Badge tone="neutral">BOX only</Badge></div><DataTable caption="Loading and unloading operation directory" headers={['Task', 'Operation', 'Employee', 'Warehouse', 'Status', 'Boxes', 'Time taken', 'SLA', 'Actions']} rows={operations.map((operation) => [<Link key={operation.taskId} className="table-link mono" to={detailPath(operation.taskId)}>{operation.taskCode}</Link>, <strong>{operation.operationType}</strong>, operation.employee, operation.warehouse, <StatusBadge status={operation.status} />, <span className="mono">{operation.boxesHandled} / {operation.boxesAssigned} BOX</span>, formatDuration(operation.totalDurationSeconds), <StatusBadge status={slaLabel(operation.slaStatus)} />, <Link className="inline-link" to={detailPath(operation.taskId)}>Open</Link>])} empty={<EmptyState icon={Truck} title={search || status !== 'all' || employee !== 'all' || warehouse !== 'all' || slaStatus !== 'all' || tab !== 'All' ? 'No operations match' : 'No loading or unloading operations'} description="Adjust the filters or clear them to return to the operational queue." />} /></Card></>;
}

export function LoadingUnloadingDetailPage() {
  const { taskId } = useParams();
  const { mode, repositories } = useRepositories();
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; setLoading(true); setError(null); if (!taskId) { setLoading(false); return undefined; } void Promise.all([repositories.tasks.getById(taskId), repositories.employees.list({ page: 1, pageSize: Number.MAX_SAFE_INTEGER })]).then(([record, people]) => { if (active) { setTask(record ?? null); setEmployees(people.items); setLoading(false); } }).catch((cause: unknown) => { if (active) { setError(cause instanceof Error ? cause.message : 'The operation could not be loaded.'); setLoading(false); } }); return () => { active = false; }; }, [repositories.employees, repositories.tasks, taskId]);
  if (loading) return <LoadingState label="Loading operation detail" />;
  if (error) return <ErrorState title="Operation could not be loaded" description={error} />;
  if (!task) return <EmptyState icon={Truck} title="Operation not found" description="The selected task is not available in the current data source." action={<Link className="button button-primary" to={routes.loadingUnloading}>Back to operations</Link>} />;
  const operation = loadingUnloadingOperations([task])[0];
  if (!operation) return <EmptyState icon={Truck} title="Unavailable operation" description="This task is not classified as Loading or Unloading." action={<Link className="button button-primary" to={routes.loadingUnloading}>Back to operations</Link>} />;
  const applyAction = async (action: TaskPreviewAction) => { if (mode !== 'mock') return 'Operation mutations require a confirmed backend contract.'; try { const updated = applyTaskPreviewAction(task, action, employees); const saved = await repositories.tasks.update(task.id, updated); setTask(saved ?? updated); return undefined; } catch (cause) { return cause instanceof Error ? cause.message : 'The operation preview could not be updated.'; } };
  return <><PageHeader breadcrumbs={['Loading & unloading', operation.taskCode]} title={operation.taskCode} description={`${operation.operationType} operation at ${operation.warehouse}`} actions={<Link className="button button-secondary" to={routes.loadingUnloading}>Back to directory</Link>} /><div className="detail-grid"><Card><div className="section-heading"><div><span className="section-kicker">Operation summary</span><h2>{operation.operationType}</h2></div><StatusBadge status={operation.status} /></div><div className="detail-facts four"><span><small>Task</small><strong className="mono">{operation.taskCode}</strong></span><span><small>Employee</small><strong>{operation.employee}</strong></span><span><small>Warehouse</small><strong>{operation.warehouse}</strong></span><span><small>Supervisor</small><strong>{operation.supervisor ?? 'Not assigned'}</strong></span></div></Card><Card><div className="section-heading"><div><span className="section-kicker">Quantity</span><h2>BOX handling</h2></div><Badge tone="neutral">BOX only</Badge></div><div className="detail-facts"><span><small>Assigned</small><strong>{operation.boxesAssigned} BOX</strong></span><span><small>Handled</small><strong>{operation.boxesHandled} BOX</strong></span><span><small>Remaining</small><strong>{operation.boxesRemaining} BOX</strong></span></div></Card></div><SlaPanel operation={operation} /><BoxHandling operation={operation} mode={mode} onSubmit={applyAction} /><TaskWorkflowPanel task={task} mode={mode} employees={employees} onSubmit={applyAction} /></>;
}
