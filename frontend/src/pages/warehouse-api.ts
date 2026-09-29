// Runtime-validated contract and mapping for the backend warehouse operations read model
// (GET /warehouse/operations, GET /warehouse/operations/:id) and locations (GET /locations).
// The backend projection is mapped onto the existing TaskRecord shape so the warehouse pages keep
// their existing projection logic (toWarehouseOperation / filterWarehouseOperations).
import { z } from 'zod';
import { apiPageMetaSchema } from '../api/contracts';
import { ContractValidationError, parseContract } from '../api/contract-validation';
import { TASK_ACTIVITY_EVENTS, type TaskActivityEvent, type TaskRecord, type TaskTimerEvent } from '../types/domain';
import type { TaskStatusV1 } from '../types/v1';
import { calculateTimerDurations, formatDuration } from './task-workflow';

const refSchema = z.object({ id: z.string().min(1), code: z.string(), name: z.string() });

export const BACKEND_TASK_STATUSES = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;
export const BACKEND_OPERATION_TYPES = ['LOADING', 'UNLOADING', 'PUTAWAY', 'PICKING', 'PACKING', 'OTHER'] as const;

export const warehouseOperationDtoSchema = z.object({
  id: z.string().min(1),
  task_code: z.string().min(1),
  task_type: z.string().nullable(),
  operation_type: z.enum(BACKEND_OPERATION_TYPES),
  status: z.enum(BACKEND_TASK_STATUSES),
  warehouse: refSchema.nullable(),
  source_location: refSchema.nullable(),
  destination_location: refSchema.nullable(),
  inventory_item: z.object({ id: z.string(), product_code: z.string(), name: z.string().nullable() }).nullable(),
  order: z.object({ id: z.string(), order_code: z.string(), priority: z.string() }).nullable(),
  assignees: z.array(z.object({ employee_id: z.string().min(1), employee_code: z.string(), name: z.string().nullable() })),
  planned_box_quantity: z.number().int().nonnegative().nullable(),
  completed_box_quantity: z.number().int().nonnegative().nullable(),
  started_at: z.string().nullable(),
  paused_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  timing_events: z.array(z.object({ id: z.string(), event_type: z.string(), event_at: z.string() })),
  sla: z.object({ target_seconds: z.null(), status: z.literal('NOT_DEFINED') }),
});
export type WarehouseOperationDto = z.infer<typeof warehouseOperationDtoSchema>;

export const warehouseOperationDetailDtoSchema = warehouseOperationDtoSchema.extend({
  activity: z.array(z.object({ id: z.string(), event_type: z.string(), event_at: z.string(), actor: z.string().nullable() })),
});
export type WarehouseOperationDetailDto = z.infer<typeof warehouseOperationDetailDtoSchema>;

export const warehouseOperationListEnvelopeSchema = z.object({ data: z.array(warehouseOperationDtoSchema), meta: apiPageMetaSchema });
export const warehouseOperationDetailEnvelopeSchema = z.object({ data: warehouseOperationDetailDtoSchema });

export const locationDtoSchema = z.object({
  id: z.string().min(1),
  code: z.string(),
  name: z.string(),
  active: z.boolean(),
  warehouse: refSchema.extend({ active: z.boolean() }),
  parent: refSchema.nullable(),
  box_on_hand: z.number().nonnegative(),
});
export const locationListEnvelopeSchema = z.object({ data: z.array(locationDtoSchema), meta: apiPageMetaSchema });

// Shared with the other API-backed screens.
export { ContractValidationError, parseContract };

// ---------------------------------------------------------------------------
// Mapping onto the existing frontend TaskRecord
// ---------------------------------------------------------------------------

const typeByOperation: Record<WarehouseOperationDto['operation_type'], TaskRecord['type']> = {
  LOADING: 'Loading', UNLOADING: 'Unloading', PUTAWAY: 'Putaway', PICKING: 'Picking', PACKING: 'Wrapping', OTHER: 'Other',
};

const legacyStatus: Record<WarehouseOperationDto['status'], TaskRecord['status']> = {
  PENDING: 'Queued', ASSIGNED: 'Queued', IN_PROGRESS: 'In progress', PAUSED: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};

const timerEventByType: Record<string, TaskTimerEvent['eventType']> = {
  TASK_STARTED: 'START', TASK_PAUSED: 'PAUSE', TASK_RESUMED: 'RESUME', TASK_COMPLETED: 'END', TASK_CANCELLED: 'END',
};

