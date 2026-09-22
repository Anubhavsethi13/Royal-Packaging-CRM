import { describe, expect, it } from 'vitest';
import { tasks } from '../mock/data';
import { applyTaskPreviewAction } from '../mock/task-preview';
import { filterWarehouseOperations, warehouseSummary } from './warehouse-data';
import { classifyLoadingUnloadingTask, findLoadingUnloadingOperation, loadingUnloadingOperations, slaVarianceSeconds, toLoadingUnloadingOperation, validateLoadingUnloadingBoxes } from './loading-unloading-data';

describe('loading and unloading operational read model', () => {
  it('classifies only structured Loading and Unloading task types', () => {
    expect(classifyLoadingUnloadingTask(tasks.find((task) => task.id === 'task-481')!)).toBe('LOADING');
    expect(classifyLoadingUnloadingTask(tasks.find((task) => task.id === 'task-474')!)).toBe('UNLOADING');
    expect(classifyLoadingUnloadingTask(tasks.find((task) => task.id === 'task-477')!)).toBeUndefined();
  });

  it('derives BOX quantities, status, SLA, and F6 timing from the source task', () => {
    const completed = toLoadingUnloadingOperation(tasks.find((task) => task.id === 'task-476')!);
    expect(completed).toMatchObject({ operationType: 'LOADING', boxesAssigned: 100, boxesHandled: 100, boxesRemaining: 0, status: 'COMPLETED', slaTargetSeconds: 2400, slaStatus: 'MET' });
    expect(completed?.activeDurationSeconds).toBe(1920);
    expect(completed?.totalDurationSeconds).toBe(1920);
    expect(completed?.startedAt).toBe('2026-09-10T08:00:00.000Z');
    expect(completed?.completedAt).toBe('2026-09-10T08:32:00.000Z');
  });

  it('safely projects invalid source quantities without mutating the source task', () => {
    const source = { ...tasks[0], boxesPlanned: 20, boxesCompleted: 30 };
    const operation = toLoadingUnloadingOperation(source)!;
    expect(operation.boxesHandled).toBe(20);
    expect(operation.boxesRemaining).toBe(0);
    expect(source.boxesCompleted).toBe(30);
  });

  it('filters by operation, status, employee, warehouse, and SLA state', () => {
    expect(loadingUnloadingOperations(tasks, { operationType: 'UNLOADING' }).every((item) => item.operationType === 'UNLOADING')).toBe(true);
    expect(loadingUnloadingOperations(tasks, { status: 'PAUSED' }).map((item) => item.taskCode)).toEqual(['TSK-478']);
    expect(loadingUnloadingOperations(tasks, { employee: 'Fatima Khan' }).map((item) => item.taskCode)).toEqual(['TSK-475']);
    expect(loadingUnloadingOperations(tasks, { warehouse: 'Dock 07' }).map((item) => item.taskCode)).toEqual(['TSK-469']);
    expect(loadingUnloadingOperations(tasks, { slaStatus: 'BREACHED' }).map((item) => item.taskCode)).toEqual(['TSK-469']);
  });

  it('stays synchronized when the shared task record changes', () => {
    const updated = { ...tasks.find((task) => task.id === 'task-481')!, boxesCompleted: 100, v1Status: 'PAUSED' as const, employee: 'Meera Nair', evidence: [{ id: 'evidence-1', filename: 'dock-photo.png', type: 'PHOTO' as const, status: 'SUBMITTED' as const, timestamp: '2026-09-10T08:10:00.000Z' }], activity: [{ id: 'activity-1', eventType: 'BOXES_UPDATED' as const, timestamp: '2026-09-10T08:11:00.000Z', actor: 'Meera Nair', taskId: 'task-481', details: { current: 100, unit: 'BOX' } }] };
    const operation = findLoadingUnloadingOperation([updated], 'task-481')!;
    expect(operation).toMatchObject({ boxesHandled: 100, boxesRemaining: 24, status: 'PAUSED', employee: 'Meera Nair' });
    expect(operation.evidence).toHaveLength(1);
    expect(operation.activity).toHaveLength(1);
  });

  it('exposes stable employee identity for KPI source readiness', () => {
    const operation = toLoadingUnloadingOperation({ ...tasks.find((task) => task.id === 'task-481')!, employeeId: 'emp-003' });
    expect(operation?.employeeId).toBe('emp-003');
  });

  it('supports search and validates whole BOX handling values', () => {
    expect(loadingUnloadingOperations(tasks, { search: 'TSK-481' }).map((item) => item.taskCode)).toEqual(['TSK-481']);
    expect(validateLoadingUnloadingBoxes('12', 12)).toBeUndefined();
    expect(validateLoadingUnloadingBoxes('-1', 12)).toContain('whole BOX');
    expect(validateLoadingUnloadingBoxes('12.5', 12)).toContain('whole BOX');
    expect(validateLoadingUnloadingBoxes('13', 12)).toContain('exceed');
  });

  it('keeps SLA variance as a display-only comparison', () => {
    const operation = toLoadingUnloadingOperation(tasks.find((task) => task.id === 'task-476')!);
    expect(slaVarianceSeconds(operation!)).toBe(-480);
    expect(slaVarianceSeconds({ ...operation!, slaTargetSeconds: undefined })).toBeUndefined();
  });

  it('projects a shared task mutation into loading and warehouse read models', () => {
    const source = tasks.find((task) => task.id === 'task-481')!;
    const updated = applyTaskPreviewAction(source, { type: 'update', boxesCompleted: 100 }, []);
    const loading = findLoadingUnloadingOperation([updated], source.id)!;
    const warehouse = filterWarehouseOperations([updated])[0];
    expect(loading.boxesHandled).toBe(100);
    expect(warehouse.boxesHandled).toBe(100);
    expect(warehouseSummary([warehouse]).boxesHandled).toBe(100);
  });

  it('keeps lifecycle status synchronized across both read models', () => {
    const source = tasks.find((task) => task.id === 'task-481')!;
    const updated = applyTaskPreviewAction(source, { type: 'workflow', action: 'PAUSE', reason: 'Break' }, []);
    expect(findLoadingUnloadingOperation([updated], source.id)?.status).toBe('PAUSED');
    expect(filterWarehouseOperations([updated])[0].status).toBe('PAUSED');
  });
});
