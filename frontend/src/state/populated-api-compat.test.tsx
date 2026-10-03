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
