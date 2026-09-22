import { describe, expect, it } from 'vitest';
import { kpiResults } from './kpi-result-data';
import { resultRelationshipIsConsistent, validateKpiResult } from './kpi-result-domain';
import { filterKpiResults, createMockKpiResultRepository } from './kpi-result-repository';
import { kpiRuleVersions, kpiRules } from './kpi-data';
import { tasks } from '../mock/data';

describe('KPI result domain and read model', () => {
  it('validates deterministic mock results without calculating them', () => {
    expect(kpiResults.every((result) => validateKpiResult(result).length === 0)).toBe(true);
    expect(kpiResults.every((result) => result.isMock)).toBe(true);
    expect(kpiResults.map((result) => result.metric)).toEqual(expect.arrayContaining(['BOXES_HANDLED', 'TIME_TAKEN', 'SLA_COMPLIANCE']));
  });

  it('preserves KPI configuration and rule-version relationships', () => {
    for (const result of kpiResults) {
      const rule = kpiRules.find((candidate) => candidate.kpiId === result.kpiId)!;
      const version = kpiRuleVersions.find((candidate) => candidate.id === result.ruleVersionId)!;
      expect(resultRelationshipIsConsistent(result, rule, version)).toBe(true);
      expect(result.employeeId).toBeTruthy();
      expect(result.sourceReferences.every((reference) => reference.taskId && reference.sourceRecordId)).toBe(true);
    }
  });

  it('represents period, target, actual, and metric-specific units as read-only values', () => {
    const boxes = kpiResults.find((result) => result.metric === 'BOXES_HANDLED')!;
    const time = kpiResults.find((result) => result.metric === 'TIME_TAKEN')!;
    const sla = kpiResults.find((result) => result.metric === 'SLA_COMPLIANCE')!;
    expect(boxes.period).toMatchObject({ kind: 'WEEKLY', start: expect.any(String), end: expect.any(String) });
    expect(boxes.target.unit).toBe('BOX'); expect(boxes.actual.unit).toBe('BOX');
    expect(time.target.unit).toBe('DURATION'); expect(time.actual.unit).toBe('DURATION');
    expect(sla.target.unit).toBe('PERCENTAGE'); expect(sla.actual.unit).toBe('PERCENTAGE');
    expect(boxes.sourceReferences[0]?.quantity?.unit).toBe('BOX');
  });

  it('rejects incompatible result units without converting or calculating values', () => {
    const invalid = { ...kpiResults[0], actual: { value: 462, unit: 'DURATION' as const }, unit: 'DURATION' as const };
    expect(validateKpiResult(invalid).join(' ')).toContain('BOXES_HANDLED results must use BOX units.');
  });

  it('filters mock results by the supported read-model dimensions', () => {
    expect(filterKpiResults(kpiResults, { employeeId: 'emp-002' })).toHaveLength(3);
    expect(filterKpiResults(kpiResults, { metric: 'TIME_TAKEN', operation: 'LOADING', period: 'CUSTOM' })).toHaveLength(2);
    expect(filterKpiResults(kpiResults, { status: 'AVAILABLE', scope: 'TEAM' })).toHaveLength(5);
    expect(filterKpiResults(kpiResults, { periodStart: '2026-09-12T00:00:00.000Z' })).toHaveLength(1);
    expect(filterKpiResults(kpiResults, { kpiId: 'missing' })).toEqual([]);
  });

  it('exposes standalone fixtures rather than deriving actuals from F7 records', async () => {
    const repository = createMockKpiResultRepository(kpiResults);
    const before = (await repository.getById('kpi-result-demo-boxes-emp-002'))!;
    const operationalData = structuredClone(tasks);
    operationalData[0].boxesCompleted = 9999;
    operationalData.push({ ...operationalData[0], id: 'new-task', boxesCompleted: 1 });
    const after = (await repository.getById('kpi-result-demo-boxes-emp-002'))!;
    expect(after.actual).toEqual(before.actual);
    expect(after.actual.value).toBe(462);
  });

  it('keeps source traceability and does not expose a calculated score field', () => {
    for (const result of kpiResults) {
      expect(result.sourceReferences[0]).toHaveProperty('sourceType');
      expect(result.sourceReferences[0]).toHaveProperty('operationType');
      expect(result).not.toHaveProperty('score');
      expect(result).not.toHaveProperty('achievementPercentage');
    }
  });
});
