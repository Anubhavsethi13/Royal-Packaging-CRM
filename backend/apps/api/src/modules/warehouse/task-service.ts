import crypto from "node:crypto";
import type {
  AssignTaskRequest,
  CancelTaskRequest,
  CompleteTaskRequest,
  CreateTaskRequest,
  ListTasksFilter,
  ReopenTaskRequest,
  TaskAssignmentRecord,
  TaskEventRecord,
  TaskRecord,
  TaskTransitionOptions,
  UnassignTaskRequest
} from "@royal-packaging/contracts";
import {
  assignTaskRequestSchema,
  cancelTaskRequestSchema,
  completeTaskRequestSchema,
  createTaskRequestSchema,
  reopenTaskRequestSchema,
  TaskDomainError,
  unassignTaskRequestSchema
} from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";

export interface TaskServiceConfig {
  readonly database: DatabaseConnection;
}

export class TaskService {
  private readonly database: DatabaseConnection;

  public constructor(config: TaskServiceConfig) {
    this.database = config.database;
  }

  /**
   * Creates a new warehouse task in PENDING status within a database transaction,
   * appending an initial TASK_CREATED event.
   */
  public async createTask(
    request: CreateTaskRequest,
    actorUserId: string,
    options?: TaskTransitionOptions
  ): Promise<TaskRecord> {
    this.assertActor(actorUserId);

    const parseResult = createTaskRequestSchema.safeParse(request);
    if (!parseResult.success) {
      throw new TaskDomainError("VALIDATION_FAILED", parseResult.error.issues[0]?.message ?? "Invalid request");
    }

    const {
      depot_id,
      task_type,
      client_id,
      order_id,
      order_item_id,
      inventory_item_id,
      inventory_batch_id,
      source_location_id,
      destination_location_id,
      shift_id,
      planned_box_quantity,
      correlation_id
    } = parseResult.data;

    const plannedQty = planned_box_quantity !== undefined ? BigInt(planned_box_quantity) : null;
    if (plannedQty !== null && plannedQty < 0n) {
      throw new TaskDomainError("INVALID_QUANTITY", "Planned box quantity cannot be negative.");
    }

    const effCorrelationId = correlation_id ?? options?.correlation_id ?? null;

    return this.database.transaction().execute(async (trx) => {
      const taskId = crypto.randomUUID();
      const now = new Date();

      await trx
        .insertInto("tasks")
        .values({
          id: taskId,
          depot_id: depot_id ?? null,
          task_type: task_type ?? null,
          status: "PENDING",
          client_id: client_id ?? null,
          order_id: order_id ?? null,
          order_item_id: order_item_id ?? null,
          inventory_item_id: inventory_item_id ?? null,
          inventory_batch_id: inventory_batch_id ?? null,
          source_location_id: source_location_id ?? null,
          destination_location_id: destination_location_id ?? null,
          shift_id: shift_id ?? null,
          planned_box_quantity: plannedQty !== null ? plannedQty.toString() : null,
          completed_box_quantity: null,
          started_at: null,
          paused_at: null,
          completed_at: null,
          created_at: now,
          updated_at: now,
          version: sql`1`
        })
        .execute();

      const eventId = crypto.randomUUID();
      await trx
        .insertInto("task_events")
        .values({
          id: eventId,
          task_id: taskId,
          event_type: "TASK_CREATED",
          event_at: now,
          actor_user_id: actorUserId,
          correlation_id: effCorrelationId,
          metadata: options?.metadata ? JSON.stringify(options.metadata) : null,
          created_at: now
        })
        .execute();

      const created = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", taskId)
        .executeTakeFirstOrThrow();

      return this.formatTask(created);
    });
  }

