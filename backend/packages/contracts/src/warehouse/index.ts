import { z } from "zod";
import type { InventoryMovementRecord } from "../inventory/index.js";
import type { QualityRecord, TaskPhotoRecord } from "../quality/index.js";

export const taskStatusSchema = z.enum([
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "CANCELLED"
]);

export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const createTaskRequestSchema = z.object({
  depot_id: z.string().uuid({ message: "depot_id must be a valid UUID" }).optional(),
  task_type: z.string().min(1, { message: "task_type must be non-empty" }).optional(),
  client_id: z.string().uuid({ message: "client_id must be a valid UUID" }).optional(),
  order_id: z.string().uuid({ message: "order_id must be a valid UUID" }).optional(),
  order_item_id: z.string().uuid({ message: "order_item_id must be a valid UUID" }).optional(),
  inventory_item_id: z.string().uuid({ message: "inventory_item_id must be a valid UUID" }).optional(),
  inventory_batch_id: z.string().uuid({ message: "inventory_batch_id must be a valid UUID" }).optional(),
  source_location_id: z.string().uuid({ message: "source_location_id must be a valid UUID" }).optional(),
  destination_location_id: z.string().uuid({ message: "destination_location_id must be a valid UUID" }).optional(),
  shift_id: z.string().uuid({ message: "shift_id must be a valid UUID" }).optional(),
  planned_box_quantity: z.union([
    z.bigint().nonnegative({ message: "planned_box_quantity must be non-negative" }),
    z.number().int().nonnegative({ message: "planned_box_quantity must be a non-negative integer" }),
    z.string().regex(/^\d+$/, { message: "planned_box_quantity must be a non-negative integer string" })
  ]).optional(),
  correlation_id: z.string().uuid({ message: "correlation_id must be a valid UUID" }).optional()
});

export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;

export const assignTaskRequestSchema = z.object({
  task_id: z.string().uuid({ message: "task_id must be a valid UUID" }),
  employee_id: z.string().uuid({ message: "employee_id must be a valid UUID" }),
  correlation_id: z.string().uuid({ message: "correlation_id must be a valid UUID" }).optional()
});

export type AssignTaskRequest = z.infer<typeof assignTaskRequestSchema>;

export const unassignTaskRequestSchema = z.object({
  task_id: z.string().uuid({ message: "task_id must be a valid UUID" }),
  employee_id: z.string().uuid({ message: "employee_id must be a valid UUID" }),
  correlation_id: z.string().uuid({ message: "correlation_id must be a valid UUID" }).optional()
});

export type UnassignTaskRequest = z.infer<typeof unassignTaskRequestSchema>;

export const completeTaskRequestSchema = z.object({
  task_id: z.string().uuid({ message: "task_id must be a valid UUID" }),
  completed_box_quantity: z.union([
    z.bigint().nonnegative({ message: "completed_box_quantity must be non-negative" }),
    z.number().int().nonnegative({ message: "completed_box_quantity must be a non-negative integer" }),
    z.string().regex(/^\d+$/, { message: "completed_box_quantity must be a non-negative integer string" })
  ]),
  correlation_id: z.string().uuid({ message: "correlation_id must be a valid UUID" }).optional()
});

export type CompleteTaskRequest = z.infer<typeof completeTaskRequestSchema>;

export const cancelTaskRequestSchema = z.object({
  task_id: z.string().uuid({ message: "task_id must be a valid UUID" }),
  reason: z.string().min(1, { message: "Cancellation reason is required" }),
  correlation_id: z.string().uuid({ message: "correlation_id must be a valid UUID" }).optional()
});

export type CancelTaskRequest = z.infer<typeof cancelTaskRequestSchema>;

export const reopenTaskRequestSchema = z.object({
  task_id: z.string().uuid({ message: "task_id must be a valid UUID" }),
  reason: z.string().min(1, { message: "Reopen reason is required" }),
  correlation_id: z.string().uuid({ message: "correlation_id must be a valid UUID" }).optional()
});

export type ReopenTaskRequest = z.infer<typeof reopenTaskRequestSchema>;

