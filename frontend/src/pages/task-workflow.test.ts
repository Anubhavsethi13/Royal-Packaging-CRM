import { describe, expect, it } from 'vitest';
import { calculateTimerDurations, formatDuration, isTaskActionAvailable, TASK_WORKFLOW_ACTIONS, timerEvent, validateBoxQuantity } from './task-workflow';

describe('task workflow preview', () => {
  it('maps lifecycle states to actions and permissions', () => {
    expect(TASK_WORKFLOW_ACTIONS.STARTED).toEqual(['PAUSE', 'COMPLETE', 'CANCEL']);
    expect(TASK_WORKFLOW_ACTIONS.CANCELLED).toEqual([]);
    expect(isTaskActionAvailable('ASSIGNED', 'ACCEPT', ['TASKS:ACCEPT'])).toBe(true);
    expect(isTaskActionAvailable('ASSIGNED', 'CANCEL', ['TASKS:CANCEL'])).toBe(true);
    expect(isTaskActionAvailable('ASSIGNED', 'START', ['TASKS:START'])).toBe(false);
  });
  it('validates BOX output and preserves timer events', () => {
    expect(validateBoxQuantity('-1')).toBeTruthy();
    expect(validateBoxQuantity('121', 120)).toContain('planned');
    expect(validateBoxQuantity('120', 120)).toBeUndefined();
    expect(timerEvent(timerEvent({ activeSeconds: 0, pausedSeconds: 0 }, 'START', '10:00'), 'PAUSE', '10:15').pausedAt).toBe('10:15');
  });
  it('calculates active, paused, and total durations across multiple cycles', () => {
    const events = [
      { id: '1', eventType: 'START' as const, timestamp: '2026-01-01T09:00:00.000Z' },
      { id: '2', eventType: 'PAUSE' as const, timestamp: '2026-01-01T10:00:00.000Z' },
      { id: '3', eventType: 'RESUME' as const, timestamp: '2026-01-01T10:15:00.000Z' },
      { id: '4', eventType: 'PAUSE' as const, timestamp: '2026-01-01T11:00:00.000Z' },
      { id: '5', eventType: 'RESUME' as const, timestamp: '2026-01-01T11:10:00.000Z' },
      { id: '6', eventType: 'END' as const, timestamp: '2026-01-01T11:30:00.000Z' },
    ];
    expect(calculateTimerDurations(events)).toEqual({ activeSeconds: 7500, pausedSeconds: 1500, totalSeconds: 9000 });
    expect(formatDuration(7500)).toBe('02h 05m');
  });
});
