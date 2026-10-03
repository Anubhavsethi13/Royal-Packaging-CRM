import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Archive, ClipboardCheck, Plus, SlidersHorizontal, Users } from 'lucide-react';
import { routes } from '../app/routes';
import { useRepositories } from '../state/repositories';
import { useAuth } from '../state/auth';
import type { EmployeeRecord } from '../types/domain';
import type { ListResponse } from '../mock/repositories';
import { employeeDetailTabs, loadEmployeeDetail, loadEmployeeList } from './employee-data';
import { ActionMenu, Avatar, Badge, Button, Card, DataTable, DemoNotice, EmptyState, ErrorState, FilterBar, LoadingState, MetricCard, PageHeader, Pagination, SearchField, Select, StatusBadge, Tabs } from '../components/ui';

const initials = (name: string) => name.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase();
const detailPath = (path: string, id: string) => path.replace(/:[^/]+$/, id);

function DetailNotFound() {
  return <Card className="empty-panel not-found"><EmptyState icon={Archive} title="Employee not found" description="The requested employee ID does not match the available records." action={<Link className="button button-primary" to={routes.employees}>Back to employees</Link>} /></Card>;
}

export function EmployeesPage() {
  const { mode, repositories } = useRepositories();
  const [query, setQuery] = useState('');
  const [depot, setDepot] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [response, setResponse] = useState<ListResponse<EmployeeRecord>>({ items: [], page: 1, pageSize: 5, total: 0, stale: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void loadEmployeeList(repositories.employees, mode, { page, pageSize, search: query, depot, status, sort }).then((result) => {
      if (!active) return;
      setResponse(result);
      setLoading(false);
    }).catch((requestError: unknown) => {
      if (!active) return;
      setError(requestError instanceof Error ? requestError.message : 'Employees could not be loaded.');
      setLoading(false);
    });
    return () => { active = false; };
  }, [depot, mode, page, pageSize, query, repositories.employees, sort, status]);

  if (loading) return <LoadingState label="Loading employees" />;
  if (error) return <ErrorState title="Employees could not be loaded" description={error} />;
  const totalPages = Math.max(1, Math.ceil(response.total / pageSize));
  return <><PageHeader eyebrow="People and attribution" title="Employees" description="A workforce directory for roles, shifts, productivity, and KPI context." actions={<Button disabled={mode === 'api'} title={mode === 'api' ? 'Employee mutations require a confirmed backend contract' : undefined}><Plus size={15} /> Add employee</Button>} /><DemoNotice>{mode === 'api' ? 'Employee records are loaded from the API. Role, task count, productivity and KPI are not part of the employee record and show as not recorded. Account creation and role changes are not connected.' : 'Employee and financial values are mock data. Account creation and role mutation are not connected.'}</DemoNotice><FilterBar resultLabel={`${response.items.length} shown · ${response.total} employees`}><SearchField placeholder="Search employee, code, or role" value={query} onChange={(value) => { setQuery(value); setPage(1); }} /><Select value={depot} onChange={(event) => { setDepot(event.target.value); setPage(1); }} aria-label="Filter depot"><option value="all">All depots</option><option value="D1">Bengaluru · D1</option><option value="D2">Bengaluru · D2</option></Select><Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Filter employee status"><option value="all">All statuses</option><option>Active</option><option>On leave</option></Select><Select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label="Sort employees"><option value="name">Sort: name</option><option value="role">Sort: role</option><option value="productivity">Sort: productivity</option></Select><Select value={String(pageSize)} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Employees per page"><option value="5">5 per page</option><option value="10">10 per page</option></Select></FilterBar><Card><div className="section-heading"><div><span className="section-kicker">Employee register</span><h2>Workforce directory</h2></div><Badge tone="neutral">Read-only preview</Badge></div><DataTable headers={['Employee', 'Role', 'Depot / shift', 'Tasks', 'Productivity', 'KPI', 'Status', '']} rows={response.items.map((employee) => [<Link className="person-cell table-link" to={detailPath(routes.employeeDetail, employee.id)}><Avatar initials={initials(employee.name)} tone="green" /><span><strong>{employee.name}</strong><small>{employee.code}</small></span></Link>, employee.role, <span>{employee.depot}<small className="table-sub">{employee.shift}</small></span>, <span className="mono">{employee.tasks}</span>, employee.productivity, employee.kpi, <StatusBadge status={employee.status} />, <ActionMenu items={[{ label: 'Open profile', onClick: () => undefined }, { label: 'View activity', onClick: () => undefined }]} />])} empty={<EmptyState title="No employees found" description="Try another search or filter." />} /></Card><Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onChange={setPage} /></>;
}