  /**
   * Assigns an employee to a task within a database transaction.
   * Preserves historical assignment records, checks for duplicate active assignments,
   * updates task state if PENDING, and records an auditable task event.
   */
  public async assignTask(
    request: AssignTaskRequest,
    actorUserId: string,
    options?: TaskTransitionOptions
  ): Promise<TaskRecord> {
    this.assertActor(actorUserId);

    const parseResult = assignTaskRequestSchema.safeParse(request);
    if (!parseResult.success) {
      throw new TaskDomainError("VALIDATION_FAILED", parseResult.error.issues[0]?.message ?? "Invalid request");
    }

    const { task_id, employee_id, correlation_id } = parseResult.data;
    const effCorrelationId = correlation_id ?? options?.correlation_id ?? null;

    return this.database.transaction().execute(async (trx) => {
      const task = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", task_id)
        .forUpdate()
        .executeTakeFirst();

      if (!task) {
        throw new TaskDomainError("TASK_NOT_FOUND", `Task with ID '${task_id}' was not found.`);
      }

      if (task.status === "COMPLETED" || task.status === "CANCELLED") {
        throw new TaskDomainError(
          "INVALID_TASK_STATE",
          `Cannot assign employee to a task with status '${task.status}'.`
        );
      }

      const employee = await trx
        .selectFrom("employees")
        .select("id")
        .where("id", "=", employee_id)
        .executeTakeFirst();

      if (!employee) {
        throw new TaskDomainError("EMPLOYEE_NOT_FOUND", `Employee with ID '${employee_id}' was not found.`);
      }

      const activeAssignment = await trx
        .selectFrom("task_assignments")
        .selectAll()
        .where("task_id", "=", task_id)
        .where("employee_id", "=", employee_id)
        .where("unassigned_at", "is", null)
        .executeTakeFirst();

      if (activeAssignment) {
        throw new TaskDomainError(
          "DUPLICATE_ACTIVE_ASSIGNMENT",
          `Employee '${employee_id}' is already actively assigned to task '${task_id}'.`
        );
      }

      const now = new Date();
      const assignmentId = crypto.randomUUID();

      await trx
        .insertInto("task_assignments")
        .values({
          id: assignmentId,
          task_id,
          employee_id,
          assigned_at: now,
          assigned_by_user_id: actorUserId,
          unassigned_at: null,
          unassigned_by_user_id: null,
          version: "1"
        })
        .execute();

      let newStatus = task.status;
      if (task.status === "PENDING") {
        newStatus = "ASSIGNED";
      }

      await trx
        .updateTable("tasks")
        .set({
          status: newStatus,
          updated_at: now,
          version: sql`version + 1`
        })
        .where("id", "=", task_id)
        .execute();

      const eventId = crypto.randomUUID();
      const eventMeta = JSON.stringify({
        employee_id,
        assignment_id: assignmentId,
        ...options?.metadata
      });

      await trx
        .insertInto("task_events")
        .values({
          id: eventId,
          task_id,
          event_type: "TASK_ASSIGNED",
          event_at: now,
          actor_user_id: actorUserId,
          correlation_id: effCorrelationId,
          metadata: eventMeta,
          created_at: now
        })
        .execute();

      const updated = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", task_id)
        .executeTakeFirstOrThrow();

      return this.formatTask(updated);
    });
  }

