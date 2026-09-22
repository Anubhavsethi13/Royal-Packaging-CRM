import type { InventoryItemDTO } from "@royal-packaging/contracts";
import { moveInventoryRequestSchema } from "@royal-packaging/contracts";
import { z } from "zod";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { BadRequestError, NotFoundError } from "../middleware/error-handler.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { InventoryService } from "../modules/inventory/inventory-service.js";
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

const INVENTORY_SORT_MAP: Record<string, keyof InventoryItemDTO> = {
  product_code: "product_code",
  productCode: "product_code",
  name: "name",
  total_box_quantity: "total_box_quantity",
  totalBoxQuantity: "total_box_quantity",
  created_at: "created_at",
  createdAt: "created_at"
};

export function registerInventoryRoutes(
  router: Router,
  authService: AuthService,
  inventoryService: InventoryService,
  authPolicy: AuthorizationPolicy
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  // GET /inventory - Inventory catalog list (item-level aggregate balances)
  router.get("/inventory", auth, authz("inventory:read_catalog"), async (ctx: ApiContext) => {
    const pagination = parsePagination(ctx.query);
    const search = ctx.query.get("search") ?? undefined;
    const allItems = await inventoryService.listItems({ search });

    const sortBy = ctx.query.get("sortBy") ?? ctx.query.get("sort_by") ?? ctx.query.get("sort");
    const dir = sortDirection(ctx.query, "desc");
    const sortKey = sortBy ? INVENTORY_SORT_MAP[sortBy] : undefined;
    const sorted = sortKey ? sortByKey(allItems, sortKey, dir) : allItems;
    const paged = pageItems(sorted, pagination);

    sendList(ctx.res, withCamelCaseMirror(paged), pagination, sorted.length);
  });

  // POST /inventory/movements - Record inventory movement
  router.post("/inventory/movements", auth, authz("inventory:move"), async (ctx: ApiContext) => {
    const payload = (typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {}) as Record<string, unknown>;
    const normalized = await normalizeMoveInventoryBody(payload, inventoryService);
    const parseResult = moveInventoryRequestSchema.safeParse({
      ...normalized,
      idempotency_key: normalized.idempotency_key ?? ctx.idempotencyKey ?? undefined,
      correlation_id: normalized.correlation_id ?? ctx.correlationId
    });
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const result = await inventoryService.moveInventory(parseResult.data, ctx.user!.id);
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(result)
    });
  });

  // GET /inventory/balances - Query inventory balances by batch and optional location
  router.get("/inventory/balances", auth, authz("inventory:read_balances"), async (ctx: ApiContext) => {
    const batchId = ctx.query.get("batch_id");
    if (!batchId) {
      throw new BadRequestError("Query parameter 'batch_id' is required");
    }

    const batchValidation = uuidSchema.safeParse(batchId);
    if (!batchValidation.success) {
      throw new BadRequestError("Invalid 'batch_id' format: must be a valid UUID");
    }

    const locationId = ctx.query.get("location_id");
    if (locationId) {
      const locValidation = uuidSchema.safeParse(locationId);
      if (!locValidation.success) {
        throw new BadRequestError("Invalid 'location_id' format: must be a valid UUID");
      }

      const balance = await inventoryService.getBalance(batchId, locationId);
      sendJson(ctx.res, 200, {
        success: true,
        data: withCamelCaseMirror(balance)
      });
      return;
    }

    const balances = await inventoryService.getBatchBalances(batchId);
    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(balances)
    });
  });

  // GET /inventory/:id - Inventory catalog item detail. Registered after all
  // literal /inventory/... routes above (balances, movements) so those exact
  // paths are matched first - a single-segment :id param would otherwise
  // shadow them (route matching is registration-order, first-match-wins).
  router.get("/inventory/:id", auth, authz("inventory:read_catalog"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id || !uuidSchema.safeParse(id).success) {
      throw new BadRequestError("Invalid inventory item ID format");
    }
    const item = await inventoryService.getItemById(id);
    if (!item) {
      throw new NotFoundError(`Inventory item with ID '${id}' was not found`);
    }
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(item) });
  });

  // GET /inventory/movements/:id - Retrieve movement by ID
  router.get("/inventory/movements/:id", auth, authz("inventory:read_movement"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id) {
      throw new BadRequestError("Movement ID parameter is required");
    }

    const idValidation = uuidSchema.safeParse(id);
    if (!idValidation.success) {
      throw new BadRequestError("Invalid movement ID format: must be a valid UUID");
    }

    const movement = await inventoryService.getMovement(id);
    if (!movement) {
      throw new NotFoundError(`Inventory movement with ID '${id}' was not found`);
    }

    sendJson(ctx.res, 200, {
      success: true,
      data: withCamelCaseMirror(movement)
    });
  });
}

/**
 * Accepts either the native snake_case movement body or the frontend's
 * camelCase {inventoryItemId, batchId?, ...} shape. When `batchId` is
 * omitted, resolves it via `InventoryService.resolveBatchForItem` (FIFO -
 * see its doc comment). Falls through unchanged when the body already looks
 * native (has `inventory_batch_id`).
 */
async function normalizeMoveInventoryBody(
  payload: Record<string, unknown>,
  inventoryService: InventoryService
): Promise<Record<string, unknown>> {
  if (typeof payload.inventory_batch_id === "string") {
    return payload;
  }

  const inventoryItemId = payload.inventoryItemId;
  if (typeof inventoryItemId !== "string") {
    return payload;
  }

  const sourceLocationId = (payload.sourceLocationId ?? payload.source_location_id) as string | null | undefined;
  const destinationLocationId = (payload.destinationLocationId ?? payload.destination_location_id) as
    | string
    | null
    | undefined;

  const batchId =
    typeof payload.batchId === "string"
      ? payload.batchId
      : await inventoryService.resolveBatchForItem(inventoryItemId, sourceLocationId ?? destinationLocationId);

  return {
    inventory_batch_id: batchId,
    source_location_id: sourceLocationId ?? null,
    destination_location_id: destinationLocationId ?? null,
    box_quantity: payload.boxQuantity ?? payload.box_quantity,
    movement_type: payload.movementType ?? payload.movement_type,
    task_id: payload.taskId ?? payload.task_id ?? null,
    idempotency_key: payload.idempotencyKey ?? payload.idempotency_key,
    correlation_id: payload.correlationId ?? payload.correlation_id
  };
}
