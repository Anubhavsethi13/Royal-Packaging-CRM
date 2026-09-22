import { describe, expect, it } from 'vitest';
import { availableTaskActions } from './task-lifecycle';

describe('V1 task lifecycle action availability', () => {
  it('exposes state-aware execution actions', () => {
    expect(availableTaskActions('ASSIGNED')).toEqual(['ACCEPT', 'CANCEL']);
    expect(availableTaskActions('STARTED')).toEqual(['PAUSE', 'COMPLETE', 'CANCEL']);
    expect(availableTaskActions('PAUSED')).toEqual(['RESUME', 'CANCEL']);
  });

  it('separates completion from verification and protects cancelled work', () => {
    expect(availableTaskActions('COMPLETED')).toEqual(['VERIFY', 'REJECT', 'REOPEN']);
    expect(availableTaskActions('VERIFIED')).toEqual(['REOPEN']);
    expect(availableTaskActions('CANCELLED')).toEqual([]);
  });
});
