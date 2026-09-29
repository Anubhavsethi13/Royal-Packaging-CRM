// Runtime-validated client for the backend's read-only KPI configuration
// (GET /kpi/definitions, GET /kpi/definitions/:id over kpi_definitions + kpi_targets).
// The backend stores definitions and targets only; rules, rule versions, roles,
// operations, scopes, directions and periods exist only in the preview store, so
// they are not mapped here.
import { z } from 'zod';
import { apiRequest } from '../api/client';
import { parseContract } from '../api/contract-validation';
import { apiPageMetaSchema } from '../api/contracts';

export const KPI_DEFINITION_STATUSES = ['ACTIVE', 'SCHEDULED', 'EXPIRED', 'INACTIVE'] as const;
export type KpiDefinitionStatus = (typeof KPI_DEFINITION_STATUSES)[number];

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/, { message: 'must be a decimal number' });

const targetSchema = z.object({
  id: z.string().min(1),
  target_value: decimalString,
  warning_threshold: decimalString.nullable(),
  critical_threshold: decimalString.nullable(),
  effective_from: z.string().min(1),
  effective_to: z.string().nullable(),
  warehouse: z.object({ id: z.string(), code: z.string(), name: z.string() }).nullable(),
  is_current: z.boolean(),
});

export const kpiDefinitionConfigSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  pillar: z.string().nullable(),
  description: z.string().nullable(),
  unit: z.string().nullable(),
  formula_reference: z.string().nullable(),
  active: z.boolean(),
  effective_from: z.string().nullable(),
  effective_to: z.string().nullable(),
  status: z.enum(KPI_DEFINITION_STATUSES),
  current_targets: z.array(targetSchema),
  target_count: z.number().int().nonnegative(),
  updated_at: z.string(),
  version: z.string(),
});

export const kpiDefinitionListEnvelopeSchema = z.object({ data: z.array(kpiDefinitionConfigSchema), meta: apiPageMetaSchema });
export const kpiDefinitionDetailEnvelopeSchema = z.object({ data: kpiDefinitionConfigSchema.extend({ targets: z.array(targetSchema) }) });

export interface KpiTargetView {
  id: string;
  targetValue: string;
  warningThreshold: string | null;
  criticalThreshold: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  warehouse: { id: string; code: string; name: string } | null;
  isCurrent: boolean;
}

export interface KpiDefinitionView {
  id: string;
  code: string;
  name: string;
  pillar: string | null;
  description: string | null;
  unit: string | null;
  formulaReference: string | null;
  active: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: KpiDefinitionStatus;
  currentTargets: KpiTargetView[];
  targetCount: number;
  updatedAt: string;
  version: string;
}

export interface KpiDefinitionDetailView extends KpiDefinitionView {
  targets: KpiTargetView[];
}

export interface KpiDefinitionPage {
  items: KpiDefinitionView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface KpiDefinitionQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: KpiDefinitionStatus;
}

function mapTarget(dto: z.infer<typeof targetSchema>): KpiTargetView {
  return { id: dto.id, targetValue: dto.target_value, warningThreshold: dto.warning_threshold, criticalThreshold: dto.critical_threshold, effectiveFrom: dto.effective_from, effectiveTo: dto.effective_to, warehouse: dto.warehouse, isCurrent: dto.is_current };
}

export function mapKpiDefinition(dto: z.infer<typeof kpiDefinitionConfigSchema>): KpiDefinitionView {
  return {
    id: dto.id, code: dto.code, name: dto.name, pillar: dto.pillar, description: dto.description, unit: dto.unit, formulaReference: dto.formula_reference,
    active: dto.active, effectiveFrom: dto.effective_from, effectiveTo: dto.effective_to, status: dto.status,
    currentTargets: dto.current_targets.map(mapTarget), targetCount: dto.target_count, updatedAt: dto.updated_at, version: dto.version,
  };
}

type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;

export async function fetchKpiDefinitions(query: KpiDefinitionQuery, request: RequestFn = apiRequest): Promise<KpiDefinitionPage> {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.status) params.set('status', query.status);
  const envelope = parseContract(kpiDefinitionListEnvelopeSchema, await request<unknown>(`/kpi/definitions?${params.toString()}`), 'KPI configuration');
  return { items: envelope.data.map(mapKpiDefinition), page: envelope.meta.page, pageSize: envelope.meta.pageSize, total: envelope.meta.total, totalPages: envelope.meta.totalPages };
}

export async function fetchKpiDefinition(id: string, request: RequestFn = apiRequest): Promise<KpiDefinitionDetailView> {
  const envelope = parseContract(kpiDefinitionDetailEnvelopeSchema, await request<unknown>(`/kpi/definitions/${encodeURIComponent(id)}`), 'KPI definition');
  return { ...mapKpiDefinition(envelope.data), targets: envelope.data.targets.map(mapTarget) };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function formatKpiValue(value: string | null, unit: string | null): string {
  if (value === null) return '—';
  return unit ? `${value} ${unit}` : value;
}

export function formatEffectiveRange(from: string | null, to: string | null): string {
  const label = (value: string | null, open: string) => (value ? new Date(value).toLocaleDateString() : open);
  return `${label(from, 'Always')} – ${label(to, 'open ended')}`;
}

export function targetScopeLabel(target: Pick<KpiTargetView, 'warehouse'>): string {
  return target.warehouse ? `${target.warehouse.name} (${target.warehouse.code})` : 'All warehouses';
}

export function statusTone(status: KpiDefinitionStatus): 'success' | 'info' | 'neutral' | 'warning' {
  return status === 'ACTIVE' ? 'success' : status === 'SCHEDULED' ? 'info' : status === 'EXPIRED' ? 'warning' : 'neutral';
}
