import crypto from "node:crypto";
import type {
  ClosedLoopTaskSummary,
  ExecuteTaskMovementRequest,
  InitializeTaskFromOrderRequest,
  MoveInventoryResult,
  TaskRecord
} from "@royal-packaging/contracts";
import {
  executeTaskMovementRequestSchema,
  initializeTaskFromOrderRequestSchema,
  OrchestrationDomainError
} from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";
import type { InventoryService } from "../inventory/index.js";
import type { QualityService } from "../quality/index.js";
import type { TaskService } from "./task-service.js";

export interface WarehouseOrchestratorConfig {
  readonly database: DatabaseConnection;
  readonly taskService: TaskService;
  readonly inventoryService: InventoryService;
  readonly qualityService: QualityService;
}

export class WarehouseOrchestrator {
  private readonly database: DatabaseConnection;
  private readonly taskService: TaskService;
  private readonly inventoryService: InventoryService;
  private readonly qualityService: QualityService;

  public constructor(config: WarehouseOrchestratorConfig) {
    this.database = config.database;
    this.taskService = config.taskService;
    this.inventoryService = config.inventoryService;
    this.qualityService = config.qualityService;
  }

  /**
   * Initializes a warehouse task linked to a commercial order and optional order item.
   *
   * Coordinates:
   * 1. Validates order existence and extracts verified client_id.
   * 2. Validates order item link if provided, ensuring strict relational consistency.
   * 3. Creates the warehouse task in PENDING status via TaskService.
   *
   * @param request Task initialization request from order context.
   * @param actorUserId Server-resolved authenticated user ID.
   */
  public async initializeTaskFromOrder(
    request: InitializeTaskFromOrderRequest,
    actorUserId: string
  ): Promise<TaskRecord> {
    this.assertActor(actorUserId);

    const parseResult = initializeTaskFromOrderRequestSchema.safeParse(request);
    if (!parseResult.success) {
      throw new OrchestrationDomainError(
        "VALIDATION_FAILED",
        parseResult.error.issues[0]?.message ?? "Invalid request"
      );
    }

    const {
      order_id,
      order_item_id,
      task_type,
      depot_id,
      planned_box_quantity,
      inventory_item_id,
      inventory_batch_id,
      source_location_id,
      destination_location_id,
      shift_id,
      correlation_id
    } = parseResult.data;

    // 1. Verify order exists and retrieve client_id
    const order = await this.database
      .selectFrom("orders")
      .selectAll()
      .where("id", "=", order_id)
      .executeTakeFirst();

    if (!order) {
      throw new OrchestrationDomainError(
        "ORDER_NOT_FOUND",
        `Order with ID '${order_id}' was not found.`
      );
    }

    // 2. If order item is specified, verify existence and linkage
    if (order_item_id) {
      const orderItem = await this.database
        .selectFrom("order_items")
        .selectAll()
        .where("id", "=", order_item_id)
        .executeTakeFirst();

      if (!orderItem) {
        throw new OrchestrationDomainError(
          "ORDER_ITEM_NOT_FOUND",
          `Order item with ID '${order_item_id}' was not found.`
        );
      }

      if (orderItem.order_id !== order_id) {
        throw new OrchestrationDomainError(
          "INVALID_ORDER_LINKAGE",
          `Order item '${order_item_id}' does not belong to order '${order_id}'.`
        );
      }
    }

    // 3. Create the task via TaskService
    const createdTask = await this.taskService.createTask(
      {
        ...(depot_id !== undefined ? { depot_id } : {}),
        ...(task_type !== undefined ? { task_type } : {}),
        client_id: order.client_id,
        order_id: order.id,
        ...(order_item_id !== undefined ? { order_item_id } : {}),
        ...(inventory_item_id !== undefined ? { inventory_item_id } : {}),
        ...(inventory_batch_id !== undefined ? { inventory_batch_id } : {}),
        ...(source_location_id !== undefined ? { source_location_id } : {}),
        ...(destination_location_id !== undefined ? { destination_location_id } : {}),
        ...(shift_id !== undefined ? { shift_id } : {}),
        ...(planned_box_quantity !== undefined ? { planned_box_quantity } : {}),
        ...(correlation_id !== undefined ? { correlation_id } : {})
      },
      actorUserId,
      {
        metadata: {
          initialized_from_order: true,
          order_id: order.id
        }
      }
    );

    return createdTask;
  }

