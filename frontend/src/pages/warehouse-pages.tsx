import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Boxes, CheckCircle2, Clock3, PackageCheck, PauseCircle } from 'lucide-react';
import { routes } from '../app/routes';
import { applyTaskPreviewAction, type TaskPreviewAction } from '../mock/task-preview';
import type { EmployeeRecord, TaskRecord } from '../types/domain';
import { useRepositories } from '../state/repositories';
import { Alert, Badge, Button, Card, DataTable, EmptyState, ErrorState, FilterBar, LoadingState, MetricCard, PageHeader, SearchField, Select, StatusBadge } from '../components/ui';
import { TaskWorkflowPanel } from './TaskWorkflowPanel';
import { filterWarehouseOperations, warehouseDuration, warehouseSummary, type WarehouseFilters } from './warehouse-data';

const v1Statuses = ['ASSIGNED', 'ACCEPTED', 'STARTED', 'PAUSED', 'RESUMED', 'COMPLETED', 'VERIFIED', 'REJECTED', 'REASSIGNED', 'CANCELLED', 'REOPENED', 'FAILED'];
const operationTypes = ['RECEIVING', 'STORAGE', 'PICKING', 'PACKING', 'DISPATCH'];
const pathFor = (id: string) => routes.warehouseDetail.replace(':taskId', id);

function useWarehouseTasks() {
  const { mode, repositories } = useRepositories();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; setLoading(true); setError(null); void repositories.tasks.list({ page: 1, pageSize: Number.MAX_SAFE_INTEGER }).then((result) => { if (active) { setTasks(result.items); setLoading(false); } }).catch((cause: unknown) => { if (active) { setError(cause instanceof Error ? cause.message : 'Warehouse tasks could not be loaded.'); setLoading(false); } }); return () => { active = false; }; }, [repositories.tasks]);
  return { mode, repositories, tasks, setTasks, loading, error };
}

export function WarehouseDashboardPage() {
  const { mode, tasks, loading, error } = useWarehouseTasks();
  const [filters, setFilters] = useState<WarehouseFilters>({ operation: 'all', status: 'all', employee: 'all', warehouse: 'all' });
  const operations = useMemo(() => filterWarehouseOperations(tasks, filters), [filters, tasks]);
  const summary = warehouseSummary(operations);
  const employees = [...new Set(tasks.map((task) => task.employee))].sort();
  const warehouses = [...new Set(operations.map((operation) => operation.warehouse))].sort();
  if (loading) return <LoadingState label="Loading warehouse operations" />;
  if (error) return <ErrorState title="Warehouse operations could not be loaded" description={error} />;
  return <><PageHeader title="Warehouse operations" description="Track BOX handling, task state, people, and operational timing from the shared task workflow." actions={<Badge tone={mode === 'mock' ? 'info' : 'neutral'}>{mode === 'mock' ? 'Mock operations' : 'API readiness'}</Badge>} /><Alert tone="info" title="Operational preview">Warehouse values are projected from the shared task repository. Server-side inventory movement and authorization remain backend-authoritative.</Alert><div className="metric-grid"><MetricCard label="Boxes handled" value={`${summary.boxesHandled} BOX`} detail="Selected warehouse scope" accent="indigo" icon={<Boxes size={16} />} /><MetricCard label="Tasks completed" value={String(summary.completed)} detail="Completed or verified" accent="green" icon={<CheckCircle2 size={16} />} /><MetricCard label="Active tasks" value={String(summary.active)} detail="Started or resumed" accent="amber" icon={<Clock3 size={16} />} /><MetricCard label="Pending tasks" value={String(summary.pending)} detail={`${summary.paused} paused`} accent="slate" icon={<PauseCircle size={16} />} /></div><FilterBar resultLabel={`${operations.length} warehouse tasks`}><SearchField placeholder="Search task, operation, employee, or warehouse" value={filters.search} onChange={(search) => setFilters((current) => ({ ...current, search }))} /><Select value={filters.operation} onChange={(event) => setFilters((current) => ({ ...current, operation: event.target.value }))} aria-label="Filter warehouse operation"><option value="all">All operations</option>{operationTypes.map((operation) => <option key={operation}>{operation}</option>)}</Select><Select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} aria-label="Filter warehouse status"><option value="all">All states</option>{v1Statuses.map((status) => <option key={status}>{status}</option>)}</Select><Select value={filters.employee} onChange={(event) => setFilters((current) => ({ ...current, employee: event.target.value }))} aria-label="Filter warehouse employee"><option value="all">All employees</option>{employees.map((employee) => <option key={employee}>{employee}</option>)}</Select><Select value={filters.warehouse} onChange={(event) => setFilters((current) => ({ ...current, warehouse: event.target.value }))} aria-label="Filter warehouse depot"><option value="all">All warehouses</option>{warehouses.map((warehouse) => <option key={warehouse}>{warehouse}</option>)}</Select><Button variant="ghost" onClick={() => setFilters({ operation: 'all', status: 'all', employee: 'all', warehouse: 'all' })}>Clear filters</Button></FilterBar><Card><div className="section-heading"><h2>Warehouse task register</h2><Badge tone="neutral">BOX only</Badge></div><DataTable caption="Warehouse operational task directory" headers={['Task', 'Operation', 'Employee', 'Warehouse', 'Status', 'Boxes', 'Started', 'Completed', 'Time', 'SLA']} rows={operations.map((operation) => [<Link key={operation.taskId} className="table-link mono" to={pathFor(operation.taskId)}>{operation.taskCode}</Link>, operation.operation, <span>{operation.employee}<small className="table-sub">{operation.supervisor ? `Supervisor: ${operation.supervisor}` : 'No supervisor'}</small></span>, operation.warehouse, <StatusBadge status={operation.status} />, <span className="mono">{operation.boxesHandled} / {operation.boxesAssigned} BOX</span>, operation.startedAt ? new Date(operation.startedAt).toLocaleString() : '—', operation.completedAt ? new Date(operation.completedAt).toLocaleString() : '—', warehouseDuration(operation.task), <StatusBadge status={operation.sla} />])} empty={<EmptyState icon={PackageCheck} title="No warehouse tasks match" description="Adjust the current filters or clear them to return to the operational queue." />} /></Card></>;
}

