import { useState } from 'react';
import { Boxes, CalendarClock, PackageCheck, Truck } from 'lucide-react';
import { Alert, Badge, Button, Card, DataTable, DemoNotice, EmptyState, FilterBar, FormField, Input, LoadingState, MetricCard, PageHeader, Pagination, Select } from '../components/ui';
import { useRepositories } from '../state/repositories';
import { useExpireOnUnauthorized, useLoad } from './use-load';
import { useManagementKpiGateway, useShiftGateway } from './use-shift-gateway';
import {
  EMPTY_MANAGEMENT_FILTERS,
  employeeLabel,
  formatHours,
  formatWarehouseInvolvement,
  hasActiveFilters,
  validateManagementFilters,
  type EmployeeKpiRow,
  type EmployeeOption,
  type ManagementFilterErrors,
  type ManagementKpiFilters,
  type ManagementKpiSummary,
} from './management-kpi-data';
import { describeShiftError, formatBoxes, formatCount, formatDecimal, formatRate, type ShiftKpiMetrics, type ShiftOptions } from './shift-data';
import { ShiftErrorPanel } from './shift-pages';

const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Presentational pieces (props only)
// ---------------------------------------------------------------------------

interface FiltersProps {
  filters: ManagementKpiFilters;
  errors: ManagementFilterErrors;
  employees: EmployeeOption[];
  options: ShiftOptions;
  resultLabel?: string;
  onChange: (changes: Partial<ManagementKpiFilters>) => void;
  onClear: () => void;
}

export function ManagementKpiFiltersBar({ filters, errors, employees, options, resultLabel, onChange, onClear }: FiltersProps) {
  return <Card>
    <FilterBar resultLabel={resultLabel}>
      <FormField label="From" error={errors.from}><Input type="date" aria-label="From date" value={filters.from} onChange={(event) => onChange({ from: event.target.value })} aria-invalid={Boolean(errors.from)} /></FormField>
      <FormField label="To" error={errors.to}><Input type="date" aria-label="To date" value={filters.to} onChange={(event) => onChange({ to: event.target.value })} aria-invalid={Boolean(errors.to)} /></FormField>
      <FormField label="Employee"><Select aria-label="Filter by employee" value={filters.employeeId} onChange={(event) => onChange({ employeeId: event.target.value })}><option value="">All employees</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} ({employee.code})</option>)}</Select></FormField>
      <FormField label="Warehouse"><Select aria-label="Filter by warehouse" value={filters.warehouseCode} onChange={(event) => onChange({ warehouseCode: event.target.value })}><option value="">All warehouses</option>{options.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.code}>{warehouse.name} ({warehouse.code})</option>)}</Select></FormField>
      <FormField label="Truck type"><Select aria-label="Filter by truck type" value={filters.truckType} onChange={(event) => onChange({ truckType: event.target.value })}><option value="">All truck types</option>{options.truckTypes.map((truckType) => <option key={truckType.id} value={truckType.code}>{truckType.name}</option>)}</Select></FormField>
      <Button variant="ghost" onClick={onClear} disabled={!hasActiveFilters(filters)}>Clear filters</Button>
    </FilterBar>
  </Card>;
}

export function ManagementKpiTotals({ metrics }: { metrics: ShiftKpiMetrics }) {
  return <div className="metric-grid">
    <MetricCard label="Shifts" value={formatCount(metrics.shiftCount)} detail={`Avg labour ${metrics.averageLabour === null ? '—' : formatDecimal(metrics.averageLabour)}`} icon={<CalendarClock size={16} />} />
    <MetricCard label="Total boxes" value={formatBoxes(metrics.totalBoxes)} detail={`Avg ${metrics.averageBoxesPerShift === null ? '—' : formatDecimal(metrics.averageBoxesPerShift)} per shift`} accent="indigo" icon={<Boxes size={16} />} />
    <MetricCard label="Loading" value={formatBoxes(metrics.totalLoading)} detail={formatRate(metrics.loadingProductivity)} icon={<Truck size={16} />} />
    <MetricCard label="Unloading" value={formatBoxes(metrics.totalUnloading)} detail={formatRate(metrics.unloadingProductivity)} accent="slate" icon={<PackageCheck size={16} />} />
  </div>;
}