  /**
   * Coordinates inventory movement for an operational task in ONE atomic PostgreSQL transaction.
   *
   * Transaction writes (all 5 commit or rollback together):
   * 1. inventory_balances source decrement
   * 2. inventory_balances destination increment / insert
   * 3. inventory_movements record insert
   * 4. tasks location / batch / version update
   * 5. task_events TASK_MOVEMENT_EXECUTED audit event insert
   *
   * @param request Coordinated task movement request.
   * @param actorUserId Server-resolved authenticated user ID.
   */
  public async executeTaskMovement(
    request: ExecuteTaskMovementRequest,
    actorUserId: string
  ): Promise<{ task: TaskRecord; movement: MoveInventoryResult }> {
    this.assertActor(actorUserId);

    const parseResult = executeTaskMovementRequestSchema.safeParse(request);
    if (!parseResult.success) {
      throw new OrchestrationDomainError(
        "VALIDATION_FAILED",
        parseResult.error.issues[0]?.message ?? "Invalid movement request"
      );
    }

    const {
      task_id,
      inventory_batch_id,
      source_location_id,
      destination_location_id,
      box_quantity,
      movement_type,
      idempotency_key,
      correlation_id
    } = parseResult.data;

    // Execute the ENTIRE coordinated operation inside ONE single PostgreSQL transaction
    return this.database.transaction().execute(async (trx) => {
      // 1. Acquire row lock on task and verify state
      const taskRow = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", task_id)
        .forUpdate()
        .executeTakeFirst();

      if (!taskRow) {
        throw new OrchestrationDomainError(
          "TASK_NOT_FOUND",
          `Task with ID '${task_id}' was not found.`
        );
      }

      if (taskRow.status === "COMPLETED" || taskRow.status === "CANCELLED") {
        throw new OrchestrationDomainError(
          "INVALID_TASK_STATE",
          `Cannot execute inventory movement for task in status '${taskRow.status}'.`
        );
      }

      // 2. Execute authoritative inventory movement inside the SAME transaction handle (trx)
      const movementResult = await this.inventoryService.moveInventory(
        {
          inventory_batch_id,
          source_location_id: source_location_id ?? null,
          destination_location_id: destination_location_id ?? null,
          box_quantity,
          task_id,
          movement_type,
          ...(idempotency_key !== undefined ? { idempotency_key } : {}),
          ...(correlation_id !== undefined ? { correlation_id } : {})
        },
        actorUserId,
        trx
      );

      // 3. If this was an idempotent replay, do NOT append duplicate task events or increment version again
      if (movementResult.is_idempotent_replay) {
        return {
          task: this.taskService.formatTask(taskRow),
          movement: movementResult
        };
      }

      // 4. Update task location references and version inside the SAME transaction
      const now = new Date();
      await trx
        .updateTable("tasks")
        .set({
          inventory_batch_id,
          source_location_id: source_location_id ?? taskRow.source_location_id,
          destination_location_id: destination_location_id ?? taskRow.destination_location_id,
          updated_at: now,
          version: sql`version + 1`
        })
        .where("id", "=", task_id)
        .execute();

      // 5. Insert TASK_MOVEMENT_EXECUTED audit event inside the SAME transaction
      const eventId = crypto.randomUUID();
      await trx
        .insertInto("task_events")
        .values({
          id: eventId,
          task_id,
          event_type: "TASK_MOVEMENT_EXECUTED",
          event_at: now,
          actor_user_id: actorUserId,
          correlation_id: correlation_id ?? null,
          metadata: JSON.stringify({
            movement_id: movementResult.movement.id,
            movement_type: movementResult.movement.movement_type,
            box_quantity: movementResult.movement.box_quantity.toString(),
            source_location_id: movementResult.movement.source_location_id,
            destination_location_id: movementResult.movement.destination_location_id
          }),
          created_at: now
        })
        .execute();

      // 6. Fetch updated task state from within the SAME transaction
      const updatedTaskRow = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", task_id)
        .executeTakeFirstOrThrow();

      return {
        task: this.taskService.formatTask(updatedTaskRow),
        movement: movementResult
      };
    });
  }

