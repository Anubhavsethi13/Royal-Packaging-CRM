import crypto from "node:crypto";
import type {
  InventoryBalanceRecord,
  InventoryItemDetailDTO,
  InventoryItemDTO,
  InventoryMovementRecord,
  ListInventoryItemsFilter,
  MoveInventoryRequest,
  MoveInventoryResult,
  ScanResultDTO
} from "@royal-packaging/contracts";
import {
  InventoryDomainError,
  moveInventoryRequestSchema
} from "@royal-packaging/contracts";
import type { DatabaseConnection, DatabaseExecutor, DatabaseTransaction } from "@royal-packaging/db";
import { sql } from "kysely";

export interface InventoryServiceConfig {
  readonly database: DatabaseConnection;
}

export class InventoryService {
  private readonly database: DatabaseConnection;

  public constructor(config: InventoryServiceConfig) {
    this.database = config.database;
  }

  /**
   * Executes an atomic inventory movement inside a PostgreSQL transaction.
   *
   * Transaction flow:
   * 1. Validate request payload and normalize box quantity.
   * 2. Check for existing idempotent movement if idempotency_key is provided.
   * 3. Validate existence of inventory_batch, source_location, destination_location, and task (if supplied).
   * 4. Acquire row-level lock (FOR UPDATE) on source balance and validate stock.
   * 5. Decrement source balance atomically (version incremented).
   * 6. Acquire row-level lock (FOR UPDATE) or create destination balance and increment atomically.
   * 7. Insert immutable inventory_movements record.
   * 8. Commit and return resulting balances.
   *
   * @param request The movement request parameters.
   * @param actorUserId Server-resolved authenticated user ID (never trusted from unverified client payload).
   * @param externalTrx Optional outer transaction handle for cross-service atomic orchestration.
   */
  public async moveInventory(
    request: MoveInventoryRequest,
    actorUserId?: string | null,
    externalTrx?: DatabaseTransaction | DatabaseExecutor
  ): Promise<MoveInventoryResult> {
    const parseResult = moveInventoryRequestSchema.safeParse(request);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      const message = firstIssue?.message ?? "Invalid movement request";
      if (message.includes("same location")) {
        throw new InventoryDomainError("SAME_LOCATION_UNSUPPORTED", message);
      }
      if (message.includes("positive")) {
        throw new InventoryDomainError("INVALID_QUANTITY", message);
      }
      if (message.includes("At least one of")) {
        throw new InventoryDomainError("INVALID_LOCATIONS", message);
      }
      throw new InventoryDomainError("VALIDATION_FAILED", message);
    }

    const validated = parseResult.data;
    const requestedQty = BigInt(validated.box_quantity);
    if (requestedQty <= 0n) {
      throw new InventoryDomainError("INVALID_QUANTITY", "Box quantity must be a positive integer");
    }

    const sourceLocationId = validated.source_location_id ?? null;
    const destinationLocationId = validated.destination_location_id ?? null;
    const taskId = validated.task_id ?? null;
    const idempotencyKey = validated.idempotency_key ?? null;
    const correlationId = validated.correlation_id ?? null;
    const actor = actorUserId ?? null;

