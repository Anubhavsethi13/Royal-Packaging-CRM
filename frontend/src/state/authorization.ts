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
  'WAREHOUSE:VIEW': ['warehouse:read_operations', 'warehouse:read_tasks', 'warehouse:read_route', 'warehouse:scan'],
  'LOCATIONS:VIEW': ['location:read', 'warehouse:read_tasks', 'warehouse:read_route'],
  'LOADING_UNLOADING:VIEW': ['warehouse:read_tasks', 'task:execute_movement'],
  'DAILY_REPORTS:VIEW': ['daily_report:read'],
  'DAILY_REPORTS:CREATE': ['daily_report:write'],
  'DAILY_REPORTS:EDIT': ['daily_report:write'],
  'EMPLOYEES:VIEW': ['employee:read'],
  'EMPLOYEES:CREATE': ['employee:write'],
  'EMPLOYEES:EDIT': ['employee:write'],
  'KPI_SUMMARY:VIEW': ['kpi:read_all'],
  'SHIFTS:VIEW': ['shift:read_own'],
  'SHIFTS:CREATE': ['shift:create'],
  'KPI:VIEW': ['kpi:read'],
  'KPI_CONFIG:VIEW': ['kpi:read_config'],
  'DEPOT_KPI:VIEW': ['kpi:read_depot'],
  'KPI:EDIT': ['kpi:write'],
  'KPI:VERIFY': ['kpi:verify'],
  'INCENTIVES:VIEW': ['incentive:read'],
  'INCENTIVES:APPROVE': ['incentive:approve'],
  'PAYROLL:VIEW': ['payroll:read'],
  'PAYROLL:APPROVE': ['payroll:approve'],
  'REPORTS:VIEW': ['report:read'],
  'REPORTS:EXPORT': ['report:execute'],
  'AUDIT:VIEW': ['audit:read'],
  // Administration is its own permission: audit visibility must not open users, roles or settings.
  'ACCESS_CONTROL:VIEW': ['settings:read'],
  'SETTINGS:VIEW': ['settings:read'],
};

// Incentives and payroll (payroll entries are incentive amounts) are Super Admin only.
// No permission string can grant them to another role; the backend enforces the same rule.
export const SUPER_ADMIN_ONLY_MODULES: readonly string[] = ['INCENTIVES', 'PAYROLL'];
const SUPER_ADMIN_ONLY_PERMISSION_PREFIXES: readonly string[] = ['incentive:', 'payroll:', 'financial:', 'view:finance'];

export function isSuperAdminOnly(requirement: PermissionRequirement): boolean {
  if (typeof requirement === 'string') {
    const upper = requirement.toUpperCase();
    return SUPER_ADMIN_ONLY_MODULES.some((module) => upper.startsWith(`${module}:`))
      || SUPER_ADMIN_ONLY_PERMISSION_PREFIXES.some((prefix) => requirement.toLowerCase().startsWith(prefix));
  }
  return SUPER_ADMIN_ONLY_MODULES.includes(requirement.module.toUpperCase());
}

export function hasPermission(subject: AuthorizationSubject | null | undefined, requirement: PermissionRequirement): boolean {
  if (!subject) return false;
  if (isSuperAdminOnly(requirement)) return hasRole(subject, 'SUPER_ADMIN');
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
      ['DASHBOARD', 'VIEW'], ['SHIFTS', 'VIEW'], ['SHIFTS', 'CREATE'], ['KPI_SUMMARY', 'VIEW'], ['EMPLOYEES', 'VIEW'], ['EMPLOYEES', 'CREATE'], ['EMPLOYEES', 'EDIT'],
      ['TASKS', 'VIEW'], ['TASKS', 'ASSIGN'], ['TASKS', 'ACCEPT'], ['TASKS', 'START'], ['TASKS', 'PAUSE'], ['TASKS', 'RESUME'], ['TASKS', 'COMPLETE'], ['TASKS', 'REOPEN'], ['TASKS', 'CANCEL'], ['TASKS', 'VERIFY'],
      ['WAREHOUSE', 'VIEW'], ['LOADING_UNLOADING', 'VIEW'], ['DAILY_REPORTS', 'VIEW'], ['DAILY_REPORTS', 'CREATE'], ['DAILY_REPORTS', 'EDIT'], ['KPI', 'VIEW'], ['KPI', 'VERIFY'], ['KPI_CONFIG', 'VIEW'], ['DEPOT_KPI', 'VIEW'], ['REPORTS', 'VIEW'], ['REPORTS', 'EXPORT'], ['AUDIT', 'VIEW'], ['SETTINGS', 'VIEW'],
    ],
    ACCOUNTANT: [
      ['DASHBOARD', 'VIEW'], ['KPI_SUMMARY', 'VIEW'], ['EMPLOYEES', 'VIEW'], ['TASKS', 'VIEW'], ['WAREHOUSE', 'VIEW'], ['LOCATIONS', 'VIEW'], ['LOADING_UNLOADING', 'VIEW'], ['DAILY_REPORTS', 'VIEW'], ['INVENTORY', 'VIEW'],
      ['KPI', 'VIEW'], ['DEPOT_KPI', 'VIEW'], ['REPORTS', 'VIEW'], ['REPORTS', 'EXPORT'], ['AUDIT', 'VIEW'],
    ],
    SUPERVISOR: [
      ['DASHBOARD', 'VIEW'], ['SHIFTS', 'VIEW'], ['SHIFTS', 'CREATE'], ['KPI_SUMMARY', 'VIEW'], ['EMPLOYEES', 'VIEW'], ['TASKS', 'VIEW'], ['TASKS', 'ASSIGN'], ['TASKS', 'START'], ['TASKS', 'PAUSE'], ['TASKS', 'RESUME'], ['TASKS', 'COMPLETE'], ['TASKS', 'REOPEN'], ['TASKS', 'VERIFY'],
      ['WAREHOUSE', 'VIEW'], ['LOADING_UNLOADING', 'VIEW'], ['DAILY_REPORTS', 'VIEW'], ['DAILY_REPORTS', 'CREATE'], ['DAILY_REPORTS', 'EDIT'], ['KPI', 'VIEW'], ['KPI', 'VERIFY'], ['DEPOT_KPI', 'VIEW'], ['REPORTS', 'VIEW'],
    ],
    EMPLOYEE: [
      ['DASHBOARD', 'VIEW'], ['SHIFTS', 'VIEW'], ['SHIFTS', 'CREATE'], ['TASKS', 'VIEW'], ['TASKS', 'ACCEPT'], ['TASKS', 'START'], ['TASKS', 'PAUSE'], ['TASKS', 'RESUME'], ['TASKS', 'COMPLETE'], ['KPI', 'VIEW'],
    ],
  };
  const legacy: Record<Role, string[]> = {
    SUPER_ADMIN: [],
    ADMIN: ['view:dashboard', 'view:crm', 'view:warehouse', 'view:people', 'view:reports', 'action:create', 'action:edit', 'action:approve', 'action:export'],
    ACCOUNTANT: ['view:dashboard', 'view:warehouse', 'view:people', 'view:reports', 'action:export'],
    SUPERVISOR: ['view:dashboard', 'view:crm', 'view:warehouse', 'view:people', 'view:reports', 'action:create', 'action:edit', 'action:approve', 'action:export'],
    EMPLOYEE: ['view:dashboard', 'view:warehouse', 'action:edit'],
  };
  return [...permissions[role].map(([module, action]) => permissionKey(module, action)), ...legacy[role]];
}
