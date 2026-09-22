import type { DataScope, Role } from '../types/v1';
import type { KpiDefinition, KpiMetricCode, KpiMetricDefinition, KpiOperation, KpiRule, KpiRuleVersion, KpiUnit } from './kpi-domain';
import { KPI_CATEGORIES, KPI_CONFIGURATION_STATUSES, KPI_DIRECTIONS, KPI_METRIC_CODES, KPI_OPERATIONS, KPI_PERIODS, KPI_SOURCE_TYPES, KPI_UNITS } from './kpi-domain';

export const kpiMetricCatalog: KpiMetricDefinition[] = [
  { id: 'metric-boxes-handled', code: 'BOXES_HANDLED', displayName: 'BOXES handled', description: 'Completed operational BOX quantity from task or warehouse records.', category: 'PRODUCTIVITY', sourceTypes: ['TASK', 'WAREHOUSE_OPERATION', 'LOADING_OPERATION', 'UNLOADING_OPERATION'], unit: 'BOX', supportedOperations: ['TASK', 'WAREHOUSE', 'LOADING', 'UNLOADING'], supportedRoles: ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'EMPLOYEE'], aggregationType: 'SUM', enabled: true },
  { id: 'metric-tasks-completed', code: 'TASKS_COMPLETED', displayName: 'Tasks completed', description: 'Count of completed task records in the measurement period.', category: 'PRODUCTIVITY', sourceTypes: ['TASK'], unit: 'COUNT', supportedOperations: ['TASK', 'WAREHOUSE'], supportedRoles: ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'EMPLOYEE'], aggregationType: 'COUNT', enabled: true },
  { id: 'metric-time-taken', code: 'TIME_TAKEN', displayName: 'Time taken', description: 'Recorded duration from loading or unloading operational timing.', category: 'TIMELINESS', sourceTypes: ['LOADING_OPERATION', 'UNLOADING_OPERATION'], unit: 'DURATION', supportedOperations: ['LOADING', 'UNLOADING'], supportedRoles: ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'EMPLOYEE'], aggregationType: 'DURATION', enabled: true },
  { id: 'metric-sla-compliance', code: 'SLA_COMPLIANCE', displayName: 'SLA compliance', description: 'Operational SLA compliance result from loading or unloading records.', category: 'TIMELINESS', sourceTypes: ['LOADING_OPERATION', 'UNLOADING_OPERATION'], unit: 'PERCENTAGE', supportedOperations: ['LOADING', 'UNLOADING'], supportedRoles: ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'EMPLOYEE'], aggregationType: 'PERCENTAGE', enabled: true },
];

