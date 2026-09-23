import type { DataScope, PermissionAction, Role } from '../types/v1';

export type PermissionRequirement = string | { module: string; action: PermissionAction };

export interface AuthorizationSubject {
  role?: Role;
  roles?: Role[];
  permissions?: string[];
  scopes?: DataScope[];
}

// Scopes shape frontend visibility and future request context only. The backend must enforce every scope on data access.

const legacyModuleAliases: Record<string, string> = {
  DASHBOARD: 'dashboard',
  CLIENTS: 'crm',
  ORDERS: 'crm',
  INVENTORY: 'warehouse',
  WAREHOUSE: 'warehouse',
  LOCATIONS: 'warehouse',
  LOADING_UNLOADING: 'warehouse',
  TASKS: 'warehouse',
  EMPLOYEES: 'people',
  KPI: 'people',
  INCENTIVES: 'finance',
  PAYROLL: 'finance',
  REPORTS: 'reports',
  AUDIT: 'security',
  SETTINGS: 'security',
  ACCESS_CONTROL: 'security',
};

export function permissionKey(module: string, action: PermissionAction): string {
  return `${module.toUpperCase()}:${action}`;
}

function legacyPermission(module: string, action: PermissionAction): string {
  const alias = legacyModuleAliases[module.toUpperCase()] ?? module.toLowerCase();
  return action === 'VIEW' ? `view:${alias}` : `action:${action.toLowerCase()}`;
}

export function requirementKey(requirement: PermissionRequirement): string {
  return typeof requirement === 'string' ? requirement : permissionKey(requirement.module, requirement.action);
}

export function hasRole(subject: AuthorizationSubject | null | undefined, role: Role): boolean {
  return Boolean(subject && (subject.roles ?? (subject.role ? [subject.role] : [])).includes(role));
}

export function hasAnyRole(subject: AuthorizationSubject | null | undefined, roles: readonly Role[]): boolean {
  return roles.some((role) => hasRole(subject, role));
}

const backendPermissionMap: Record<string, string[]> = {
  'DASHBOARD:VIEW': ['dashboard:read'],
  'CLIENTS:VIEW': ['client:read'],
  'CLIENTS:CREATE': ['client:write'],
  'CLIENTS:EDIT': ['client:write'],
  'CLIENTS:DELETE': ['client:write'],
  'ORDERS:VIEW': ['order:read'],
  'ORDERS:CREATE': ['order:write'],
  'ORDERS:EDIT': ['order:write'],
  'ORDERS:CANCEL': ['order:cancel'],
  'INVENTORY:VIEW': ['inventory:read_catalog', 'inventory:read_balances', 'inventory:read_movement'],
  'TASKS:VIEW': ['task:read', 'task:read_summary'],
  'TASKS:ASSIGN': ['task:assign'],
  'TASKS:START': ['task:start'],
  'TASKS:PAUSE': ['task:pause'],
  'TASKS:RESUME': ['task:resume'],
  'TASKS:COMPLETE': ['task:complete'],
  'TASKS:CANCEL': ['task:cancel'],
  'TASKS:VERIFY': ['task:verify', 'quality:inspect'],
  'WAREHOUSE:VIEW': ['warehouse:read_tasks', 'warehouse:read_route', 'warehouse:scan'],
  'LOCATIONS:VIEW': ['warehouse:read_tasks', 'warehouse:read_route'],
  'LOADING_UNLOADING:VIEW': ['warehouse:read_tasks', 'task:execute_movement'],
  'EMPLOYEES:VIEW': ['employee:read'],
  'EMPLOYEES:CREATE': ['employee:write'],
  'EMPLOYEES:EDIT': ['employee:write'],
  'KPI:VIEW': ['kpi:read'],
  'KPI:EDIT': ['kpi:write'],
  'KPI:VERIFY': ['kpi:verify'],
  'INCENTIVES:VIEW': ['incentive:read'],
  'INCENTIVES:APPROVE': ['incentive:approve'],
  'PAYROLL:VIEW': ['payroll:read'],
  'PAYROLL:APPROVE': ['payroll:approve'],
  'REPORTS:VIEW': ['report:read'],
  'REPORTS:EXPORT': ['report:execute'],
  'AUDIT:VIEW': ['audit:read'],
  'ACCESS_CONTROL:VIEW': ['audit:read', 'settings:read'],
  'SETTINGS:VIEW': ['settings:read', 'audit:read'],
};

