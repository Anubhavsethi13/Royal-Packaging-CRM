import { Activity, BarChart3, BrainCircuit, Boxes, BriefcaseBusiness, CalendarCheck, ClipboardList, FileText, LayoutDashboard, PackageSearch, Settings, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import { routes } from './routes';
import { hasPermission, type AuthorizationSubject, type PermissionRequirement } from '../state/authorization';
import type { Role } from '../types/v1';

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  permission: PermissionRequirement;
}

export interface NavigationGroup {
  id: string;
  label: string;
  items: NavigationItem[];
}

// Warehouse KPI-first information architecture. Every item is filtered by the
// centralized permission check; Incentives/Payroll are Super Admin only there.
export const navigationGroups: NavigationGroup[] = [
  { id: 'workspace', label: 'Workspace', items: [
    { id: 'dashboard', label: 'Dashboard', path: routes.overview, icon: LayoutDashboard, permission: { module: 'DASHBOARD', action: 'VIEW' } },
  ] },
  { id: 'warehouse', label: 'Warehouse', items: [
    { id: 'warehouse', label: 'Overview', path: routes.warehouse, icon: Boxes, permission: { module: 'WAREHOUSE', action: 'VIEW' } },
    { id: 'loading-unloading', label: 'Loading / unloading', path: routes.loadingUnloading, icon: Activity, permission: { module: 'LOADING_UNLOADING', action: 'VIEW' } },
    { id: 'daily-reports', label: 'Daily depot report', path: routes.dailyReports, icon: CalendarCheck, permission: { module: 'DAILY_REPORTS', action: 'VIEW' } },
    { id: 'tasks', label: 'Tasks', path: routes.tasks, icon: ClipboardList, permission: { module: 'TASKS', action: 'VIEW' } },
    { id: 'locations', label: 'Locations', path: routes.locations, icon: Boxes, permission: { module: 'LOCATIONS', action: 'VIEW' } },
    { id: 'inventory', label: 'Inventory', path: routes.inventory, icon: PackageSearch, permission: { module: 'INVENTORY', action: 'VIEW' } },
  ] },
  { id: 'people-performance', label: 'Employees & KPI', items: [
    { id: 'depot-kpi', label: 'Depot KPI dashboard', path: routes.depotKpi, icon: BarChart3, permission: { module: 'DEPOT_KPI', action: 'VIEW' } },
    { id: 'employees', label: 'Employees', path: routes.employees, icon: Users, permission: { module: 'EMPLOYEES', action: 'VIEW' } },
    { id: 'kpi-results', label: 'KPI results', path: routes.kpiResults, icon: BarChart3, permission: { module: 'KPI', action: 'VIEW' } },
    { id: 'shift-kpi-summary', label: 'Shift KPI summary', path: routes.shiftKpiSummary, icon: BarChart3, permission: { module: 'KPI_SUMMARY', action: 'VIEW' } },
    { id: 'my-shifts', label: 'My shifts', path: routes.myShifts, icon: ClipboardList, permission: { module: 'SHIFTS', action: 'VIEW' } },
    { id: 'kpis', label: 'KPI configuration', path: routes.kpis, icon: BarChart3, permission: { module: 'KPI_CONFIG', action: 'VIEW' } },
  ] },
  { id: 'incentives', label: 'Incentives', items: [
    { id: 'incentives', label: 'Incentives', path: routes.incentives, icon: Activity, permission: { module: 'INCENTIVES', action: 'VIEW' } },
    { id: 'payroll', label: 'Payroll', path: routes.payroll, icon: FileText, permission: { module: 'PAYROLL', action: 'VIEW' } },
  ] },
  { id: 'governance', label: 'Reports & audit', items: [
    { id: 'reports', label: 'Reports', path: routes.reports, icon: FileText, permission: { module: 'REPORTS', action: 'VIEW' } },
    { id: 'audit', label: 'Audit logs', path: routes.audit, icon: ShieldCheck, permission: { module: 'AUDIT', action: 'VIEW' } },
    { id: 'recommendations', label: 'AI recommendations', path: routes.recommendations, icon: BrainCircuit, permission: { module: 'DASHBOARD', action: 'VIEW' } },
  ] },
  { id: 'administration', label: 'Administration', items: [
    { id: 'access-control', label: 'Roles & permissions', path: routes.accessControl, icon: ShieldCheck, permission: { module: 'ACCESS_CONTROL', action: 'VIEW' } },
    { id: 'users', label: 'Users', path: routes.users, icon: Users, permission: { module: 'ACCESS_CONTROL', action: 'VIEW' } },
    { id: 'roles', label: 'Roles', path: routes.roles, icon: ShieldCheck, permission: { module: 'ACCESS_CONTROL', action: 'VIEW' } },
    { id: 'permissions', label: 'Permissions', path: routes.permissions, icon: ShieldCheck, permission: { module: 'ACCESS_CONTROL', action: 'VIEW' } },
    { id: 'scopes', label: 'Data scopes', path: routes.scopes, icon: ShieldCheck, permission: { module: 'ACCESS_CONTROL', action: 'VIEW' } },
    { id: 'settings', label: 'Settings', path: routes.settings, icon: Settings, permission: { module: 'SETTINGS', action: 'VIEW' } },
  ] },
  { id: 'crm', label: 'CRM', items: [
    { id: 'clients', label: 'Clients', path: routes.clients, icon: BriefcaseBusiness, permission: { module: 'CLIENTS', action: 'VIEW' } },
    { id: 'orders', label: 'Orders', path: routes.orders, icon: ClipboardList, permission: { module: 'ORDERS', action: 'VIEW' } },
  ] },
];

