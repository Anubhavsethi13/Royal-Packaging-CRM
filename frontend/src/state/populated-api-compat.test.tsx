import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusBadge } from '../components/ui';
import { createApiRepositoryCollection, createDefaultApiRepositoryConfiguration } from './repositories';

/**
 * Populated-data compatibility: the default API repositories are fed response envelopes captured
 * from a populated local backend (ids shortened). Before the mappers existed, Employees, Inventory
 * and Tasks passed these DTOs straight to pages, which crashed on `status.toLowerCase()`.
 */
const page = (data: unknown[]) => ({ success: true, data, meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1, hasNext: false, hasPrevious: false } });

const employees = [
  { id: 'e-1', employee_code: 'RP-EA1', employeeCode: 'RP-EA1', name: 'Asha Loader', department: 'Warehouse Operations', depot_id: 'd-a', depotId: 'd-a', user_id: 'u-1', is_active: true, isActive: true, currentShift: { shift_id: 's-1', shift_name: 'Morning', effective_from: '2026-09-22', effective_to: null }, created_at: '2026-10-02T11:02:45.000Z', updated_at: '2026-10-02T11:02:45.000Z', version: '1' },
  { id: 'e-2', employee_code: 'RP-WA3', employeeCode: 'RP-WA3', name: null, department: null, depot_id: 'd-a', depotId: 'd-a', user_id: null, is_active: true, isActive: true, currentShift: null, created_at: '2026-10-02T11:02:45.000Z', updated_at: '2026-10-02T11:02:45.000Z', version: '1' },
  { id: 'e-3', employee_code: 'RP-WB2', employeeCode: 'RP-WB2', name: 'Deepak Helper', department: 'Warehouse Operations', depot_id: 'd-b', depotId: 'd-b', user_id: null, is_active: false, isActive: false, currentShift: null, created_at: '2026-10-02T11:02:45.000Z', updated_at: '2026-10-02T11:02:45.000Z', version: '1' },
];

const inventory = [
  { id: 'i-3', product_code: 'PKG-UNK-003', productCode: 'PKG-UNK-003', name: null, total_box_quantity: '0', totalBoxQuantity: '0', created_at: '2026-10-02T11:02:45.112Z', updated_at: '2026-10-02T11:02:45.112Z', version: '1' },
  { id: 'i-1', product_code: 'PKG-CTN-001', productCode: 'PKG-CTN-001', name: 'Corrugated carton 5-ply', total_box_quantity: '590', totalBoxQuantity: '590', created_at: '2026-10-02T11:02:45.100Z', updated_at: '2026-10-02T11:02:45.100Z', version: '1' },
];

const operation = (overrides: Record<string, unknown>) => ({
  id: 't-a1', task_code: 'TSK-496ADEFF', task_type: 'LOADING', operation_type: 'LOADING', status: 'COMPLETED',
  warehouse: { id: 'd-a', code: 'DEP-A', name: 'Bhiwandi Depot A' },
  source_location: { id: 'l-1', code: 'A-RACK-1', name: 'Depot A rack 1' }, destination_location: { id: 'l-2', code: 'A-DOCK-1', name: 'Depot A dock 1' },
  inventory_item: { id: 'i-1', product_code: 'PKG-CTN-001', name: 'Corrugated carton 5-ply' }, order: { id: 'o-1', order_code: 'RP-20481', priority: 'high' },
  assignees: [{ employee_id: 'e-1', employee_code: 'RP-EA1', name: 'Asha Loader' }],
  planned_box_quantity: 120, completed_box_quantity: 120,
  started_at: '2026-10-02T11:02:46.065Z', paused_at: null, completed_at: '2026-10-02T11:02:46.143Z', created_at: '2026-10-02T11:02:45.968Z', updated_at: '2026-10-02T11:02:46.143Z',
  timing_events: [{ id: 'ev1', event_type: 'TASK_STARTED', event_at: '2026-10-02T11:02:46.065Z' }, { id: 'ev2', event_type: 'TASK_COMPLETED', event_at: '2026-10-02T11:02:46.143Z' }],
  sla: { target_seconds: null, status: 'NOT_DEFINED' },
  ...overrides,
});
const operations = [
  operation({}),
  operation({ id: 't-a3', task_code: 'TSK-AEFEBCE3', status: 'IN_PROGRESS', order: null, inventory_item: null, completed_box_quantity: null, completed_at: null, timing_events: [{ id: 'ev3', event_type: 'TASK_STARTED', event_at: '2026-10-02T11:02:46.300Z' }] }),
  operation({ id: 't-none', task_code: 'TSK-1C9A3EDF', task_type: 'OTHER', operation_type: 'OTHER', status: 'PENDING', warehouse: null, source_location: null, destination_location: null, inventory_item: null, order: null, assignees: [], planned_box_quantity: null, completed_box_quantity: null, started_at: null, completed_at: null, timing_events: [] }),
];

