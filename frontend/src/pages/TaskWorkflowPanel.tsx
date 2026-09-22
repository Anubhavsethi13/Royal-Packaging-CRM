import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, FileCheck2, Pause, Play, RotateCcw, ShieldCheck, UserRoundCheck, XCircle } from 'lucide-react';
import { useAuth } from '../state/auth';
import { Alert, Badge, Button, Card, Dialog, EmptyState, FormField, Input, Select, StatusBadge, Textarea } from '../components/ui';
import type { EmployeeRecord, TaskRecord } from '../types/domain';
import { calculateTimerDurations, formatDuration, isTaskActionAvailable, validateBoxQuantity, type TaskWorkflowAction } from './task-workflow';
import type { TaskPreviewAction } from '../mock/task-preview';

const labels: Record<TaskWorkflowAction, string> = { ACCEPT: 'Accept task', START: 'Start task', PAUSE: 'Pause', RESUME: 'Resume', COMPLETE: 'Complete', VERIFY: 'Verify', REJECT: 'Reject', REOPEN: 'Reopen', REASSIGN: 'Reassign', CANCEL: 'Cancel task' };
const reasons = ['Break', 'Waiting', 'Material unavailable', 'Equipment issue', 'Other'];
const rejectionReasons = ['Incorrect quantity', 'Quality issue', 'Missing evidence', 'Incomplete work', 'Other'];

