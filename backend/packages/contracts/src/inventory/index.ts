import { z } from "zod";

export const moveInventoryRequestSchema = z.object({
  inventory_batch_id: z.string().uuid({ message: "inventory_batch_id must be a valid UUID" }),
  source_location_id: z.string().uuid({ message: "source_location_id must be a valid UUID" }).nullable().optional(),
  destination_location_id: z.string().uuid({ message: "destination_location_id must be a valid UUID" }).nullable().optional(),
  box_quantity: z.union([
    z.bigint().positive({ message: "box_quantity must be positive" }),
    z.number().int().positive({ message: "box_quantity must be a positive integer" }),
    z.string().regex(/^[1-9]\d*$/, { message: "box_quantity must be a positive integer string" })
  ]),
  movement_type: z.string().min(1, { message: "movement_type is required" }),
  task_id: z.string().uuid({ message: "task_id must be a valid UUID" }).nullable().optional(),
  idempotency_key: z.string().min(1).max(255).nullable().optional(),
  correlation_id: z.string().uuid().nullable().optional()
}).refine(
  (data) => {
    // Cannot have both source and destination null
    const hasSource = data.source_location_id !== null && data.source_location_id !== undefined;
    const hasDest = data.destination_location_id !== null && data.destination_location_id !== undefined;
    return hasSource || hasDest;
  },
  {
    message: "At least one of source_location_id or destination_location_id must be provided"
  }
).refine(
  (data) => {
    // If both source and destination are provided, they cannot be identical
    if (data.source_location_id && data.destination_location_id) {
      return data.source_location_id !== data.destination_location_id;
    }
    return true;
  },
  {
    message: "source_location_id and destination_location_id cannot be the same location"
  }
);

export type MoveInventoryRequest = z.infer<typeof moveInventoryRequestSchema>;

export interface InventoryMovementRecord {
  id: string;
  inventory_batch_id: string;
  source_location_id: string | null;
  destination_location_id: string | null;
  box_quantity: bigint;
  task_id: string | null;
  movement_type: string;
  occurred_at: Date;
  actor_user_id: string | null;
  idempotency_key: string | null;
  correlation_id: string | null;
  created_at: Date;
}

export interface MoveInventoryResult {
  movement: InventoryMovementRecord;
  source_balance_after?: bigint | undefined;
  destination_balance_after?: bigint | undefined;
  is_idempotent_replay: boolean;
}

export interface InventoryBalanceRecord {
  id: string;
  inventory_batch_id: string;
  location_id: string;
  box_quantity: bigint;
  version: bigint;
  created_at: Date;
  updated_at: Date;
}

export type InventoryErrorCode =
  | "INVALID_QUANTITY"
  | "INSUFFICIENT_STOCK"
  | "MISSING_SOURCE_BALANCE"
  | "SAME_LOCATION_UNSUPPORTED"
  | "BATCH_NOT_FOUND"
  | "SOURCE_LOCATION_NOT_FOUND"
  | "DESTINATION_LOCATION_NOT_FOUND"
  | "TASK_NOT_FOUND"
  | "INVALID_LOCATIONS"
  | "IDEMPOTENT_RETRY_MISMATCH"
  | "ITEM_NOT_FOUND"
  | "VALIDATION_FAILED";

export class InventoryDomainError extends Error {
  public readonly code: InventoryErrorCode;

  public constructor(code: InventoryErrorCode, message: string) {
    super(message);
    this.name = "InventoryDomainError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Inventory catalog (item-level view aggregating balances across batches/locations)
// ---------------------------------------------------------------------------

export const listInventoryItemsFilterSchema = z.object({
  search: z.string().trim().min(1).optional()
});
export type ListInventoryItemsFilter = z.infer<typeof listInventoryItemsFilterSchema>;

export interface InventoryItemDTO {
  readonly id: string;
  readonly product_code: string;
  readonly name: string | null;
  readonly total_box_quantity: bigint;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly version: bigint;
}

export interface InventoryItemBatchBalanceDTO {
  readonly batch_id: string;
  readonly batch_number: string;
  readonly location_id: string;
  readonly box_quantity: bigint;
}

export interface InventoryItemDetailDTO extends InventoryItemDTO {
  readonly balances: readonly InventoryItemBatchBalanceDTO[];
}

// ---------------------------------------------------------------------------
// camelCase reconciliation for inventory movements/balances
// ---------------------------------------------------------------------------

/**
 * The frontend contract references `inventoryItemId` + `batchId` separately,
 * but the DB models a single `inventory_batch_id` (an item can have several
 * batches). `resolveBatchForItem` (see inventory-service.ts) auto-selects a
 * batch for the given item/location using a documented FIFO rule -
 * Assumption flagged in the reconciliation doc.
 */
export const frontendMoveInventoryRequestSchema = z.object({
  inventoryItemId: z.string().uuid({ message: "inventoryItemId must be a valid UUID" }),
  batchId: z.string().uuid({ message: "batchId must be a valid UUID" }).optional(),
  sourceLocationId: z.string().uuid().nullable().optional(),
  destinationLocationId: z.string().uuid().nullable().optional(),
  boxQuantity: z.union([
    z.number().int().positive(),
    z.string().regex(/^[1-9]\d*$/)
  ]),
  movementType: z.string().min(1),
  taskId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().min(1).optional(),
  correlationId: z.string().uuid().optional()
});
export type FrontendMoveInventoryRequest = z.infer<typeof frontendMoveInventoryRequestSchema>;

export interface FrontendInventoryMovementDTO {
  readonly id: string;
  readonly inventoryItemId: string;
  readonly batchId: string;
  readonly sourceLocationId: string | null;
  readonly destinationLocationId: string | null;
  readonly boxQuantity: string;
  readonly taskId: string | null;
  readonly movementType: string;
  readonly occurredAt: Date;
  readonly actorUserId: string | null;
}

export interface FrontendInventoryBalanceDTO {
  readonly id: string;
  readonly inventoryItemId: string;
  readonly batchId: string;
  readonly locationId: string;
  readonly boxQuantity: string;
}
