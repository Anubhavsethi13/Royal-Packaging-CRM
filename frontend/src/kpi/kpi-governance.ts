import type { KpiConfigurationRecord } from './kpi-config-store';
import type { KpiRuleVersion } from './kpi-domain';

export type KpiGovernanceAction = 'ACTIVATE' | 'DEACTIVATE' | 'ARCHIVE';
export type KpiComparisonState = 'UNCHANGED' | 'CHANGED' | 'ADDED' | 'REMOVED';

export interface KpiVersionView {
  id: string;
  version: number;
  status: KpiRuleVersion['status'];
  effectiveFrom: string;
  effectiveTo?: string;
  createdAt: string;
  createdBy?: string;
  metric: string;
  operations: string;
  roles: string;
  scope: string;
  period: string;
  target: string;
  direction: string;
  thresholds: string;
}

export interface KpiVersionComparisonRow {
  field: string;
  left: string;
  right: string;
  state: KpiComparisonState;
}

function valueOrUnset(value: string | number | undefined): string { return value === undefined || value === '' ? 'Not configured' : String(value); }

export function versionView(record: KpiConfigurationRecord, versionId: string): KpiVersionView | undefined {
  const version = record.versions.find((candidate) => candidate.id === versionId);
  if (!version) return undefined;
  const snapshot = version.configurationSnapshot;
  return {
    id: version.id, version: version.version, status: version.status, effectiveFrom: version.effectiveFrom, effectiveTo: version.effectiveTo,
    createdAt: version.createdAt, createdBy: version.createdBy, metric: snapshot.metric, operations: snapshot.applicableOperations.join(' · '),
    roles: snapshot.applicableRoles.join(' · '), scope: snapshot.scope, period: snapshot.measurementPeriod, target: `${snapshot.target.value} ${snapshot.target.unit}`,
    direction: snapshot.direction, thresholds: snapshot.threshold ? `${valueOrUnset(snapshot.threshold.belowTarget)} / ${valueOrUnset(snapshot.threshold.aboveTarget)}` : 'Not configured',
  };
}

export function compareKpiVersions(left: KpiVersionView, right: KpiVersionView): KpiVersionComparisonRow[] {
  const fields: Array<[string, string, string]> = [
    ['Metric', left.metric, right.metric], ['Operation', left.operations, right.operations], ['Role', left.roles, right.roles], ['Scope', left.scope, right.scope],
    ['Measurement period', left.period, right.period], ['Target', left.target, right.target], ['Direction', left.direction, right.direction],
    ['Thresholds', left.thresholds, right.thresholds], ['Effective from', left.effectiveFrom, right.effectiveFrom], ['Effective to', valueOrUnset(left.effectiveTo), valueOrUnset(right.effectiveTo)],
    ['Status', left.status, right.status],
  ];
  return fields.map(([field, leftValue, rightValue]) => ({ field, left: leftValue, right: rightValue, state: leftValue === rightValue ? 'UNCHANGED' : 'CHANGED' }));
}

export function governanceActionsForStatus(status: KpiRuleVersion['status']): KpiGovernanceAction[] {
  if (status === 'ARCHIVED') return [];
  if (status === 'ACTIVE') return ['DEACTIVATE', 'ARCHIVE'];
  return ['ACTIVATE', 'ARCHIVE'];
}

export function governanceActionLabel(action: KpiGovernanceAction): string {
  return action === 'ACTIVATE' ? 'Activate' : action === 'DEACTIVATE' ? 'Deactivate' : 'Archive';
}