export function TaskWorkflowPanel({ task, mode, employees, onSubmit }: { task: TaskRecord; mode: 'mock' | 'api'; employees: EmployeeRecord[]; onSubmit: (action: TaskPreviewAction) => Promise<string | undefined> }) {
  const { session } = useAuth();
  const status = task.v1Status;
  const permissions = session?.permissions ?? [];
  const [pending, setPending] = useState<TaskWorkflowAction | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [employee, setEmployee] = useState('');
  const [boxes, setBoxes] = useState(String(task.boxesCompleted ?? ''));
  const [quality, setQuality] = useState<TaskRecord['qualityStatus']>(task.qualityStatus ?? 'PENDING');
  const [accepted, setAccepted] = useState(String(task.acceptedBoxes ?? ''));
  const [rejected, setRejected] = useState(String(task.rejectedBoxes ?? ''));
  const [qualityNotes, setQualityNotes] = useState(task.qualityNotes ?? '');
  const [correction, setCorrection] = useState(task.correctionRequired ?? false);
  const [correctionReason, setCorrectionReason] = useState(task.correctionReason ?? '');
  const [correctionComment, setCorrectionComment] = useState(task.correctionComment ?? '');
  const [correctedBoxes, setCorrectedBoxes] = useState(String(task.correctedBoxes ?? ''));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [evidencePending, setEvidencePending] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer); }, []);

  if (!status) return null;
  const available = (['ACCEPT', 'START', 'PAUSE', 'RESUME', 'COMPLETE', 'VERIFY', 'REJECT', 'REOPEN', 'REASSIGN', 'CANCEL'] as TaskWorkflowAction[]).filter((action) => isTaskActionAvailable(status, action, permissions));
  const reviewerAllowed = session?.permissions.includes('*') || session?.permissions.includes('TASKS:VERIFY') || session?.permissions.includes('action:verify');
  const durations = calculateTimerDurations(task.timerEvents ?? [], clock);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (mode !== 'mock') { setError('Task workflow mutations require a confirmed backend contract.'); return; }
    if (pending === 'PAUSE' && !reason) { setError('Choose a pause reason.'); return; }
    if (pending === 'REJECT' && !reason) { setError('Choose a rejection reason.'); return; }
    if (['REOPEN', 'CANCEL', 'REASSIGN'].includes(pending ?? '') && !reason) { setError('Enter a reason before continuing.'); return; }
    if (pending === 'REASSIGN' && !employee) { setError('Select a new employee.'); return; }
    if (pending === 'COMPLETE') { const validation = validateBoxQuantity(boxes, task.boxesPlanned); if (validation) { setError(validation); return; } }
    if (!pending) return;
    setSaving(true);
    const result = await onSubmit({ type: 'workflow', action: pending, reason: reason || note, employee: employee || undefined, boxesCompleted: pending === 'COMPLETE' ? Number(boxes) : undefined });
    setSaving(false);
    if (result) { setError(result); return; }
    setPending(null); setReason(''); setNote(''); setEmployee(''); setError('');
  };
  const saveQuality = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (quality === 'FAIL' && !qualityNotes.trim()) { setError('Add a quality explanation when status is FAIL.'); return; }
    const result = await onSubmit({ type: 'update', qualityStatus: quality, acceptedBoxes: accepted ? Number(accepted) : undefined, rejectedBoxes: rejected ? Number(rejected) : undefined, qualityNotes, correctionRequired: correction, correctionReason: correction ? correctionReason : undefined, correctionComment: correction ? correctionComment : undefined, correctedBoxes: correction && correctedBoxes ? Number(correctedBoxes) : undefined });
    if (result) setError(result); else setError('Quality recorded in preview.');
  };
  const addEvidence = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!file) { setError('Choose an evidence file.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('Evidence must be 10 MB or smaller.'); return; }
    const type = file.type.startsWith('image/') ? 'PHOTO' : file.type === 'application/pdf' || file.type.includes('document') ? 'DOCUMENT' : 'OTHER';
    const result = await onSubmit({ type: 'update', evidence: { id: `evidence-${Date.now()}`, filename: file.name, type, status: 'SUBMITTED', timestamp: new Date().toISOString() } });
    if (result) setError(result); else { setFile(null); setError('Evidence submitted in preview.'); }
  };
  const reviewEvidence = async (status: 'ACCEPTED' | 'REJECTED') => {
    const item = task.evidence?.find((candidate) => candidate.id === evidencePending);
    if (!item) return;
    if (status === 'REJECTED' && !reason) { setError('Enter an evidence rejection reason.'); return; }
    const result = await onSubmit({ type: 'update', evidencePatch: { id: item.id, status, ...(status === 'ACCEPTED' ? { acceptedBy: session?.userName ?? 'Admin preview', acceptedAt: new Date().toISOString() } : { rejectedBy: session?.userName ?? 'Admin preview', rejectedAt: new Date().toISOString(), rejectionReason: reason }) } });
    if (result) setError(result); else { setEvidencePending(null); setReason(''); setError(`Evidence ${status.toLowerCase()} in preview.`); }
  };
  return <div className="task-workflow-panel">
    <Card><div className="section-heading"><div><span className="section-kicker">Task workflow</span><h2>Available actions</h2></div><StatusBadge status={status} /></div><div className="page-actions task-action-bar">{available.map((action) => <Button key={action} variant={['REJECT', 'CANCEL'].includes(action) ? 'danger' : action === 'VERIFY' ? 'secondary' : 'primary'} disabled={mode !== 'mock'} onClick={() => { setPending(action); setError(''); }}>{action === 'ACCEPT' && <CheckCircle2 size={15} />}{action === 'START' && <Play size={15} />}{action === 'PAUSE' && <Pause size={15} />}{action === 'RESUME' && <Play size={15} />}{action === 'VERIFY' && <ShieldCheck size={15} />}{action === 'REASSIGN' && <UserRoundCheck size={15} />}{action === 'REOPEN' && <RotateCcw size={15} />}{action === 'CANCEL' && <XCircle size={15} />}{labels[action]}</Button>)}</div>{mode === 'api' && <Alert tone="info" title="Backend workflow pending">Task mutations are disabled until the backend contract is confirmed.</Alert>}</Card>
    <div className="detail-grid"><Card><div className="section-heading"><div><span className="section-kicker">BOX output</span><h2>Operational quantity</h2></div><Badge tone="neutral">BOX only</Badge></div><div className="detail-facts four"><span><small>Planned</small><strong>{task.boxesPlanned ?? '—'} BOX</strong></span><span><small>Completed</small><strong>{task.boxesCompleted ?? '—'} BOX</strong></span><span><small>Accepted</small><strong>{task.acceptedBoxes ?? '—'} BOX</strong></span><span><small>Rejected</small><strong>{task.rejectedBoxes ?? '—'} BOX</strong></span></div></Card><Card><div className="section-heading"><div><span className="section-kicker">Execution</span><h2>Timing and SLA</h2></div></div><div className="detail-facts"><span><small>Active time</small><strong>{formatDuration(durations.activeSeconds)}</strong></span><span><small>Paused time</small><strong>{formatDuration(durations.pausedSeconds)}</strong></span><span><small>Total time</small><strong>{formatDuration(durations.totalSeconds)}</strong></span><span><small>SLA</small><strong>{task.sla}</strong></span></div><div className="detail-facts"><span><small>Started</small><strong>{task.startedAt ?? 'Not started'}</strong></span><span><small>Last paused</small><strong>{task.pausedAt ?? '—'}</strong></span><span><small>Completed</small><strong>{task.completedAt ?? '—'}</strong></span></div></Card></div>
    <Card><div className="section-heading"><div><span className="section-kicker">Quality</span><h2>Record quality</h2></div><StatusBadge status={task.qualityStatus ?? 'PENDING'} /></div><form onSubmit={saveQuality} noValidate><div className="form-grid"><FormField label="Quality status"><Select value={quality} onChange={(event) => setQuality(event.target.value as TaskRecord['qualityStatus'])}><option value="PENDING">Pending</option><option value="PASS">Pass</option><option value="FAIL">Fail</option></Select></FormField><FormField label="Accepted BOX"><Input inputMode="decimal" value={accepted} onChange={(event) => setAccepted(event.target.value)} /></FormField><FormField label="Rejected BOX"><Input inputMode="decimal" value={rejected} onChange={(event) => setRejected(event.target.value)} /></FormField></div><FormField label="Quality notes"><Textarea value={qualityNotes} onChange={(event) => setQualityNotes(event.target.value)} placeholder="Explain the quality result" /></FormField><label className="checkbox-field"><input type="checkbox" checked={correction} onChange={(event) => setCorrection(event.target.checked)} /> Correction required</label>{correction && <div className="form-grid"><FormField label="Corrected BOX"><Input inputMode="decimal" value={correctedBoxes} onChange={(event) => setCorrectedBoxes(event.target.value)} /></FormField><FormField label="Correction reason"><Input value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} /></FormField><FormField label="Correction comment"><Textarea value={correctionComment} onChange={(event) => setCorrectionComment(event.target.value)} /></FormField></div>}{error && <Alert tone="error" title="Check the workflow">{error}</Alert>}<Button type="submit" disabled={mode !== 'mock'}>Record quality</Button></form></Card>
    <Card><div className="section-heading"><div><span className="section-kicker">Evidence</span><h2>Supporting files</h2></div></div><form onSubmit={addEvidence} className="form-grid" noValidate><FormField label="Evidence file"><Input type="file" accept="image/*,.pdf,.doc,.docx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></FormField><Button type="submit" disabled={mode !== 'mock'}>Add evidence</Button></form>{task.evidence?.length ? <div className="timeline compact">{task.evidence.map((item) => <div key={item.id}><strong>{item.filename}</strong><span>{item.type} · {item.status} · {item.timestamp}</span>{item.acceptedBy && <small>Accepted by {item.acceptedBy} · {item.acceptedAt}</small>}{item.rejectionReason && <small>Rejected by {item.rejectedBy ?? 'Reviewer'} · {item.rejectionReason}</small>}{item.status === 'SUBMITTED' && <div className="dialog-actions"><Button variant="secondary" disabled={mode !== 'mock' || !reviewerAllowed} onClick={() => { setEvidencePending(item.id); setReason(''); }}>Review evidence</Button></div>}</div>)}</div> : <EmptyState icon={FileCheck2} title="No evidence submitted" description="Add a photo, document, or other supporting file in preview mode." />}</Card>
    <Card><div className="section-heading"><div><span className="section-kicker">Activity</span><h2>Task timeline</h2></div></div>{task.activity?.length ? <div className="timeline" aria-label="Task activity timeline">{[...task.activity].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).map((event) => <div key={event.id}><strong>{event.eventType}</strong><span>{event.actor} · {new Date(event.timestamp).toLocaleString()}</span><small>{Object.entries(event.details).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}: ${value}`).join(' · ')}</small></div>)}</div> : <EmptyState icon={FileCheck2} title="No activity recorded" description="Mock task actions will appear here chronologically." />}</Card>
    <Dialog open={evidencePending !== null} title="Review evidence" description="Confirm the evidence decision in frontend preview mode." onClose={() => setEvidencePending(null)}><FormField label="Rejection reason"><Select value={reason} onChange={(event) => setReason(event.target.value)}><option value="">Choose if rejecting</option><option>Missing information</option><option>Incorrect evidence</option><option>Unreadable</option><option>Wrong task</option><option>Other</option></Select></FormField>{reason === 'Other' && <FormField label="Reviewer note"><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></FormField>}<div className="dialog-actions"><Button variant="secondary" onClick={() => reviewEvidence('REJECTED')}>Reject evidence</Button><Button onClick={() => reviewEvidence('ACCEPTED')}>Accept evidence</Button></div></Dialog>
    <Dialog open={pending !== null} title={pending ? labels[pending] : 'Task action'} description="This is a frontend preview. Confirming changes mock state only." onClose={() => setPending(null)}><form onSubmit={submit} noValidate>{pending === 'PAUSE' && <FormField label="Pause reason"><Select value={reason} onChange={(event) => setReason(event.target.value)}><option value="">Choose a reason</option>{reasons.map((item) => <option key={item}>{item}</option>)}</Select></FormField>}{pending === 'REJECT' && <FormField label="Rejection reason"><Select value={reason} onChange={(event) => setReason(event.target.value)}><option value="">Choose a reason</option>{rejectionReasons.map((item) => <option key={item}>{item}</option>)}</Select></FormField>}{['REOPEN', 'REASSIGN', 'CANCEL'].includes(pending ?? '') && <FormField label="Reason"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} required /></FormField>}{pending === 'REASSIGN' && <FormField label="New employee"><Select value={employee} onChange={(event) => setEmployee(event.target.value)}><option value="">Choose employee</option>{employees.map((item) => <option key={item.id} value={item.name}>{item.name} · {item.role}</option>)}</Select></FormField>}{pending === 'COMPLETE' && <><div className="detail-facts"><span><small>Employee</small><strong>{task.employee}</strong></span><span><small>Supervisor</small><strong>{task.supervisor ?? '—'}</strong></span><span><small>Planned</small><strong>{task.boxesPlanned ?? '—'} BOX</strong></span><span><small>SLA</small><strong>{task.sla}</strong></span></div><FormField label="Completed BOX"><Input inputMode="decimal" value={boxes} onChange={(event) => setBoxes(event.target.value)} required /></FormField></>}{pending === 'VERIFY' && <Alert tone="warning" title="Verification review">Confirm the task output, quality, evidence, timing, and SLA before verification.</Alert>}{error && <Alert tone="error" title="Action not applied">{error}</Alert>}<div className="dialog-actions"><Button variant="secondary" type="button" onClick={() => setPending(null)}>Cancel</Button><Button type="submit" loading={saving} variant={['REJECT', 'CANCEL'].includes(pending ?? '') ? 'danger' : 'primary'}>{saving ? 'Applying preview' : 'Confirm'}</Button></div></form></Dialog>
  </div>;
}
