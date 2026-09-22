import type { OrderDTO, OrderPriority, OrderStatus } from "@royal-packaging/contracts";
import { cancelOrderRequestSchema, createOrderRequestSchema, updateOrderRequestSchema } from "@royal-packaging/contracts";
import { z } from "zod";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { BadRequestError, NotFoundError } from "../middleware/error-handler.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { OrdersService } from "../modules/orders/orders-service.js";
import type { ApiContext, Router } from "../router.js";
import {
  pageItems,
  parsePagination,
  sendJson,
  sendList,
  sortByKey,
  sortDirection,
  withCamelCaseMirror
} from "../utils/http-utils.js";

const uuidSchema = z.string().uuid({ message: "Must be a valid UUID" });

const ORDER_SORT_MAP: Record<string, keyof OrderDTO> = {
  order_code: "order_code",
  orderCode: "order_code",
  material_name: "material_name",
  materialName: "material_name",
  status: "status",
  priority: "priority",
  due_at: "due_at",
  dueAt: "due_at",
  created_at: "created_at",
  createdAt: "created_at"
};

export function registerOrdersRoutes(
  router: Router,
  authService: AuthService,
  ordersService: OrdersService,
  authPolicy: AuthorizationPolicy
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  // GET /orders
  router.get("/orders", auth, authz("order:read"), async (ctx: ApiContext) => {
    const pagination = parsePagination(ctx.query);
    const rawStatus = ctx.query.get("status");
    const status = rawStatus && rawStatus.toLowerCase() !== "all"
      ? (rawStatus.toLowerCase() as OrderStatus)
      : undefined;
    const rawPriority = ctx.query.get("priority");
    const priority = rawPriority && rawPriority.toLowerCase() !== "all"
      ? (rawPriority.toLowerCase() as OrderPriority)
      : undefined;
    const clientId = ctx.query.get("client_id") ?? ctx.query.get("clientId") ?? undefined;
    const search = ctx.query.get("search") ?? undefined;

    const allOrders = await ordersService.listOrders({
      status,
      client_id: clientId,
      priority,
      search
    });

    const sortBy = ctx.query.get("sortBy") ?? ctx.query.get("sort_by") ?? ctx.query.get("sort");
    const dir = sortDirection(ctx.query, "desc");
    const sortKey = sortBy ? ORDER_SORT_MAP[sortBy] : undefined;
    const sorted = sortKey ? sortByKey(allOrders, sortKey, dir) : allOrders;
    const paged = pageItems(sorted, pagination);

    sendList(ctx.res, withCamelCaseMirror(paged), pagination, sorted.length);
  });

  // POST /orders
  router.post("/orders", auth, authz("order:write"), async (ctx: ApiContext) => {
    const parseResult = createOrderRequestSchema.safeParse(ctx.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    const order = await ordersService.createOrder(parseResult.data);
    sendJson(ctx.res, 201, { success: true, data: withCamelCaseMirror(order) });
  });

  // GET /orders/:id
  router.get("/orders/:id", auth, authz("order:read"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id || !uuidSchema.safeParse(id).success) {
      throw new BadRequestError("Invalid order ID format");
    }
    const order = await ordersService.getOrderById(id);
    if (!order) {
      throw new NotFoundError(`Order with ID '${id}' was not found`);
    }
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(order) });
  });

  // PATCH /orders/:id
  router.patch("/orders/:id", auth, authz("order:write"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id || !uuidSchema.safeParse(id).success) {
      throw new BadRequestError("Invalid order ID format");
    }
    const parseResult = updateOrderRequestSchema.safeParse(ctx.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    const order = await ordersService.updateOrder(id, parseResult.data);
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(order) });
  });

  // POST /orders/:id/cancel
  router.post("/orders/:id/cancel", auth, authz("order:cancel"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id || !uuidSchema.safeParse(id).success) {
      throw new BadRequestError("Invalid order ID format");
    }
    const parseResult = cancelOrderRequestSchema.safeParse(ctx.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    const order = await ordersService.cancelOrder(id, parseResult.data);
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(order) });
  });
}
