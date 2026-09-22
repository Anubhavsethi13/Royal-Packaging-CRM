import { describe, expect, it } from 'vitest';
import { defaultDashboardPath, permissionForPath, visibleNavigation } from './navigation';
import { rolePermissions } from '../state/authorization';

function subject(role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE') {
  return { role, roles: [role], permissions: rolePermissions(role) };
}

describe('role-aware navigation', () => {
  it('shows the full workspace to super admins', () => {
    const items = visibleNavigation(subject('SUPER_ADMIN')).flatMap((group) => group.items);
    expect(items.some((item) => item.id === 'access-control')).toBe(true);
    expect(items.some((item) => item.id === 'payroll')).toBe(true);
  });

  it('keeps employee navigation focused on their work', () => {
    const ids = visibleNavigation(subject('EMPLOYEE')).flatMap((group) => group.items).map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(['dashboard', 'tasks', 'kpis', 'incentives']));
    expect(ids).not.toContain('access-control');
    expect(ids).not.toContain('payroll');
  });

  it('uses the same permission metadata for protected routes', () => {
    expect(permissionForPath('/employees/employee-1')).toEqual({ module: 'EMPLOYEES', action: 'VIEW' });
    expect(permissionForPath('/unknown')).toBeUndefined();
  });

  it('centralizes the post-login dashboard decision', () => {
    expect(defaultDashboardPath('SUPER_ADMIN')).toBe('/');
    expect(defaultDashboardPath('EMPLOYEE')).toBe('/');
  });
});
