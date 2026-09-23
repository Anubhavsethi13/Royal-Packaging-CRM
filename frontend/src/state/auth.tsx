/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { resolveDataMode, type DataMode } from './repositories';
import type { DataScope, Role } from '../types/v1';
import { can as canSubject, hasAllPermissions, hasPermission, hasRole, rolePermissions, type PermissionRequirement } from './authorization';
import { apiRequest, ApiError } from '../api/client';

export type AuthStatus = 'INITIALIZING' | 'UNAUTHENTICATED' | 'AUTHENTICATED' | 'LOGGING_IN' | 'LOGGING_OUT' | 'SESSION_EXPIRED' | 'AUTH_ERROR';
export type { DataScope, PermissionAction, Role } from '../types/v1';
export type Permission = string;

export interface SessionState {
  id: string;
  userName: string;
  email: string;
  employeeIdentifier?: string;
  avatarUrl?: string;
  accountStatus?: 'ACTIVE' | 'INACTIVE';
  organization?: string;
  location?: string;
  team?: string;
  role: Role;
  roles: Role[];
  permissions: string[];
  scopes: DataScope[];
  kind: 'mock-demo' | 'live-session';
}

export interface ApiUserDTO {
  id: string;
  login_identifier?: string;
  email?: string;
  role?: string | null;
  roles?: string[];
  permissions?: string[];
  scopes?: string[];
}

export interface ApiSessionDTO {
  id?: string;
  userId?: string;
  expiresAt?: string;
}

export type AuthErrorReason = 'invalid_credentials' | 'account_locked' | 'network_error' | 'server_unavailable' | 'api_auth_unavailable' | 'unknown';
export interface SignInResult { ok: boolean; reason?: AuthErrorReason; session?: SessionState; }

interface AuthContextValue {
  mode: DataMode;
  session: SessionState | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  hasPermission: (permission: PermissionRequirement) => boolean;
  hasRole: (role: Role) => boolean;
  hasAnyPermission: (permissions: PermissionRequirement[]) => boolean;
  hasAllPermissions: (permissions: PermissionRequirement[]) => boolean;
  can: (module: string, action: import('../types/v1').PermissionAction) => boolean;
  canAccessRoute: (permission?: PermissionRequirement) => boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void> | void;
  expireSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export const mockRoles: Role[] = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'EMPLOYEE'];

function configuredMockRole(): Role {
  const role = import.meta.env.VITE_MOCK_ROLE;
  return mockRoles.includes(role as Role) ? role as Role : 'SUPER_ADMIN';
}

export function normalizeRole(rawRole?: string | null): Role {
  if (!rawRole) return 'ADMIN';
  const upper = rawRole.toUpperCase();
  if (upper === 'MANAGER') return 'SUPERVISOR';
  if (mockRoles.includes(upper as Role)) return upper as Role;
  return 'ADMIN';
}

export function mapApiUserToSessionState(user: ApiUserDTO): SessionState {
  const email = user.email || user.login_identifier || '';
  const primaryRole = normalizeRole(user.role || user.roles?.[0]);
  const roles: Role[] = user.roles && user.roles.length > 0
    ? user.roles.map(normalizeRole)
    : [primaryRole];
  const permissions = user.permissions && user.permissions.length > 0
    ? user.permissions
    : rolePermissions(primaryRole);
  const scopes: DataScope[] = user.scopes && user.scopes.length > 0
    ? (user.scopes as DataScope[])
    : (primaryRole === 'EMPLOYEE' ? ['OWN'] : primaryRole === 'SUPERVISOR' ? ['TEAM'] : ['ORGANIZATION']);
  const rawName = email.split('@')[0] || 'User';
  const userName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  return {
    id: user.id,
    userName,
    email,
    employeeIdentifier: primaryRole === 'EMPLOYEE' ? 'RP-EMP-LIVE' : undefined,
    accountStatus: 'ACTIVE',
    organization: 'Royal Packaging',
    location: 'All locations',
    team: primaryRole === 'SUPERVISOR' || primaryRole === 'EMPLOYEE' ? 'Warehouse operations' : 'Operations leadership',
    role: primaryRole,
    roles,
    permissions,
    scopes,
    kind: 'live-session',
  };
}

export function createMockSession(role: Role = configuredMockRole(), email = `${role.toLowerCase()}@royalpackaging.local`): SessionState {
  return { id: `mock-user-${role.toLowerCase()}`, userName: `${role.replace('_', ' ')} preview`, email, employeeIdentifier: role === 'EMPLOYEE' ? 'RP-EMP-SELF' : undefined, accountStatus: 'ACTIVE', organization: 'Royal Packaging', location: role === 'EMPLOYEE' ? 'Assigned location' : 'All locations', team: role === 'SUPERVISOR' || role === 'EMPLOYEE' ? 'Warehouse operations' : 'Operations leadership', role, roles: [role], permissions: rolePermissions(role), scopes: role === 'EMPLOYEE' ? ['OWN'] : role === 'SUPERVISOR' ? ['TEAM'] : ['ORGANIZATION'], kind: 'mock-demo' };
}

