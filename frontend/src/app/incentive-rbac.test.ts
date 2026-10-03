import { describe, expect, it } from 'vitest';
import { permissionForPath, visibleNavigation } from './navigation';
import { routes } from './routes';
import { canAccessRoute, hasPermission, rolePermissions, type AuthorizationSubject } from '../state/authorization';
import { mapApiUserToSessionState } from '../state/auth';
import { V1_ROLES, type Role } from '../types/v1';

// Product requirement: ONLY Super Admin may see or open Incentives (and payroll,
// which is made of incentive amounts). Hiding the menu is not enough: the route
// guard (ProtectedRoute → canAccessRoute(permissionForPath(path))) must deny too.

const subject = (role: Role, permissions = rolePermissions(role)): AuthorizationSubject => ({ role, roles: [role], permissions });
const navIds = (s: AuthorizationSubject) => visibleNavigation(s).flatMap((group) => group.items).map((item) => item.id);
const guardAllows = (s: AuthorizationSubject, path: string) => canAccessRoute(s, permissionForPath(path));

const INCENTIVE_PATHS = [routes.incentives, `${routes.incentives}/history`, `${routes.incentives}/rules/1`, routes.payroll, `${routes.payroll}/entry-1`];
const DENIED_ROLES = V1_ROLES.filter((role) => role !== 'SUPER_ADMIN');

describe('Super Admin incentive access', () => {
  const superAdmin = subject('SUPER_ADMIN');

  it('sees Incentives and Payroll navigation', () => {
    expect(navIds(superAdmin)).toEqual(expect.arrayContaining(['incentives', 'payroll']));
  });

  it('can open every incentive route and use incentive actions', () => {
    for (const path of INCENTIVE_PATHS) expect(guardAllows(superAdmin, path)).toBe(true);
    for (const action of ['VIEW', 'APPROVE', 'CREATE', 'EDIT'] as const) expect(hasPermission(superAdmin, { module: 'INCENTIVES', action })).toBe(true);
  });

  it('keeps access with a live backend session for SUPER_ADMIN', () => {
    const live = mapApiUserToSessionState({ id: 'u-sa', email: 'sa@example.test', role: 'SUPER_ADMIN', roles: ['SUPER_ADMIN'], permissions: ['incentive:read'] });
    expect(guardAllows(live, routes.incentives)).toBe(true);
  });
});

describe.each(DENIED_ROLES)('%s is denied incentives', (role) => {
  it('does not see Incentives or Payroll navigation', () => {
    const ids = navIds(subject(role));
    expect(ids).not.toContain('incentives');
    expect(ids).not.toContain('payroll');
  });

  it('is denied every incentive route by the route guard (direct URL access)', () => {
    for (const path of INCENTIVE_PATHS) expect(guardAllows(subject(role), path)).toBe(false);
  });

  it('is denied every incentive action, including history and calculation', () => {
    for (const action of ['VIEW', 'APPROVE', 'CREATE', 'EDIT', 'EXPORT'] as const) {
      expect(hasPermission(subject(role), { module: 'INCENTIVES', action })).toBe(false);
      expect(hasPermission(subject(role), { module: 'PAYROLL', action })).toBe(false);
    }
  });

  it('stays denied even when the session carries stale or forged incentive permissions', () => {
    const forged = subject(role, ['incentive:read', 'incentive:calculate', 'incentive:approve', 'payroll:read', 'INCENTIVES:VIEW', 'PAYROLL:VIEW', 'view:finance', '*']);
    expect(navIds(forged)).not.toContain('incentives');
    for (const path of INCENTIVE_PATHS) expect(guardAllows(forged, path)).toBe(false);
    expect(hasPermission(forged, 'incentive:read')).toBe(false);
  });

  it('stays denied for a live backend session of this role', () => {
    const live = mapApiUserToSessionState({ id: `u-${role}`, email: `${role.toLowerCase()}@example.test`, role, roles: [role], permissions: ['incentive:read', 'dashboard:read'] });
    expect(guardAllows(live, routes.incentives)).toBe(false);
  });
});

describe('role hierarchy navigation', () => {
  it('gives the Accountant read-only reporting navigation without incentives or KPI configuration actions', () => {
    const ids = navIds(subject('ACCOUNTANT'));
    expect(ids).toEqual(expect.arrayContaining(['dashboard', 'reports', 'kpi-results']));
    expect(ids).not.toContain('incentives');
    expect(ids).not.toContain('access-control');
    expect(hasPermission(subject('ACCOUNTANT'), { module: 'KPI', action: 'EDIT' })).toBe(false);
  });

  it('never treats an unrecognised backend role as an administrator', () => {
    const live = mapApiUserToSessionState({ id: 'u-x', email: 'x@example.test', role: 'AUDITOR', roles: ['AUDITOR'], permissions: [] });
    expect(live.role).toBe('EMPLOYEE');
    expect(navIds(live)).not.toContain('incentives');
  });
});
