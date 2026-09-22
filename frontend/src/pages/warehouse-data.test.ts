import { describe, expect, it } from 'vitest';
import { tasks } from '../mock/data';
import { filterWarehouseOperations, toWarehouseOperation, validateWarehouseBoxes, warehouseSummary } from './warehouse-data';

describe('warehouse operations projection', () => {
  it('uses BOX-only task data for operational quantities', () => {
    const operation = toWarehouseOperation(tasks[0]);
    expect(operation.operation).toBe('DISPATCH');
    expect(operation.boxesAssigned).toBe(124);
    expect(operation.boxesHandled).toBe(74);
    expect(operation.boxesRemaining).toBe(50);
    expect(validateWarehouseBoxes('74', operation.boxesAssigned)).toBeUndefined();
    expect(validateWarehouseBoxes('-1', operation.boxesAssigned)).toContain('whole BOX');
    expect(validateWarehouseBoxes('125', operation.boxesAssigned)).toContain('cannot exceed');
    expect(validateWarehouseBoxes('74.5', operation.boxesAssigned)).toContain('whole BOX');
  });

  it('filters operation, state, employee, and warehouse context', () => {
    expect(filterWarehouseOperations(tasks, { operation: 'PICKING' }).map((item) => item.taskCode)).toEqual(['TSK-477']);
    expect(filterWarehouseOperations(tasks, { status: 'PAUSED' }).map((item) => item.taskCode)).toEqual(['TSK-479', 'TSK-478']);
    expect(filterWarehouseOperations(tasks, { employee: 'Arjun Singh' }).map((item) => item.taskCode)).toEqual(['TSK-481', 'TSK-469']);
    expect(filterWarehouseOperations(tasks, { warehouse: 'D1 · A03' }).map((item) => item.taskCode)).toEqual(['TSK-481']);
    expect(filterWarehouseOperations(tasks, { search: 'no match' })).toEqual([]);
  });

  it('derives dashboard totals from the same task records', () => {
    const summary = warehouseSummary(filterWarehouseOperations(tasks));
    expect(summary).toMatchObject({ boxesHandled: 471, completed: 3, active: 2, pending: 3, paused: 2 });
  });
});
