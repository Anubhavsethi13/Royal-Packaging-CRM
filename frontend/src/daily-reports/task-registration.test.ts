import { describe, expect, it, vi } from 'vitest';
import { createApiTaskRegistrationGateway, createMockTaskRegistrationGateway, mapDepotTaskDto, parseBoxQuantity } from './task-registration-gateway';

const TASK = { id: 't-1', task_type: 'LOADING', status: 'IN_PROGRESS', planned_box_quantity: '120', completed_box_quantity: null, started_at: '2026-09-30T04:30:00Z', completed_at: null };

describe('task registration', () => {
  it('validates BOX quantities as whole numbers of 0 or more', () => {
    expect(parseBoxQuantity('120', true)).toEqual({ value: 120 });
    expect(parseBoxQuantity('', false)).toEqual({ value: null });
    expect(parseBoxQuantity('', true).error).toBeDefined();
    expect(parseBoxQuantity('-1', true).error).toBeDefined();
    expect(parseBoxQuantity('2.5', true).error).toBeDefined();
  });

  it('maps bigint-as-string BOX quantities from the API', () => {
    expect(mapDepotTaskDto(TASK)).toMatchObject({ id: 't-1', taskType: 'LOADING', plannedBoxes: 120, completedBoxes: null });
  });

  it('registers through the existing task lifecycle: create → assign labour → start', async () => {
    const request = vi.fn(async (_path: string, _init?: RequestInit) => ({ data: TASK }));
    const gateway = createApiTaskRegistrationGateway(request as never);
    await gateway.register({ depotId: 'd-4', taskType: 'LOADING', plannedBoxes: 120, employeeIds: ['e-1', 'e-2'], startNow: true });
    const calls = request.mock.calls.map(([path, init]) => [path, JSON.parse(String(init?.body))]);
    expect(calls).toEqual([
      ['/tasks', { depot_id: 'd-4', task_type: 'LOADING', planned_box_quantity: 120 }],
      ['/tasks/t-1/assignments', { employeeIds: ['e-1', 'e-2'] }],
      ['/tasks/t-1/start', {}],
    ]);
    await gateway.complete('t-1', 118);
    expect(request).toHaveBeenLastCalledWith('/tasks/t-1/complete', { method: 'POST', body: JSON.stringify({ completed_box_quantity: 118 }) });
  });

  it('lists only open loading and unloading tasks of the depot', async () => {
    const request = vi.fn(async () => ({ data: [TASK, { ...TASK, id: 't-2', status: 'COMPLETED' }, { ...TASK, id: 't-3', task_type: 'PICKING' }] }));
    const tasks = await createApiTaskRegistrationGateway(request as never).listOpenTasks('d-4');
    expect(tasks.map((task) => task.id)).toEqual(['t-1']);
    expect(request).toHaveBeenCalledWith('/tasks?depot_id=d-4&page=1&pageSize=100');
  });

  it('preview gateway enforces the same transitions', async () => {
    const gateway = createMockTaskRegistrationGateway();
    const task = await gateway.register({ depotId: 'd', taskType: 'UNLOADING', plannedBoxes: null, employeeIds: [], startNow: false });
    await expect(gateway.complete(task.id, 10)).rejects.toMatchObject({ status: 409 });
    await gateway.start(task.id);
    const done = await gateway.complete(task.id, 10);
    expect(done).toMatchObject({ status: 'COMPLETED', completedBoxes: 10 });
    expect(await gateway.listOpenTasks('d')).toEqual([]);
  });
});