    const executeInTransaction = async (trx: DatabaseExecutor): Promise<MoveInventoryResult> => {
      // 1. Idempotency check inside transaction
      if (idempotencyKey) {
        const existingMovement = await trx
          .selectFrom("inventory_movements")
          .selectAll()
          .where("idempotency_key", "=", idempotencyKey)
          .forUpdate()
          .executeTakeFirst();

        if (existingMovement) {
          const isMatching =
            existingMovement.inventory_batch_id === validated.inventory_batch_id &&
            existingMovement.source_location_id === sourceLocationId &&
            existingMovement.destination_location_id === destinationLocationId &&
            BigInt(existingMovement.box_quantity) === requestedQty &&
            existingMovement.movement_type === validated.movement_type;

          if (!isMatching) {
            throw new InventoryDomainError(
              "IDEMPOTENT_RETRY_MISMATCH",
              `Idempotency key '${idempotencyKey}' was already used with different movement parameters.`
            );
          }

          let sourceBalAfter: bigint | undefined;
          let destBalAfter: bigint | undefined;

          if (sourceLocationId) {
            const src = await trx
              .selectFrom("inventory_balances")
              .select("box_quantity")
              .where("inventory_batch_id", "=", validated.inventory_batch_id)
              .where("location_id", "=", sourceLocationId)
              .executeTakeFirst();
            if (src) {
              sourceBalAfter = BigInt(src.box_quantity);
            }
          }

          if (destinationLocationId) {
            const dst = await trx
              .selectFrom("inventory_balances")
              .select("box_quantity")
              .where("inventory_batch_id", "=", validated.inventory_batch_id)
              .where("location_id", "=", destinationLocationId)
              .executeTakeFirst();
            if (dst) {
              destBalAfter = BigInt(dst.box_quantity);
            }
          }

          return {
            movement: {
              id: existingMovement.id,
              inventory_batch_id: existingMovement.inventory_batch_id,
              source_location_id: existingMovement.source_location_id,
              destination_location_id: existingMovement.destination_location_id,
              box_quantity: BigInt(existingMovement.box_quantity),
              task_id: existingMovement.task_id,
              movement_type: existingMovement.movement_type,
              occurred_at: existingMovement.occurred_at,
              actor_user_id: existingMovement.actor_user_id,
              idempotency_key: existingMovement.idempotency_key,
              correlation_id: existingMovement.correlation_id,
              created_at: existingMovement.created_at
            },
            source_balance_after: sourceBalAfter,
            destination_balance_after: destBalAfter,
            is_idempotent_replay: true
          };
        }
      }

      // 2. Validate batch existence
      const batch = await trx
        .selectFrom("inventory_batches")
        .select("id")
        .where("id", "=", validated.inventory_batch_id)
        .executeTakeFirst();

      if (!batch) {
        throw new InventoryDomainError(
          "BATCH_NOT_FOUND",
          `Inventory batch with ID '${validated.inventory_batch_id}' does not exist.`
        );
      }

      // 3. Validate locations existence
      if (sourceLocationId) {
        const srcLoc = await trx
          .selectFrom("locations")
          .select("id")
          .where("id", "=", sourceLocationId)
          .executeTakeFirst();

        if (!srcLoc) {
          throw new InventoryDomainError(
            "SOURCE_LOCATION_NOT_FOUND",
            `Source location with ID '${sourceLocationId}' does not exist.`
          );
        }
      }

      if (destinationLocationId) {
        const dstLoc = await trx
          .selectFrom("locations")
          .select("id")
          .where("id", "=", destinationLocationId)
          .executeTakeFirst();

        if (!dstLoc) {
          throw new InventoryDomainError(
            "DESTINATION_LOCATION_NOT_FOUND",
            `Destination location with ID '${destinationLocationId}' does not exist.`
          );
        }
      }

      // 4. Validate task existence if task_id provided
      if (taskId) {
        const task = await trx
          .selectFrom("tasks")
          .select("id")
          .where("id", "=", taskId)
          .executeTakeFirst();

        if (!task) {
          throw new InventoryDomainError(
            "TASK_NOT_FOUND",
            `Referenced task with ID '${taskId}' does not exist.`
          );
        }
      }

      let newSourceQty: bigint | undefined;
      let newDestQty: bigint | undefined;

      // 5. Source Balance: Row-level lock and decrement
      if (sourceLocationId) {
        const sourceBalance = await trx
          .selectFrom("inventory_balances")
          .selectAll()
          .where("inventory_batch_id", "=", validated.inventory_batch_id)
          .where("location_id", "=", sourceLocationId)
          .forUpdate()
          .executeTakeFirst();

        if (!sourceBalance) {
          throw new InventoryDomainError(
            "MISSING_SOURCE_BALANCE",
            `No inventory balance found for batch '${validated.inventory_batch_id}' at source location '${sourceLocationId}'.`
          );
        }

        const currentSourceQty = BigInt(sourceBalance.box_quantity);
        if (currentSourceQty < requestedQty) {
          throw new InventoryDomainError(
            "INSUFFICIENT_STOCK",
            `Insufficient stock at source location. Available: ${currentSourceQty.toString()} BOX, Requested: ${requestedQty.toString()} BOX.`
          );
        }

        newSourceQty = currentSourceQty - requestedQty;

        await trx
          .updateTable("inventory_balances")
          .set({
            box_quantity: newSourceQty.toString(),
            version: sql`version + 1`,
            updated_at: sql`now()`
          })
          .where("id", "=", sourceBalance.id)
          .execute();
      }

      // 6. Destination Balance: Row-level lock and increment / insert
      if (destinationLocationId) {
        const destBalance = await trx
          .selectFrom("inventory_balances")
          .selectAll()
          .where("inventory_batch_id", "=", validated.inventory_batch_id)
          .where("location_id", "=", destinationLocationId)
          .forUpdate()
          .executeTakeFirst();

        if (destBalance) {
          const currentDestQty = BigInt(destBalance.box_quantity);
          newDestQty = currentDestQty + requestedQty;

          await trx
            .updateTable("inventory_balances")
            .set({
              box_quantity: newDestQty.toString(),
              version: sql`version + 1`,
              updated_at: sql`now()`
            })
            .where("id", "=", destBalance.id)
            .execute();
        } else {
          newDestQty = requestedQty;
          const newBalanceId = crypto.randomUUID();

          await trx
            .insertInto("inventory_balances")
            .values({
              id: newBalanceId,
              inventory_batch_id: validated.inventory_batch_id,
              location_id: destinationLocationId,
              box_quantity: newDestQty.toString(),
              version: "1",
              created_at: sql`now()`,
              updated_at: sql`now()`
            })
            .execute();
        }
      }

      // 7. Insert immutable movement record
      const movementId = crypto.randomUUID();
      const now = new Date();

      await trx
        .insertInto("inventory_movements")
        .values({
          id: movementId,
          inventory_batch_id: validated.inventory_batch_id,
          source_location_id: sourceLocationId,
          destination_location_id: destinationLocationId,
          box_quantity: requestedQty.toString(),
          task_id: taskId,
          movement_type: validated.movement_type,
          occurred_at: now,
          actor_user_id: actor,
          idempotency_key: idempotencyKey,
          correlation_id: correlationId,
          created_at: now
        })
        .execute();

      return {
        movement: {
          id: movementId,
          inventory_batch_id: validated.inventory_batch_id,
          source_location_id: sourceLocationId,
          destination_location_id: destinationLocationId,
          box_quantity: requestedQty,
          task_id: taskId,
          movement_type: validated.movement_type,
          occurred_at: now,
          actor_user_id: actor,
          idempotency_key: idempotencyKey,
          correlation_id: correlationId,
          created_at: now
        },
        source_balance_after: newSourceQty,
        destination_balance_after: newDestQty,
        is_idempotent_replay: false
      };
    };