export const kpiDefinitions: KpiDefinition[] = [
  { id: 'kpi-config-boxes-handled', code: 'WAREHOUSE_BOXES_HANDLED', name: 'Warehouse BOXES handled', description: 'Demo configuration for operational BOX throughput.', category: 'PRODUCTIVITY', metric: 'BOXES_HANDLED', status: 'ACTIVE', applicableRoles: ['EMPLOYEE'], applicableOperations: ['WAREHOUSE'], scope: 'TEAM', ruleVersionIds: ['kpi-rule-version-boxes-1'], createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' },
  { id: 'kpi-config-loading-sla', code: 'LOADING_SLA_COMPLIANCE', name: 'Loading SLA compliance', description: 'Demo configuration for loading SLA monitoring.', category: 'TIMELINESS', metric: 'SLA_COMPLIANCE', status: 'ACTIVE', applicableRoles: ['EMPLOYEE'], applicableOperations: ['LOADING'], scope: 'TEAM', ruleVersionIds: ['kpi-rule-version-loading-sla-1'], createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' },
  { id: 'kpi-config-loading-time', code: 'LOADING_TIME_TAKEN', name: 'Loading time taken', description: 'Demo configuration for loading duration monitoring.', category: 'TIMELINESS', metric: 'TIME_TAKEN', status: 'DRAFT', applicableRoles: ['EMPLOYEE'], applicableOperations: ['LOADING'], scope: 'OWN', ruleVersionIds: ['kpi-rule-version-loading-time-1'], createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' },
];

export const kpiRules: KpiRule[] = [
  { id: 'kpi-rule-boxes', kpiId: 'kpi-config-boxes-handled', metric: 'BOXES_HANDLED', target: { value: 500, unit: 'BOX' }, threshold: { belowTarget: 400 }, direction: 'HIGHER_IS_BETTER', measurementPeriod: 'WEEKLY', applicableRoles: ['EMPLOYEE'], applicableOperations: ['WAREHOUSE'], scope: 'TEAM', status: 'ACTIVE', effectiveFrom: '2026-09-10T00:00:00.000Z' },
  { id: 'kpi-rule-loading-sla', kpiId: 'kpi-config-loading-sla', metric: 'SLA_COMPLIANCE', target: { value: 90, unit: 'PERCENTAGE', minimum: 0, maximum: 100 }, direction: 'HIGHER_IS_BETTER', measurementPeriod: 'WEEKLY', applicableRoles: ['EMPLOYEE'], applicableOperations: ['LOADING'], scope: 'TEAM', status: 'ACTIVE', effectiveFrom: '2026-09-10T00:00:00.000Z' },
  { id: 'kpi-rule-loading-time', kpiId: 'kpi-config-loading-time', metric: 'TIME_TAKEN', target: { value: 45, unit: 'DURATION' }, direction: 'LOWER_IS_BETTER', measurementPeriod: 'CUSTOM', applicableRoles: ['EMPLOYEE'], applicableOperations: ['LOADING'], scope: 'OWN', status: 'DRAFT', effectiveFrom: '2026-09-10T00:00:00.000Z' },
];

export const kpiRuleVersions: KpiRuleVersion[] = kpiRules.map((rule) => ({ id: `kpi-rule-version-${rule.id.replace('kpi-rule-', '')}-1`, ruleId: rule.id, version: 1, status: rule.status, effectiveFrom: rule.effectiveFrom, configurationSnapshot: { metric: rule.metric, target: rule.target, threshold: rule.threshold, direction: rule.direction, measurementPeriod: rule.measurementPeriod, applicableRoles: rule.applicableRoles, applicableOperations: rule.applicableOperations, scope: rule.scope }, createdAt: rule.effectiveFrom, createdBy: 'frontend-demo' }));

export const kpiMetricByCode = (code: KpiMetricCode) => kpiMetricCatalog.find((metric) => metric.code === code);
export function kpiDirectionsForMetric(metric: KpiMetricCode) { return metric === 'TIME_TAKEN' ? ['LOWER_IS_BETTER'] as const : ['HIGHER_IS_BETTER', 'TARGET_MATCH'] as const; }
export const allKpiDefinitions = () => [...kpiDefinitions];
export const activeKpiDefinitions = () => kpiDefinitions.filter((definition) => definition.status === 'ACTIVE');
export const kpiById = (id: string) => kpiDefinitions.find((definition) => definition.id === id);
export const kpisByMetric = (metric: KpiMetricCode) => kpiDefinitions.filter((definition) => definition.metric === metric);
export const kpisByCategory = (category: KpiDefinition['category']) => kpiDefinitions.filter((definition) => definition.category === category);
export const kpisByRole = (role: Role) => kpiDefinitions.filter((definition) => definition.applicableRoles.includes(role));
export const kpisByOperation = (operation: KpiOperation) => kpiDefinitions.filter((definition) => definition.applicableOperations.includes(operation));
export const kpisByScope = (scope: DataScope) => kpiDefinitions.filter((definition) => definition.scope === scope);
export const rulesForKpi = (kpiId: string) => kpiRules.filter((rule) => rule.kpiId === kpiId);
export const activeRuleVersions = () => kpiRuleVersions.filter((version) => version.status === 'ACTIVE');

export function rulesEffectiveDuring(start: string, end: string): KpiRule[] {
  const startAt = Date.parse(start); const endAt = Date.parse(end);
  return kpiRules.filter((rule) => { const from = Date.parse(rule.effectiveFrom); const until = rule.effectiveTo ? Date.parse(rule.effectiveTo) : Number.POSITIVE_INFINITY; return !Number.isNaN(startAt) && !Number.isNaN(endAt) && from <= endAt && until >= startAt; });
}

export function validateKpiConfiguration(definition: KpiDefinition, rule: KpiRule): string[] {
  const errors: string[] = []; const metric = kpiMetricByCode(definition.metric);
  if (!definition.name.trim() || !definition.code.trim()) errors.push('KPI name and code are required.');
  if (!metric) errors.push('KPI metric must exist in the metric catalog.');
  if (rule.kpiId !== definition.id || rule.metric !== definition.metric) errors.push('Rule must reference the KPI definition and its metric.');
  if (!Number.isFinite(rule.target.value) || rule.target.value < 0) errors.push('Target value must be a non-negative number.');
  if (metric && rule.target.unit !== metric.unit) errors.push(`Target unit must be ${metric.unit}.`);
  if (!rule.measurementPeriod || !KPI_PERIODS.includes(rule.measurementPeriod)) errors.push('Measurement period is required.');
  if (!rule.applicableRoles.length || rule.applicableRoles.some((role) => !['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'EMPLOYEE'].includes(role))) errors.push('Applicable roles must use the V1 role vocabulary.');
  if (!rule.applicableOperations.length || rule.applicableOperations.some((operation) => !KPI_OPERATIONS.includes(operation))) errors.push('Applicable operations must use the KPI operation vocabulary.');
  if (!['OWN', 'TEAM', 'DEPARTMENT', 'LOCATION', 'ORGANIZATION', 'CUSTOM'].includes(rule.scope)) errors.push('Scope must use the V1 scope vocabulary.');
  if (metric && (!metric.supportedOperations.some((operation) => rule.applicableOperations.includes(operation)) || !metric.supportedRoles.some((role) => rule.applicableRoles.includes(role)))) errors.push('Metric does not support the selected role or operation.');
  if (metric && !kpiDirectionsForMetric(rule.metric).includes(rule.direction as never)) errors.push('Direction is not compatible with the selected metric.');
  if (rule.threshold?.belowTarget !== undefined && rule.threshold?.aboveTarget !== undefined && rule.threshold.belowTarget > rule.threshold.aboveTarget) errors.push('Threshold values must be ordered.');
  if (rule.effectiveTo && Date.parse(rule.effectiveTo) < Date.parse(rule.effectiveFrom)) errors.push('Effective end date must not precede the start date.');
  return errors;
}

export function isMetricUnitCompatible(metric: KpiMetricCode, unit: KpiUnit): boolean {
  return kpiMetricByCode(metric)?.unit === unit;
}

export const KPI_DOMAIN_VOCABULARY = { metrics: KPI_METRIC_CODES, sources: KPI_SOURCE_TYPES, categories: KPI_CATEGORIES, operations: KPI_OPERATIONS, units: KPI_UNITS, directions: KPI_DIRECTIONS, periods: KPI_PERIODS, statuses: KPI_CONFIGURATION_STATUSES } as const;
