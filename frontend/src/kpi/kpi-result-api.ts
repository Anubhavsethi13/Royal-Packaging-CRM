// Runtime-validated contract for GET /kpi/results and GET /kpi/results/:id
// (results calculated on demand by the backend from completed tasks).
// Every response is validated and mapped onto the existing KpiResultReadModel;
// nothing is calculated here.
import { z } from 'zod';
import { parseContract } from '../api/contract-validation';
import type { ApiRepositoryConfig } from '../api/repositories';
import type { KpiResultReadModel } from './kpi-result-domain';
import type { KpiSourceRecordReference } from './kpi-domain';

const valueSchema = z.object({ value: z.number().finite(), unit: z.enum(['BOX', 'COUNT', 'DURATION', 'PERCENTAGE']) });

const referenceSchema = z.object({
  source_record_id: z.string().min(1),
  source_type: z.enum(['TASK', 'WAREHOUSE_OPERATION', 'LOADING_OPERATION', 'UNLOADING_OPERATION']),
  task_id: z.string().min(1),
  task_code: z.string().min(1),
  operation_type: z.enum(['TASK', 'WAREHOUSE', 'LOADING', 'UNLOADING']),
  employee_id: z.string().min(1),
  timestamp: z.string().min(1),
  raw_metric_value: z.number().finite().nullable(),
  quantity: z.object({ value: z.number().nonnegative(), unit: z.literal('BOX') }),
  duration_seconds: z.number().int().nonnegative().nullable(),
  warehouse: z.string().nullable(),
  participants: z.number().int().positive(),
});

export const kpiResultDtoSchema = z.object({
  id: z.string().min(1),
  employee: z.object({ id: z.string().min(1), code: z.string(), name: z.string().nullable() }),
  kpi: z.object({ id: z.string().min(1), code: z.string().min(1), name: z.string().min(1) }),
  rule_version_id: z.string().min(1),
  metric: z.enum(['BOXES_HANDLED', 'TASKS_COMPLETED', 'TIME_TAKEN', 'AVERAGE_BOXES_PER_TASK', 'SLA_COMPLIANCE']),
  category: z.enum(['PRODUCTIVITY', 'QUALITY', 'TIMELINESS']),
  operation: z.enum(['TASK', 'WAREHOUSE', 'LOADING', 'UNLOADING']),
  scope: z.literal('OWN'),
  period: z.object({
    kind: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    label: z.string(),
    timezone: z.string().min(1),
  }),
  actual: valueSchema.nullable(),
  target: valueSchema.extend({ target_id: z.string().min(1) }).nullable(),
  unit: z.enum(['BOX', 'COUNT', 'DURATION', 'PERCENTAGE']),
  direction: z.enum(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'TARGET_MATCH']),
  status: z.enum(['PENDING', 'AVAILABLE', 'NOT_AVAILABLE']),
  not_available_reason: z.string().nullable(),
  source: z.literal('TASK'),
  source_count: z.number().int().nonnegative(),
  calculated_at: z.string().min(1),
  calculation_version: z.string().min(1),
}).superRefine((value, ctx) => {
  if (value.status === 'NOT_AVAILABLE' ? value.actual !== null : value.actual === null) ctx.addIssue({ code: 'custom', path: ['actual'], message: 'actual must be null exactly when status is NOT_AVAILABLE' });
  if (value.actual && value.actual.unit !== value.unit) ctx.addIssue({ code: 'custom', path: ['actual', 'unit'], message: 'actual unit must match the result unit' });
  if (value.target && value.target.unit !== value.unit) ctx.addIssue({ code: 'custom', path: ['target', 'unit'], message: 'target unit must match the result unit' });
  if (value.period.end < value.period.start) ctx.addIssue({ code: 'custom', path: ['period', 'end'], message: 'period end must not precede its start' });
});

const kpiResultDetailDtoSchema = z.intersection(kpiResultDtoSchema, z.object({ source_references: z.array(referenceSchema) }));
export const kpiResultDetailEnvelopeSchema = z.object({ data: kpiResultDetailDtoSchema });

type KpiResultDto = z.infer<typeof kpiResultDtoSchema>;

function mapReference(dto: z.infer<typeof referenceSchema>): KpiSourceRecordReference {
  return {
    sourceRecordId: dto.source_record_id,
    sourceType: dto.source_type,
    taskId: dto.task_id,
    taskCode: dto.task_code,
    operationType: dto.operation_type,
    employeeId: dto.employee_id,
    timestamp: dto.timestamp,
    rawMetricValue: dto.raw_metric_value ?? 0,
    quantity: dto.quantity,
    ...(dto.duration_seconds === null ? {} : { durationSeconds: dto.duration_seconds }),
    ...(dto.warehouse ? { warehouse: dto.warehouse } : {}),
    participants: dto.participants,
  };
}

export function mapKpiResultDto(dto: KpiResultDto, references: KpiSourceRecordReference[] = []): KpiResultReadModel {
  return {
    id: dto.id,
    resultId: dto.id,
    employeeId: dto.employee.id,
    employee: { id: dto.employee.id, name: dto.employee.name?.trim() || dto.employee.code, code: dto.employee.code },
    kpiId: dto.kpi.id,
    kpiName: dto.kpi.name,
    kpiCode: dto.kpi.code,
    ruleVersionId: dto.rule_version_id,
    metric: dto.metric,
    category: dto.category,
    operation: dto.operation,
    scope: dto.scope,
    period: { kind: dto.period.kind, start: dto.period.start, end: dto.period.end, displayLabel: dto.period.label, timezone: dto.period.timezone },
    ...(dto.target ? { target: { value: dto.target.value, unit: dto.target.unit } } : {}),
    ...(dto.actual ? { actual: dto.actual } : {}),
    unit: dto.unit,
    direction: dto.direction,
    status: dto.status,
    ...(dto.not_available_reason ? { notAvailableReason: dto.not_available_reason } : {}),
    sourceReferences: references,
    sourceCount: dto.source_count,
    calculatedAt: dto.calculated_at,
    calculationVersion: dto.calculation_version,
    isMock: false,
  };
}

/** List items (source references are only returned by the detail endpoint). */
export function decodeKpiResultItem(item: unknown): KpiResultReadModel {
  return mapKpiResultDto(parseContract(kpiResultDtoSchema, item, 'KPI result'));
}

export function decodeKpiResultDetail(payload: unknown): KpiResultReadModel {
  const dto = parseContract(kpiResultDetailEnvelopeSchema, payload, 'KPI result detail').data;
  return mapKpiResultDto(dto, dto.source_references.map(mapReference));
}

/** Repository configuration for API mode: the shared API repository with validated decoding. */
export const kpiResultsApiRepositoryConfig: ApiRepositoryConfig<KpiResultReadModel> = {
  resourcePath: '/kpi/results',
  decodeItem: decodeKpiResultItem,
  decodeDetail: decodeKpiResultDetail,
};