export function EmployeeKpiTable({ summary, onPageChange }: { summary: Pick<ManagementKpiSummary, 'employees' | 'page' | 'totalPages' | 'totalEmployees'>; onPageChange?: (page: number) => void }) {
  return <Card>
    <div className="section-heading"><div><span className="section-kicker">By employee</span><h2>Shift KPIs</h2></div><Badge tone="neutral">{summary.totalEmployees} employee{summary.totalEmployees === 1 ? '' : 's'}</Badge></div>
    <DataTable
      caption="Aggregated shift KPIs per employee"
      headers={['Employee', 'Shifts', 'Loading', 'Unloading', 'Total boxes', 'Avg boxes / shift', 'Labour', 'Shift hours', 'Warehouses']}
      rows={summary.employees.map((row: EmployeeKpiRow) => [
        <span key="e"><strong>{employeeLabel(row)}</strong><br /><small className="mono">{row.employeeCode}</small></span>,
        formatCount(row.metrics.shiftCount),
        <span key="l" className="mono">{formatCount(row.metrics.totalLoading)}</span>,
        <span key="u" className="mono">{formatCount(row.metrics.totalUnloading)}</span>,
        <span key="t" className="mono">{formatCount(row.metrics.totalBoxes)}</span>,
        row.metrics.averageBoxesPerShift === null ? '—' : formatDecimal(row.metrics.averageBoxesPerShift),
        `${formatCount(row.metrics.totalLabour)}${row.metrics.averageLabour === null ? '' : ` (avg ${formatDecimal(row.metrics.averageLabour)})`}`,
        formatHours(row.metrics.totalDurationSeconds),
        formatWarehouseInvolvement(row.metrics),
      ])}
      empty={<EmptyState icon={Boxes} title="No shift entries match" description="No employee has recorded shifts for these filters. Widen the date range or clear the filters." />}
    />
    {summary.totalPages > 1 && <Pagination page={summary.page} totalPages={summary.totalPages} onChange={onPageChange} />}
  </Card>;
}

export function ManagementKpiNotes({ filters, options }: { filters: ManagementKpiFilters; options: ShiftOptions }) {
  const truck = options.truckTypes.find((option) => option.code === filters.truckType);
  const warehouse = options.warehouses.find((option) => option.code === filters.warehouseCode);
  const active = [warehouse && `warehouse ${warehouse.name}`, truck && `truck type ${truck.name}`].filter(Boolean).join(', ');
  return <Alert tone="info" title="How to read these figures">
    Totals and averages come straight from submitted shift entries; nothing is ranked or scored. Warehouse and truck-type filters keep whole entries, so an entry&apos;s totals are not split between warehouses or truck types, and truck types are not broken out per employee.{active ? ` Active: ${active}.` : ''}
  </Alert>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ManagementKpiSummaryPage() {
  const { mode } = useRepositories();
  const gateway = useManagementKpiGateway();
  const shiftGateway = useShiftGateway();
  const [filters, setFilters] = useState<ManagementKpiFilters>(EMPTY_MANAGEMENT_FILTERS);
  const [applied, setApplied] = useState<ManagementKpiFilters>(EMPTY_MANAGEMENT_FILTERS);
  const [errors, setErrors] = useState<ManagementFilterErrors>({});
  const [page, setPage] = useState(1);

  const referenceData = useLoad(async () => {
    const [employees, options] = await Promise.all([gateway.listEmployees(), shiftGateway.getOptions()]);
    return { employees, options };
  }, [gateway, shiftGateway]);

  const summaryState = useLoad(() => gateway.getSummary({ ...applied, page, pageSize: PAGE_SIZE }), [gateway, applied, page]);

  useExpireOnUnauthorized(referenceData.status === 'error' ? referenceData.error : summaryState.status === 'error' ? summaryState.error : undefined);

  const change = (changes: Partial<ManagementKpiFilters>) => {
    const next = { ...filters, ...changes };
    const nextErrors = validateManagementFilters(next);
    setFilters(next);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) { setApplied(next); setPage(1); }
  };
  const clear = () => { setFilters(EMPTY_MANAGEMENT_FILTERS); setApplied(EMPTY_MANAGEMENT_FILTERS); setErrors({}); setPage(1); };

  const header = <PageHeader eyebrow="Performance" title="Shift KPI summary" description="Aggregated daily shift figures per employee, from submitted shift entries." />;

  if (referenceData.status === 'error') return <>{header}<ShiftErrorPanel view={describeShiftError(referenceData.error)} /></>;
  if (summaryState.status === 'error') return <>{header}<ShiftErrorPanel view={describeShiftError(summaryState.error)} /></>;
  if (referenceData.status === 'loading') return <>{header}<LoadingState label="Loading filters" /></>;

  const { employees, options } = referenceData.data;
  const summary = summaryState.status === 'ready' ? summaryState.data : null;

  return <>
    {header}
    {mode === 'mock' && <DemoNotice>Sample shift data is shown in preview mode. Nothing is read from the server.</DemoNotice>}
    <ManagementKpiFiltersBar filters={filters} errors={errors} employees={employees} options={options} resultLabel={summary ? `${summary.totalEmployees} employee${summary.totalEmployees === 1 ? '' : 's'}` : undefined} onChange={change} onClear={clear} />
    {!summary ? <LoadingState label="Loading shift KPIs" /> : <>
      <ManagementKpiTotals metrics={summary.metrics} />
      <EmployeeKpiTable summary={summary} onPageChange={setPage} />
      <ManagementKpiNotes filters={applied} options={options} />
    </>}
  </>;
}
