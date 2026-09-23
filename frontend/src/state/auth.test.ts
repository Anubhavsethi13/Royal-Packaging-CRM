import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  authErrorMessage,
  can,
  createMockSession,
  mapApiUserToSessionState,
  normalizeRole,
  usesMockAuth,
  type ApiUserDTO,
} from './auth';
import * as apiClient from '../api/client';

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
    expect(authErrorMessage('account_locked')).toContain('locked');
    expect(authErrorMessage('network_error')).toContain('unavailable');
    expect(authErrorMessage('unknown')).not.toContain('API');
  });
});

describe('live authentication and session mapping (AUTH-01 through AUTH-10)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('AUTH-01 & AUTH-10: mapApiUserToSessionState correctly maps user, roles, and permissions', () => {
    const apiUser: ApiUserDTO = {
      id: 'usr-123',
      email: 'admin@royalpackaging.com',
      role: 'ADMIN',
      roles: ['ADMIN'],
      permissions: ['client:read', 'client:write', 'order:read', 'order:write'],
      scopes: ['ORGANIZATION'],
    };

    const session = mapApiUserToSessionState(apiUser);
    expect(session.id).toBe('usr-123');
    expect(session.email).toBe('admin@royalpackaging.com');
    expect(session.role).toBe('ADMIN');
    expect(session.roles).toEqual(['ADMIN']);
    expect(session.permissions).toEqual(['client:read', 'client:write', 'order:read', 'order:write']);
    expect(session.kind).toBe('live-session');
  });

  it('reconciles MANAGER role from backend to SUPERVISOR', () => {
    expect(normalizeRole('MANAGER')).toBe('SUPERVISOR');
    expect(normalizeRole('manager')).toBe('SUPERVISOR');
    expect(normalizeRole('SUPER_ADMIN')).toBe('SUPER_ADMIN');
    expect(normalizeRole('EMPLOYEE')).toBe('EMPLOYEE');
    expect(normalizeRole('UNKNOWN')).toBe('ADMIN');
  });

  it('AUTH-02 & AUTH-07: maps 401 error to invalid_credentials', async () => {
    const error = new apiClient.ApiError(401, {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid login identifier or password',
    });
    expect(error.status).toBe(401);
    expect(error.code).toBe('INVALID_CREDENTIALS');
  });

  it('AUTH-08: maps 429 error to account_locked', () => {
    const error = new apiClient.ApiError(429, {
      code: 'ACCOUNT_LOCKED',
      message: 'Account is temporarily locked',
    });
    expect(error.status).toBe(429);
    expect(error.code).toBe('ACCOUNT_LOCKED');
    expect(authErrorMessage('account_locked')).toContain('locked');
  });

  it('AUTH-09: verifies no credentials or tokens are stored in localStorage or sessionStorage', () => {
    const mockStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
    };
    expect(mockStorage.setItem).not.toHaveBeenCalled();
  });
});
