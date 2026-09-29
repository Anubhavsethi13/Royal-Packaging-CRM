import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { operationalSurfaceState } from './operational-data';
import { LocationsView } from './locations-pages';
import { permissionForPath, visibleNavigation } from '../app/navigation';
import { hasPermission, rolePermissions } from '../state/authorization';

describe('operational surface mode boundary', () => {
  it('keeps operational preview screens available in mock mode', () => {
    expect(operationalSurfaceState('mock')).toBe('preview');
    expect(operationalSurfaceState('mock', 'warehouse')).toBe('preview');
    expect(operationalSurfaceState('mock', 'locations')).toBe('preview');
  });

  it('does not expose mock operational data in API mode', () => {
    expect(operationalSurfaceState('api')).toBe('unavailable');
    expect(operationalSurfaceState('api', 'operations')).toBe('unavailable');
  });

  it('connects only the surfaces with a confirmed backend contract', () => {
    expect(operationalSurfaceState('api', 'warehouse')).toBe('api');
    expect(operationalSurfaceState('api', 'locations')).toBe('api');
    expect(operationalSurfaceState('api', 'loading-unloading')).toBe('api');
  });
});

describe('locations view', () => {
  const location = (overrides = {}) => ({ id: 'l1', code: 'A-01', name: 'Receiving bay', active: true, warehouse: { id: 'd1', code: 'DEP-01', name: 'Main Depot', active: true }, parent: { id: 'z', code: 'A', name: 'Zone A' }, boxOnHand: 1200, ...overrides });

  it('renders real location fields and no invented occupancy', () => {
    const html = renderToStaticMarkup(createElement(LocationsView, { page: { items: [location(), location({ id: 'l2', code: 'B-01', name: 'Overflow', active: false, parent: null, boxOnHand: 0 })], page: 1, pageSize: 24, total: 2, totalPages: 1 }}));
    for (const text of ['A-01 · Receiving bay', 'Main Depot (DEP-01) · within A', '1,200 BOX on hand', 'Active', 'B-01 · Overflow', 'Inactive', '0 BOX on hand']) expect(html).toContain(text);
    expect(html).not.toMatch(/% full|Restricted|Blocked/);
    expect(html).not.toContain('Page 1 of');
  });

  it('flags locations in an inactive warehouse', () => {
    const html = renderToStaticMarkup(createElement(LocationsView, { page: { items: [location({ warehouse: { id: 'd9', code: 'OLD', name: 'Old Depot', active: false } })], page: 1, pageSize: 24, total: 1, totalPages: 1 }}));
    expect(html).toContain('Warehouse inactive');
  });

  it('shows an empty state and pagination', () => {
    expect(renderToStaticMarkup(createElement(LocationsView, { page: { items: [], page: 1, pageSize: 24, total: 0, totalPages: 0 }}))).toContain('No locations match');
    expect(renderToStaticMarkup(createElement(LocationsView, { page: { items: [location()], page: 1, pageSize: 24, total: 30, totalPages: 2 }}))).toContain('Page 1 of 2');
  });
});

describe('supervisor access to warehouse and locations', () => {
  const subject = (role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE') => ({ role, roles: [role], permissions: rolePermissions(role) });

  it('keeps the existing route guards', () => {
    expect(permissionForPath('/warehouse')).toEqual({ module: 'WAREHOUSE', action: 'VIEW' });
    expect(permissionForPath('/locations')).toEqual({ module: 'LOCATIONS', action: 'VIEW' });
    // Live supervisor sessions carry the seeded backend permission codes.
    const liveSupervisor = { role: 'SUPERVISOR' as const, roles: ['SUPERVISOR' as const], permissions: ['warehouse:read_operations', 'warehouse:read_tasks', 'location:read'] };
    expect(visibleNavigation(liveSupervisor).flatMap((group) => group.items).map((item) => item.id)).toEqual(expect.arrayContaining(['warehouse', 'locations']));
    expect(visibleNavigation(subject('SUPERVISOR')).flatMap((group) => group.items).map((item) => item.id)).toContain('warehouse');
  });

  it('accepts the new backend permission codes for live sessions', () => {
    const live = { role: 'SUPERVISOR' as const, roles: ['SUPERVISOR' as const], permissions: ['warehouse:read_operations', 'location:read'] };
    expect(hasPermission(live, { module: 'WAREHOUSE', action: 'VIEW' })).toBe(true);
    expect(hasPermission(live, { module: 'LOCATIONS', action: 'VIEW' })).toBe(true);
    expect(hasPermission({ role: 'SUPERVISOR', roles: ['SUPERVISOR'], permissions: [] }, { module: 'LOCATIONS', action: 'VIEW' })).toBe(false);
  });
});