  /**
   * Unassigns an employee from a task within a database transaction.
   * Updates unassigned_at and unassigned_by_user_id, reverts to PENDING if no active assignments remain,
   * and records an auditable task event.
   */
  public async unassignTask(
    request: UnassignTaskRequest,
    actorUserId: string,
    options?: TaskTransitionOptions
  ): Promise<TaskRecord> {
    this.assertActor(actorUserId);

    const parseResult = unassignTaskRequestSchema.safeParse(request);
    if (!parseResult.success) {
      throw new TaskDomainError("VALIDATION_FAILED", parseResult.error.issues[0]?.message ?? "Invalid request");
    }

    const { task_id, employee_id, correlation_id } = parseResult.data;
    const effCorrelationId = correlation_id ?? options?.correlation_id ?? null;

    return this.database.transaction().execute(async (trx) => {
      const task = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", task_id)
        .forUpdate()
        .executeTakeFirst();

      if (!task) {
        throw new TaskDomainError("TASK_NOT_FOUND", `Task with ID '${task_id}' was not found.`);
      }

      const activeAssignment = await trx
        .selectFrom("task_assignments")
        .selectAll()
        .where("task_id", "=", task_id)
        .where("employee_id", "=", employee_id)
        .where("unassigned_at", "is", null)
        .forUpdate()
        .executeTakeFirst();

      if (!activeAssignment) {
        throw new TaskDomainError(
          "ASSIGNMENT_NOT_FOUND",
          `No active assignment found for employee '${employee_id}' on task '${task_id}'.`
        );
      }

      const now = new Date();

      await trx
        .updateTable("task_assignments")
        .set({
          unassigned_at: now,
          unassigned_by_user_id: actorUserId,
          version: sql`version + 1`
        })
        .where("id", "=", activeAssignment.id)
        .execute();

      const remainingActive = await trx
        .selectFrom("task_assignments")
        .select("id")
        .where("task_id", "=", task_id)
        .where("unassigned_at", "is", null)
        .execute();

      let newStatus = task.status;
      if (remainingActive.length === 0 && task.status === "ASSIGNED") {
        newStatus = "PENDING";
      }

      await trx
        .updateTable("tasks")
        .set({
          status: newStatus,
          updated_at: now,
          version: sql`version + 1`
        })
        .where("id", "=", task_id)
        .execute();

      const eventId = crypto.randomUUID();
      const eventMeta = JSON.stringify({
        employee_id,
        assignment_id: activeAssignment.id,
        ...options?.metadata
      });

      await trx
        .insertInto("task_events")
        .values({
          id: eventId,
          task_id,
          event_type: "TASK_UNASSIGNED",
          event_at: now,
          actor_user_id: actorUserId,
          correlation_id: effCorrelationId,
          metadata: eventMeta,
          created_at: now
        })
        .execute();

      const updated = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", task_id)
        .executeTakeFirstOrThrow();

      return this.formatTask(updated);
    });
  }

  /**
   * Starts an assigned or pending task, transitioning it to IN_PROGRESS.
   * Initializes started_at if not already set, clears paused_at, and records a TASK_STARTED event.
   */
  public async startTask(
    taskId: string,
    actorUserId: string,
    options?: TaskTransitionOptions
  ): Promise<TaskRecord> {
    this.assertActor(actorUserId);

    return this.database.transaction().execute(async (trx) => {
      const task = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", taskId)
        .forUpdate()
        .executeTakeFirst();

      if (!task) {
        throw new TaskDomainError("TASK_NOT_FOUND", `Task with ID '${taskId}' was not found.`);
      }

      if (task.status !== "PENDING" && task.status !== "ASSIGNED") {
        throw new TaskDomainError(
          "INVALID_TASK_STATE",
          `Cannot start task in status '${task.status}'. Allowed source states: PENDING, ASSIGNED.`
        );
      }

      const now = new Date();
      const startedAt = task.started_at ?? now;

      await trx
        .updateTable("tasks")
        .set({
          status: "IN_PROGRESS",
          started_at: startedAt,
          paused_at: null,
          updated_at: now,
          version: sql`version + 1`
        })
        .where("id", "=", taskId)
        .execute();

      const eventId = crypto.randomUUID();
      await trx
        .insertInto("task_events")
        .values({
          id: eventId,
          task_id: taskId,
          event_type: "TASK_STARTED",
          event_at: now,
          actor_user_id: actorUserId,
          correlation_id: options?.correlation_id ?? null,
          metadata: options?.metadata ? JSON.stringify(options.metadata) : null,
          created_at: now
        })
        .execute();

      const updated = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", taskId)
        .executeTakeFirstOrThrow();

      return this.formatTask(updated);
    });
  }

