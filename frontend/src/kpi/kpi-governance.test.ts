import { afterEach, describe, expect, it } from 'vitest';
import { compareKpiVersions, governanceActionsForStatus, versionView } from './kpi-governance';
import { createKpiConfiguration, duplicateKpiConfiguration, getKpiConfiguration, listKpiConfigurations, resetKpiConfigurationsForTests, transitionKpiConfiguration, updateKpiConfiguration } from './kpi-config-store';
import { hasPermission, rolePermissions } from '../state/authorization';

afterEach(() => resetKpiConfigurationsForTests());

describe('KPI configuration governance', () => {
  it('offers lifecycle actions according to the current status', () => {
    expect(governanceActionsForStatus('DRAFT')).toEqual(['ACTIVATE', 'ARCHIVE']);
    expect(governanceActionsForStatus('ACTIVE')).toEqual(['DEACTIVATE', 'ARCHIVE']);
    expect(governanceActionsForStatus('INACTIVE')).toEqual(['ACTIVATE', 'ARCHIVE']);
    expect(governanceActionsForStatus('ARCHIVED')).toEqual([]);
  });

  it('activates a valid configuration and archives the previous version', async () => {
    const record = (await listKpiConfigurations()).find((item) => item.definition.status === 'DRAFT')!;
    const result = await transitionKpiConfiguration(record.definition.id, 'ACTIVATE');
    expect(result.errors).toEqual([]);
    expect(result.record?.definition.status).toBe('ACTIVE');
    expect(result.record?.versions.at(-1)?.status).toBe('ACTIVE');
    expect(result.record?.versions.at(-2)?.status).toBe('ARCHIVED');
  });

  it('supports deactivation and archival as new lifecycle versions', async () => {
    const record = (await listKpiConfigurations()).find((item) => item.definition.status === 'ACTIVE')!;
    const inactive = await transitionKpiConfiguration(record.definition.id, 'DEACTIVATE');
    expect(inactive.errors).toEqual([]);
    expect(inactive.record?.definition.status).toBe('INACTIVE');
    const archived = await transitionKpiConfiguration(record.definition.id, 'ARCHIVE');
    expect(archived.errors).toEqual([]);
    expect(archived.record?.definition.status).toBe('ARCHIVED');
    expect(archived.record?.versions.at(-1)?.status).toBe('ARCHIVED');
    expect(governanceActionsForStatus('ARCHIVED')).toEqual([]);
  });

  it('blocks activation when the current configuration fails validation', async () => {
    const record = (await listKpiConfigurations()).find((item) => item.definition.status === 'DRAFT')!;
    await updateKpiConfiguration(record.definition.id, {
      name: record.definition.name, code: record.definition.code, description: record.definition.description,
      category: record.definition.category, metric: record.rule.metric, operation: 'TASK', role: record.rule.applicableRoles[0],
      scope: record.rule.scope, measurementPeriod: record.rule.measurementPeriod, targetValue: record.rule.target.value,
      direction: record.rule.direction, status: 'DRAFT', effectiveFrom: '2026-09-20', effectiveTo: '2026-09-19',
    });
    const result = await transitionKpiConfiguration(record.definition.id, 'ACTIVATE');
    expect(result.record).toBeUndefined();
    expect(result.errors.join(' ')).toContain('Effective end date');
    expect((await getKpiConfiguration(record.definition.id))?.definition.status).toBe('DRAFT');
  });

  it('duplicates as a new draft without inheriting results or source records', async () => {
    const original = (await listKpiConfigurations())[0];
    const duplicate = await duplicateKpiConfiguration(original.definition.id);
    expect(duplicate?.definition.id).not.toBe(original.definition.id);
    expect(duplicate?.definition.status).toBe('DRAFT');
    expect(duplicate?.definition.code).toContain('_COPY');
    expect(duplicate?.versions).toHaveLength(1);
    expect(duplicate).not.toHaveProperty('results');
    expect(duplicate).not.toHaveProperty('sourceRecords');
  });

  it('selects and compares model fields across versions', async () => {
    const original = (await listKpiConfigurations())[0];
    const historicalSnapshot = structuredClone(original.versions[0].configurationSnapshot);
    const updated = await updateKpiConfiguration(original.definition.id, {
      name: original.definition.name, code: original.definition.code, description: original.definition.description,
      category: original.definition.category, metric: original.rule.metric, operation: original.rule.applicableOperations[0],
      role: original.rule.applicableRoles[0], scope: original.rule.scope, measurementPeriod: original.rule.measurementPeriod,
      targetValue: original.rule.target.value + 1, direction: original.rule.direction, status: 'ACTIVE', effectiveFrom: '2026-09-17',
    });
    const left = versionView(updated!, updated!.versions[0].id)!;
    const right = versionView(updated!, updated!.versions[1].id)!;
    const comparison = compareKpiVersions(left, right);
    expect(comparison.find((row) => row.field === 'Target')?.state).toBe('CHANGED');
    expect(comparison.find((row) => row.field === 'Metric')?.state).toBe('UNCHANGED');
    expect(updated?.versions.find((version) => version.version === 1)?.configurationSnapshot).toEqual(historicalSnapshot);
  });

  it('keeps cloned configuration creation in the mock store only', async () => {
    const original = (await listKpiConfigurations())[0];
    const created = await createKpiConfiguration({
      name: `${original.definition.name} test`, code: `${original.definition.code}_TEST`, description: original.definition.description,
      category: original.definition.category, metric: original.rule.metric, operation: original.rule.applicableOperations[0],
      role: original.rule.applicableRoles[0], scope: original.rule.scope, measurementPeriod: original.rule.measurementPeriod,
      targetValue: original.rule.target.value, direction: original.rule.direction, status: 'DRAFT', effectiveFrom: '2026-09-16',
    });
    expect((await getKpiConfiguration(created.definition.id))?.definition.status).toBe('DRAFT');
  });

  it('uses the centralized KPI edit permission boundary', () => {
    expect(hasPermission({ role: 'SUPER_ADMIN', permissions: rolePermissions('SUPER_ADMIN') }, { module: 'KPI', action: 'EDIT' })).toBe(true);
    expect(hasPermission({ role: 'EMPLOYEE', permissions: rolePermissions('EMPLOYEE') }, { module: 'KPI', action: 'EDIT' })).toBe(false);
  });
});
