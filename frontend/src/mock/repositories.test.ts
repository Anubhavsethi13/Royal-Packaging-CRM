import { describe, expect, it } from 'vitest';
import { repositories } from './repositories';

describe('mock repositories', () => {
  it('returns paginated, stale-labelled preview responses', async () => {
    const result = await repositories.orders.list({ page: 2, pageSize: 2 });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(2);
    expect(result.total).toBeGreaterThan(2);
    expect(result.items).toHaveLength(2);
    expect(result.stale).toBe(true);
  });

  it('returns cloned records so UI code cannot mutate the source fixture', async () => {
    const first = await repositories.clients.getById('cl-kaveri');
    expect(first).toBeDefined();
    if (first) first.name = 'Changed locally';
    const second = await repositories.clients.getById('cl-kaveri');
    expect(second?.name).toBe('Kaveri Foods');
  });

  it('supports local task updates without changing the imported fixture', async () => {
    const updated = await repositories.tasks.update('task-481', { status: 'Completed', employee: 'Ravi Kumar' });
    expect(updated?.status).toBe('Completed');
    expect((await repositories.tasks.getById('task-481'))?.employee).toBe('Ravi Kumar');
  });

  it('supports local client creation and update with cloned list results', async () => {
    const created = await repositories.clients.create({ id: 'cl-test-preview', accountCode: 'CL-9999', name: 'Preview Client', contactName: 'Test Contact', phone: '+91 80 1234 5678', status: 'Prospect', orderCount: 0, openOrders: 0, lastActivity: 'Just now', segment: 'Test' });
    expect((await repositories.clients.list({ search: 'Preview Client' })).items[0]?.id).toBe(created.id);
    const updated = await repositories.clients.update(created.id, { name: 'Updated Preview Client' });
    expect(updated?.name).toBe('Updated Preview Client');
    expect((await repositories.clients.getById(created.id))?.name).toBe('Updated Preview Client');
  });

  it('surfaces duplicate local creates as predictable repository failures', async () => {
    const record = { id: 'cl-duplicate-preview', accountCode: 'CL-9998', name: 'Duplicate Preview', contactName: 'Test Contact', phone: '+91 80 1234 5678', status: 'Prospect' as const, orderCount: 0, openOrders: 0, lastActivity: 'Just now', segment: 'Test' };
    await repositories.clients.create(record);
    await expect(repositories.clients.create(record)).rejects.toThrow('already exists');
  });
});