  /**
   * Pauses an active IN_PROGRESS task.
   * Sets paused_at, status = PAUSED, and records a TASK_PAUSED event.
   */
  public async pauseTask(
    taskId: string,
    actorUserId: string,
    options?: TaskTransitionOptions
  ): Promise<TaskRecord> {
    this.assertActor(actorUserId);

    return this.database.transaction().execute(async (trx) => {
      const task = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", taskId)
        .forUpdate()
        .executeTakeFirst();

      if (!task) {
        throw new TaskDomainError("TASK_NOT_FOUND", `Task with ID '${taskId}' was not found.`);
      }

      if (task.status !== "IN_PROGRESS") {
        throw new TaskDomainError(
          "INVALID_TASK_STATE",
          `Cannot pause task in status '${task.status}'. Task must be IN_PROGRESS.`
        );
      }

      const now = new Date();

      await trx
        .updateTable("tasks")
        .set({
          status: "PAUSED",
          paused_at: now,
          updated_at: now,
          version: sql`version + 1`
        })
        .where("id", "=", taskId)
        .execute();

      const eventId = crypto.randomUUID();
      await trx
        .insertInto("task_events")
        .values({
          id: eventId,
          task_id: taskId,
          event_type: "TASK_PAUSED",
          event_at: now,
          actor_user_id: actorUserId,
          correlation_id: options?.correlation_id ?? null,
          metadata: options?.metadata ? JSON.stringify(options.metadata) : null,
          created_at: now
        })
        .execute();

      const updated = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", taskId)
        .executeTakeFirstOrThrow();

      return this.formatTask(updated);
    });
  }

  /**
   * Resumes a PAUSED task, transitioning it back to IN_PROGRESS.
   * Clears paused_at and records a TASK_RESUMED event.
   */
  public async resumeTask(
    taskId: string,
    actorUserId: string,
    options?: TaskTransitionOptions
  ): Promise<TaskRecord> {
    this.assertActor(actorUserId);

    return this.database.transaction().execute(async (trx) => {
      const task = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", taskId)
        .forUpdate()
        .executeTakeFirst();

      if (!task) {
        throw new TaskDomainError("TASK_NOT_FOUND", `Task with ID '${taskId}' was not found.`);
      }

      if (task.status !== "PAUSED") {
        throw new TaskDomainError(
          "INVALID_TASK_STATE",
          `Cannot resume task in status '${task.status}'. Task must be PAUSED.`
        );
      }

      const now = new Date();

      await trx
        .updateTable("tasks")
        .set({
          status: "IN_PROGRESS",
          paused_at: null,
          updated_at: now,
          version: sql`version + 1`
        })
        .where("id", "=", taskId)
        .execute();

      const eventId = crypto.randomUUID();
      await trx
        .insertInto("task_events")
        .values({
          id: eventId,
          task_id: taskId,
          event_type: "TASK_RESUMED",
          event_at: now,
          actor_user_id: actorUserId,
          correlation_id: options?.correlation_id ?? null,
          metadata: options?.metadata ? JSON.stringify(options.metadata) : null,
          created_at: now
        })
        .execute();

      const updated = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", taskId)
        .executeTakeFirstOrThrow();

      return this.formatTask(updated);
    });
  }

