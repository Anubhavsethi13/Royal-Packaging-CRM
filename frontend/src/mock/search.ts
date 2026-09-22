import { preview } from './preview';

export interface SearchResult {
  id: string;
  kind: 'Client' | 'Order' | 'Inventory' | 'Employee' | 'Task';
  label: string;
  meta: string;
  path: string;
}

export function searchPreview(query: string): SearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return [
    ...preview.clients.filter((item) => `${item.name} ${item.accountCode} ${item.contactName}`.toLowerCase().includes(needle)).map((item) => ({ id: item.id, kind: 'Client' as const, label: item.name, meta: `${item.accountCode} · ${item.segment}`, path: `/clients/${item.id}` })),
    ...preview.orders.filter((item) => `${item.orderCode} ${item.clientName} ${item.materialName}`.toLowerCase().includes(needle)).map((item) => ({ id: item.id, kind: 'Order' as const, label: item.orderCode, meta: `${item.clientName} · ${item.status}`, path: `/orders/${item.id}` })),
    ...preview.inventory.filter((item) => `${item.sku} ${item.barcode} ${item.materialName}`.toLowerCase().includes(needle)).map((item) => ({ id: item.id, kind: 'Inventory' as const, label: item.sku, meta: `${item.materialName} · ${item.location}`, path: `/inventory/${item.id}` })),
    ...preview.employees.filter((item) => `${item.name} ${item.code} ${item.role}`.toLowerCase().includes(needle)).map((item) => ({ id: item.id, kind: 'Employee' as const, label: item.name, meta: `${item.code} · ${item.role}`, path: `/employees/${item.id}` })),
    ...preview.tasks.filter((item) => `${item.taskCode} ${item.material} ${item.employee}`.toLowerCase().includes(needle)).map((item) => ({ id: item.id, kind: 'Task' as const, label: item.taskCode, meta: `${item.material} · ${item.status}`, path: `/tasks/${item.id}` })),
  ].slice(0, 12);
}