    if (externalTrx) {
      return executeInTransaction(externalTrx);
    }

    return this.database.transaction().execute(async (trx) => executeInTransaction(trx));
  }

  /**
   * Retrieves current balance for a specific batch at a specific location.
   */
  public async getBalance(
    inventoryBatchId: string,
    locationId: string
  ): Promise<InventoryBalanceRecord | null> {
    const row = await this.database
      .selectFrom("inventory_balances")
      .selectAll()
      .where("inventory_batch_id", "=", inventoryBatchId)
      .where("location_id", "=", locationId)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      inventory_batch_id: row.inventory_batch_id,
      location_id: row.location_id,
      box_quantity: BigInt(row.box_quantity),
      version: BigInt(row.version),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  /**
   * Retrieves all location balances for a specific batch.
   */
  public async getBatchBalances(inventoryBatchId: string): Promise<InventoryBalanceRecord[]> {
    const rows = await this.database
      .selectFrom("inventory_balances")
      .selectAll()
      .where("inventory_batch_id", "=", inventoryBatchId)
      .execute();

    return rows.map((row) => ({
      id: row.id,
      inventory_batch_id: row.inventory_batch_id,
      location_id: row.location_id,
      box_quantity: BigInt(row.box_quantity),
      version: BigInt(row.version),
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  }

  /**
   * Retrieves an immutable movement record by its primary key.
   */
  public async getMovement(movementId: string): Promise<InventoryMovementRecord | null> {
    const row = await this.database
      .selectFrom("inventory_movements")
      .selectAll()
      .where("id", "=", movementId)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      inventory_batch_id: row.inventory_batch_id,
      source_location_id: row.source_location_id,
      destination_location_id: row.destination_location_id,
      box_quantity: BigInt(row.box_quantity),
      task_id: row.task_id,
      movement_type: row.movement_type,
      occurred_at: row.occurred_at,
      actor_user_id: row.actor_user_id,
      idempotency_key: row.idempotency_key,
      correlation_id: row.correlation_id,
      created_at: row.created_at
    };
  }

  /**
   * Retrieves a movement by its idempotency key.
   */
  public async getMovementByIdempotencyKey(
    idempotencyKey: string
  ): Promise<InventoryMovementRecord | null> {
    const row = await this.database
      .selectFrom("inventory_movements")
      .selectAll()
      .where("idempotency_key", "=", idempotencyKey)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      inventory_batch_id: row.inventory_batch_id,
      source_location_id: row.source_location_id,
      destination_location_id: row.destination_location_id,
      box_quantity: BigInt(row.box_quantity),
      task_id: row.task_id,
      movement_type: row.movement_type,
      occurred_at: row.occurred_at,
      actor_user_id: row.actor_user_id,
      idempotency_key: row.idempotency_key,
      correlation_id: row.correlation_id,
      created_at: row.created_at
    };
  }

  /**
   * Lists inventory catalog items with their aggregate box quantity across
   * all batches and locations (SUM over inventory_balances joined through
   * inventory_batches).
   */
  public async listItems(filter: ListInventoryItemsFilter = {}): Promise<InventoryItemDTO[]> {
    let query = this.database
      .selectFrom("inventory_items")
      .leftJoin("inventory_batches", "inventory_batches.inventory_item_id", "inventory_items.id")
      .leftJoin("inventory_balances", "inventory_balances.inventory_batch_id", "inventory_batches.id")
      .select([
        "inventory_items.id as id",
        "inventory_items.product_code as product_code",
        "inventory_items.name as name",
        "inventory_items.created_at as created_at",
        "inventory_items.updated_at as updated_at",
        "inventory_items.version as version",
        (eb) => eb.fn.coalesce(eb.fn.sum<string>("inventory_balances.box_quantity"), sql<string>`0`).as("total_box_quantity")
      ])
      .groupBy([
        "inventory_items.id",
        "inventory_items.product_code",
        "inventory_items.name",
        "inventory_items.created_at",
        "inventory_items.updated_at",
        "inventory_items.version"
      ]);

    if (filter.search) {
      const term = `%${filter.search}%`;
      query = query.where((eb) =>
        eb.or([eb("inventory_items.product_code", "ilike", term), eb("inventory_items.name", "ilike", term)])
      );
    }

    const rows = await query.orderBy("inventory_items.created_at", "desc").execute();

    return rows.map((row) => ({
      id: row.id,
      product_code: row.product_code,
      name: row.name,
      total_box_quantity: BigInt(row.total_box_quantity ?? "0"),
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: BigInt(row.version)
    }));
  }

  /**
   * Retrieves a single inventory catalog item with its aggregate box
   * quantity and a per-batch/per-location balance breakdown.
   */
  public async getItemById(id: string): Promise<InventoryItemDetailDTO | null> {
    const item = await this.database
      .selectFrom("inventory_items")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!item) {
      return null;
    }

    const balanceRows = await this.database
      .selectFrom("inventory_batches")
      .innerJoin("inventory_balances", "inventory_balances.inventory_batch_id", "inventory_batches.id")
      .select([
        "inventory_batches.id as batch_id",
        "inventory_batches.batch_number as batch_number",
        "inventory_balances.location_id as location_id",
        "inventory_balances.box_quantity as box_quantity"
      ])
      .where("inventory_batches.inventory_item_id", "=", id)
      .execute();

    const totalBoxQuantity = balanceRows.reduce((sum, row) => sum + BigInt(row.box_quantity), 0n);

    return {
      id: item.id,
      product_code: item.product_code,
      name: item.name,
      total_box_quantity: totalBoxQuantity,
      created_at: item.created_at,
      updated_at: item.updated_at,
      version: BigInt(item.version),
      balances: balanceRows.map((row) => ({
        batch_id: row.batch_id,
        batch_number: row.batch_number,
        location_id: row.location_id,
        box_quantity: BigInt(row.box_quantity)
      }))
    };
  }

  /**
   * Resolves which inventory_batch_id to use for a given item/location when
   * the frontend supplies `inventoryItemId` without a `batchId`.
   *
   * Assumption (flagged in reconciliation doc): auto-selects the OLDEST
   * batch (by inventory_batches.created_at) that currently has a positive
   * balance at the given location, i.e. a FIFO rule. When `locationId` is
   * omitted, it selects the oldest batch for the item regardless of
   * location. Returns null when no matching batch exists.
   */
  public async resolveBatchForItem(inventoryItemId: string, locationId?: string | null): Promise<string | null> {
    let query = this.database
      .selectFrom("inventory_batches")
      .select("inventory_batches.id as id")
      .where("inventory_batches.inventory_item_id", "=", inventoryItemId);

    if (locationId) {
      query = query
        .innerJoin("inventory_balances", "inventory_balances.inventory_batch_id", "inventory_batches.id")
        .where("inventory_balances.location_id", "=", locationId)
        .where(sql`inventory_balances.box_quantity::bigint`, ">", 0);
    }

    const row = await query.orderBy("inventory_batches.created_at", "asc").executeTakeFirst();
    return row?.id ?? null;
  }

  /**
   * Looks up a scanned barcode against product_code first, then
   * batch_number, returning the matched item/batch and its balances.
   * Assumption (flagged in reconciliation doc): barcode-to-record matching
   * order was not specified; product_code is checked first since it is the
   * primary catalog identifier.
   */
  public async scanBarcode(barcode: string): Promise<ScanResultDTO> {
    const itemRow = await this.database
      .selectFrom("inventory_items")
      .select(["id", "product_code", "name"])
      .where("product_code", "=", barcode)
      .executeTakeFirst();

    if (itemRow) {
      return {
        matchType: "PRODUCT_CODE",
        item: { id: itemRow.id, product_code: itemRow.product_code, name: itemRow.name },
        batch: null,
        balances: []
      };
    }

    const batchRow = await this.database
      .selectFrom("inventory_batches")
      .innerJoin("inventory_items", "inventory_items.id", "inventory_batches.inventory_item_id")
      .select([
        "inventory_batches.id as batch_id",
        "inventory_batches.batch_number as batch_number",
        "inventory_items.id as item_id",
        "inventory_items.product_code as product_code",
        "inventory_items.name as item_name"
      ])
      .where("inventory_batches.batch_number", "=", barcode)
      .executeTakeFirst();

    if (!batchRow) {
      return { matchType: "NOT_FOUND", item: null, batch: null, balances: [] };
    }

    const balances = await this.database
      .selectFrom("inventory_balances")
      .select(["location_id", "box_quantity"])
      .where("inventory_batch_id", "=", batchRow.batch_id)
      .execute();

    return {
      matchType: "BATCH_NUMBER",
      item: { id: batchRow.item_id, product_code: batchRow.product_code, name: batchRow.item_name },
      batch: { id: batchRow.batch_id, batch_number: batchRow.batch_number },
      balances: balances.map((b) => ({ location_id: b.location_id, box_quantity: b.box_quantity }))
    };
  }
}
