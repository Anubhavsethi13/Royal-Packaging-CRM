import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { routes } from './routes';
import { permissionForPath, visibleNavigation } from './navigation';
import { searchPreview } from '../mock/search';
import { AccessControlPage, AuthPage, ClientDetailPage, ClientsPage, DashboardPage, ForgotPasswordPage, InventoryDetailPage, InventoryPage, NotFoundPage, OrderDetailPage, OrdersPage, ProfilePage, ResetPasswordPage, SessionExpiredPage, SettingsPage, TasksPage, TaskDetailPage, UnauthorizedPage } from '../pages/pages';
import { AuditPage, IncentivesPage, PayrollPage, ReportsPage } from '../pages/management-pages';
import { EmployeeDetailPage, EmployeesPage } from '../pages/employee-pages';
import { LoadingUnloadingDetailRoute, LoadingUnloadingPage, LocationsPage, OperationsPage, WarehousePage } from '../pages/operational-pages';
import { WarehouseTaskDetailPage } from '../pages/warehouse-pages';
import { RecommendationsPage } from '../ai/RecommendationsPage';
import { KpiConfigurationDetailPage, KpiConfigurationPage } from '../kpi/configuration-pages';
import { KpiResultDetailPage, KpiResultsPage } from '../kpi/result-pages';
import { PermissionsPage, RolesPage, ScopesPage, UserAccessPage, UsersPage } from '../pages/rbac-pages';
import { ActionMenu, Alert, Dialog, IconButton, Input, LoadingState } from '../components/ui';
import { AuthProvider, useAuth } from '../state/auth';
import type { PermissionRequirement } from '../state/authorization';
import { RepositoryProvider } from '../state/repositories';

function ProtectedRoute({ permission, children }: { permission?: PermissionRequirement; children: ReactNode }) {
  const { status, isAuthenticated, canAccessRoute } = useAuth();
  const location = useLocation();
  if (status === 'INITIALIZING' || status === 'LOGGING_IN' || status === 'LOGGING_OUT') return <LoadingState label={status === 'LOGGING_OUT' ? 'Signing you out' : 'Checking your workspace session'} />;
  if (status === 'SESSION_EXPIRED') return <Navigate to={routes.sessionExpired} replace state={{ from: location.pathname }} />;
  if (!isAuthenticated) return <Navigate to={routes.login} replace state={{ from: location.pathname }} />;
  if (!canAccessRoute(permission)) return <UnauthorizedPage />;
  return <>{children}</>;
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const items = visibleNavigation(session).flatMap((group) => group.items).filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  const results = searchPreview(query);
  const firstPath = items[0]?.path ?? results[0]?.path;
  return <Dialog open={open} title="Search workspace" description="Find clients, orders, inventory, employees, tasks, or screens." onClose={onClose}><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && firstPath) { event.preventDefault(); navigate(firstPath); onClose(); } }} placeholder="Search records or screens" /><div className="command-list">{items.map((item) => <button key={item.path} onClick={() => { navigate(item.path); onClose(); }}><item.icon size={16} /><span>{item.label}</span><ChevronRight size={14} /></button>)}{results.length > 0 && <div className="command-section-label">Records</div>}{results.map((result) => <button key={`${result.kind}-${result.id}`} onClick={() => { navigate(result.path); onClose(); }}><Search size={16} /><span><strong>{result.label}</strong><small>{result.kind} · {result.meta}</small></span><ChevronRight size={14} /></button>)}{items.length === 0 && results.length === 0 && <span className="muted">No screens or records match that search.</span>}</div></Dialog>;
}

function ShellLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { session, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const navGroups = visibleNavigation(session);
  const pageTitle = location.pathname === '/' ? 'Overview' : location.pathname.split('/')[1]?.replaceAll('-', ' ') ?? 'Workspace';

  return <div className={`app ${dark ? 'theme-dark' : ''}`}>
    {mobileOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark">RP</div><div><strong>Royal Packaging</strong><span>Operations console</span></div><IconButton label="Close navigation" className="mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></IconButton></div>
      <div className="nav-scroll">{navGroups.length ? navGroups.map((group) => <div className="nav-group" key={group.id}><div className="nav-label">{group.label}</div><nav aria-label={group.label}>{group.items.map(({ label, path, icon: Icon }) => <NavLink key={label} to={path} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive && (path === routes.overview ? location.pathname === routes.overview : location.pathname.startsWith(path)) ? 'nav-active' : ''}`}><Icon size={16} /><span>{label}</span>{location.pathname.startsWith(path) && <ChevronRight className="nav-chevron" size={14} />}</NavLink>)}</nav></div>) : <div className="nav-empty">No workspace areas are available for this session.</div>}</div>
      <div className="sidebar-footer"><div className="system-status"><span className="status-dot" />{session?.kind === 'mock-demo' ? 'Preview session · no live sync' : 'Connected session'}</div><div className="user-mini"><div className="avatar">{session?.userName.slice(0, 2).toUpperCase() ?? 'AD'}</div><div><strong>{session?.userName ?? 'Signed out'}</strong><span>{session?.roles.join(' · ') ?? 'No active session'}{session?.employeeIdentifier ? ` · ${session.employeeIdentifier}` : ''}</span></div></div></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><IconButton label="Open navigation" className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={19} /></IconButton><div className="crumb"><span>Workspace</span><ChevronRight size={14} /><strong>{pageTitle}</strong></div><div className="topbar-actions"><button className="command-trigger" onClick={() => setCommandOpen(true)}><Search size={15} /><span>Search workspace</span><kbd>⌘ K</kbd></button><IconButton label="View notifications" onClick={() => setNotificationsOpen(true)} className="notification-button"><Bell size={17} /><span className="notification-dot" /></IconButton><button className="theme-switch" onClick={() => setDark((value) => !value)} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>{dark ? <Sun size={16} /> : <Moon size={16} />}<span>{dark ? 'Light' : 'Dark'}</span></button><ActionMenu items={[{ label: 'Profile', onClick: () => navigate(routes.profile) }, { label: 'Settings', onClick: () => navigate(routes.settings) }, { label: 'Sign out', onClick: () => { signOut(); navigate(routes.login, { replace: true }); } }]} /></div></header>
      <div className="content-wrap"><Outlet /></div>
    </main>
    <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    <Dialog open={notificationsOpen} title="Notifications" description="Preview alerts from the current workspace." onClose={() => setNotificationsOpen(false)}><div className="notification-list"><Alert tone="warning" title="Stale preview data">Inventory values are illustrative and not connected to a live event stream.</Alert><Alert tone="info" title="Phase 2 boundary">Authentication and authorization remain mock-only until the security backend phase.</Alert></div></Dialog>
  </div>;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false, message: '' };

  static getDerivedStateFromError(error: Error) { return { failed: true, message: error.message }; }

  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Diagnostics stay in developer tooling; user output remains safe. */ }

  render() {
    if (this.state.failed) return <div className="app-error-shell"><Alert tone="error" title="The workspace could not be displayed">{this.state.message || 'Refresh the page to recover this preview. No operational data was changed.'}</Alert><button className="button button-secondary" onClick={() => window.location.reload()}>Refresh workspace</button></div>;
    return this.props.children;
  }
}

export function App() {
  return <AppErrorBoundary><AuthProvider><RepositoryProvider><Routes><Route element={<ShellLayout />}><Route path={routes.overview} element={<ProtectedRoute permission={permissionForPath(routes.overview)}><DashboardPage /></ProtectedRoute>} /><Route path={routes.clients} element={<ProtectedRoute permission={permissionForPath(routes.clients)}><ClientsPage /></ProtectedRoute>} /><Route path={routes.clientDetail} element={<ProtectedRoute permission={permissionForPath(routes.clients)}><ClientDetailPage /></ProtectedRoute>} /><Route path={routes.orders} element={<ProtectedRoute permission={permissionForPath(routes.orders)}><OrdersPage /></ProtectedRoute>} /><Route path={routes.orderDetail} element={<ProtectedRoute permission={permissionForPath(routes.orders)}><OrderDetailPage /></ProtectedRoute>} /><Route path={routes.operations} element={<ProtectedRoute permission={permissionForPath(routes.operations)}><OperationsPage /></ProtectedRoute>} /><Route path={routes.inventory} element={<ProtectedRoute permission={permissionForPath(routes.inventory)}><InventoryPage /></ProtectedRoute>} /><Route path={routes.inventoryDetail} element={<ProtectedRoute permission={permissionForPath(routes.inventory)}><InventoryDetailPage /></ProtectedRoute>} /><Route path={routes.warehouse} element={<ProtectedRoute permission={permissionForPath(routes.warehouse)}><WarehousePage /></ProtectedRoute>} /><Route path={routes.warehouseDetail} element={<ProtectedRoute permission={permissionForPath(routes.warehouse)}><WarehouseTaskDetailPage /></ProtectedRoute>} /><Route path={routes.locations} element={<ProtectedRoute permission={permissionForPath(routes.locations)}><LocationsPage /></ProtectedRoute>} /><Route path={routes.loadingUnloading} element={<ProtectedRoute permission={permissionForPath(routes.loadingUnloading)}><LoadingUnloadingPage /></ProtectedRoute>} /><Route path={routes.loadingUnloadingDetail} element={<ProtectedRoute permission={permissionForPath(routes.loadingUnloading)}><LoadingUnloadingDetailRoute /></ProtectedRoute>} /><Route path={routes.tasks} element={<ProtectedRoute permission={permissionForPath(routes.tasks)}><TasksPage /></ProtectedRoute>} /><Route path={routes.taskDetail} element={<ProtectedRoute permission={permissionForPath(routes.tasks)}><TaskDetailPage /></ProtectedRoute>} /><Route path={routes.employees} element={<ProtectedRoute permission={permissionForPath(routes.employees)}><EmployeesPage /></ProtectedRoute>} /><Route path={routes.employeeDetail} element={<ProtectedRoute permission={permissionForPath(routes.employees)}><EmployeeDetailPage /></ProtectedRoute>} /><Route path={routes.kpiResults} element={<ProtectedRoute permission={permissionForPath(routes.kpiResults)}><KpiResultsPage /></ProtectedRoute>} /><Route path={routes.kpiResultDetail} element={<ProtectedRoute permission={permissionForPath(routes.kpiResultDetail)}><KpiResultDetailPage /></ProtectedRoute>} /><Route path={routes.kpis} element={<ProtectedRoute permission={permissionForPath(routes.kpis)}><KpiConfigurationPage /></ProtectedRoute>} /><Route path={routes.kpiDetail} element={<ProtectedRoute permission={permissionForPath(routes.kpis)}><KpiConfigurationDetailPage /></ProtectedRoute>} /><Route path={routes.recommendations} element={<ProtectedRoute permission={permissionForPath(routes.recommendations)}><RecommendationsPage /></ProtectedRoute>} /><Route path={routes.incentives} element={<ProtectedRoute permission={permissionForPath(routes.incentives)}><IncentivesPage /></ProtectedRoute>} /><Route path={routes.payroll} element={<ProtectedRoute permission={permissionForPath(routes.payroll)}><PayrollPage /></ProtectedRoute>} /><Route path={routes.reports} element={<ProtectedRoute permission={permissionForPath(routes.reports)}><ReportsPage /></ProtectedRoute>} /><Route path={routes.audit} element={<ProtectedRoute permission={permissionForPath(routes.audit)}><AuditPage /></ProtectedRoute>} /><Route path={routes.profile} element={<ProtectedRoute permission={permissionForPath(routes.settings)}><ProfilePage /></ProtectedRoute>} /><Route path={routes.settings} element={<ProtectedRoute permission={permissionForPath(routes.settings)}><SettingsPage /></ProtectedRoute>} /><Route path={routes.accessControl} element={<ProtectedRoute permission={permissionForPath(routes.accessControl)}><AccessControlPage /></ProtectedRoute>} /><Route path={routes.users} element={<ProtectedRoute permission={permissionForPath(routes.users)}><UsersPage /></ProtectedRoute>} /><Route path={routes.userDetail} element={<ProtectedRoute permission={permissionForPath(routes.users)}><UserAccessPage /></ProtectedRoute>} /><Route path={routes.roles} element={<ProtectedRoute permission={permissionForPath(routes.roles)}><RolesPage /></ProtectedRoute>} /><Route path={routes.permissions} element={<ProtectedRoute permission={permissionForPath(routes.permissions)}><PermissionsPage /></ProtectedRoute>} /><Route path={routes.scopes} element={<ProtectedRoute permission={permissionForPath(routes.scopes)}><ScopesPage /></ProtectedRoute>} /><Route path="*" element={<NotFoundPage />} /></Route><Route path={routes.login} element={<AuthPage mode="login" />} /><Route path={routes.register} element={<AuthPage mode="register" />} /><Route path={routes.forgotPassword} element={<ForgotPasswordPage />} /><Route path={routes.resetPassword} element={<ResetPasswordPage />} /><Route path={routes.unauthorized} element={<UnauthorizedPage />} /><Route path={routes.sessionExpired} element={<SessionExpiredPage />} /></Routes></RepositoryProvider></AuthProvider></AppErrorBoundary>;
}
