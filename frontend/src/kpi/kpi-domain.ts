import type { DataScope, Role } from '../types/v1';

export const KPI_METRIC_CODES = ['BOXES_HANDLED', 'TASKS_COMPLETED', 'TIME_TAKEN', 'SLA_COMPLIANCE'] as const;
export type KpiMetricCode = (typeof KPI_METRIC_CODES)[number];

export const KPI_SOURCE_TYPES = ['TASK', 'WAREHOUSE_OPERATION', 'LOADING_OPERATION', 'UNLOADING_OPERATION'] as const;
export type KpiSourceType = (typeof KPI_SOURCE_TYPES)[number];

export const KPI_CATEGORIES = ['PRODUCTIVITY', 'QUALITY', 'TIMELINESS'] as const;
export type KpiCategory = (typeof KPI_CATEGORIES)[number];

export const KPI_UNITS = ['BOX', 'COUNT', 'TASK', 'DURATION', 'PERCENTAGE'] as const;
export type KpiUnit = (typeof KPI_UNITS)[number];

export const KPI_OPERATIONS = ['TASK', 'WAREHOUSE', 'LOADING', 'UNLOADING'] as const;
export type KpiOperation = (typeof KPI_OPERATIONS)[number];

export const KPI_DIRECTIONS = ['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'TARGET_MATCH'] as const;
export type KpiComparisonDirection = (typeof KPI_DIRECTIONS)[number];

export const KPI_PERIODS = ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'] as const;
export type KpiMeasurementPeriod = (typeof KPI_PERIODS)[number];

export const KPI_CONFIGURATION_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export type KpiConfigurationStatus = (typeof KPI_CONFIGURATION_STATUSES)[number];

export interface KpiMetricDefinition {
  id: string;
  code: KpiMetricCode;
  displayName: string;
  description: string;
  category: KpiCategory;
  sourceTypes: KpiSourceType[];
  unit: KpiUnit;
  supportedOperations: KpiOperation[];
  supportedRoles: Role[];
  aggregationType: 'SUM' | 'COUNT' | 'DURATION' | 'PERCENTAGE';
  enabled: boolean;
}

export interface KpiThreshold {
  belowTarget?: number;
  aboveTarget?: number;
}

export interface KpiTarget {
  value: number;
  unit: KpiUnit;
  minimum?: number;
  maximum?: number;
}

export interface KpiDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  category: KpiCategory;
  metric: KpiMetricCode;
  status: KpiConfigurationStatus;
  applicableRoles: Role[];
  applicableOperations: KpiOperation[];
  scope: DataScope;
  ruleVersionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface KpiRule {
  id: string;
  kpiId: string;
  metric: KpiMetricCode;
  target: KpiTarget;
  threshold?: KpiThreshold;
  direction: KpiComparisonDirection;
  measurementPeriod: KpiMeasurementPeriod;
  applicableRoles: Role[];
  applicableOperations: KpiOperation[];
  scope: DataScope;
  status: KpiConfigurationStatus;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface KpiRuleVersion {
  id: string;
  ruleId: string;
  version: number;
  status: KpiConfigurationStatus;
  effectiveFrom: string;
  effectiveTo?: string;
  configurationSnapshot: Pick<KpiRule, 'metric' | 'target' | 'threshold' | 'direction' | 'measurementPeriod' | 'applicableRoles' | 'applicableOperations' | 'scope'>;
  createdAt: string;
  createdBy?: string;
}

export interface KpiSourceRecordReference {
  sourceRecordId: string;
  sourceType: KpiSourceType;
  taskId?: string;
  operationType?: KpiOperation;
  employeeId?: string;
  employeeName?: string;
  timestamp: string;
  rawMetricValue: number;
  quantity?: { value: number; unit: 'BOX' };
  durationSeconds?: number;
  slaStatus?: string;
  slaTarget?: { value: number; unit: 'PERCENTAGE' };
  warehouse?: string;
  location?: string;
}
