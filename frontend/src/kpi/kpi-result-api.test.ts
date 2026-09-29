import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { ContractValidationError, describeApiError } from '../api/contract-validation';
import { createApiRepositoryCollection, createDefaultApiRepositoryConfiguration } from '../state/repositories';
import { decodeKpiResultDetail, decodeKpiResultItem, kpiResultsApiRepositoryConfig } from './kpi-result-api';
import { validateKpiResult } from './kpi-result-domain';
import { formatResultValue, KpiResultsView, toKpiResultTrendPoints } from './result-pages';
import { validateKpiResultTraceability } from './source-traceability';

const fetchMock = vi.spyOn(globalThis, 'fetch');
afterEach(() => fetchMock.mockReset());

const dto = (overrides: Record<string, unknown> = {}) => ({
  id: 'k1_e1_DAILY_2026-09-10',
  employee: { id: 'e1', code: 'EMP-1', name: 'Asha Rao' },
  kpi: { id: 'k1', code: 'BOXES_HANDLED', name: 'Boxes handled' },
  rule_version_id: 'k1:v1',
  metric: 'BOXES_HANDLED', category: 'PRODUCTIVITY', operation: 'WAREHOUSE', scope: 'OWN',
  period: { kind: 'DAILY', start: '2026-09-10', end: '2026-09-10', label: '2026-09-10', timezone: 'UTC' },
  actual: { value: 172.5, unit: 'BOX' },
  target: { value: 150, unit: 'BOX', target_id: 't1' },
  unit: 'BOX', direction: 'HIGHER_IS_BETTER', status: 'AVAILABLE', not_available_reason: null,
  source: 'TASK', source_count: 3, calculated_at: '2026-09-30T08:00:00.000Z', calculation_version: 'task-kpi-v1',
  ...overrides,
});
const reference = (overrides: Record<string, unknown> = {}) => ({
  source_record_id: 'task-2', source_type: 'WAREHOUSE_OPERATION', task_id: 'task-2', task_code: 'TSK-00000002', operation_type: 'WAREHOUSE',
  employee_id: 'e1', timestamp: '2026-09-10T11:30:00.000Z', raw_metric_value: 22.5, quantity: { value: 22.5, unit: 'BOX' }, duration_seconds: 1800, warehouse: 'DEP-01', participants: 2,
  ...overrides,
});
const listEnvelope = (items: unknown[]) => ({ success: true, data: items, meta: { page: 1, pageSize: 100, total: items.length, totalPages: items.length ? 1 : 0, hasNext: false, hasPrevious: false } });
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const html = (element: React.ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, null, element));

