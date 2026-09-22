import { describe, expect, it } from 'vitest';
import { activeKpiDefinitions, activeRuleVersions, isMetricUnitCompatible, kpiMetricCatalog, kpiMetricByCode, kpiRules, kpisByOperation, rulesEffectiveDuring, validateKpiConfiguration } from './kpi-data';

describe('KPI configuration read model', () => {
  it('contains the required metric catalog with unique IDs and safe units', () => {
    expect(new Set(kpiMetricCatalog.map((metric) => metric.id)).size).toBe(kpiMetricCatalog.length);
    expect(kpiMetricCatalog.map((metric) => metric.code)).toEqual(expect.arrayContaining(['BOXES_HANDLED', 'TASKS_COMPLETED', 'TIME_TAKEN', 'SLA_COMPLIANCE']));
    expect(kpiMetricByCode('BOXES_HANDLED')?.unit).toBe('BOX');
    expect(kpiMetricByCode('TASKS_COMPLETED')?.unit).toBe('COUNT');
    expect(kpiMetricByCode('TIME_TAKEN')?.unit).toBe('DURATION');
    expect(kpiMetricByCode('SLA_COMPLIANCE')?.unit).toBe('PERCENTAGE');
  });

  it('selects definitions, operations, and active versions deterministically', () => {
    expect(activeKpiDefinitions().every((definition) => definition.status === 'ACTIVE')).toBe(true);
    expect(kpisByOperation('LOADING').map((definition) => definition.code)).toEqual(['LOADING_SLA_COMPLIANCE', 'LOADING_TIME_TAKEN']);
    expect(activeRuleVersions().every((version) => version.status === 'ACTIVE')).toBe(true);
    expect(rulesEffectiveDuring('2026-09-12T00:00:00.000Z', '2026-09-13T00:00:00.000Z')).toHaveLength(3);
  });

  it('keeps rule and target configuration separate from result calculation', () => {
    const definition = activeKpiDefinitions()[0]; const rule = kpiRules.find((item) => item.kpiId === definition.id)!;
    expect(validateKpiConfiguration(definition, rule)).toEqual([]);
    expect(rule.target).toMatchObject({ value: 500, unit: 'BOX' });
  });

  it('enforces metric and unit compatibility', () => {
    expect(isMetricUnitCompatible('BOXES_HANDLED', 'BOX')).toBe(true);
    expect(isMetricUnitCompatible('BOXES_HANDLED', 'DURATION')).toBe(false);
    expect(isMetricUnitCompatible('TIME_TAKEN', 'DURATION')).toBe(true);
    expect(isMetricUnitCompatible('SLA_COMPLIANCE', 'PERCENTAGE')).toBe(true);
  });

  it('rejects invalid configuration without calculating a KPI result', () => {
    const definition = activeKpiDefinitions()[0]; const rule = { ...kpiRules.find((item) => item.kpiId === definition.id)!, target: { value: -1, unit: 'DURATION' as const }, effectiveFrom: '2026-09-20T00:00:00.000Z', effectiveTo: '2026-09-19T00:00:00.000Z' };
    expect(validateKpiConfiguration(definition, rule).length).toBeGreaterThan(1);
  });
});