  /**
   * Completes a task, validating completed box quantity, recording completed_at,
   * setting status = COMPLETED, and appending a TASK_COMPLETED event.
   */
  public async completeTask(
    request: CompleteTaskRequest,
    actorUserId: string,
    options?: TaskTransitionOptions
  ): Promise<TaskRecord> {
    this.assertActor(actorUserId);

    const parseResult = completeTaskRequestSchema.safeParse(request);
    if (!parseResult.success) {
      throw new TaskDomainError("VALIDATION_FAILED", parseResult.error.issues[0]?.message ?? "Invalid request");
    }

    const { task_id, completed_box_quantity, correlation_id } = parseResult.data;
    const completedQty = BigInt(completed_box_quantity);
    if (completedQty < 0n) {
      throw new TaskDomainError("INVALID_QUANTITY", "Completed box quantity cannot be negative.");
    }

    const effCorrelationId = correlation_id ?? options?.correlation_id ?? null;

    return this.database.transaction().execute(async (trx) => {
      const task = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", task_id)
        .forUpdate()
        .executeTakeFirst();

      if (!task) {
        throw new TaskDomainError("TASK_NOT_FOUND", `Task with ID '${task_id}' was not found.`);
      }

      if (task.status !== "IN_PROGRESS" && task.status !== "PAUSED") {
        throw new TaskDomainError(
          "INVALID_TASK_STATE",
          `Cannot complete task in status '${task.status}'. Allowed source states: IN_PROGRESS, PAUSED.`
        );
      }

      // Check quality inspection gate: if quality records exist, latest non-superseded must not be failed / DAMAGED
      const latestQuality = await trx
        .selectFrom("quality_records")
        .selectAll()
        .where("task_id", "=", task_id)
        .where("superseded_by_record_id", "is", null)
        .orderBy("inspected_at", "desc")
        .orderBy("created_at", "desc")
        .executeTakeFirst();

      if (latestQuality) {
        const isFailed =
          latestQuality.outcome === "FAIL" ||
          latestQuality.final_inventory_status === "DAMAGED" ||
          (latestQuality.damage_rate !== null && Number(latestQuality.damage_rate) >= 5);

        if (isFailed) {
          throw new TaskDomainError(
            "QUALITY_GATE_FAILED",
            `Task cannot be completed because the latest quality inspection failed (outcome: '${latestQuality.outcome}', damage_rate: ${latestQuality.damage_rate ?? "N/A"}%). A passing quality inspection is required.`
          );
        }
      }

      const now = new Date();

      await trx
        .updateTable("tasks")
        .set({
          status: "COMPLETED",
          completed_box_quantity: completedQty.toString(),
          completed_at: now,
          paused_at: null,
          updated_at: now,
          version: sql`version + 1`
        })
        .where("id", "=", task_id)
        .execute();

      const eventId = crypto.randomUUID();
      const eventMeta = JSON.stringify({
        completed_box_quantity: completedQty.toString(),
        quality_gate: latestQuality ? latestQuality.outcome : "NOT_INSPECTED",
        ...options?.metadata
      });

      await trx
        .insertInto("task_events")
        .values({
          id: eventId,
          task_id,
          event_type: "TASK_COMPLETED",
          event_at: now,
          actor_user_id: actorUserId,
          correlation_id: effCorrelationId,
          metadata: eventMeta,
          created_at: now
        })
        .execute();

      const updated = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", task_id)
        .executeTakeFirstOrThrow();

      return this.formatTask(updated);
    });
  }

  /**
   * Cancels a task, recording the reason in metadata and appending a TASK_CANCELLED event.
   * Only unstarted tasks (PENDING, ASSIGNED) can be cancelled because tasks with in-transit inventory cannot be cancelled.
   */
  public async cancelTask(
    request: CancelTaskRequest,
    actorUserId: string,
    options?: TaskTransitionOptions
  ): Promise<TaskRecord> {
    this.assertActor(actorUserId);

    const parseResult = cancelTaskRequestSchema.safeParse(request);
    if (!parseResult.success) {
      throw new TaskDomainError("VALIDATION_FAILED", parseResult.error.issues[0]?.message ?? "Invalid request");
    }

    const { task_id, reason, correlation_id } = parseResult.data;
    const effCorrelationId = correlation_id ?? options?.correlation_id ?? null;

    return this.database.transaction().execute(async (trx) => {
      const task = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", task_id)
        .forUpdate()
        .executeTakeFirst();

      if (!task) {
        throw new TaskDomainError("TASK_NOT_FOUND", `Task with ID '${task_id}' was not found.`);
      }

      if (task.status !== "PENDING" && task.status !== "ASSIGNED") {
        throw new TaskDomainError(
          "INVALID_TASK_STATE",
          `Cannot cancel task in status '${task.status}'. Only unstarted tasks (PENDING, ASSIGNED) can be cancelled.`
        );
      }

      const now = new Date();

      await trx
        .updateTable("tasks")
        .set({
          status: "CANCELLED",
          updated_at: now,
          version: sql`version + 1`
        })
        .where("id", "=", task_id)
        .execute();

      const eventId = crypto.randomUUID();
      const eventMeta = JSON.stringify({
        reason,
        previous_status: task.status,
        ...options?.metadata
      });

      await trx
        .insertInto("task_events")
        .values({
          id: eventId,
          task_id,
          event_type: "TASK_CANCELLED",
          event_at: now,
          actor_user_id: actorUserId,
          correlation_id: effCorrelationId,
          metadata: eventMeta,
          created_at: now
        })
        .execute();

      const updated = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", task_id)
        .executeTakeFirstOrThrow();

      return this.formatTask(updated);
    });
  }

