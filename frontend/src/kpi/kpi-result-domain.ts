import type { DataScope } from '../types/v1';
import type { KpiCategory, KpiComparisonDirection, KpiMeasurementPeriod, KpiMetricCode, KpiOperation, KpiRule, KpiRuleVersion, KpiSourceRecordReference, KpiUnit } from './kpi-domain';

export type KpiResultStatus = 'PENDING' | 'AVAILABLE' | 'NOT_AVAILABLE';

export interface KpiResultValue {
  value: number;
  unit: KpiUnit;
}

export interface KpiResultPeriod {
  kind: KpiMeasurementPeriod;
  start: string;
  end: string;
  displayLabel?: string;
}

export interface KpiResultEmployee {
  id: string;
  name: string;
  code?: string;
}

export interface KpiResultReadModel {
  id: string;
  resultId: string;
  employeeId: string;
  employee?: KpiResultEmployee;
  kpiId: string;
  kpiName: string;
  ruleVersionId: string;
  metric: KpiMetricCode;
  category: KpiCategory;
  operation: KpiOperation;
  scope: DataScope;
  period: KpiResultPeriod;
  target: KpiResultValue;
  actual: KpiResultValue;
  unit: KpiUnit;
  direction: KpiComparisonDirection;
  status: KpiResultStatus;
  sourceReferences: KpiSourceRecordReference[];
  calculatedAt?: string;
  calculationVersion?: string;
  isMock: boolean;
}

export function validateKpiResult(result: KpiResultReadModel): string[] {
  const errors: string[] = [];
  if (!result.id || result.id !== result.resultId) errors.push('Result identity must be present and stable.');
  if (!result.employeeId || !result.kpiId || !result.ruleVersionId) errors.push('Result traceability identifiers are required.');
  if (!result.period.start || !result.period.end || !result.period.kind) errors.push('Result period is required.');
  if (Date.parse(result.period.end) < Date.parse(result.period.start)) errors.push('Result period end must not precede its start.');
  if (!Number.isFinite(result.target.value) || !Number.isFinite(result.actual.value)) errors.push('Target and actual values must be finite read-only values.');
  if (result.target.unit !== result.unit || result.actual.unit !== result.unit) errors.push('Target, actual, and result units must agree.');
  if (result.metric === 'BOXES_HANDLED' && result.unit !== 'BOX') errors.push('BOXES_HANDLED results must use BOX units.');
  if (result.metric === 'TIME_TAKEN' && result.unit !== 'DURATION') errors.push('TIME_TAKEN results must use DURATION units.');
  if (result.metric === 'SLA_COMPLIANCE' && result.unit !== 'PERCENTAGE') errors.push('SLA_COMPLIANCE results must use PERCENTAGE units.');
  if (result.sourceReferences.some((reference) => reference.employeeId && reference.employeeId !== result.employeeId)) errors.push('Source employee references must match the result employee.');
  return errors;
}

export function resultRelationshipIsConsistent(result: KpiResultReadModel, rule: KpiRule, version: KpiRuleVersion): boolean {
  return result.kpiId === rule.kpiId && result.ruleVersionId === version.id && result.metric === rule.metric && result.operation === rule.applicableOperations[0];
}
