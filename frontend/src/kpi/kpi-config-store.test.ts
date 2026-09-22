import { afterEach, describe, expect, it } from 'vitest';
import { createKpiConfiguration, filterKpiConfigurations, getKpiConfiguration, listKpiConfigurations, resetKpiConfigurationsForTests, updateKpiConfiguration } from './kpi-config-store';

afterEach(() => resetKpiConfigurationsForTests());

describe('KPI configuration mock store', () => {
  it('filters the directory by search and configuration dimensions', async () => {
    const records = await listKpiConfigurations();

    expect(filterKpiConfigurations(records, { search: 'warehouse boxes' })).toHaveLength(1);
    expect(filterKpiConfigurations(records, { metric: 'TIME_TAKEN', operation: 'LOADING', scope: 'OWN' })).toHaveLength(1);
    expect(filterKpiConfigurations(records, { category: 'TIMELINESS', status: 'ACTIVE', measurementPeriod: 'WEEKLY' })).toHaveLength(1);
    expect(filterKpiConfigurations(records, { role: 'EMPLOYEE' }).length).toBe(records.length);
  });

  it('creates a mock configuration that can be retrieved by id', async () => {
    const created = await createKpiConfiguration({
      name: 'Task completion demo', code: 'TASK_COMPLETION_DEMO', description: 'Demo task configuration', category: 'PRODUCTIVITY',
      metric: 'TASKS_COMPLETED', operation: 'TASK', role: 'SUPERVISOR', scope: 'TEAM', measurementPeriod: 'DAILY',
      targetValue: 10, direction: 'HIGHER_IS_BETTER', status: 'DRAFT', effectiveFrom: '2026-09-16',
    });

    expect((await getKpiConfiguration(created.definition.id))?.definition.code).toBe('TASK_COMPLETION_DEMO');
    expect(created.rule.target.unit).toBe('COUNT');
  });

  it('preserves historical versions when editing a mock configuration', async () => {
    const original = (await listKpiConfigurations())[0];
    const updated = await updateKpiConfiguration(original.definition.id, {
      name: original.definition.name, code: original.definition.code, description: original.definition.description,
      category: original.definition.category, metric: original.rule.metric, operation: original.rule.applicableOperations[0],
      role: original.rule.applicableRoles[0], scope: original.rule.scope, measurementPeriod: original.rule.measurementPeriod,
      targetValue: 600, direction: original.rule.direction, thresholdBelow: original.rule.threshold?.belowTarget,
      thresholdAbove: original.rule.threshold?.aboveTarget, status: 'ACTIVE', effectiveFrom: '2026-09-17',
    });

    expect(updated?.rule.target).toMatchObject({ value: 600, unit: 'BOX' });
    expect(updated?.versions).toHaveLength(2);
    expect(updated?.versions.find((version) => version.version === 1)?.status).toBe('ARCHIVED');
    expect(updated?.versions.find((version) => version.version === 2)?.status).toBe('ACTIVE');
  });
});
