import { describe, expect, it } from 'vitest';
import { kpiResults } from './kpi-result-data';
import { groupSourceReferences, sourceReferenceIssues, validateKpiResultTraceability } from './source-traceability';

describe('KPI source traceability', () => {
  it('accepts the supplied deterministic source reference shape', () => {
    expect(validateKpiResultTraceability(kpiResults[0])).toEqual([]);
  });

  it('reports missing source record, task, timestamp, and metadata without repairing them', () => {
    const result = kpiResults[0];
    const issues = sourceReferenceIssues(result, { ...result.sourceReferences[0], sourceRecordId: '', taskId: '', timestamp: '', quantity: undefined, warehouse: undefined });
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['MISSING_SOURCE_RECORD', 'MISSING_TASK', 'MISSING_TIMESTAMP', 'MISSING_METADATA']));
  });

  it('reports employee, operation, and unsupported source mismatches', () => {
    const result = kpiResults[0];
    const issues = sourceReferenceIssues(result, { ...result.sourceReferences[0], sourceType: 'UNSUPPORTED' as never, employeeId: 'emp-other', operationType: 'LOADING' });
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['UNSUPPORTED_SOURCE_TYPE', 'EMPLOYEE_MISMATCH', 'OPERATION_MISMATCH']));
  });

  it('reports unresolved operational tasks without fabricating a task', () => {
    const result = kpiResults[0];
    const issues = validateKpiResultTraceability(result, new Map([['task-479', undefined]]));
    expect(issues.some((issue) => issue.code === 'TASK_UNAVAILABLE')).toBe(true);
  });

  it('groups references by source type and operation with explicit counts', () => {
    const groups = groupSourceReferences([...kpiResults[0].sourceReferences, ...kpiResults[1].sourceReferences]);
    expect(groups.map((group) => `${group.sourceType}:${group.operation}`)).toEqual(['WAREHOUSE_OPERATION:WAREHOUSE', 'LOADING_OPERATION:LOADING']);
    expect(groups.every((group) => group.count === 1)).toBe(true);
  });

  it('keeps source measurements structural and BOX-only', () => {
    expect(kpiResults[0].sourceReferences[0].quantity?.unit).toBe('BOX');
    expect(kpiResults[0].sourceReferences[0].durationSeconds).toBeUndefined();
  });
});