export function visibleNavigation(subject: AuthorizationSubject | null | undefined): NavigationGroup[] {
  return navigationGroups.map((group) => ({ ...group, items: group.items.filter((item) => hasPermission(subject, item.permission)) })).filter((group) => group.items.length > 0);
}

export const routePermissions: Array<{ prefix: string; permission: PermissionRequirement }> = [
  { prefix: routes.overview, permission: { module: 'DASHBOARD', action: 'VIEW' } },
  { prefix: routes.operations, permission: { module: 'WAREHOUSE', action: 'VIEW' } },
  { prefix: routes.clients, permission: { module: 'CLIENTS', action: 'VIEW' } },
  { prefix: routes.orders, permission: { module: 'ORDERS', action: 'VIEW' } },
  { prefix: routes.inventory, permission: { module: 'INVENTORY', action: 'VIEW' } },
  { prefix: routes.tasks, permission: { module: 'TASKS', action: 'VIEW' } },
  { prefix: routes.warehouse, permission: { module: 'WAREHOUSE', action: 'VIEW' } },
  { prefix: routes.locations, permission: { module: 'LOCATIONS', action: 'VIEW' } },
  { prefix: routes.loadingUnloading, permission: { module: 'LOADING_UNLOADING', action: 'VIEW' } },
  { prefix: routes.dailyReports, permission: { module: 'DAILY_REPORTS', action: 'VIEW' } },
  { prefix: routes.depotKpi, permission: { module: 'DEPOT_KPI', action: 'VIEW' } },
  { prefix: routes.shiftEntryNew, permission: { module: 'SHIFTS', action: 'CREATE' } },
  { prefix: routes.shiftKpiSummary, permission: { module: 'KPI_SUMMARY', action: 'VIEW' } },
  { prefix: routes.myShifts, permission: { module: 'SHIFTS', action: 'VIEW' } },
  { prefix: routes.employees, permission: { module: 'EMPLOYEES', action: 'VIEW' } },
  { prefix: routes.kpiResults, permission: { module: 'KPI', action: 'VIEW' } },
  { prefix: routes.kpis, permission: { module: 'KPI_CONFIG', action: 'VIEW' } },
  { prefix: routes.incentives, permission: { module: 'INCENTIVES', action: 'VIEW' } },
  { prefix: routes.payroll, permission: { module: 'PAYROLL', action: 'VIEW' } },
  { prefix: routes.reports, permission: { module: 'REPORTS', action: 'VIEW' } },
  { prefix: routes.audit, permission: { module: 'AUDIT', action: 'VIEW' } },
  { prefix: routes.accessControl, permission: { module: 'ACCESS_CONTROL', action: 'VIEW' } },
  { prefix: routes.users, permission: { module: 'ACCESS_CONTROL', action: 'VIEW' } },
  { prefix: routes.roles, permission: { module: 'ACCESS_CONTROL', action: 'VIEW' } },
  { prefix: routes.permissions, permission: { module: 'ACCESS_CONTROL', action: 'VIEW' } },
  { prefix: routes.scopes, permission: { module: 'ACCESS_CONTROL', action: 'VIEW' } },
  { prefix: routes.settings, permission: { module: 'SETTINGS', action: 'VIEW' } },
  { prefix: routes.recommendations, permission: { module: 'DASHBOARD', action: 'VIEW' } },
];

export function permissionForPath(pathname: string): PermissionRequirement | undefined {
  return routePermissions.find(({ prefix }) => prefix === routes.overview ? pathname === prefix : pathname.startsWith(prefix))?.permission;
}

// The current product has one dashboard route; keeping this decision centralized leaves room for role-specific dashboards later.
export function defaultDashboardPath(_role?: Role): string {
  return routes.overview;
}