  /**
   * Reopens a completed or cancelled task back to IN_PROGRESS.
   * Clears completed_at and records a TASK_REOPENED event with reason.
   */
  public async reopenTask(
    request: ReopenTaskRequest,
    actorUserId: string,
    options?: TaskTransitionOptions
  ): Promise<TaskRecord> {
    this.assertActor(actorUserId);

    const parseResult = reopenTaskRequestSchema.safeParse(request);
    if (!parseResult.success) {
      throw new TaskDomainError("VALIDATION_FAILED", parseResult.error.issues[0]?.message ?? "Invalid request");
    }

    const { task_id, reason, correlation_id } = parseResult.data;
    const effCorrelationId = correlation_id ?? options?.correlation_id ?? null;

    return this.database.transaction().execute(async (trx) => {
      const task = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", task_id)
        .forUpdate()
        .executeTakeFirst();

      if (!task) {
        throw new TaskDomainError("TASK_NOT_FOUND", `Task with ID '${task_id}' was not found.`);
      }

      if (task.status !== "COMPLETED" && task.status !== "CANCELLED") {
        throw new TaskDomainError(
          "INVALID_TASK_STATE",
          `Cannot reopen task in status '${task.status}'. Task must be COMPLETED or CANCELLED.`
        );
      }

      const now = new Date();

      await trx
        .updateTable("tasks")
        .set({
          status: "IN_PROGRESS",
          completed_at: null,
          updated_at: now,
          version: sql`version + 1`
        })
        .where("id", "=", task_id)
        .execute();

      const eventId = crypto.randomUUID();
      const eventMeta = JSON.stringify({
        reason,
        previous_status: task.status,
        ...options?.metadata
      });

      await trx
        .insertInto("task_events")
        .values({
          id: eventId,
          task_id,
          event_type: "TASK_REOPENED",
          event_at: now,
          actor_user_id: actorUserId,
          correlation_id: effCorrelationId,
          metadata: eventMeta,
          created_at: now
        })
        .execute();

      const updated = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", task_id)
        .executeTakeFirstOrThrow();

      return this.formatTask(updated);
    });
  }

  /**
   * Retrieves a task by ID.
   */
  public async getTask(taskId: string): Promise<TaskRecord | null> {
    const row = await this.database
      .selectFrom("tasks")
      .selectAll()
      .where("id", "=", taskId)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return this.formatTask(row);
  }

  /**
   * Retrieves all assignment history records for a task.
   */
  public async getTaskAssignments(taskId: string): Promise<TaskAssignmentRecord[]> {
    const rows = await this.database
      .selectFrom("task_assignments")
      .selectAll()
      .where("task_id", "=", taskId)
      .orderBy("assigned_at", "asc")
      .execute();

    return rows.map((r) => ({
      id: r.id,
      task_id: r.task_id,
      employee_id: r.employee_id,
      assigned_at: r.assigned_at,
      assigned_by_user_id: r.assigned_by_user_id,
      unassigned_at: r.unassigned_at,
      unassigned_by_user_id: r.unassigned_by_user_id,
      version: BigInt(r.version)
    }));
  }

  /**
   * Retrieves all lifecycle events for a task.
   */
  public async getTaskEvents(taskId: string): Promise<TaskEventRecord[]> {
    const rows = await this.database
      .selectFrom("task_events")
      .selectAll()
      .where("task_id", "=", taskId)
      .orderBy("event_at", "asc")
      .execute();

    return rows.map((r) => ({
      id: r.id,
      task_id: r.task_id,
      event_type: r.event_type,
      event_at: r.event_at,
      actor_user_id: r.actor_user_id,
      correlation_id: r.correlation_id,
      metadata: r.metadata,
      created_at: r.created_at
    }));
  }

