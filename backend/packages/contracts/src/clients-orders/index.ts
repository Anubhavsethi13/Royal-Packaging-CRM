import { z } from "zod";

export type CommercialErrorCode =
  | "CLIENT_NOT_FOUND"
  | "ORDER_NOT_FOUND"
  | "EMPLOYEE_NOT_FOUND"
  | "SHIFT_NOT_FOUND"
  | "DUPLICATE_ACCOUNT_CODE"
  | "DUPLICATE_ORDER_CODE"
  | "DUPLICATE_EMPLOYEE_CODE"
  | "INVALID_STATUS_TRANSITION"
  | "ORDER_NOT_CANCELLABLE"
  | "VALIDATION_FAILED";

export class CommercialDomainError extends Error {
  public readonly code: CommercialErrorCode;

  public constructor(code: CommercialErrorCode, message: string) {
    super(message);
    this.name = "CommercialDomainError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export const CLIENT_STATUSES = ["active", "inactive"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const createClientRequestSchema = z.object({
  name: z.string().trim().min(1, { message: "name is required" }),
  account_code: z.string().trim().min(1, { message: "account_code is required" }),
  contact_name: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  status: z.enum(CLIENT_STATUSES).optional()
});
export type CreateClientRequest = z.infer<typeof createClientRequestSchema>;

export const updateClientRequestSchema = z.object({
  name: z.string().trim().min(1).optional(),
  contact_name: z.string().trim().min(1).nullable().optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  status: z.enum(CLIENT_STATUSES).optional()
});
export type UpdateClientRequest = z.infer<typeof updateClientRequestSchema>;

export const listClientsFilterSchema = z.object({
  status: z.enum(CLIENT_STATUSES).optional(),
  search: z.string().trim().min(1).optional()
});
export type ListClientsFilter = z.infer<typeof listClientsFilterSchema>;

export interface ClientDTO {
  readonly id: string;
  readonly name: string;
  readonly account_code: string | null;
  readonly contact_name: string | null;
  readonly phone: string | null;
  readonly status: string;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly version: bigint;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const ORDER_STATUSES = [
  "draft",
  "confirmed",
  "in_production",
  "ready",
  "dispatched",
  "completed",
  "cancelled"
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type OrderPriority = (typeof ORDER_PRIORITIES)[number];

/**
 * Forward-only order status transition graph (Assumption: reconciliation
 * doc). `cancelled` is reachable from every pre-dispatch state via the
 * dedicated cancel endpoint, never via the generic status PATCH.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["in_production", "cancelled"],
  in_production: ["ready", "cancelled"],
  ready: ["dispatched", "cancelled"],
  dispatched: ["completed"],
  completed: [],
  cancelled: []
};

export function isValidOrderStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** An order can be cancelled any time before it has been dispatched. */
export function isOrderCancellable(status: OrderStatus): boolean {
  return status !== "dispatched" && status !== "completed" && status !== "cancelled";
}

export const createOrderRequestSchema = z.object({
  client_id: z.string().uuid({ message: "client_id must be a valid UUID" }),
  order_code: z.string().trim().min(1, { message: "order_code is required" }),
  material_name: z.string().trim().min(1).optional(),
  quantity: z.union([
    z.bigint().nonnegative(),
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/)
  ]).optional(),
  unit: z.string().trim().min(1).optional(),
  priority: z.enum(ORDER_PRIORITIES).optional(),
  due_at: z.coerce.date().optional(),
  notes: z.string().optional()
});
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

export const updateOrderRequestSchema = z.object({
  material_name: z.string().trim().min(1).optional(),
  quantity: z.union([
    z.bigint().nonnegative(),
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/)
  ]).optional(),
  unit: z.string().trim().min(1).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  priority: z.enum(ORDER_PRIORITIES).optional(),
  due_at: z.coerce.date().nullable().optional(),
  notes: z.string().nullable().optional()
});
export type UpdateOrderRequest = z.infer<typeof updateOrderRequestSchema>;

export const cancelOrderRequestSchema = z.object({
  reason: z.string().trim().min(1, { message: "Cancellation reason is required" })
});
export type CancelOrderRequest = z.infer<typeof cancelOrderRequestSchema>;

export const listOrdersFilterSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  client_id: z.string().uuid().optional(),
  priority: z.enum(ORDER_PRIORITIES).optional(),
  search: z.string().trim().min(1).optional()
});
export type ListOrdersFilter = z.infer<typeof listOrdersFilterSchema>;

export interface OrderDTO {
  readonly id: string;
  readonly client_id: string;
  readonly order_code: string | null;
  readonly material_name: string | null;
  readonly quantity: bigint | null;
  readonly unit: string | null;
  readonly status: string;
  readonly priority: string;
  readonly due_at: Date | null;
  readonly notes: string | null;
  readonly cancelled_at: Date | null;
  readonly cancellation_reason: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly version: bigint;
}