export const initializeTaskFromOrderRequestSchema = z.object({
  order_id: z.string().uuid({ message: "order_id must be a valid UUID" }),
  order_item_id: z.string().uuid({ message: "order_item_id must be a valid UUID" }).optional(),
  task_type: z.string().min(1, { message: "task_type must be non-empty" }).optional(),
  depot_id: z.string().uuid({ message: "depot_id must be a valid UUID" }).optional(),
  planned_box_quantity: z.union([
    z.bigint().nonnegative({ message: "planned_box_quantity must be non-negative" }),
    z.number().int().nonnegative({ message: "planned_box_quantity must be a non-negative integer" }),
    z.string().regex(/^\d+$/, { message: "planned_box_quantity must be a non-negative integer string" })
  ]).optional(),
  inventory_item_id: z.string().uuid({ message: "inventory_item_id must be a valid UUID" }).optional(),
  inventory_batch_id: z.string().uuid({ message: "inventory_batch_id must be a valid UUID" }).optional(),
  source_location_id: z.string().uuid({ message: "source_location_id must be a valid UUID" }).optional(),
  destination_location_id: z.string().uuid({ message: "destination_location_id must be a valid UUID" }).optional(),
  shift_id: z.string().uuid({ message: "shift_id must be a valid UUID" }).optional(),
  correlation_id: z.string().uuid({ message: "correlation_id must be a valid UUID" }).optional()
});

export type InitializeTaskFromOrderRequest = z.infer<typeof initializeTaskFromOrderRequestSchema>;

export const executeTaskMovementRequestSchema = z.object({
  task_id: z.string().uuid({ message: "task_id must be a valid UUID" }),
  inventory_batch_id: z.string().uuid({ message: "inventory_batch_id must be a valid UUID" }),
  source_location_id: z.string().uuid({ message: "source_location_id must be a valid UUID" }).nullable().optional(),
  destination_location_id: z.string().uuid({ message: "destination_location_id must be a valid UUID" }).nullable().optional(),
  box_quantity: z.union([
    z.bigint().positive({ message: "box_quantity must be greater than 0" }),
    z.number().int().positive({ message: "box_quantity must be a positive integer" }),
    z.string().regex(/^[1-9]\d*$/, { message: "box_quantity must be a positive integer" })
  ]),
  movement_type: z.string().min(1, { message: "movement_type must be non-empty" }).default("TASK_MOVEMENT"),
  idempotency_key: z.string().min(1).optional(),
  correlation_id: z.string().uuid({ message: "correlation_id must be a valid UUID" }).optional()
});

export type ExecuteTaskMovementRequest = z.input<typeof executeTaskMovementRequestSchema>;

export interface TaskRecord {
  id: string;
  depot_id: string | null;
  task_type: string | null;
  status: TaskStatus | string;
  client_id: string | null;
  order_id: string | null;
  order_item_id: string | null;
  inventory_item_id: string | null;
  inventory_batch_id: string | null;
  source_location_id: string | null;
  destination_location_id: string | null;
  shift_id: string | null;
  planned_box_quantity: bigint | null;
  completed_box_quantity: bigint | null;
  started_at: Date | null;
  paused_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: bigint;
}

export interface TaskAssignmentRecord {
  id: string;
  task_id: string;
  employee_id: string;
  assigned_at: Date;
  assigned_by_user_id: string;
  unassigned_at: Date | null;
  unassigned_by_user_id: string | null;
  version: bigint;
}

export interface TaskEventRecord {
  id: string;
  task_id: string;
  event_type: string;
  event_at: Date;
  actor_user_id: string | null;
  correlation_id: string | null;
  metadata: string | null;
  created_at: Date;
}

export interface TaskTransitionOptions {
  correlation_id?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface ClosedLoopTaskSummary {
  task: TaskRecord;
  order: {
    id: string;
    client_id: string;
    created_at: Date;
    updated_at: Date;
    version: bigint;
  } | null;
  order_item: {
    id: string;
    order_id: string;
    created_at: Date;
    updated_at: Date;
    version: bigint;
  } | null;
  assignments: TaskAssignmentRecord[];
  photos: TaskPhotoRecord[];
  movements: InventoryMovementRecord[];
  quality_records: QualityRecord[];
  events: TaskEventRecord[];
}

export type TaskErrorCode =
  | "TASK_NOT_FOUND"
  | "INVALID_TASK_STATE"
  | "UNSUPPORTED_TRANSITION"
  | "EMPLOYEE_NOT_FOUND"
  | "DUPLICATE_ACTIVE_ASSIGNMENT"
  | "ASSIGNMENT_NOT_FOUND"
  | "INVALID_QUANTITY"
  | "UNAUTHORIZED_ACTOR"
  | "QUALITY_GATE_FAILED"
  | "VALIDATION_FAILED";

export class TaskDomainError extends Error {
  public readonly code: TaskErrorCode;