  /**
   * Retrieves all active tasks assigned to an employee.
   */
  public async getActiveTasksForEmployee(employeeId: string): Promise<TaskRecord[]> {
    const rows = await this.database
      .selectFrom("tasks")
      .innerJoin("task_assignments", "task_assignments.task_id", "tasks.id")
      .selectAll("tasks")
      .where("task_assignments.employee_id", "=", employeeId)
      .where("task_assignments.unassigned_at", "is", null)
      .where("tasks.status", "in", ["ASSIGNED", "IN_PROGRESS", "PAUSED"])
      .execute();

    return rows.map((r) => this.formatTask(r));
  }

  /**
   * Lists tasks with an optional filter set (status, assignee, depot, task
   * type, client/order linkage, and a created_at date range). `employee_id`
   * matches tasks with an active (non-unassigned) assignment for that
   * employee.
   */
  public async listTasks(filter: ListTasksFilter = {}): Promise<TaskRecord[]> {
    let query = this.database.selectFrom("tasks").selectAll("tasks");

    if (filter.employee_id) {
      query = query
        .innerJoin("task_assignments", "task_assignments.task_id", "tasks.id")
        .where("task_assignments.employee_id", "=", filter.employee_id)
        .where("task_assignments.unassigned_at", "is", null);
    }
    if (filter.status) {
      query = query.where("tasks.status", "=", filter.status);
    }
    if (filter.depot_id) {
      query = query.where("tasks.depot_id", "=", filter.depot_id);
    }
    if (filter.task_type) {
      query = query.where("tasks.task_type", "=", filter.task_type);
    }
    if (filter.client_id) {
      query = query.where("tasks.client_id", "=", filter.client_id);
    }
    if (filter.order_id) {
      query = query.where("tasks.order_id", "=", filter.order_id);
    }
    if (filter.from) {
      query = query.where("tasks.created_at", ">=", filter.from);
    }
    if (filter.to) {
      query = query.where("tasks.created_at", "<=", filter.to);
    }

    const rows = await query.orderBy("tasks.created_at", "desc").execute();
    return rows.map((row) => this.formatTask(row));
  }

  private assertActor(actorUserId: string): void {
    if (!actorUserId || actorUserId.trim() === "") {
      throw new TaskDomainError("UNAUTHORIZED_ACTOR", "Actor user ID is required from authenticated context.");
    }
  }

  public formatTask(row: {
    id: string;
    depot_id?: string | null;
    task_type?: string | null;
    status: string;
    client_id?: string | null;
    order_id?: string | null;
    order_item_id?: string | null;
    inventory_item_id?: string | null;
    inventory_batch_id?: string | null;
    source_location_id?: string | null;
    destination_location_id?: string | null;
    shift_id?: string | null;
    planned_box_quantity?: string | null;
    completed_box_quantity?: string | null;
    started_at?: Date | null;
    paused_at?: Date | null;
    completed_at?: Date | null;
    created_at?: Date;
    updated_at?: Date;
    version?: string | bigint;
  }): TaskRecord {
    return {
      id: row.id,
      depot_id: row.depot_id ?? null,
      task_type: row.task_type ?? null,
      status: row.status,
      client_id: row.client_id ?? null,
      order_id: row.order_id ?? null,
      order_item_id: row.order_item_id ?? null,
      inventory_item_id: row.inventory_item_id ?? null,
      inventory_batch_id: row.inventory_batch_id ?? null,
      source_location_id: row.source_location_id ?? null,
      destination_location_id: row.destination_location_id ?? null,
      shift_id: row.shift_id ?? null,
      planned_box_quantity: row.planned_box_quantity ? BigInt(row.planned_box_quantity) : null,
      completed_box_quantity: row.completed_box_quantity ? BigInt(row.completed_box_quantity) : null,
      started_at: row.started_at ?? null,
      paused_at: row.paused_at ?? null,
      completed_at: row.completed_at ?? null,
      created_at: row.created_at ?? new Date(),
      updated_at: row.updated_at ?? new Date(),
      version: typeof row.version === "bigint"
        ? row.version
        : typeof row.version === "number" || (typeof row.version === "string" && /^\d+$/.test(row.version))
          ? BigInt(row.version)
          : 1n
    };
  }
}

