import { kpiDefinitions, kpiMetricByCode, kpiRuleVersions, kpiRules, validateKpiConfiguration } from './kpi-data';
import type { KpiDefinition, KpiRule, KpiRuleVersion, KpiTarget, KpiThreshold, KpiMetricCode, KpiCategory, KpiComparisonDirection, KpiMeasurementPeriod, KpiOperation, KpiConfigurationStatus } from './kpi-domain';
import type { DataScope, Role } from '../types/v1';

export interface KpiConfigurationRecord {
  definition: KpiDefinition;
  rule: KpiRule;
  versions: KpiRuleVersion[];
  metric: NonNullable<ReturnType<typeof kpiMetricByCode>>;
}

export interface KpiConfigurationInput {
  name: string;
  code: string;
  description: string;
  category: KpiCategory;
  metric: KpiMetricCode;
  operation: KpiOperation;
  role: Role;
  scope: DataScope;
  measurementPeriod: KpiMeasurementPeriod;
  targetValue: number;
  direction: KpiComparisonDirection;
  thresholdBelow?: number;
  thresholdAbove?: number;
  status: KpiConfigurationStatus;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface KpiConfigurationFilters {
  search?: string;
  category?: KpiCategory;
  metric?: KpiMetricCode;
  operation?: KpiOperation;
  role?: Role;
  scope?: DataScope;
  status?: KpiConfigurationStatus;
  measurementPeriod?: KpiMeasurementPeriod;
}

export type KpiGovernanceAction = 'ACTIVATE' | 'DEACTIVATE' | 'ARCHIVE';

export interface KpiGovernanceResult {
  record?: KpiConfigurationRecord;
  errors: string[];
}

let definitions = kpiDefinitions.map((definition) => structuredClone(definition));
let rules = kpiRules.map((rule) => structuredClone(rule));
let versions = kpiRuleVersions.map((version) => structuredClone(version));
const listeners = new Set<() => void>();

function notify() { listeners.forEach((listener) => listener()); }
function currentRecord(definition: KpiDefinition): KpiConfigurationRecord | undefined {
  const rule = rules.find((candidate) => candidate.kpiId === definition.id);
  const metric = kpiMetricByCode(definition.metric);
  if (!rule || !metric) return undefined;
  return { definition: structuredClone(definition), rule: structuredClone(rule), versions: structuredClone(versions.filter((version) => version.ruleId === rule.id)), metric: structuredClone(metric) };
}

export function subscribeKpiConfigurations(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export async function listKpiConfigurations(): Promise<KpiConfigurationRecord[]> { return definitions.flatMap((definition) => { const record = currentRecord(definition); return record ? [record] : []; }); }
export async function getKpiConfiguration(id: string): Promise<KpiConfigurationRecord | undefined> { const definition = definitions.find((candidate) => candidate.id === id); return definition ? currentRecord(definition) : undefined; }

export function filterKpiConfigurations(records: KpiConfigurationRecord[], filters: KpiConfigurationFilters = {}): KpiConfigurationRecord[] {
  const search = filters.search?.trim().toLowerCase();
  return records.filter((record) => {
    const { definition, rule } = record;
    const haystack = `${definition.name} ${definition.code} ${definition.metric} ${definition.applicableOperations.join(' ')}`.toLowerCase();
    return (!search || haystack.includes(search))
      && (!filters.category || definition.category === filters.category)
      && (!filters.metric || definition.metric === filters.metric)
      && (!filters.operation || definition.applicableOperations.includes(filters.operation))
      && (!filters.role || definition.applicableRoles.includes(filters.role))
      && (!filters.scope || definition.scope === filters.scope)
      && (!filters.status || definition.status === filters.status)
      && (!filters.measurementPeriod || rule.measurementPeriod === filters.measurementPeriod);
  });
}

function toRule(id: string, input: KpiConfigurationInput, kpiId: string): KpiRule {
  return { id, kpiId, metric: input.metric, target: { value: input.targetValue, unit: kpiMetricByCode(input.metric)!.unit } satisfies KpiTarget, threshold: input.thresholdBelow === undefined && input.thresholdAbove === undefined ? undefined : { belowTarget: input.thresholdBelow, aboveTarget: input.thresholdAbove } satisfies KpiThreshold, direction: input.direction, measurementPeriod: input.measurementPeriod, applicableRoles: [input.role], applicableOperations: [input.operation], scope: input.scope, status: input.status, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, };
}

function inputFromRecord(record: KpiConfigurationRecord, status = record.definition.status): KpiConfigurationInput {
  return {
    name: record.definition.name, code: record.definition.code, description: record.definition.description,
    category: record.definition.category, metric: record.rule.metric, operation: record.rule.applicableOperations[0],
    role: record.rule.applicableRoles[0], scope: record.rule.scope, measurementPeriod: record.rule.measurementPeriod,
    targetValue: record.rule.target.value, direction: record.rule.direction,
    thresholdBelow: record.rule.threshold?.belowTarget, thresholdAbove: record.rule.threshold?.aboveTarget,
    status, effectiveFrom: record.rule.effectiveFrom.slice(0, 10), effectiveTo: record.rule.effectiveTo?.slice(0, 10) ?? '',
  };
}

export async function createKpiConfiguration(input: KpiConfigurationInput): Promise<KpiConfigurationRecord> {
  const id = `kpi-config-${Date.now()}`; const ruleId = `${id}-rule`; const versionId = `${id}-version-1`; const definition: KpiDefinition = { id, code: input.code.trim(), name: input.name.trim(), description: input.description.trim(), category: input.category, metric: input.metric, status: input.status, applicableRoles: [input.role], applicableOperations: [input.operation], scope: input.scope, ruleVersionIds: [versionId], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; const rule = toRule(ruleId, input, id); const version: KpiRuleVersion = { id: versionId, ruleId, version: 1, status: input.status, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, configurationSnapshot: { metric: rule.metric, target: rule.target, threshold: rule.threshold, direction: rule.direction, measurementPeriod: rule.measurementPeriod, applicableRoles: rule.applicableRoles, applicableOperations: rule.applicableOperations, scope: rule.scope }, createdAt: definition.createdAt, createdBy: 'frontend-demo' };
  definitions = [...definitions, definition]; rules = [...rules, rule]; versions = [...versions, version]; notify(); return currentRecord(definition)!;
}

export async function updateKpiConfiguration(id: string, input: KpiConfigurationInput): Promise<KpiConfigurationRecord | undefined> {
  const existing = definitions.find((definition) => definition.id === id); const oldRule = rules.find((rule) => rule.kpiId === id); if (!existing || !oldRule) return undefined;
  const nextVersion = Math.max(0, ...versions.filter((version) => version.ruleId === oldRule.id).map((version) => version.version)) + 1; const versionId = `${id}-version-${nextVersion}`; const rule = toRule(oldRule.id, input, id); const definition: KpiDefinition = { ...existing, code: input.code.trim(), name: input.name.trim(), description: input.description.trim(), category: input.category, metric: input.metric, status: input.status, applicableRoles: [input.role], applicableOperations: [input.operation], scope: input.scope, ruleVersionIds: [...existing.ruleVersionIds, versionId], updatedAt: new Date().toISOString() }; const version: KpiRuleVersion = { id: versionId, ruleId: oldRule.id, version: nextVersion, status: input.status, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, configurationSnapshot: { metric: rule.metric, target: rule.target, threshold: rule.threshold, direction: rule.direction, measurementPeriod: rule.measurementPeriod, applicableRoles: rule.applicableRoles, applicableOperations: rule.applicableOperations, scope: rule.scope }, createdAt: new Date().toISOString(), createdBy: 'frontend-demo' };
  definitions = definitions.map((candidate) => candidate.id === id ? definition : candidate); rules = rules.map((candidate) => candidate.id === oldRule.id ? rule : candidate); versions = [...versions.map((candidate) => candidate.ruleId === oldRule.id ? { ...candidate, status: 'ARCHIVED' as const } : candidate), version]; notify(); return currentRecord(definition);
}

export async function transitionKpiConfiguration(id: string, action: KpiGovernanceAction): Promise<KpiGovernanceResult> {
  const existing = await getKpiConfiguration(id);
  if (!existing) return { errors: ['The KPI configuration could not be found.'] };
  const status = action === 'ACTIVATE' ? 'ACTIVE' : action === 'DEACTIVATE' ? 'INACTIVE' : 'ARCHIVED';
  if (action === 'ACTIVATE') {
    const errors = validateKpiConfiguration(existing.definition, existing.rule);
    if (errors.length > 0) return { errors };
  }
  const record = await updateKpiConfiguration(id, inputFromRecord(existing, status));
  return record ? { record, errors: [] } : { errors: ['The KPI configuration could not be updated.'] };
}

export async function duplicateKpiConfiguration(id: string): Promise<KpiConfigurationRecord | undefined> {
  const existing = await getKpiConfiguration(id);
  if (!existing) return undefined;
  const baseCode = `${existing.definition.code}_COPY`;
  const usedCodes = new Set(definitions.map((definition) => definition.code.toLowerCase()));
  let code = baseCode;
  let suffix = 2;
  while (usedCodes.has(code.toLowerCase())) code = `${baseCode}_${suffix++}`;
  const baseName = `${existing.definition.name} copy`;
  const usedNames = new Set(definitions.map((definition) => definition.name.toLowerCase()));
  let name = baseName;
  suffix = 2;
  while (usedNames.has(name.toLowerCase())) name = `${baseName} ${suffix++}`;
  return createKpiConfiguration({ ...inputFromRecord(existing, 'DRAFT'), code, name, status: 'DRAFT' });
}

export function resetKpiConfigurationsForTests() { definitions = kpiDefinitions.map((definition) => structuredClone(definition)); rules = kpiRules.map((rule) => structuredClone(rule)); versions = kpiRuleVersions.map((version) => structuredClone(version)); notify(); }
