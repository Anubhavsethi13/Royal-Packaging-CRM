import { describe, expect, it } from 'vitest';
import { filterSourceRecords, KPI_OPERATIONAL_SOURCE_MAP, sourceDefinitionForMetric, sourceRecordsForMetric } from './source-preview';
import { tasks } from '../mock/data';

describe('KPI operational source preview', () => {
  it('centralizes the supported metric to operational source mapping', () => {
    expect(KPI_OPERATIONAL_SOURCE_MAP.BOXES_HANDLED.sourceTypes).toEqual(['WAREHOUSE_OPERATION', 'LOADING_OPERATION', 'UNLOADING_OPERATION']);
    expect(sourceDefinitionForMetric('TIME_TAKEN')?.operations).toEqual(['LOADING', 'UNLOADING']);
    expect(sourceDefinitionForMetric('SLA_COMPLIANCE')?.sourceTypes).toEqual(['LOADING_OPERATION', 'UNLOADING_OPERATION']);
  });

  it('projects BOX source records with task and employee traceability', () => {
    const records = sourceRecordsForMetric(tasks, 'BOXES_HANDLED');
    const loading = records.find((record) => record.operation === 'LOADING');
    const warehouse = records.find((record) => record.operation === 'WAREHOUSE');
    expect(records.length).toBeGreaterThan(0);
    expect(loading).toMatchObject({ metric: 'BOXES_HANDLED', unit: 'BOX', taskId: expect.any(String), sourceRecordId: expect.any(String), sourceType: 'LOADING_OPERATION', mock: true });
    expect(loading?.employeeId).toBeDefined();
    expect(warehouse?.sourceType).toBe('WAREHOUSE_OPERATION');
    expect(sourceRecordsForMetric(tasks, 'BOXES_HANDLED', 'WAREHOUSE').every((record) => record.operation === 'WAREHOUSE')).toBe(true);
  });

  it('projects timing and SLA fields without producing a score', () => {
    const timing = sourceRecordsForMetric(tasks, 'TIME_TAKEN');
    const sla = sourceRecordsForMetric(tasks, 'SLA_COMPLIANCE');
    expect(timing.every((record) => record.operation === 'LOADING' || record.operation === 'UNLOADING')).toBe(true);
    expect(timing[0]).toMatchObject({ unit: 'DURATION', durationSeconds: expect.any(Number), taskId: expect.any(String) });
    expect(sla[0]).toMatchObject({ unit: 'PERCENTAGE', slaStatus: expect.any(String), taskId: expect.any(String) });
    expect(sla[0]).not.toHaveProperty('score');
  });

  it('filters source records deterministically by employee, operation, status, and date', () => {
    const records = sourceRecordsForMetric(tasks, 'BOXES_HANDLED');
    const candidate = records.find((record) => record.timestamp);
    expect(candidate).toBeDefined();
    expect(filterSourceRecords(records, { employeeId: candidate?.employeeId })).toContainEqual(candidate);
    expect(filterSourceRecords(records, { operation: candidate?.operation, taskStatus: candidate?.taskStatus, date: candidate?.timestamp?.slice(0, 10) })).toContainEqual(candidate);
    expect(filterSourceRecords(records, { employeeId: 'missing-employee' })).toEqual([]);
  });

  it('does not invent a source preview for unsupported metrics', () => {
    expect(sourceDefinitionForMetric('TASKS_COMPLETED')).toBeUndefined();
    expect(sourceRecordsForMetric(tasks, 'TASKS_COMPLETED')).toEqual([]);
  });
});