describe('KPI results API provider', () => {
  it('is part of the default API configuration (no longer the unavailable repository)', () => {
    expect(createDefaultApiRepositoryConfiguration().kpiResults).toBe(kpiResultsApiRepositoryConfig);
    expect(kpiResultsApiRepositoryConfig.resourcePath).toBe('/kpi/results');
  });

  it('lists results through the shared API client, forwarding the page filters', async () => {
    fetchMock.mockResolvedValue(respond(listEnvelope([dto()])));
    const repositories = createApiRepositoryCollection(createDefaultApiRepositoryConfiguration());
    const response = await repositories.kpiResults.list({ page: 1, pageSize: 100, filters: { employeeId: 'e1', kpiId: 'k1', period: 'WEEKLY', periodStart: '2026-09-01', periodEnd: '2026-09-30', metric: 'BOXES_HANDLED', status: undefined } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/kpi/results?page=1&pageSize=100&employeeId=e1&kpiId=k1&metric=BOXES_HANDLED&period=WEEKLY&periodEnd=2026-09-30&periodStart=2026-09-01');
    expect(init.credentials).toBe('include'); // session cookie
    expect(JSON.stringify(init.headers)).not.toMatch(/role|permission/i); // no client-asserted identity
    expect(response.total).toBe(1);
    expect(response.items[0]).toMatchObject({ id: 'k1_e1_DAILY_2026-09-10', employeeId: 'e1', kpiCode: 'BOXES_HANDLED', isMock: false, sourceCount: 3 });
  });

  it('loads a result detail with its source references, and treats 404 as not found', async () => {
    fetchMock.mockResolvedValueOnce(respond({ success: true, data: { ...dto(), source_references: [reference()] } }));
    const repositories = createApiRepositoryCollection(createDefaultApiRepositoryConfiguration());
    const result = await repositories.kpiResults.getById('k1_e1_DAILY_2026-09-10');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/api/kpi/results/k1_e1_DAILY_2026-09-10');
    expect(result?.sourceReferences[0]).toMatchObject({ taskId: 'task-2', taskCode: 'TSK-00000002', participants: 2, quantity: { value: 22.5, unit: 'BOX' }, durationSeconds: 1800, warehouse: 'DEP-01' });

    fetchMock.mockResolvedValueOnce(respond({ success: false, code: 'NOT_FOUND', message: 'x' }, 404));
    await expect(repositories.kpiResults.getById('k1_e2_DAILY_2026-09-10')).resolves.toBeUndefined();
  });

  it('surfaces unauthorized and forbidden responses instead of falling back', async () => {
    const repositories = createApiRepositoryCollection(createDefaultApiRepositoryConfiguration());
    fetchMock.mockResolvedValueOnce(respond({ success: false, code: 'UNAUTHORIZED', message: 'Session is invalid or expired.' }, 401));
    const unauthorized = await repositories.kpiResults.list({}).catch((error: unknown) => error);
    expect(unauthorized).toBeInstanceOf(ApiError);
    expect(describeApiError(unauthorized, 'x')).toContain('session');
    fetchMock.mockResolvedValueOnce(respond({ success: false, code: 'FORBIDDEN', message: 'You may only view your own KPI results.' }, 403));
    const forbidden = await repositories.kpiResults.list({}).catch((error: unknown) => error);
    expect(describeApiError(forbidden, 'x')).toBe('You may only view your own KPI results.');
  });
});

describe('response validation and mapping', () => {
  it('maps a result onto the existing read model without inventing fields', () => {
    const result = decodeKpiResultItem({ ...dto(), employeeId: 'mirror' });
    expect(result).toMatchObject({ resultId: 'k1_e1_DAILY_2026-09-10', kpiId: 'k1', kpiName: 'Boxes handled', ruleVersionId: 'k1:v1', metric: 'BOXES_HANDLED', operation: 'WAREHOUSE', scope: 'OWN', unit: 'BOX', direction: 'HIGHER_IS_BETTER', status: 'AVAILABLE', calculationVersion: 'task-kpi-v1' });
    expect(result.period).toEqual({ kind: 'DAILY', start: '2026-09-10', end: '2026-09-10', displayLabel: '2026-09-10', timezone: 'UTC' });
    expect(result.actual).toEqual({ value: 172.5, unit: 'BOX' });
    expect(result.target).toEqual({ value: 150, unit: 'BOX' });
    expect(result.sourceReferences).toEqual([]);
    expect(validateKpiResult(result)).toEqual([]);
  });

  it('keeps a missing target absent and a not-calculable value absent', () => {
    const sla = decodeKpiResultItem(dto({ metric: 'SLA_COMPLIANCE', operation: 'LOADING', unit: 'PERCENTAGE', category: 'TIMELINESS', actual: null, target: null, status: 'NOT_AVAILABLE', not_available_reason: 'No SLA targets are defined for tasks.' }));
    expect(sla.actual).toBeUndefined();
    expect(sla.target).toBeUndefined();
    expect(sla.notAvailableReason).toContain('No SLA targets');
    expect(validateKpiResult(sla)).toEqual([]);
    expect(toKpiResultTrendPoints([sla])).toEqual([]); // nothing plotted for a missing value
  });

  it.each([
    ['an unknown metric', { metric: 'SCORE' }],
    ['a value on a NOT_AVAILABLE result', { status: 'NOT_AVAILABLE' }],
    ['a missing value on an AVAILABLE result', { actual: null }],
    ['a unit mismatch', { actual: { value: 1, unit: 'COUNT' } }],
    ['an unsupported period', { period: { kind: 'CUSTOM', start: '2026-09-10', end: '2026-09-10', label: 'x', timezone: 'UTC' } }],
    ['a reversed period', { period: { kind: 'DAILY', start: '2026-09-10', end: '2026-09-09', label: 'x', timezone: 'UTC' } }],
    ['a non-numeric value', { actual: { value: 'lots', unit: 'BOX' } }],
    ['a missing employee', { employee: undefined }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => decodeKpiResultItem(dto(overrides))).toThrow(ContractValidationError);
  });

  it('rejects a detail without source references or with a malformed reference', () => {
    expect(() => decodeKpiResultDetail({ success: true, data: dto() })).toThrow(ContractValidationError);
    expect(() => decodeKpiResultDetail({ success: true, data: { ...dto(), source_references: [reference({ participants: 0 })] } })).toThrow(ContractValidationError);
  });

  it('API references pass the existing traceability checks (the measured operation matches the result)', () => {
    const detail = decodeKpiResultDetail({ success: true, data: { ...dto(), source_references: [reference(), reference({ source_record_id: 'task-1', task_id: 'task-1', participants: 1 })] } });
    expect(validateKpiResultTraceability(detail)).toEqual([]);
    // A reference whose source type disagrees with the measured operation is flagged by the existing checks.
    const mismatched = decodeKpiResultDetail({ success: true, data: { ...dto(), source_references: [reference({ source_type: 'LOADING_OPERATION' })] } });
    expect(validateKpiResultTraceability(mismatched).map((issue) => issue.code)).toContain('OPERATION_MISMATCH');
  });
});

describe('results page states', () => {
  const items = [decodeKpiResultItem(dto()), decodeKpiResultItem(dto({ id: 'k2_e1_DAILY_2026-09-10', kpi: { id: 'k2', code: 'TASK_TIME', name: 'Task time' }, metric: 'TIME_TAKEN', unit: 'DURATION', direction: 'LOWER_IS_BETTER', category: 'TIMELINESS', actual: { value: 210, unit: 'DURATION' }, target: null, status: 'PENDING' }))];

  it('shows the loading state', () => {
    expect(html(createElement(KpiResultsView, { loading: true, error: null, items: [], emptyTitle: 'x', emptyDescription: 'y' }))).toContain('Loading KPI results');
  });

  it('shows an API error, including an unauthorized message', () => {
    const output = html(createElement(KpiResultsView, { loading: false, error: describeApiError(new ApiError(401, { code: 'UNAUTHORIZED' }), 'x'), items: [], emptyTitle: 'x', emptyDescription: 'y' }));
    expect(output).toContain('KPI results could not be loaded');
    expect(output).toContain('Your session has expired');
  });

  it('shows the empty state', () => {
    expect(html(createElement(KpiResultsView, { loading: false, error: null, items: [], emptyTitle: 'No KPI results available', emptyDescription: 'No KPI results for this period.' }))).toContain('No KPI results for this period.');
  });

  it('renders backend values as supplied, with honest placeholders and no ranking', () => {
    const output = html(createElement(KpiResultsView, { loading: false, error: null, items, emptyTitle: 'x', emptyDescription: 'y' }));
    for (const text of ['Asha Rao', 'Boxes handled', 'BOXES_HANDLED', '172.5 BOX', '150 BOX', '210 min', 'Not configured', 'AVAILABLE', 'PENDING', 'API · 3 tasks', '/kpis/results/k1_e1_DAILY_2026-09-10']) expect(output).toContain(text);
    expect(output).not.toMatch(/rank|score|DEMO/i);
  });

  it('formats values without calculating', () => {
    expect(formatResultValue(undefined, 'Not calculable')).toBe('Not calculable');
    expect(formatResultValue({ value: 39, unit: 'DURATION' })).toBe('39 min');
    expect(formatResultValue({ value: 462, unit: 'BOX' })).toBe('462 BOX');
  });
});