  /**
   * Retrieves a consolidated, authoritative closed-loop summary across:
   * CLIENT/ORDER -> TASK -> INVENTORY MOVEMENTS -> QUALITY INSPECTIONS -> AUDIT EVENTS.
   *
   * @param taskId Unique identifier of the task.
   */
  public async getClosedLoopTaskSummary(taskId: string): Promise<ClosedLoopTaskSummary> {
    const task = await this.taskService.getTask(taskId);
    if (!task) {
      throw new OrchestrationDomainError(
        "TASK_NOT_FOUND",
        `Task with ID '${taskId}' was not found.`
      );
    }

    // Fetch order if present
    let order: ClosedLoopTaskSummary["order"] = null;
    if (task.order_id) {
      const orderRow = await this.database
        .selectFrom("orders")
        .selectAll()
        .where("id", "=", task.order_id)
        .executeTakeFirst();

      if (orderRow) {
        order = {
          id: orderRow.id,
          client_id: orderRow.client_id,
          created_at: new Date(orderRow.created_at),
          updated_at: new Date(orderRow.updated_at),
          version: BigInt(orderRow.version)
        };
      }
    }

    // Fetch order item if present
    let orderItem: ClosedLoopTaskSummary["order_item"] = null;
    if (task.order_item_id) {
      const itemRow = await this.database
        .selectFrom("order_items")
        .selectAll()
        .where("id", "=", task.order_item_id)
        .executeTakeFirst();

      if (itemRow) {
        orderItem = {
          id: itemRow.id,
          order_id: itemRow.order_id,
          created_at: new Date(itemRow.created_at),
          updated_at: new Date(itemRow.updated_at),
          version: BigInt(itemRow.version)
        };
      }
    }

    // Fetch task assignments
    const assignments = await this.taskService.getTaskAssignments(taskId);

    // Fetch task photos
    const photos = await this.qualityService.getTaskPhotos(taskId);

    // Fetch inventory movements linked to this task
    const movementRows = await this.database
      .selectFrom("inventory_movements")
      .selectAll()
      .where("task_id", "=", taskId)
      .orderBy("occurred_at", "asc")
      .execute();

    const movements = movementRows.map((m) => ({
      id: m.id,
      inventory_batch_id: m.inventory_batch_id,
      source_location_id: m.source_location_id,
      destination_location_id: m.destination_location_id,
      box_quantity: BigInt(m.box_quantity),
      task_id: m.task_id,
      movement_type: m.movement_type,
      occurred_at: new Date(m.occurred_at),
      actor_user_id: m.actor_user_id,
      idempotency_key: m.idempotency_key,
      correlation_id: m.correlation_id,
      created_at: new Date(m.created_at)
    }));

    // Fetch quality inspection records
    const qualityRecords = await this.qualityService.getTaskQualityHistory(taskId);

    // Fetch all task events
    const events = await this.taskService.getTaskEvents(taskId);

    return {
      task,
      order,
      order_item: orderItem,
      assignments,
      photos,
      movements,
      quality_records: qualityRecords,
      events
    };
  }

  private assertActor(actorUserId: string): void {
    if (!actorUserId || actorUserId.trim() === "") {
      throw new OrchestrationDomainError(
        "UNAUTHORIZED_ACTOR",
        "Actor user ID is required from authenticated context."
      );
    }
  }
}