  public constructor(code: TaskErrorCode, message: string) {
    super(message);
    this.name = "TaskDomainError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type OrchestrationErrorCode =
  | "TASK_NOT_FOUND"
  | "ORDER_NOT_FOUND"
  | "ORDER_ITEM_NOT_FOUND"
  | "INVALID_ORDER_LINKAGE"
  | "INVALID_TASK_STATE"
  | "UNAUTHORIZED_ACTOR"
  | "VALIDATION_FAILED"
  | "COORDINATION_FAILED";

export class OrchestrationDomainError extends Error {
  public readonly code: OrchestrationErrorCode;

  public constructor(code: OrchestrationErrorCode, message: string) {
    super(message);
    this.name = "OrchestrationDomainError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Warehouse compat: barcode scan, grid routing, task listing
// ---------------------------------------------------------------------------

export const scanBarcodeRequestSchema = z.object({
  barcode: z.string().trim().min(1, { message: "barcode is required" })
});
export type ScanBarcodeRequest = z.infer<typeof scanBarcodeRequestSchema>;

export interface ScanResultDTO {
  readonly matchType: "PRODUCT_CODE" | "BATCH_NUMBER" | "NOT_FOUND";
  readonly item: { readonly id: string; readonly product_code: string; readonly name: string | null } | null;
  readonly batch: { readonly id: string; readonly batch_number: string } | null;
  readonly balances: readonly { readonly location_id: string; readonly box_quantity: string }[];
}

/**
 * Depot-specific grid location code, e.g. "R3-A12" (row 3, aisle 12).
 * Assumption (reconciliation doc): the exact grid notation was not
 * specified by requirements; this row/aisle format matches the "depot-
 * specific location hierarchy" described in AGENTS.md and is documented
 * here for the frontend to conform to.
 */
export const GRID_LOCATION_PATTERN = /^R(\d+)-A(\d+)$/i;

export interface GridRoute {
  readonly from: string;
  readonly to: string;
  readonly rowDistance: number;
  readonly aisleDistance: number;
  readonly totalSteps: number;
  readonly instructions: readonly string[];
}

/**
 * Computes a simple Manhattan-distance route between two grid locations
 * (Assumption: reconciliation doc - no real depot floor-plan/graph data
 * exists yet, so this is a straight-line row+aisle step count, not a
 * physically-validated path around obstacles).
 */
export function calculateGridRoute(from: string, to: string): GridRoute {
  const fromMatch = GRID_LOCATION_PATTERN.exec(from);
  const toMatch = GRID_LOCATION_PATTERN.exec(to);

  if (!fromMatch || !toMatch) {
    throw new Error("Invalid grid location code. Expected format 'R<row>-A<aisle>', e.g. 'R3-A12'.");
  }

  const fromRow = Number(fromMatch[1]);
  const fromAisle = Number(fromMatch[2]);
  const toRow = Number(toMatch[1]);
  const toAisle = Number(toMatch[2]);

  const rowDistance = Math.abs(toRow - fromRow);
  const aisleDistance = Math.abs(toAisle - fromAisle);
  const totalSteps = rowDistance + aisleDistance;

  const instructions: string[] = [];
  if (rowDistance > 0) {
    instructions.push(`Move ${rowDistance} row(s) ${toRow > fromRow ? "forward" : "backward"}`);
  }
  if (aisleDistance > 0) {
    instructions.push(`Move ${aisleDistance} aisle(s) ${toAisle > fromAisle ? "right" : "left"}`);
  }
  if (instructions.length === 0) {
    instructions.push("Already at destination");
  }

  return { from, to, rowDistance, aisleDistance, totalSteps, instructions };
}

export const listTasksFilterSchema = z.object({
  status: taskStatusSchema.optional(),
  employee_id: z.string().uuid().optional(),
  depot_id: z.string().uuid().optional(),
  task_type: z.string().trim().min(1).optional(),
  client_id: z.string().uuid().optional(),
  order_id: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});
export type ListTasksFilter = z.infer<typeof listTasksFilterSchema>;

/**
 * Multi-employee assignment request. Composed from repeated single-employee
 * assignTask calls (see task-routes.ts POST /tasks/:id/assignments) - this
 * is NOT atomic across employees: if assigning the 2nd of 3 employees fails,
 * the 1st remains assigned. Documented as a flagged limitation, not silently
 * accepted.
 */
export const multiEmployeeSchema = z.object({
  employeeIds: z.array(z.string().uuid()).min(1, { message: "At least one employeeId is required" }),
  reason: z.string().optional(),
  correlation_id: z.string().uuid().optional()
});
export type MultiEmployeeRequest = z.infer<typeof multiEmployeeSchema>;

export const reassignTaskRequestSchema = z.object({
  from_employee_id: z.string().uuid({ message: "from_employee_id must be a valid UUID" }),
  to_employee_id: z.string().uuid({ message: "to_employee_id must be a valid UUID" }),
  reason: z.string().optional(),
  correlation_id: z.string().uuid().optional()
});
export type ReassignTaskRequest = z.infer<typeof reassignTaskRequestSchema>;