export function WarehouseTaskDetailPage() {
  const { taskId } = useParams();
  const { mode, repositories } = useRepositories();
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; if (!taskId) return undefined; setLoading(true); void Promise.all([repositories.tasks.getById(taskId), repositories.employees.list({ page: 1, pageSize: Number.MAX_SAFE_INTEGER })]).then(([record, people]) => { if (active) { setTask(record ?? null); setEmployees(people.items); setLoading(false); } }).catch((cause: unknown) => { if (active) { setError(cause instanceof Error ? cause.message : 'Warehouse task could not be loaded.'); setLoading(false); } }); return () => { active = false; }; }, [repositories.employees, repositories.tasks, taskId]);
  if (loading) return <LoadingState label="Loading warehouse task" />;
  if (error) return <ErrorState title="Warehouse task could not be loaded" description={error} />;
  if (!task) return <EmptyState icon={PackageCheck} title="Warehouse task not found" description="The selected warehouse task is not available in the current data source." action={<Link className="button button-primary" to={routes.warehouse}>Back to warehouse operations</Link>} />;
  const operation = filterWarehouseOperations([task])[0];
  const applyAction = async (action: TaskPreviewAction) => { if (mode !== 'mock') return 'Warehouse task mutations require a confirmed backend contract.'; try { const updated = applyTaskPreviewAction(task, action, employees); const saved = await repositories.tasks.update(task.id, updated); setTask(saved ?? updated); return undefined; } catch (cause) { return cause instanceof Error ? cause.message : 'The warehouse preview could not be updated.'; } };
  return <><PageHeader breadcrumbs={['Warehouse operations', operation.taskCode]} title={operation.taskCode} description={`${operation.operation} at ${operation.warehouse} · ${operation.employee}`} actions={<Link className="button button-secondary" to={routes.warehouse}>Back to directory</Link>} /><div className="detail-grid"><Card><div className="section-heading"><h2>Operational context</h2><StatusBadge status={operation.status} /></div><div className="detail-facts four"><span><small>Operation</small><strong>{operation.operation}</strong></span><span><small>Warehouse</small><strong>{operation.warehouse}</strong></span><span><small>Assigned employee</small><strong>{operation.employee}</strong></span><span><small>Supervisor</small><strong>{operation.supervisor ?? 'Not assigned'}</strong></span></div></Card><Card><div className="section-heading"><h2>BOX handling</h2><Badge tone="neutral">BOX only</Badge></div><div className="detail-facts"><span><small>Assigned</small><strong>{operation.boxesAssigned} BOX</strong></span><span><small>Handled</small><strong>{operation.boxesHandled} BOX</strong></span><span><small>Remaining</small><strong>{operation.boxesRemaining} BOX</strong></span></div></Card></div><TaskWorkflowPanel task={task} mode={mode} employees={employees} onSubmit={applyAction} /></>;
}
