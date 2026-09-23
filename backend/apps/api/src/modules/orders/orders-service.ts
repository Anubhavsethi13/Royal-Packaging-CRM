import crypto from "node:crypto";
import type {
  CancelOrderRequest,
  CreateOrderRequest,
  ListOrdersFilter,
  OrderDTO,
  OrderStatus,
  UpdateOrderRequest
} from "@royal-packaging/contracts";
import {
  cancelOrderRequestSchema,
  CommercialDomainError,
  createOrderRequestSchema,
  isOrderCancellable,
  isValidOrderStatusTransition,
  updateOrderRequestSchema
} from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";
import { isPostgresUniqueViolation } from "../clients/clients-service.js";

export interface OrdersServiceConfig {
  readonly database: DatabaseConnection;
}

export class OrdersService {
  private readonly database: DatabaseConnection;

  public constructor(config: OrdersServiceConfig) {
    this.database = config.database;
  }

  public async createOrder(request: CreateOrderRequest): Promise<OrderDTO> {
    const parsed = createOrderRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new CommercialDomainError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid order request");
    }

    const client = await this.database
      .selectFrom("clients")
      .select("id")
      .where("id", "=", parsed.data.client_id)
      .executeTakeFirst();

    if (!client) {
      throw new CommercialDomainError("CLIENT_NOT_FOUND", `Client with ID '${parsed.data.client_id}' was not found.`);
    }

    const now = new Date();
    const id = crypto.randomUUID();
    const explicitCode = parsed.data.order_code?.trim();

    let attempts = 0;
    while (attempts < 5) {
      attempts++;
      const orderCode = explicitCode || `ORD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

      try {
        await this.database
          .insertInto("orders")
          .values({
            id,
            client_id: parsed.data.client_id,
            order_code: orderCode,
            material_name: parsed.data.material_name ?? null,
            quantity: parsed.data.quantity !== undefined ? String(parsed.data.quantity) : null,
            unit: parsed.data.unit ?? null,
            status: "draft",
            priority: parsed.data.priority ?? "normal",
            due_at: parsed.data.due_at ?? null,
            notes: parsed.data.notes ?? null,
            cancelled_at: null,
            cancellation_reason: null,
            created_at: now,
            updated_at: now,
            version: "1"
          })
          .execute();
        break;
      } catch (err) {
        if (isPostgresUniqueViolation(err)) {
          if (explicitCode) {
            throw new CommercialDomainError(
              "DUPLICATE_ORDER_CODE",
              `order_code '${explicitCode}' is already in use.`
            );
          }
          // Generated code collided - loop to retry with new random bytes
          if (attempts >= 5) {
            throw new CommercialDomainError("DUPLICATE_ORDER_CODE", "Failed to generate unique order code after retries.");
          }
          continue;
        }
        throw err;
      }
    }

    return this.getOrderByIdOrThrow(id);
  }

  public async updateOrder(id: string, request: UpdateOrderRequest): Promise<OrderDTO> {
    const parsed = updateOrderRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new CommercialDomainError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid order update");
    }

    const existing = await this.database.selectFrom("orders").selectAll().where("id", "=", id).executeTakeFirst();
    if (!existing) {
      throw new CommercialDomainError("ORDER_NOT_FOUND", `Order with ID '${id}' was not found.`);
    }

    if (parsed.data.status !== undefined) {
      const from = existing.status as OrderStatus;
      const to = parsed.data.status;
      if (!isValidOrderStatusTransition(from, to)) {
        throw new CommercialDomainError(
          "INVALID_STATUS_TRANSITION",
          `Cannot transition order from '${from}' to '${to}'.`
        );
      }
    }

    await this.database
      .updateTable("orders")
      .set({
        ...(parsed.data.material_name !== undefined ? { material_name: parsed.data.material_name } : {}),
        ...(parsed.data.quantity !== undefined ? { quantity: String(parsed.data.quantity) } : {}),
        ...(parsed.data.unit !== undefined ? { unit: parsed.data.unit } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
        ...(parsed.data.due_at !== undefined ? { due_at: parsed.data.due_at } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        updated_at: sql`now()`,
        version: sql`version + 1`
      })
      .where("id", "=", id)
      .execute();

    return this.getOrderByIdOrThrow(id);
  }

  public async cancelOrder(id: string, request: CancelOrderRequest): Promise<OrderDTO> {
    const parsed = cancelOrderRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new CommercialDomainError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Cancellation reason is required");
    }

    const existing = await this.database.selectFrom("orders").selectAll().where("id", "=", id).executeTakeFirst();
    if (!existing) {
      throw new CommercialDomainError("ORDER_NOT_FOUND", `Order with ID '${id}' was not found.`);
    }

    if (!isOrderCancellable(existing.status as OrderStatus)) {
      throw new CommercialDomainError(
        "ORDER_NOT_CANCELLABLE",
        `Order in status '${existing.status}' can no longer be cancelled.`
      );
    }

    const now = new Date();
    await this.database
      .updateTable("orders")
      .set({
        status: "cancelled",
        cancelled_at: now,
        cancellation_reason: parsed.data.reason,
        updated_at: now,
        version: sql`version + 1`
      })
      .where("id", "=", id)
      .execute();

    return this.getOrderByIdOrThrow(id);
  }

  public async getOrderById(id: string): Promise<OrderDTO | null> {
    const row = await this.database.selectFrom("orders").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDTO(row) : null;
  }

  public async listOrders(filter: ListOrdersFilter): Promise<OrderDTO[]> {
    let query = this.database.selectFrom("orders").selectAll();

    if (filter.status) {
      query = query.where("status", "=", filter.status);
    }
    if (filter.client_id) {
      query = query.where("client_id", "=", filter.client_id);
    }
    if (filter.priority) {
      query = query.where("priority", "=", filter.priority);
    }
    if (filter.search) {
      const term = `%${filter.search}%`;
      query = query.where((eb) =>
        eb.or([eb("order_code", "ilike", term), eb("material_name", "ilike", term)])
      );
    }

    const rows = await query.orderBy("created_at", "desc").execute();
    return rows.map((row) => this.toDTO(row));
  }

  private async getOrderByIdOrThrow(id: string): Promise<OrderDTO> {
    const order = await this.getOrderById(id);
    if (!order) {
      throw new CommercialDomainError("ORDER_NOT_FOUND", `Order with ID '${id}' was not found.`);
    }
    return order;
  }

  private toDTO(row: {
    id: string;
    client_id: string;
    order_code: string;
    material_name: string | null;
    quantity: string | null;
    unit: string | null;
    status: string;
    priority: string;
    due_at: Date | null;
    notes: string | null;
    cancelled_at: Date | null;
    cancellation_reason: string | null;
    created_at: Date;
    updated_at: Date;
    version: string;
  }): OrderDTO {
    return {
      id: row.id,
      client_id: row.client_id,
      order_code: row.order_code,
      material_name: row.material_name,
      quantity: row.quantity !== null ? BigInt(row.quantity) : null,
      unit: row.unit,
      status: row.status,
      priority: row.priority,
      due_at: row.due_at,
      notes: row.notes,
      cancelled_at: row.cancelled_at,
      cancellation_reason: row.cancellation_reason,
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: BigInt(row.version)
    };
  }
}