export function can(role: Role | undefined, permission: Permission) {
  return role ? hasPermission({ role, roles: [role], permissions: rolePermissions(role) }, permission) : false;
}

export function usesMockAuth(mode: DataMode) {
  return mode === 'mock';
}

export function authErrorMessage(reason?: AuthErrorReason): string {
  if (reason === 'invalid_credentials') return 'Invalid email or password.';
  if (reason === 'account_locked') return 'Account is temporarily locked due to multiple failed login attempts. Please try again later.';
  if (reason === 'network_error' || reason === 'server_unavailable') return 'The sign-in service is unavailable. Try again shortly.';
  if (reason === 'api_auth_unavailable') return 'Live sign-in is not enabled yet.';
  return 'We could not sign you in. Try again shortly.';
}

export function AuthProvider({ children, mode = resolveDataMode() }: { children: ReactNode; mode?: DataMode }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [status, setStatus] = useState<AuthStatus>('INITIALIZING');

  useEffect(() => {
    let active = true;

    if (usesMockAuth(mode)) {
      const timer = window.setTimeout(() => {
        if (!active) return;
        setSession(createMockSession());
        setStatus('AUTHENTICATED');
      }, 40);
      return () => { active = false; window.clearTimeout(timer); };
    }

    // API mode: verify existing session cookie via GET /auth/session
    setStatus('INITIALIZING');
    void apiRequest<{ success: boolean; data: { user: ApiUserDTO; session?: ApiSessionDTO } }>('/auth/session')
      .then((res) => {
        if (!active) return;
        if (res?.data?.user) {
          setSession(mapApiUserToSessionState(res.data.user));
          setStatus('AUTHENTICATED');
        } else {
          setSession(null);
          setStatus('UNAUTHENTICATED');
        }
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setStatus('UNAUTHENTICATED');
      });

    return () => { active = false; };
  }, [mode]);

  const value = useMemo<AuthContextValue>(() => ({
    mode,
    session,
    status,
    isAuthenticated: status === 'AUTHENTICATED' && session !== null,
    hasPermission: (permission) => status === 'AUTHENTICATED' && (hasPermission(session, permission) || session?.permissions.includes('*') === true),
    hasRole: (role) => status === 'AUTHENTICATED' && hasRole(session, role),
    hasAnyPermission: (permissions) => status === 'AUTHENTICATED' && (permissions.some((permission) => hasPermission(session, permission)) || session?.permissions.includes('*') === true),
    hasAllPermissions: (permissions) => status === 'AUTHENTICATED' && (session?.permissions.includes('*') === true || hasAllPermissions(session, permissions)),
    can: (module, action) => status === 'AUTHENTICATED' && (session?.permissions.includes('*') === true || canSubject(session, module, action)),
    canAccessRoute: (permission) => status === 'AUTHENTICATED' && (session?.permissions.includes('*') === true || !permission || hasPermission(session, permission)),
    signIn: async (email, password) => {
      setStatus('LOGGING_IN');
      if (mode === 'mock') {
        await Promise.resolve();
        const rejected = email.trim().toLowerCase().includes('denied') || password.trim().toLowerCase().includes('invalid');
        if (rejected) {
          setSession(null);
          setStatus('AUTH_ERROR');
          return { ok: false, reason: 'invalid_credentials' };
        }
        const mockSession = { ...createMockSession(configuredMockRole(), email), userName: email.split('@')[0] || 'Preview user' };
        setSession(mockSession);
        setStatus('AUTHENTICATED');
        return { ok: true, session: mockSession };
      }

      // API mode: authenticate against backend
      try {
        const res = await apiRequest<{ success: boolean; data: { user: ApiUserDTO; session: ApiSessionDTO } }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        if (!res?.data?.user) {
          setSession(null);
          setStatus('AUTH_ERROR');
          return { ok: false, reason: 'invalid_credentials' };
        }
        const liveSession = mapApiUserToSessionState(res.data.user);
        setSession(liveSession);
        setStatus('AUTHENTICATED');
        return { ok: true, session: liveSession };
      } catch (err: unknown) {
        setSession(null);
        setStatus('AUTH_ERROR');
        if (err instanceof ApiError) {
          if (err.status === 429 || err.code === 'ACCOUNT_LOCKED') {
            return { ok: false, reason: 'account_locked' };
          }
          if (err.status === 401 || err.code === 'INVALID_CREDENTIALS' || err.code === 'ACCOUNT_INACTIVE') {
            return { ok: false, reason: 'invalid_credentials' };
          }
          if (err.status >= 500) {
            return { ok: false, reason: 'server_unavailable' };
          }
        }
        return { ok: false, reason: 'network_error' };
      }
    },
    signOut: async () => {
      setStatus('LOGGING_OUT');
      try {
        if (mode === 'api') {
          await apiRequest('/auth/logout', { method: 'POST' });
        }
      } catch {
        // Best-effort revocation; clear client state regardless
      } finally {
        setSession(null);
        setStatus('UNAUTHENTICATED');
      }
    },
    expireSession: () => { setSession(null); setStatus('SESSION_EXPIRED'); },
  }), [mode, session, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
