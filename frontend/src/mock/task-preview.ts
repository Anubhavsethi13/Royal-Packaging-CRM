import type { EmployeeRecord, TaskActivityEventType, TaskRecord } from '../types/domain';

export const taskDetailTabs = ['Overview', 'Activity', 'Exceptions', 'Audit history'] as const;
export const taskStatuses: TaskRecord['status'][] = ['Queued', 'In progress', 'Completed', 'Exception', 'Cancelled'];

export type TaskPreviewAction =
  | { type: 'assign'; employee: string }
  | { type: 'status'; status: TaskRecord['status'] }
  | { type: 'update'; boxesCompleted?: number; qualityStatus?: TaskRecord['qualityStatus']; acceptedBoxes?: number; rejectedBoxes?: number; qualityNotes?: string; correctionRequired?: boolean; correctionReason?: string; correctionComment?: string; correctedBoxes?: number; evidence?: NonNullable<TaskRecord['evidence']>[number]; evidencePatch?: { id: string; status: NonNullable<TaskRecord['evidence']>[number]['status']; rejectionReason?: string; acceptedBy?: string; acceptedAt?: string; rejectedBy?: string; rejectedAt?: string } }
  | { type: 'workflow'; action: import('../pages/task-workflow').TaskWorkflowAction; reason?: string; employee?: string; boxesCompleted?: number; qualityStatus?: TaskRecord['qualityStatus']; acceptedBoxes?: number; rejectedBoxes?: number; qualityNotes?: string; correctionRequired?: boolean; correctionReason?: string; correctionComment?: string; correctedBoxes?: number; evidence?: NonNullable<TaskRecord['evidence']>[number] };

function employeeIdForName(employees: EmployeeRecord[], name: string | undefined): string | undefined {
  return name ? employees.find((employee) => employee.name === name)?.id : undefined;
}

function addActivity(task: TaskRecord, eventType: TaskActivityEventType, details: Record<string, string | number | undefined>, timestamp: string, actor = 'Admin preview'): TaskRecord {
  return { ...task, activity: [...(task.activity ?? []), { id: `activity-${Date.now()}-${eventType}`, eventType, timestamp, actor, taskId: task.id, details }] };
}

function appendTimer(task: TaskRecord, eventType: 'START' | 'PAUSE' | 'RESUME' | 'END', timestamp: string, reason?: string): TaskRecord {
  return { ...task, timerEvents: [...(task.timerEvents ?? []), { id: `timer-${Date.now()}-${eventType}`, eventType, timestamp, reason }] };
}