const fetchMock = vi.spyOn(globalThis, 'fetch');
afterEach(() => fetchMock.mockReset());

function serve(routes: Record<string, unknown>) {
  fetchMock.mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname.replace(/^\/api/, '');
    const body = routes[path];
    return body === undefined ? new Response(JSON.stringify({ success: false, code: 'NOT_FOUND' }), { status: 404 }) : new Response(JSON.stringify(body), { status: 200 });
  });
}

const repositories = () => createApiRepositoryCollection(createDefaultApiRepositoryConfiguration());
const renders = (status: string) => renderToStaticMarkup(<StatusBadge status={status} />);

describe('populated API records render through the default repositories', () => {
  it('Employees: every populated record maps to a renderable status', async () => {
    serve({ '/employees': page(employees), '/employees/e-3': { success: true, data: employees[2] } });
    const { items } = await repositories().employees.list({ page: 1, pageSize: 20 });
    expect(items.map((item) => [item.code, item.status, item.shift])).toEqual([['RP-EA1', 'Active', 'Morning'], ['RP-WA3', 'Active', 'No shift assigned'], ['RP-WB2', 'Inactive', 'No shift assigned']]);
    for (const item of items) expect(() => renders(item.status)).not.toThrow();
    expect((await repositories().employees.getById('e-3'))?.status).toBe('Inactive');
  });

  it('Inventory: list and detail render without inventing status or location', async () => {
    serve({ '/inventory': page(inventory), '/inventory/i-1': { success: true, data: { ...inventory[1], balances: [{ batch_id: 'b-1', batch_number: 'PKG-CTN-001-B1', location_id: 'l-1', box_quantity: '460' }] } } });
    const { items } = await repositories().inventory.list({ page: 1, pageSize: 20 });
    expect(items.map((item) => [item.sku, item.materialName, item.quantity, item.status])).toEqual([['PKG-UNK-003', 'Not recorded', '0', 'Not recorded'], ['PKG-CTN-001', 'Corrugated carton 5-ply', '590', 'Not recorded']]);
    for (const item of items) expect(renders(item.status)).toContain('Not recorded');
    expect(await repositories().inventory.getById('i-1')).toMatchObject({ sku: 'PKG-CTN-001', quantity: '590', unit: 'BOX', location: '—' });
  });

  it('Tasks: list and detail come from the task read model and render status and priority', async () => {
    serve({ '/warehouse/operations': page(operations), '/warehouse/operations/t-a1': { success: true, data: { ...operations[0], activity: [] } } });
    const { items } = await repositories().tasks.list({ page: 1, pageSize: 5, filters: { status: 'COMPLETED', priority: 'High' } });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/warehouse/operations?page=1&pageSize=5&status=COMPLETED');
    expect(items.map((item) => [item.taskCode, item.status, item.priority, item.employee])).toEqual([['TSK-496ADEFF', 'Completed', 'High', 'Asha Loader'], ['TSK-AEFEBCE3', 'In progress', 'Normal', 'Asha Loader'], ['TSK-1C9A3EDF', 'Queued', 'Normal', 'Unassigned']]);
    for (const item of items) {
      expect(() => renders(item.status)).not.toThrow();
      expect(`priority-${item.priority.toLowerCase()}`).toMatch(/^priority-(low|normal|high|urgent)$/);
    }
    expect(await repositories().tasks.getById('t-a1')).toMatchObject({ taskCode: 'TSK-496ADEFF', source: 'Bhiwandi Depot A · DEP-A · A-RACK-1' });
  });

  it('Tasks: a status with no backend equivalent returns an empty page without a request', async () => {
    serve({});
    await expect(repositories().tasks.list({ page: 1, pageSize: 5, filters: { status: 'VERIFIED' } })).resolves.toMatchObject({ items: [], total: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// `GET /payroll` and `GET /incentives/ledger` return `{ success, data: [] }` with no `meta` (each row
// carries a camelCase mirror). Before this, Payroll failed on `meta.page` and Incentives called the
// non-existent `/incentives` (404).
const payrollEntry = (id: string, status: string, amount: string) => ({ id, incentive_ledger_id: `l-${id}`, incentiveLedgerId: `l-${id}`, employee_id: 'e-1', employeeId: 'e-1', amount, status, created_at: '2026-10-02T11:02:45.000Z', createdAt: '2026-10-02T11:02:45.000Z', updated_at: '2026-10-03T09:00:00.000Z', updatedAt: '2026-10-03T09:00:00.000Z', version: '1', approvals: [] });
const ledgerEntry = (id: string, status: string, amount: string) => ({ id, task_id: 't-a1', taskId: 't-a1', employee_id: 'e-1', employeeId: 'e-1', incentive_rule_id: null, incentiveRuleId: null, amount, status, idempotency_key: 'k', idempotencyKey: 'k', created_at: '2026-10-02T11:02:45.000Z', createdAt: '2026-10-02T11:02:45.000Z', updated_at: '2026-10-02T11:02:45.000Z', updatedAt: '2026-10-02T11:02:45.000Z', version: '1' });

describe('Super Admin finance lists use the backend contract (unpaged envelope)', () => {
  it('Payroll: reads GET /payroll without meta, maps every status, and pages on the client', async () => {
    serve({ '/payroll': { success: true, data: [payrollEntry('p-1', 'PENDING', '450.00'), payrollEntry('p-2', 'APPROVED', '300.00'), payrollEntry('p-3', 'REJECTED', '120.50')] } });
    const first = await repositories().payroll.list({ page: 1, pageSize: 2, sortBy: 'period', sortDirection: 'asc' });
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe('/api/payroll');
    expect(first).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(first.items.map((item) => [item.id, item.status, item.incentiveAmount, item.period, item.baseAmount])).toEqual([['p-1', 'Pending approval', '450.00', 'Not recorded', 'Not recorded'], ['p-2', 'Approved', '300.00', 'Not recorded', 'Not recorded']]);
    const second = await repositories().payroll.list({ page: 2, pageSize: 2 });
    expect(second.items.map((item) => [item.id, item.status])).toEqual([['p-3', 'Rejected']]);
    for (const item of [...first.items, ...second.items]) expect(() => renders(item.status)).not.toThrow();
  });

  it('Payroll: an empty list loads (no "reading \'page\'" failure); an unknown status is a contract error', async () => {
    serve({ '/payroll': { success: true, data: [] } });
    await expect(repositories().payroll.list({ page: 1, pageSize: 50 })).resolves.toMatchObject({ items: [], total: 0, page: 1 });
    serve({ '/payroll': { success: true, data: [payrollEntry('p-9', 'PAID', '1.00')] } });
    await expect(repositories().payroll.list({ page: 1, pageSize: 50 })).rejects.toThrow();
  });

  it('Incentives: reads GET /incentives/ledger, never shows IDs or the idempotency key as names', async () => {
    serve({ '/incentives/ledger': { success: true, data: [ledgerEntry('l-1', 'PENDING', '225.00'), ledgerEntry('l-2', 'APPROVED', '90.00')] } });
    const { items, total } = await repositories().incentives.list({ page: 1, pageSize: 50, sortBy: 'createdAt', sortDirection: 'asc' });
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe('/api/incentives/ledger');
    expect(total).toBe(2);
    expect(items.map((item) => [item.id, item.employee, item.task, item.event, item.points, item.amount, item.status])).toEqual([['l-1', 'Not recorded', 'Not recorded', '—', '—', '225.00', 'Pending review'], ['l-2', 'Not recorded', 'Not recorded', '—', '—', '90.00', 'Approved']]);
    expect(JSON.stringify(items)).not.toMatch(/e-1|t-a1|"k"/);
    for (const item of items) expect(() => renders(item.status)).not.toThrow();
  });

  it('Incentives: a backend 403 surfaces as an error, never as data', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: false, code: 'FORBIDDEN', message: 'Forbidden' }), { status: 403 }));
    await expect(repositories().incentives.list({ page: 1, pageSize: 50 })).rejects.toThrow();
  });
});

// `GET /audit-logs` (camelCase AuditLogEntryDTO) and `GET /reports` also return `{ success, data: [] }`
// without `meta`. Before this, Audit called the non-existent `/audits` (404) and Reports failed on `meta.page`.
const auditEntry = (id: string, source: string, eventType: string, extra: Record<string, unknown> = {}) => ({ id, source, eventType, eventAt: '2026-10-04T12:15:48.787Z', actorUserId: 'u-secret-1', actorEmployeeId: 'e-secret-1', taskId: null, correlationId: null, metadata: null, before: null, reason: null, requestId: null, ...extra });

describe('Governance lists use the backend contract (unpaged envelope)', () => {
  it('Audit: reads GET /audit-logs, maps source and event, and never shows actor IDs', async () => {
    serve({ '/audit-logs': { success: true, data: [auditEntry('a-1', 'task', 'TASK_STARTED', { taskId: 't-a1' }), auditEntry('a-2', 'daily_report', 'DAILY_REPORT_CREATED', { metadata: { report_id: 'r-1' } }), auditEntry('a-3', 'incentive', 'INCENTIVE_APPROVED')] } });
    const { items, total } = await repositories().audits.list({ page: 1, pageSize: 50, sortBy: 'timestamp', sortDirection: 'asc' });
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe('/api/audit-logs');
    expect(total).toBe(3);
    expect(items.map((item) => [item.id, item.actor, item.action, item.entity, item.entityId, item.result, item.before, item.after])).toEqual([
      ['a-1', 'Not recorded', 'TASK_STARTED', 'Task', 't-a1', 'Not recorded', '—', '—'],
      ['a-2', 'Not recorded', 'DAILY_REPORT_CREATED', 'Daily report', 'r-1', 'Not recorded', '—', '—'],
      ['a-3', 'Not recorded', 'INCENTIVE_APPROVED', 'Incentive', '—', 'Not recorded', '—', '—'],
    ]);
    expect(JSON.stringify(items)).not.toMatch(/secret/);
    for (const item of items) expect(() => renders(item.result)).not.toThrow();
  });

  it('Audit: the page filters and search apply to the whole unpaged list', async () => {
    serve({ '/audit-logs': { success: true, data: [auditEntry('a-1', 'task', 'TASK_STARTED', { taskId: 't-a1' }), auditEntry('a-2', 'daily_report', 'DAILY_REPORT_CREATED'), auditEntry('a-3', 'task', 'TASK_COMPLETED', { taskId: 't-a1' })] } });
    const tasks = await repositories().audits.list({ page: 1, pageSize: 1, filters: { entity: 'Task' } });
    expect(tasks).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(tasks.items.map((item) => item.id)).toEqual(['a-1']);
    expect((await repositories().audits.list({ page: 2, pageSize: 1, filters: { entity: 'Task' } })).items.map((item) => item.id)).toEqual(['a-3']);
    expect((await repositories().audits.list({ page: 1, pageSize: 50, search: 'completed' })).items.map((item) => item.id)).toEqual(['a-3']);
    expect((await repositories().audits.list({ page: 1, pageSize: 50, filters: { result: 'Blocked' } })).total).toBe(0);
  });

  it('Reports: reads GET /reports without meta and shows only the recorded name', async () => {
    serve({ '/reports': { success: true, data: [{ id: 'rep-1', code: 'DAILY_OPS', name: 'Daily operations', description: null, created_at: '2026-10-01T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', version: '1' }] } });
    const { items, total } = await repositories().reports.list({ page: 1, pageSize: 50, sortBy: 'name', sortDirection: 'asc' });
    expect(total).toBe(1);
    expect(items).toEqual([{ id: 'rep-1', name: 'Daily operations', category: 'Not recorded', cadence: 'Not recorded', lastRun: 'Not recorded', owner: 'Not recorded', status: 'Not recorded' }]);
    serve({ '/reports': { success: true, data: [] } });
    await expect(repositories().reports.list({ page: 1, pageSize: 50 })).resolves.toMatchObject({ items: [], total: 0 });
  });

  it('Audit and Reports: a backend 403 surfaces as an error, never as data', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: false, code: 'FORBIDDEN', message: 'Forbidden' }), { status: 403 }));
    await expect(repositories().audits.list({ page: 1, pageSize: 50 })).rejects.toThrow();
    await expect(repositories().reports.list({ page: 1, pageSize: 50 })).rejects.toThrow();
  });
});