/** Incentive and payroll preview cards: rendered only for Super Admin (`visible` comes from the centralized INCENTIVES permission). */
export function EmployeeIncentiveCards({ visible, mode }: { visible: boolean; mode: 'mock' | 'api' }) {
  if (!visible) return null;
  // API mode: the incentive ledger and payroll contracts are not reconciled yet, so no figure is shown.
  if (mode === 'api') return <><MetricCard label="Incentive preview" value="Not available" detail="Incentive ledger not connected" accent="amber" /><MetricCard label="Payroll period" value="Not available" detail="Payroll not connected" accent="slate" /></>;
  return <><MetricCard label="Incentive preview" value="₹ 450" detail="3 events this period" accent="amber" /><MetricCard label="Payroll period" value="Pending" detail="Preview only" accent="slate" /></>;
}

export function EmployeeDetailPage() {
  const { employeeId } = useParams();
  const { mode, repositories } = useRepositories();
  const [employee, setEmployee] = useState<EmployeeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('Assigned tasks');
  // Incentive and payroll figures are Super Admin only (centralized rule in state/authorization).
  const { hasPermission } = useAuth();
  const canViewIncentives = hasPermission({ module: 'INCENTIVES', action: 'VIEW' });
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    if (!employeeId) { setEmployee(null); setLoading(false); return () => { active = false; }; }
    void loadEmployeeDetail(repositories.employees, employeeId).then((result) => { if (!active) return; setEmployee(result ?? null); setLoading(false); }).catch((requestError: unknown) => { if (!active) return; setError(requestError instanceof Error ? requestError.message : 'Employee could not be loaded.'); setLoading(false); });
    return () => { active = false; };
  }, [employeeId, repositories.employees]);
  if (loading) return <LoadingState label="Loading employee" />;
  if (error) return <ErrorState title="Employee could not be loaded" description={error} />;
  if (!employee) return <DetailNotFound />;
  return <><PageHeader breadcrumbs={['Employees', employee.name]} eyebrow={employee.code} title={employee.name} description={`${employee.role} · ${employee.depot} · ${employee.shift}`} actions={<><Button variant="secondary" disabled title="Employee mutations require a confirmed backend contract"><SlidersHorizontal size={15} /> Edit profile</Button><ActionMenu items={[{ label: 'Export employee view', onClick: () => undefined }, { label: 'Open audit history', onClick: () => undefined }]} /></>} /><DemoNotice>{mode === 'api' ? `Employee details are loaded from the API. Productivity, KPI${canViewIncentives ? ', incentive and payroll' : ''} figures are not connected to this page and show as not available.` : canViewIncentives ? 'Productivity, KPI, incentive, and payroll values are illustrative until their backend services exist.' : 'Productivity and KPI values are illustrative until their backend services exist.'}</DemoNotice><div className="detail-grid"><Card className="profile-card"><div className="large-profile"><Avatar initials={initials(employee.name)} tone="green" /><div><h2>{employee.name}</h2><span>{employee.code} · {employee.status}</span></div><StatusBadge status={employee.status} /></div><div className="detail-facts"><span><small>Role</small><strong>{employee.role}</strong></span><span><small>Depot</small><strong>{employee.depot}</strong></span><span><small>Shift</small><strong>{employee.shift}</strong></span><span><small>Assigned tasks</small><strong>{employee.tasks}</strong></span></div></Card><Card><div className="section-heading"><div><span className="section-kicker">Performance</span><h2>Current signal</h2></div>{mode === 'api' ? <Badge tone="neutral">Not available</Badge> : <Badge tone="success">On track</Badge>}</div><div className="performance-score"><strong>{employee.productivity}</strong><span>productivity</span><div className="bar bar-green"><b style={{ width: employee.productivity }} /></div><small>KPI index {employee.kpi} of target</small></div></Card></div><div className="metric-grid"><MetricCard label="Productivity" value={employee.productivity} detail="This shift" accent="green" /><MetricCard label="KPI index" value={employee.kpi} detail="Target comparison" accent="indigo" /><EmployeeIncentiveCards visible={canViewIncentives} mode={mode} /></div><Card><Tabs tabs={employeeDetailTabs(canViewIncentives)} active={tab} onChange={setTab} />{tab === 'Assigned tasks' ? <EmptyState icon={ClipboardCheck} title="Assigned task view" description="Task assignments are available through the task repository preview." /> : <EmptyState icon={Users} title={`${tab} preview`} description="This surface is ready for future API-backed employee data." />}</Card></>;
}