export function applyTaskPreviewAction(task: TaskRecord, action: TaskPreviewAction, employees: EmployeeRecord[]): TaskRecord {
  if (action.type === 'assign') {
    if (!employees.some((employee) => employee.name === action.employee)) throw new Error('Select an employee from the available preview list.');
    if (task.employee === action.employee) throw new Error('This task is already assigned to that employee.');
    return addActivity({ ...task, employee: action.employee, employeeId: employeeIdForName(employees, action.employee) }, 'TASK_REASSIGNED', { previousEmployee: task.employee, newEmployee: action.employee }, new Date().toISOString());
  }
  if (action.type === 'update') {
    const now = new Date().toISOString();
    let next = { ...task, ...(action.boxesCompleted === undefined ? {} : { boxesCompleted: action.boxesCompleted }), ...(action.qualityStatus === undefined ? {} : { qualityStatus: action.qualityStatus }), ...(action.acceptedBoxes === undefined ? {} : { acceptedBoxes: action.acceptedBoxes }), ...(action.rejectedBoxes === undefined ? {} : { rejectedBoxes: action.rejectedBoxes }), ...(action.qualityNotes === undefined ? {} : { qualityNotes: action.qualityNotes }), ...(action.correctionRequired === undefined ? {} : { correctionRequired: action.correctionRequired }), ...(action.correctionReason === undefined ? {} : { correctionReason: action.correctionReason }), ...(action.correctionComment === undefined ? {} : { correctionComment: action.correctionComment }), ...(action.correctedBoxes === undefined ? {} : { correctedBoxes: action.correctedBoxes }), ...(action.evidence ? { evidence: [...(task.evidence ?? []), action.evidence] } : {}) };
    if (action.evidence) next = addActivity(next, 'EVIDENCE_SUBMITTED', { filename: action.evidence.filename, type: action.evidence.type }, now);
    if (action.evidencePatch) next = { ...next, evidence: (next.evidence ?? []).map((item) => item.id === action.evidencePatch?.id ? { ...item, ...action.evidencePatch } : item) };
    if (action.evidencePatch?.status === 'ACCEPTED') next = addActivity(next, 'EVIDENCE_ACCEPTED', { evidenceId: action.evidencePatch.id }, now);
    if (action.evidencePatch?.status === 'REJECTED') next = addActivity(next, 'EVIDENCE_REJECTED', { evidenceId: action.evidencePatch.id, reason: action.evidencePatch.rejectionReason }, now);
    if (action.boxesCompleted !== undefined) next = addActivity(next, 'BOXES_UPDATED', { previous: task.boxesCompleted, current: action.boxesCompleted, unit: 'BOX' }, now);
    if (action.qualityStatus !== undefined) next = addActivity(next, 'QUALITY_RECORDED', { status: action.qualityStatus, notes: action.qualityNotes }, now);
    if (action.correctionRequired) next = addActivity(next, 'CORRECTION_MADE', { previous: task.boxesCompleted, current: action.correctedBoxes, reason: action.correctionReason }, now);
    return next;
  }
  if (action.type === 'workflow') {
    const statusMap: Partial<Record<import('../pages/task-workflow').TaskWorkflowAction, import('../types/v1').TaskStatusV1>> = {
      ACCEPT: 'ACCEPTED', START: 'STARTED', PAUSE: 'PAUSED', RESUME: 'RESUMED', COMPLETE: 'COMPLETED', VERIFY: 'VERIFIED', REJECT: 'REJECTED', REOPEN: 'REOPENED', REASSIGN: 'REASSIGNED', CANCEL: 'CANCELLED',
    };
    const v1Status = statusMap[action.action] ?? task.v1Status;
    const status: TaskRecord['status'] = v1Status === 'COMPLETED' || v1Status === 'VERIFIED' ? 'Completed' : v1Status === 'CANCELLED' ? 'Cancelled' : v1Status === 'FAILED' ? 'Exception' : v1Status === 'STARTED' || v1Status === 'PAUSED' || v1Status === 'RESUMED' ? 'In progress' : task.status;
    const now = new Date().toISOString();
    let next: TaskRecord = { ...task, status, v1Status, ...(action.boxesCompleted === undefined ? {} : { boxesCompleted: action.boxesCompleted }), ...(action.qualityStatus === undefined ? {} : { qualityStatus: action.qualityStatus }), ...(action.acceptedBoxes === undefined ? {} : { acceptedBoxes: action.acceptedBoxes }), ...(action.rejectedBoxes === undefined ? {} : { rejectedBoxes: action.rejectedBoxes }), ...(action.qualityNotes === undefined ? {} : { qualityNotes: action.qualityNotes }), ...(action.correctionRequired === undefined ? {} : { correctionRequired: action.correctionRequired }), ...(action.correctionReason === undefined ? {} : { correctionReason: action.correctionReason }), ...(action.correctionComment === undefined ? {} : { correctionComment: action.correctionComment }), ...(action.correctedBoxes === undefined ? {} : { correctedBoxes: action.correctedBoxes }) };
    if (action.evidence) next.evidence = [...(task.evidence ?? []), action.evidence];
    if (action.action === 'START') { next.startedAt = now; next = appendTimer(next, 'START', now); }
    if (action.action === 'PAUSE') next.pausedAt = now;
    if (action.action === 'PAUSE') next = appendTimer(next, 'PAUSE', now, action.reason);
    if (action.action === 'RESUME') { next.resumedAt = now; next = appendTimer(next, 'RESUME', now); }
    if (action.action === 'COMPLETE') { next.completedAt = now; next = appendTimer(next, 'END', now); }
    if (action.action === 'VERIFY') { next.verifiedAt = now; next.verifiedBy = 'Admin preview'; }
    if (action.action === 'REOPEN') { next.reopenedAt = now; next.reopenedBy = 'Admin preview'; next.reopenedReason = action.reason; }
    if (action.action === 'REJECT' || action.action === 'CANCEL') next.rejectionReason = action.reason;
    if (action.action === 'REASSIGN' && action.employee) { next.employee = action.employee; next.employeeId = employeeIdForName(employees, action.employee); }
    const eventMap: Partial<Record<import('../pages/task-workflow').TaskWorkflowAction, TaskActivityEventType>> = { ACCEPT: 'TASK_ACCEPTED', START: 'TASK_STARTED', PAUSE: 'TASK_PAUSED', RESUME: 'TASK_RESUMED', COMPLETE: 'TASK_COMPLETED', VERIFY: 'VERIFICATION_COMPLETED', REJECT: 'TASK_REJECTED', REOPEN: 'TASK_REOPENED', REASSIGN: 'TASK_REASSIGNED', CANCEL: 'TASK_CANCELLED' };
    return addActivity(next, eventMap[action.action] ?? 'TASK_ASSIGNED', { reason: action.reason, employee: action.employee, boxes: action.boxesCompleted, unit: action.boxesCompleted === undefined ? undefined : 'BOX' }, now);
  }
  if (task.status === action.status) throw new Error(`Task is already ${action.status.toLowerCase()}.`);
  return addActivity({ ...task, status: action.status }, 'TASK_ASSIGNED', { status: action.status }, new Date().toISOString());
}
