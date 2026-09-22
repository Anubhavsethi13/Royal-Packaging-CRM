import { describe, expect, it } from 'vitest';
import { createMockSession } from '../state/auth';
import { kpiResults } from './kpi-result-data';
import { formatResultValue, orderKpiResultHistory, resultVisibleToSession, sourceDetailLabel, toKpiResultTrendPoints } from './result-pages';

describe('KPI result presentation', () => {
  it('renders supplied target and actual units without calculating', () => {
    const result = kpiResults[0];
    expect(formatResultValue(result.target)).toBe('500 BOX');
    expect(formatResultValue(result.actual)).toBe('462 BOX');
    expect(formatResultValue(result.actual)).not.toContain('%');
  });

  it('keeps source traceability fields display-only', () => {
    expect(sourceDetailLabel(kpiResults[0].sourceReferences[0])).toContain('Quantity: 462 BOX');
    expect(sourceDetailLabel(kpiResults[1].sourceReferences[0])).toContain('Duration: 2340 seconds');
    expect(sourceDetailLabel(kpiResults[2].sourceReferences[0])).toContain('SLA: MET');
  });

  it('does not expose records outside an own-scoped session', () => {
    const employeeSession = createMockSession('EMPLOYEE');
    expect(resultVisibleToSession(kpiResults[0], employeeSession)).toBe(false);
    expect(resultVisibleToSession(kpiResults[0], createMockSession('ADMIN'))).toBe(true);
  });

  it('does not introduce score or achievement fields into the presentation model', () => {
    expect('weightedScore' in kpiResults[0]).toBe(false);
    expect('achievementPercentage' in kpiResults[0]).toBe(false);
  });

  it('orders historical periods newest first and preserves supplied values', () => {
    const history = kpiResults.filter((result) => result.kpiId === 'kpi-config-boxes-handled');
    expect(orderKpiResultHistory(history).map((result) => result.period.start)).toEqual([
      '2026-09-07T00:00:00.000Z',
      '2026-08-31T00:00:00.000Z',
      '2026-08-24T00:00:00.000Z',
    ]);
    expect(toKpiResultTrendPoints(history).map((point) => point.actual.value)).toEqual([451, 488, 462]);
    expect(toKpiResultTrendPoints(history).map((point) => point.target.value)).toEqual([500, 500, 500]);
  });

  it('keeps history tied to the selected employee and KPI', () => {
    const history = kpiResults.filter((result) => result.employeeId === 'emp-002' && result.kpiId === 'kpi-config-boxes-handled');
    expect(history).toHaveLength(3);
    expect(history.every((result) => result.employeeId === 'emp-002' && result.kpiId === 'kpi-config-boxes-handled')).toBe(true);
  });
});
