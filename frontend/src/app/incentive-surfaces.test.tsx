import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EmployeeIncentiveCards } from '../pages/employee-pages';
import { employeeDetailTabs } from '../pages/employee-data';
import { permissionForPath, visibleNavigation } from './navigation';
import { routes } from './routes';
import { canAccessRoute, hasPermission, rolePermissions } from '../state/authorization';
import { V1_ROLES, type Role } from '../types/v1';

// Phase regression: incentive and payroll data stays Super Admin only on every frontend surface.
const subject = (role: Role) => ({ role, roles: [role], permissions: rolePermissions(role) });
const canSeeIncentives = (role: Role) => hasPermission(subject(role), { module: 'INCENTIVES', action: 'VIEW' });
const employeeCards = (role: Role, mode: 'mock' | 'api' = 'mock') => renderToStaticMarkup(<MemoryRouter><EmployeeIncentiveCards visible={canSeeIncentives(role)} mode={mode} /></MemoryRouter>);

describe.each(V1_ROLES)('%s incentive surfaces', (role) => {
  const allowed = role === 'SUPER_ADMIN';

  it(`${allowed ? 'shows' : 'hides'} the employee page incentive and payroll cards`, () => {
    const markup = employeeCards(role);
    if (allowed) {
      expect(markup).toContain('Incentive preview');
      expect(markup).toContain('Payroll period');
    } else {
      expect(markup).toBe('');
    }
  });

  it(`${allowed ? 'shows no fabricated figures' : 'hides'} the employee incentive and payroll cards in API mode`, () => {
    const markup = employeeCards(role, 'api');
    if (allowed) {
      expect(markup).toContain('Not available');
      expect(markup).not.toContain('₹');
      expect(markup).not.toContain('Pending');
    } else {
      expect(markup).toBe('');
    }
  });

  it(`${allowed ? 'shows' : 'hides'} the employee page Incentives and Payroll tabs`, () => {
    const tabs = employeeDetailTabs(canSeeIncentives(role));
    expect(tabs.includes('Incentives')).toBe(allowed);
    expect(tabs.includes('Payroll')).toBe(allowed);
    expect(tabs).toEqual(expect.arrayContaining(['Assigned tasks', 'Performance', 'KPI', 'Activity']));
  });

  it(`${allowed ? 'allows' : 'denies'} the Incentives and Payroll navigation and direct URLs`, () => {
    const ids = visibleNavigation(subject(role)).flatMap((group) => group.items).map((item) => item.id);
    expect(ids.includes('incentives')).toBe(allowed);
    expect(ids.includes('payroll')).toBe(allowed);
    for (const path of [routes.incentives, `${routes.incentives}/history`, routes.payroll]) {
      expect(canAccessRoute(subject(role), permissionForPath(path))).toBe(allowed);
    }
  });
});
