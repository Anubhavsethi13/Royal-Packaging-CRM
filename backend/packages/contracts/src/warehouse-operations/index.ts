import { z } from "zod";
import { taskStatusSchema } from "../warehouse/index.js";

/**
 * Read-only warehouse operations projection over the existing `tasks`,
 * `task_assignments`, `task_events`, `depots`, `locations`,
 * `inventory_items` and `orders` tables. It is not a second task model:
 * every value is read from those tables, and task lifecycle writes stay on
 * the existing `/tasks/*` routes.
 */

// ---------------------------------------------------------------------------
// Operation classification
// ---------------------------------------------------------------------------

export const WAREHOUSE_OPERATION_TYPES = ["LOADING", "UNLOADING", "PUTAWAY", "PICKING", "PACKING", "OTHER"] as const;
export type WarehouseOperationType = (typeof WAREHOUSE_OPERATION_TYPES)[number];

/**
 * `tasks.task_type` is free text. These are the only values mapped to an
 * operation (case-insensitive); anything else, including NULL, is OTHER so a
 * task is never mislabelled. PROVISIONAL: the canonical list is a business
 * decision (see Docs/integration/supervisor-api-integration-diagnostic.md).
 */
export const TASK_TYPE_OPERATION_SYNONYMS: Readonly<Record<Exclude<WarehouseOperationType, "OTHER">, readonly string[]>> = {
  LOADING: ["LOADING", "LOAD", "DISPATCH"],
  UNLOADING: ["UNLOADING", "UNLOAD", "RECEIVING", "RECEIVE"],
  PUTAWAY: ["PUTAWAY", "STORAGE"],
  PICKING: ["PICKING", "PICK"],
  PACKING: ["PACKING", "PACK", "WRAPPING", "WRAP"]
};

export const ALL_MAPPED_TASK_TYPES: readonly string[] = Object.values(TASK_TYPE_OPERATION_SYNONYMS).flat();

export function classifyTaskType(taskType: string | null | undefined): WarehouseOperationType {
  const normalized = taskType?.trim().toUpperCase();
  if (!normalized) {
    return "OTHER";
  }
  for (const [operation, synonyms] of Object.entries(TASK_TYPE_OPERATION_SYNONYMS)) {
    if (synonyms.includes(normalized)) {
      return operation as WarehouseOperationType;
    }
  }
  return "OTHER";
}

/** Display-only code derived from the task id (tasks have no code column). */
export function taskDisplayCode(taskId: string): string {
  return `TSK-${taskId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

/** Task events that drive the timing calculation (start/pause/resume/end). */
export const TIMING_EVENT_TYPES = ["TASK_STARTED", "TASK_PAUSED", "TASK_RESUMED", "TASK_COMPLETED", "TASK_CANCELLED"] as const;

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export const listWarehouseOperationsFilterSchema = z.object({
  status: taskStatusSchema.optional(),
  /** One value or a comma-separated list, e.g. "LOADING,UNLOADING". */
  operation_type: z
    .string()
    .transform((value) => [...new Set(value.split(",").map((part) => part.trim().toUpperCase()).filter(Boolean))])
    .pipe(z.array(z.enum(WAREHOUSE_OPERATION_TYPES, { message: `operation_type must be one of ${WAREHOUSE_OPERATION_TYPES.join(", ")}` })).min(1, { message: "operation_type cannot be empty" }))
    .optional(),
  warehouse_code: z.string().trim().min(1, { message: "warehouse_code cannot be empty" }).optional(),
  employee_id: z.string().uuid({ message: "employee_id must be a valid UUID" }).optional(),
  search: z.string().trim().min(1).max(100, { message: "search must be at most 100 characters" }).optional()
});
export type ListWarehouseOperationsFilter = z.infer<typeof listWarehouseOperationsFilterSchema>;

export const listLocationsFilterSchema = z.object({
  warehouse_code: z.string().trim().min(1, { message: "warehouse_code cannot be empty" }).optional(),
  active: z.enum(["true", "false"], { message: "active must be true or false" }).transform((value) => value === "true").optional(),
  search: z.string().trim().min(1).max(100, { message: "search must be at most 100 characters" }).optional()
});
export type ListLocationsFilter = z.infer<typeof listLocationsFilterSchema>;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface WarehouseRefDTO {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface OperationAssigneeDTO {
  readonly employee_id: string;
  readonly employee_code: string;
  readonly name: string | null;
}

export interface OperationTimingEventDTO {
  readonly id: string;
  readonly event_type: string;
  readonly event_at: Date;
}

/**
 * SLA targets are not defined anywhere in the schema, so the projection
 * reports them as absent instead of inventing a target.
 */
export interface OperationSlaDTO {
  readonly target_seconds: null;
  readonly status: "NOT_DEFINED";
}

export interface WarehouseOperationDTO {
  readonly id: string;
  readonly task_code: string;
  readonly task_type: string | null;
  readonly operation_type: WarehouseOperationType;
  readonly status: string;
  readonly warehouse: WarehouseRefDTO | null;
  readonly source_location: WarehouseRefDTO | null;
  readonly destination_location: WarehouseRefDTO | null;
  readonly inventory_item: { readonly id: string; readonly product_code: string; readonly name: string | null } | null;
  readonly order: { readonly id: string; readonly order_code: string; readonly priority: string } | null;
  readonly assignees: readonly OperationAssigneeDTO[];
  readonly planned_box_quantity: number | null;
  readonly completed_box_quantity: number | null;
  readonly started_at: Date | null;
  readonly paused_at: Date | null;
  readonly completed_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly timing_events: readonly OperationTimingEventDTO[];
  readonly sla: OperationSlaDTO;
}

export interface OperationActivityDTO {
  readonly id: string;
  readonly event_type: string;
  readonly event_at: Date;
  readonly actor: string | null;
}

export interface WarehouseOperationDetailDTO extends WarehouseOperationDTO {
  readonly activity: readonly OperationActivityDTO[];
}

export interface LocationDTO {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly active: boolean;
  readonly warehouse: WarehouseRefDTO & { readonly active: boolean };
  readonly parent: WarehouseRefDTO | null;
  /** SUM(inventory_balances.box_quantity) at this location. */
  readonly box_on_hand: number;
}
