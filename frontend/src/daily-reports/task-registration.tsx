import { useState, type FormEvent } from 'react';
import { ClipboardCheck, Play, Plus } from 'lucide-react';
import { Alert, Badge, Button, Card, DataTable, EmptyState, ErrorState, FormField, Input, LoadingState, Select } from '../components/ui';
import { useLoad } from '../shifts/use-load';
import { parseBoxQuantity, useTaskRegistrationGateway, type DepotEmployee, type DepotTask, type DepotTaskType } from './task-registration-gateway';

interface ApiErrorLike { status?: number; message?: string }

function describeTaskError(error: unknown): { title: string; message: string } {
  const candidate = (typeof error === 'object' && error !== null ? error : {}) as ApiErrorLike;
  if (candidate.status === undefined) return { title: 'Could not reach the server', message: 'Check your connection and try again.' };
  if (candidate.status === 401) return { title: 'Session expired', message: 'Please sign in again.' };
  if (candidate.status === 403) return { title: 'Not permitted', message: 'You do not have permission to change this task.' };
  if (candidate.status === 409) return { title: 'Task state changed', message: candidate.message || 'The task is no longer in a state that allows this action. Refresh and try again.' };
  if (candidate.status === 400 || candidate.status === 422) return { title: 'Check the values', message: candidate.message || 'The server rejected the submitted values.' };
  return { title: 'Something went wrong', message: 'The request could not be completed. Try again shortly.' };
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = { PENDING: 'neutral', ASSIGNED: 'info', IN_PROGRESS: 'warning', PAUSED: 'warning', COMPLETED: 'success' };

function TaskRow({ task, onStart, onComplete, busy }: { task: DepotTask; onStart: () => void; onComplete: (boxes: number) => void; busy: boolean }) {
  const [completed, setCompleted] = useState(task.plannedBoxes === null ? '' : String(task.plannedBoxes));
  const [error, setError] = useState<string | undefined>();
  const canStart = task.status === 'PENDING' || task.status === 'ASSIGNED';
  const canComplete = task.status === 'IN_PROGRESS' || task.status === 'PAUSED';
  return <div className="page-actions">
    {canStart && <Button type="button" variant="secondary" loading={busy} onClick={onStart}><Play size={14} /> Start</Button>}
    {canComplete && <form className="page-actions" noValidate onSubmit={(event) => { event.preventDefault(); const parsed = parseBoxQuantity(completed, true); setError(parsed.error); if (parsed.value !== null) onComplete(parsed.value); }}>
      <FormField label="Completed BOX" error={error}><Input type="number" inputMode="numeric" min={0} step={1} value={completed} onChange={(event) => setCompleted(event.target.value)} aria-label={`Completed BOX for ${task.taskType} task`} /></FormField>
      <Button type="submit" loading={busy}><ClipboardCheck size={14} /> Complete</Button>
    </form>}
  </div>;
}

/** Register loading/unloading tasks for the depot and drive them to completion with the BOX quantity. */
export function DepotTaskPanel({ depotId, onTaskCompleted }: { depotId: string; onTaskCompleted: () => void }) {
  const gateway = useTaskRegistrationGateway();
  const [refreshKey, setRefreshKey] = useState(0);
  const employeesState = useLoad(() => gateway.listEmployees(depotId), [gateway, depotId]);
  const tasksState = useLoad(() => gateway.listOpenTasks(depotId), [gateway, depotId, refreshKey]);
  const [taskType, setTaskType] = useState<DepotTaskType>('LOADING');
  const [planned, setPlanned] = useState('');
  const [plannedError, setPlannedError] = useState<string | undefined>();
  const [labour, setLabour] = useState<string[]>([]);
  const [startNow, setStartNow] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ title: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const act = async (id: string, action: () => Promise<DepotTask>, done: (task: DepotTask) => string) => {
    setBusyId(id); setFailure(null); setNotice(null);
    try {
      const task = await action();
      setNotice(done(task));
      setRefreshKey((key) => key + 1);
      if (task.status === 'COMPLETED') onTaskCompleted();
    } catch (error) {
      setFailure(describeTaskError(error));
    } finally {
      setBusyId(null);
    }
  };

  const register = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseBoxQuantity(planned, false);
    setPlannedError(parsed.error);
    if (parsed.error) return;
    void act('new', () => gateway.register({ depotId, taskType, plannedBoxes: parsed.value, employeeIds: labour, startNow }), (task) => {
      setPlanned(''); setLabour([]);
      return `${task.taskType === 'LOADING' ? 'Loading' : 'Unloading'} task registered${task.status === 'IN_PROGRESS' ? ' and started' : ''}.`;
    });
  };

  const employees: DepotEmployee[] = employeesState.status === 'ready' ? employeesState.data : [];
  return <Card>
    <div className="section-heading"><div><span className="section-kicker">Task registration</span><h2>Loading and unloading tasks</h2></div><Badge tone="neutral">Recorded in the CRM</Badge></div>
    {notice && <Alert tone="success" title="Task updated">{notice}</Alert>}
    {failure && <Alert tone="warning" title={failure.title}>{failure.message}</Alert>}
    <form onSubmit={register} noValidate aria-label="Register task">
      <div className="form-grid">
        <FormField label="Task type"><Select value={taskType} onChange={(event) => setTaskType(event.target.value as DepotTaskType)}><option value="LOADING">Loading</option><option value="UNLOADING">Unloading</option></Select></FormField>
        <FormField label="Planned BOX" hint="Optional." error={plannedError}><Input type="number" inputMode="numeric" min={0} step={1} value={planned} onChange={(event) => setPlanned(event.target.value)} /></FormField>
      </div>
      <div className="form-field" role="group" aria-label="Labour">
        <span>Labour</span>
        {employeesState.status === 'loading' && <small>Loading depot employees…</small>}
        {employeesState.status === 'error' && <small className="field-error">{describeTaskError(employeesState.error).message}</small>}
        {employees.map((employee) => <label className="checkbox-field" key={employee.id}><input type="checkbox" checked={labour.includes(employee.id)} onChange={() => setLabour((current) => (current.includes(employee.id) ? current.filter((id) => id !== employee.id) : [...current, employee.id]))} />{employee.name} <small>({employee.code})</small></label>)}
        {employeesState.status === 'ready' && employees.length === 0 && <small>No active employees are assigned to this depot.</small>}
      </div>
      <label className="checkbox-field"><input type="checkbox" checked={startNow} onChange={(event) => setStartNow(event.target.checked)} /> Start the task now</label>
      <div className="page-actions"><Button type="submit" loading={busyId === 'new'}><Plus size={15} /> Register task</Button></div>
    </form>
    {tasksState.status === 'loading' ? <LoadingState label="Loading open tasks" /> : tasksState.status === 'error' ? <ErrorState title={describeTaskError(tasksState.error).title} description={describeTaskError(tasksState.error).message} /> : <DataTable
      caption="Open loading and unloading tasks"
      headers={['Type', 'Status', 'Planned BOX', 'Started', 'Actions']}
      rows={tasksState.data.map((task) => [
        task.taskType === 'LOADING' ? 'Loading' : 'Unloading',
        <Badge key="s" tone={STATUS_TONE[task.status] ?? 'neutral'}>{task.status.replace('_', ' ').toLowerCase()}</Badge>,
        task.plannedBoxes === null ? '—' : task.plannedBoxes.toLocaleString('en-US'),
        task.startedAt ? new Date(task.startedAt).toLocaleTimeString() : '—',
        <TaskRow key="a" task={task} busy={busyId === task.id}
          onStart={() => void act(task.id, () => gateway.start(task.id), () => 'Task started; working time is now being recorded.')}
          onComplete={(boxes) => void act(task.id, () => gateway.complete(task.id, boxes), (done) => `Task completed with ${done.completedBoxes ?? boxes} BOX.`)} />,
      ])}
      empty={<EmptyState icon={ClipboardCheck} title="No open tasks" description="Register a loading or unloading task to start recording BOX quantities and time." />}
    />}
  </Card>;
}
