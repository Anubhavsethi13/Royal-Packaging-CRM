import { describe, expect, it } from 'vitest';
import { DATA_SCOPES, PERMISSION_ACTIONS, TASK_EXCEPTION_STATES, TASK_LIFECYCLE_STATES, V1_ROLES, type OperationalQuantity } from './v1';

describe('V1 frontend domain vocabulary', () => {
  it('exposes the approved role and access-scope values', () => {
    expect(V1_ROLES).toEqual(['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'EMPLOYEE']);
    expect(DATA_SCOPES).toContain('ORGANIZATION');
    expect(PERMISSION_ACTIONS).toContain('VERIFY');
  });

  it('keeps operational quantities BOX-only at the type boundary', () => {
    const quantity: OperationalQuantity = { value: 12, unit: 'BOX' };
    expect(quantity.unit).toBe('BOX');
  });

  it('contains the V1 task lifecycle and exception states', () => {
    expect(TASK_LIFECYCLE_STATES).toEqual(['ASSIGNED', 'ACCEPTED', 'STARTED', 'PAUSED', 'RESUMED', 'COMPLETED', 'VERIFIED']);
    expect(TASK_EXCEPTION_STATES).toContain('REOPENED');
  });
});