const priorityByOrder: Record<string, TaskRecord['priority']> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };

export function toTimerEvents(dto: Pick<WarehouseOperationDto, 'timing_events'>): TaskTimerEvent[] {
  return dto.timing_events.flatMap((event) => {
    const eventType = timerEventByType[event.event_type];
    return eventType ? [{ id: event.id, eventType, timestamp: event.event_at }] : [];
  });
}

/**
 * Backend status -> V1 lifecycle state. Only states the backend really has are produced:
 * IN_PROGRESS is RESUMED when the latest timing event is a resume, otherwise STARTED.
 * PENDING (not yet assigned) has no V1 equivalent and is left undefined (shown as UNASSIGNED).
 */
export function toV1Status(dto: Pick<WarehouseOperationDto, 'status' | 'timing_events'>): TaskStatusV1 | undefined {
  switch (dto.status) {
    case 'PENDING': return undefined;
    case 'ASSIGNED': return 'ASSIGNED';
    case 'PAUSED': return 'PAUSED';
    case 'COMPLETED': return 'COMPLETED';
    case 'CANCELLED': return 'CANCELLED';
    case 'IN_PROGRESS': {
      const last = [...dto.timing_events].filter((event) => event.event_type === 'TASK_STARTED' || event.event_type === 'TASK_RESUMED').at(-1);
      return last?.event_type === 'TASK_RESUMED' ? 'RESUMED' : 'STARTED';
    }
  }
}

function toActivity(dto: WarehouseOperationDetailDto): TaskActivityEvent[] {
  const known = new Set<string>(TASK_ACTIVITY_EVENTS);
  return dto.activity.flatMap((event) => known.has(event.event_type)
    ? [{ id: event.id, eventType: event.event_type as TaskActivityEvent['eventType'], timestamp: event.event_at, actor: event.actor ?? 'System', taskId: dto.id, details: {} }]
    : []);
}

export function mapWarehouseOperationToTask(dto: WarehouseOperationDto | WarehouseOperationDetailDto): TaskRecord {
  const warehouse = dto.warehouse ? `${dto.warehouse.name} · ${dto.warehouse.code}` : 'No warehouse';
  const timerEvents = toTimerEvents(dto);
  const names = dto.assignees.map((assignee) => assignee.name?.trim() || assignee.employee_code);
  return {
    id: dto.id,
    taskCode: dto.task_code,
    type: typeByOperation[dto.operation_type],
    // Tasks carry no priority; the linked order's priority is used when there is one.
    priority: (dto.order && priorityByOrder[dto.order.priority.toLowerCase()]) || 'Normal',
    source: dto.source_location ? `${warehouse} · ${dto.source_location.code}` : warehouse,
    destination: dto.destination_location ? `${dto.destination_location.code} · ${dto.destination_location.name}` : '—',
    material: dto.inventory_item ? (dto.inventory_item.name ?? dto.inventory_item.product_code) : '—',
    barcode: dto.inventory_item?.product_code ?? '',
    quantity: dto.planned_box_quantity === null ? '—' : `${dto.planned_box_quantity} BOX`,
    timer: formatDuration(calculateTimerDurations(timerEvents).totalSeconds),
    employee: names.length ? names.join(', ') : 'Unassigned',
    employeeId: dto.assignees[0]?.employee_id,
    status: legacyStatus[dto.status],
    v1Status: toV1Status(dto),
    createdAt: dto.created_at,
    startedAt: dto.started_at ?? undefined,
    pausedAt: dto.paused_at ?? undefined,
    completedAt: dto.completed_at ?? undefined,
    boxesPlanned: dto.planned_box_quantity ?? undefined,
    boxesCompleted: dto.completed_box_quantity ?? undefined,
    timerEvents,
    activity: 'activity' in dto ? toActivity(dto) : undefined,
    sla: 'Not defined',
  };
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export interface LocationRecord {
  id: string;
  code: string;
  name: string;
  active: boolean;
  warehouse: { id: string; code: string; name: string; active: boolean };
  parent: { id: string; code: string; name: string } | null;
  boxOnHand: number;
}

export function mapLocationDto(dto: z.infer<typeof locationDtoSchema>): LocationRecord {
  return { id: dto.id, code: dto.code, name: dto.name, active: dto.active, warehouse: dto.warehouse, parent: dto.parent, boxOnHand: dto.box_on_hand };
}