export function hasPermission(subject: AuthorizationSubject | null | undefined, requirement: PermissionRequirement): boolean {
  if (!subject) return false;
  if (hasRole(subject, 'SUPER_ADMIN')) return true;
  const permissions = subject.permissions ?? [];
  if (permissions.includes('*')) return true;
  const key = requirementKey(requirement);
  if (permissions.includes(key)) return true;
  if (typeof requirement === 'string') return permissions.includes(requirement);

  const backendEquivalents = backendPermissionMap[key];
  if (backendEquivalents && backendEquivalents.some((perm) => permissions.includes(perm))) {
    return true;
  }

  if (permissions.some((permission) => /^[A-Z_]+:(VIEW|CREATE|EDIT|DELETE|ASSIGN|ACCEPT|APPROVE|REJECT|EXPORT|START|PAUSE|RESUME|COMPLETE|REOPEN|CANCEL|VERIFY)$/.test(permission))) return false;
  return permissions.includes(legacyPermission(requirement.module, requirement.action));
}

export function hasAnyPermission(subject: AuthorizationSubject | null | undefined, requirements: readonly PermissionRequirement[]): boolean {
  return requirements.some((requirement) => hasPermission(subject, requirement));
}

export function hasAllPermissions(subject: AuthorizationSubject | null | undefined, requirements: readonly PermissionRequirement[]): boolean {
  return requirements.every((requirement) => hasPermission(subject, requirement));
}

export function can(subject: AuthorizationSubject | null | undefined, module: string, action: PermissionAction): boolean {
  return hasPermission(subject, { module, action });
}

export function canAccessRoute(subject: AuthorizationSubject | null | undefined, requirement?: PermissionRequirement): boolean {
  return !requirement || hasPermission(subject, requirement);
}

export function rolePermissions(role: Role): string[] {
  if (role === 'SUPER_ADMIN') return ['*'];
  const permissions: Record<Role, Array<[string, PermissionAction]>> = {
    SUPER_ADMIN: [],
    ADMIN: [
      ['DASHBOARD', 'VIEW'], ['EMPLOYEES', 'VIEW'], ['EMPLOYEES', 'CREATE'], ['EMPLOYEES', 'EDIT'],
      ['TASKS', 'VIEW'], ['TASKS', 'ASSIGN'], ['TASKS', 'ACCEPT'], ['TASKS', 'START'], ['TASKS', 'PAUSE'], ['TASKS', 'RESUME'], ['TASKS', 'COMPLETE'], ['TASKS', 'REOPEN'], ['TASKS', 'CANCEL'], ['TASKS', 'VERIFY'],
      ['WAREHOUSE', 'VIEW'], ['LOADING_UNLOADING', 'VIEW'], ['KPI', 'VIEW'], ['KPI', 'VERIFY'], ['INCENTIVES', 'VIEW'], ['INCENTIVES', 'APPROVE'], ['PAYROLL', 'VIEW'], ['PAYROLL', 'APPROVE'], ['REPORTS', 'VIEW'], ['REPORTS', 'EXPORT'], ['AUDIT', 'VIEW'], ['SETTINGS', 'VIEW'],
    ],
    SUPERVISOR: [
      ['DASHBOARD', 'VIEW'], ['EMPLOYEES', 'VIEW'], ['TASKS', 'VIEW'], ['TASKS', 'ASSIGN'], ['TASKS', 'START'], ['TASKS', 'PAUSE'], ['TASKS', 'RESUME'], ['TASKS', 'COMPLETE'], ['TASKS', 'REOPEN'], ['TASKS', 'VERIFY'],
      ['WAREHOUSE', 'VIEW'], ['LOADING_UNLOADING', 'VIEW'], ['KPI', 'VIEW'], ['KPI', 'VERIFY'], ['INCENTIVES', 'VIEW'], ['REPORTS', 'VIEW'],
    ],
    EMPLOYEE: [
      ['DASHBOARD', 'VIEW'], ['TASKS', 'VIEW'], ['TASKS', 'ACCEPT'], ['TASKS', 'START'], ['TASKS', 'PAUSE'], ['TASKS', 'RESUME'], ['TASKS', 'COMPLETE'], ['KPI', 'VIEW'], ['INCENTIVES', 'VIEW'],
    ],
  };
  const legacy: Record<Role, string[]> = {
    SUPER_ADMIN: [],
    ADMIN: ['view:dashboard', 'view:crm', 'view:warehouse', 'view:people', 'view:finance', 'view:reports', 'action:create', 'action:edit', 'action:approve', 'action:export'],
    SUPERVISOR: ['view:dashboard', 'view:crm', 'view:warehouse', 'view:people', 'view:reports', 'action:create', 'action:edit', 'action:approve', 'action:export'],
    EMPLOYEE: ['view:dashboard', 'view:warehouse', 'action:edit'],
  };
  return [...permissions[role].map(([module, action]) => permissionKey(module, action)), ...legacy[role]];
}
