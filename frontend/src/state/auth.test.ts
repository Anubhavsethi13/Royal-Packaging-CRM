import { describe, expect, it } from 'vitest';
import { authErrorMessage, can, createMockSession, usesMockAuth } from './auth';

describe('permission policy', () => {
  it('only enables the demo session in mock mode', () => {
    expect(usesMockAuth('mock')).toBe(true);
    expect(usesMockAuth('api')).toBe(false);
  });

  it('allows the admin preview to export and correct records', () => {
    expect(can('SUPER_ADMIN', 'action:export')).toBe(true);
    expect(can('SUPER_ADMIN', 'action:correct')).toBe(true);
  });

  it('keeps operator preview access limited to warehouse work', () => {
    expect(can('EMPLOYEE', 'view:warehouse')).toBe(true);
    expect(can('EMPLOYEE', 'view:finance')).toBe(false);
    expect(can('EMPLOYEE', 'action:delete')).toBe(false);
  });

  it('denies permissions without a role', () => {
    expect(can(undefined, 'view:dashboard')).toBe(false);
  });

  it('hydrates all supported mock roles with V1 session context', () => {
    expect(createMockSession('SUPER_ADMIN').scopes).toEqual(['ORGANIZATION']);
    expect(createMockSession('ADMIN').roles).toEqual(['ADMIN']);
    expect(createMockSession('SUPERVISOR').scopes).toEqual(['TEAM']);
    expect(createMockSession('EMPLOYEE').scopes).toEqual(['OWN']);
  });

  it('maps auth failures to safe user-facing messages', () => {
    expect(authErrorMessage('invalid_credentials')).toBe('Invalid email or password.');
    expect(authErrorMessage('network_error')).toContain('unavailable');
    expect(authErrorMessage('unknown')).not.toContain('API');
  });
});
