import type { PermissionAction, TaskStatusV1 } from '../types/v1';
import type { TaskTimerEvent } from '../types/domain';

export type TaskWorkflowAction = 'ACCEPT' | 'START' | 'PAUSE' | 'RESUME' | 'COMPLETE' | 'VERIFY' | 'REJECT' | 'REOPEN' | 'REASSIGN' | 'CANCEL';

export const TASK_WORKFLOW_ACTIONS: Record<TaskStatusV1, TaskWorkflowAction[]> = {
  ASSIGNED: ['ACCEPT', 'CANCEL'], ACCEPTED: ['START', 'CANCEL'], STARTED: ['PAUSE', 'COMPLETE', 'CANCEL'], PAUSED: ['RESUME', 'CANCEL'], RESUMED: ['PAUSE', 'COMPLETE', 'CANCEL'],
  COMPLETED: ['VERIFY', 'REJECT', 'REOPEN'], VERIFIED: ['REOPEN'], REJECTED: ['REASSIGN', 'REOPEN'], REASSIGNED: ['ACCEPT'], CANCELLED: [], REOPENED: ['START', 'CANCEL'], FAILED: ['REOPEN', 'REASSIGN'],
};

const actionPermissions: Record<TaskWorkflowAction, PermissionAction> = {
  ACCEPT: 'ACCEPT', START: 'START', PAUSE: 'PAUSE', RESUME: 'RESUME', COMPLETE: 'COMPLETE', VERIFY: 'VERIFY', REJECT: 'REJECT', REOPEN: 'REOPEN', REASSIGN: 'ASSIGN', CANCEL: 'CANCEL',
};

export function isTaskActionAvailable(status: TaskStatusV1, action: TaskWorkflowAction, permissions: string[]): boolean {
  return TASK_WORKFLOW_ACTIONS[status].includes(action) && (permissions.includes('*') || permissions.includes(`TASKS:${actionPermissions[action]}`) || permissions.includes(`action:${action.toLowerCase()}`));
}

export function validateBoxQuantity(value: string, planned?: number): string | undefined {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) return 'Enter a non-negative BOX quantity.';
  if (planned !== undefined && Number(value) > planned) return 'Completed BOX quantity cannot exceed the planned quantity in this preview.';
  return undefined;
}

export interface MockTimerState { startedAt?: string; pausedAt?: string; resumedAt?: string; completedAt?: string; activeSeconds: number; pausedSeconds: number; timerEvents?: TaskTimerEvent[]; }

export function timerEvent(state: MockTimerState, event: 'START' | 'PAUSE' | 'RESUME' | 'END', timestamp: string): MockTimerState {
  const nextEvent: TaskTimerEvent = { id: `timer-${timestamp}-${event}`, eventType: event, timestamp };
  return { ...state, timerEvents: [...(state.timerEvents ?? []), nextEvent], ...(event === 'START' ? { startedAt: timestamp } : {}), ...(event === 'PAUSE' ? { pausedAt: timestamp } : {}), ...(event === 'RESUME' ? { resumedAt: timestamp } : {}), ...(event === 'END' ? { completedAt: timestamp } : {}) };
}

export interface TimerDurations { activeSeconds: number; pausedSeconds: number; totalSeconds: number; }

export function calculateTimerDurations(events: TaskTimerEvent[], now = Date.now()): TimerDurations {
  let activeSeconds = 0; let pausedSeconds = 0; let activeStart: number | undefined; let pauseStart: number | undefined;
  for (const event of [...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))) {
    const at = Date.parse(event.timestamp);
    if (Number.isNaN(at)) continue;
    if (event.eventType === 'START' || event.eventType === 'RESUME') { if (pauseStart !== undefined) { pausedSeconds += Math.max(0, (at - pauseStart) / 1000); pauseStart = undefined; } activeStart = at; }
    if (event.eventType === 'PAUSE' || event.eventType === 'END') { if (activeStart !== undefined) { activeSeconds += Math.max(0, (at - activeStart) / 1000); activeStart = undefined; } if (event.eventType === 'PAUSE') pauseStart = at; }
  }
  if (activeStart !== undefined) activeSeconds += Math.max(0, (now - activeStart) / 1000);
  if (pauseStart !== undefined) pausedSeconds += Math.max(0, (now - pauseStart) / 1000);
  return { activeSeconds, pausedSeconds, totalSeconds: activeSeconds + pausedSeconds };
}

export function formatDuration(seconds: number): string { const minutes = Math.floor(Math.max(0, seconds) / 60); return `${String(Math.floor(minutes / 60)).padStart(2, '0')}h ${String(minutes % 60).padStart(2, '0')}m`; }
