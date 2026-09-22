import { describe, expect, it } from 'vitest';
import { employees, tasks } from './data';
import { applyTaskPreviewAction, taskDetailTabs } from './task-preview';

describe('task preview actions', () => {
  it('exposes all task detail tabs and applies assignment/status previews', () => {
    expect(taskDetailTabs).toEqual(['Overview', 'Activity', 'Exceptions', 'Audit history']);
    const task = tasks.find((item) => item.id === 'task-477');
    expect(task).toBeDefined();
    if (!task) return;
    const assigned = applyTaskPreviewAction(task, { type: 'assign', employee: employees[0].name }, employees);
    const started = applyTaskPreviewAction(assigned, { type: 'status', status: 'In progress' }, employees);
    const completed = applyTaskPreviewAction(started, { type: 'status', status: 'Completed' }, employees);
    expect(completed.employee).toBe(employees[0].name);
    expect(completed.status).toBe('Completed');
    expect(completed.activity?.map((event) => event.eventType)).toContain('TASK_REASSIGNED');
  });

  it('rejects invalid and repeated task actions', () => {
    const task = tasks.find((item) => item.id === 'task-481');
    if (!task) return;
    expect(() => applyTaskPreviewAction(task, { type: 'assign', employee: 'Unknown person' }, employees)).toThrow();
    expect(() => applyTaskPreviewAction(task, { type: 'status', status: task.status }, employees)).toThrow();
  });

  it('cancels an eligible task and records a structured event', () => {
    const task = tasks.find((item) => item.id === 'task-477');
    if (!task) return;
    const cancelled = applyTaskPreviewAction(task, { type: 'workflow', action: 'CANCEL', reason: 'Duplicate task' }, employees);
    expect(cancelled.v1Status).toBe('CANCELLED');
    expect(cancelled.activity?.at(-1)?.eventType).toBe('TASK_CANCELLED');
    expect(cancelled.activity?.at(-1)?.details.reason).toBe('Duplicate task');
  });

  it('updates and reviews evidence without replacing the task record', () => {
    const task = tasks[0];
    const submitted = applyTaskPreviewAction(task, { type: 'update', evidence: { id: 'e-1', filename: 'photo.png', type: 'PHOTO', status: 'SUBMITTED', timestamp: '2026-01-01T10:00:00.000Z' } }, employees);
    const accepted = applyTaskPreviewAction(submitted, { type: 'update', evidencePatch: { id: 'e-1', status: 'ACCEPTED', acceptedBy: 'Reviewer', acceptedAt: '2026-01-01T10:01:00.000Z' } }, employees);
    expect(accepted.evidence?.[0].status).toBe('ACCEPTED');
    expect(accepted.activity?.map((event) => event.eventType)).toEqual(['EVIDENCE_SUBMITTED', 'EVIDENCE_ACCEPTED']);
  });
});
