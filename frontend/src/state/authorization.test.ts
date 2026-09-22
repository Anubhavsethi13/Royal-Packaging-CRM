import { describe, expect, it } from 'vitest';
import { can, hasAllPermissions, hasAnyPermission, hasPermission, hasRole, rolePermissions } from './authorization';

const supervisor = { role: 'SUPERVISOR' as const, roles: ['SUPERVISOR' as const], permissions: rolePermissions('SUPERVISOR'), scopes: ['TEAM' as const] };

describe('frontend authorization model', () => {
  it('supports roles and V1 module/action permissions', () => {
    expect(hasRole(supervisor, 'SUPERVISOR')).toBe(true);
    expect(hasRole(supervisor, 'EMPLOYEE')).toBe(false);
    expect(hasPermission(supervisor, { module: 'TASKS', action: 'ASSIGN' })).toBe(true);
    expect(can(supervisor, 'TASKS', 'VERIFY')).toBe(true);
  });

  it('supports any/all permission checks and legacy aliases', () => {
    expect(hasAnyPermission(supervisor, [{ module: 'PAYROLL', action: 'VIEW' }, { module: 'TASKS', action: 'VIEW' }])).toBe(true);
    expect(hasAllPermissions(supervisor, [{ module: 'TASKS', action: 'VIEW' }, { module: 'TASKS', action: 'START' }])).toBe(true);
    expect(hasPermission(supervisor, 'view:warehouse')).toBe(true);
    expect(hasPermission(supervisor, 'action:delete')).toBe(false);
  });

  it('gives the mock super admin a complete frontend permission set', () => {
    expect(hasPermission({ role: 'SUPER_ADMIN', permissions: rolePermissions('SUPER_ADMIN') }, { module: 'SETTINGS', action: 'VIEW' })).toBe(true);
    expect(hasPermission({ role: 'SUPER_ADMIN', permissions: rolePermissions('SUPER_ADMIN') }, { module: 'PAYROLL', action: 'APPROVE' })).toBe(true);
  });
});

