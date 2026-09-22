/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { resolveDataMode, type DataMode } from './repositories';
import type { DataScope, Role } from '../types/v1';
import { can as canSubject, hasAllPermissions, hasPermission, hasRole, rolePermissions, type PermissionRequirement } from './authorization';

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
  kind: 'mock-demo';
}

export type AuthErrorReason = 'invalid_credentials' | 'network_error' | 'server_unavailable' | 'api_auth_unavailable' | 'unknown';
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
  signOut: () => void;
  expireSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export const mockRoles: Role[] = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'EMPLOYEE'];

function configuredMockRole(): Role {
  const role = import.meta.env.VITE_MOCK_ROLE;
  return mockRoles.includes(role as Role) ? role as Role : 'SUPER_ADMIN';
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
  if (reason === 'network_error' || reason === 'server_unavailable') return 'The sign-in service is unavailable. Try again shortly.';
  if (reason === 'api_auth_unavailable') return 'Live sign-in is not enabled yet.';
  return 'We could not sign you in. Try again shortly.';
}

export function AuthProvider({ children, mode = resolveDataMode() }: { children: ReactNode; mode?: DataMode }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [status, setStatus] = useState<AuthStatus>(usesMockAuth(mode) ? 'INITIALIZING' : 'UNAUTHENTICATED');

  useEffect(() => {
    if (!usesMockAuth(mode)) return undefined;
    const timer = window.setTimeout(() => {
      setSession(createMockSession());
      setStatus('AUTHENTICATED');
    }, 40);
    return () => window.clearTimeout(timer);
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
      if (mode !== 'mock') {
        setSession(null);
        setStatus('AUTH_ERROR');
        return { ok: false, reason: 'api_auth_unavailable' };
      }
      await Promise.resolve();
      const rejected = email.trim().toLowerCase().includes('denied') || password.trim().toLowerCase().includes('invalid');
      if (rejected) {
        setSession(null);
        setStatus('AUTH_ERROR');
        return { ok: false, reason: 'invalid_credentials' };
      }
      setSession({ ...createMockSession(configuredMockRole(), email), userName: email.split('@')[0] || 'Preview user' });
      setStatus('AUTHENTICATED');
      return { ok: true, session: createMockSession(configuredMockRole(), email) };
    },
    signOut: () => { setStatus('LOGGING_OUT'); setSession(null); window.setTimeout(() => setStatus('UNAUTHENTICATED'), 40); },
    expireSession: () => { setSession(null); setStatus('SESSION_EXPIRED'); },
  }), [mode, session, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
