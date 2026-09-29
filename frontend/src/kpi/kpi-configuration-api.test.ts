import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { ContractValidationError, describeApiError } from '../api/contract-validation';
import { KpiDefinitionDetailView, KpiDefinitionTable } from './kpi-configuration-api-pages';
import { fetchKpiDefinition, fetchKpiDefinitions, formatEffectiveRange, formatKpiValue, targetScopeLabel, type KpiDefinitionDetailView as DetailModel, type KpiDefinitionPage } from './kpi-configuration-api';

const target = (overrides: Record<string, unknown> = {}) => ({ id: 't1', target_value: '500.25', warning_threshold: '450', critical_threshold: null, effective_from: '2026-09-01T00:00:00.000Z', effective_to: null, warehouse: null, is_current: true, ...overrides });
const definition = (overrides: Record<string, unknown> = {}) => ({
  id: 'k1', code: 'BOXES_HANDLED', name: 'Boxes handled', pillar: 'PRODUCTIVITY', description: 'Completed BOX per period', unit: 'BOX', formula_reference: 'SUM(completed_box_quantity)',
  active: true, effective_from: '2026-09-01T00:00:00.000Z', effective_to: null, status: 'ACTIVE', current_targets: [target(), target({ id: 't2', target_value: '650', warehouse: { id: 'd1', code: 'DEP-01', name: 'Main Depot' } })],
  target_count: 3, created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-02T00:00:00.000Z', version: '2',
  ...overrides,
});
const meta = (overrides = {}) => ({ page: 1, pageSize: 25, total: 1, totalPages: 1, hasNext: false, hasPrevious: false, ...overrides });
const html = (element: React.ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, null, element));

describe('KPI configuration retrieval', () => {
  it('requests definitions with filters and maps the response (camelCase mirrors tolerated)', async () => {
    const request = vi.fn().mockResolvedValue({ success: true, data: [{ ...definition(), formulaReference: 'x', currentTargets: [] }], meta: meta() });
    const page = await fetchKpiDefinitions({ page: 1, pageSize: 25, search: ' box ', status: 'ACTIVE' }, request);
    expect(request).toHaveBeenCalledWith('/kpi/definitions?page=1&pageSize=25&search=box&status=ACTIVE');
    expect(page).toMatchObject({ page: 1, total: 1, totalPages: 1 });
    expect(page.items[0]).toMatchObject({ code: 'BOXES_HANDLED', formulaReference: 'SUM(completed_box_quantity)', status: 'ACTIVE', targetCount: 3, version: '2' });
    expect(page.items[0]?.currentTargets.map((item) => [item.targetValue, item.warehouse?.code ?? null])).toEqual([['500.25', null], ['650', 'DEP-01']]);
  });

  it('returns an empty configuration unchanged', async () => {
    const page = await fetchKpiDefinitions({ page: 1, pageSize: 25 }, vi.fn().mockResolvedValue({ success: true, data: [], meta: meta({ total: 0, totalPages: 0 }) }));
    expect(page).toEqual({ items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 });
  });

  it('loads a definition with its full target history', async () => {
    const request = vi.fn().mockResolvedValue({ success: true, data: { ...definition(), targets: [target({ id: 'future', is_current: false }), target()] } });
    const detail = await fetchKpiDefinition('k1', request);
    expect(request).toHaveBeenCalledWith('/kpi/definitions/k1');
    expect(detail.targets.map((item) => [item.id, item.isCurrent])).toEqual([['future', false], ['t1', true]]);
  });
});

describe('runtime validation of configuration responses', () => {
  it.each([
    ['an unknown status', { status: 'DRAFT' }],
    ['a non-numeric target', { current_targets: [target({ target_value: 'lots' })] }],
    ['a missing code', { code: '' }],
    ['a negative target count', { target_count: -1 }],
  ])('rejects %s', async (_label, overrides) => {
    const request = vi.fn().mockResolvedValue({ success: true, data: [definition(overrides)], meta: meta() });
    await expect(fetchKpiDefinitions({ page: 1, pageSize: 25 }, request)).rejects.toBeInstanceOf(ContractValidationError);
  });

  it('rejects a detail response without target history', async () => {
    await expect(fetchKpiDefinition('k1', vi.fn().mockResolvedValue({ success: true, data: definition() }))).rejects.toThrow(/KPI definition response did not match/);
  });
});

describe('errors', () => {
  it('propagates and explains unauthorized, forbidden, not found, and server errors', async () => {
    for (const status of [401, 403, 404]) {
      const failure = new ApiError(status, { code: 'X', message: status === 403 ? "Operation 'kpi:read_config' is not authorized for the authenticated user." : 'x' });
      await expect(fetchKpiDefinitions({ page: 1, pageSize: 25 }, vi.fn().mockRejectedValue(failure))).rejects.toBe(failure);
    }
    expect(describeApiError(new ApiError(401, { code: 'UNAUTHORIZED' }), 'x')).toContain('session');
    expect(describeApiError(new ApiError(403, { code: 'FORBIDDEN', message: 'no' }), 'x')).toBe('no');
    expect(describeApiError(new ApiError(500, { code: 'E', message: 'relation kpi_definitions' }), 'x')).not.toContain('kpi_definitions');
  });
});

describe('configuration views', () => {
  const page: KpiDefinitionPage = { items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 };

  it('shows an honest empty state when nothing is configured', () => {
    const output = html(createElement(KpiDefinitionTable, { page }));
    expect(output).toContain('No KPI definitions configured');
    expect(output).toContain('0 definitions');
  });

  it('lists definitions with status, effective range, and current target, and no scores or rankings', async () => {
    const loaded = await fetchKpiDefinitions({ page: 1, pageSize: 25 }, vi.fn().mockResolvedValue({ success: true, data: [definition(), definition({ id: 'k2', code: 'LEGACY', name: 'Legacy', status: 'EXPIRED', current_targets: [], unit: null })], meta: meta({ total: 2 }) }));
    const output = html(createElement(KpiDefinitionTable, { page: loaded }));
    for (const text of ['Boxes handled', 'BOXES_HANDLED', 'PRODUCTIVITY', 'ACTIVE', '2 current targets', 'EXPIRED', 'No current target', '/kpis/k1']) expect(output).toContain(text);
    expect(output).not.toMatch(/rank|score|incentive|payroll/i);
  });

  it('shows the definition facts and the target/threshold history', async () => {
    const detail: DetailModel = await fetchKpiDefinition('k1', vi.fn().mockResolvedValue({ success: true, data: { ...definition(), targets: [target({ id: 'd', warehouse: { id: 'd1', code: 'DEP-01', name: 'Main Depot' }, target_value: '650', warning_threshold: null }), target({ id: 'old', is_current: false, critical_threshold: '300', effective_to: '2026-08-31T00:00:00.000Z' })] } }));
    const output = html(createElement(KpiDefinitionDetailView, { definition: detail }));
    for (const text of ['SUM(completed_box_quantity)', 'Main Depot (DEP-01)', 'All warehouses', '650 BOX', '500.25 BOX', '300 BOX', 'Current', 'Not in force']) expect(output).toContain(text);
  });

  it('formats values, ranges, and scopes', () => {
    expect(formatKpiValue('12.5', 'PERCENTAGE')).toBe('12.5 PERCENTAGE');
    expect(formatKpiValue(null, 'BOX')).toBe('—');
    expect(formatKpiValue('3', null)).toBe('3');
    expect(formatEffectiveRange(null, null)).toBe('Always – open ended');
    expect(targetScopeLabel({ warehouse: null })).toBe('All warehouses');
  });
});
