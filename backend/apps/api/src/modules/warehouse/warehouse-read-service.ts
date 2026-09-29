import type {
  ListLocationsFilter,
  ListWarehouseOperationsFilter,
  LocationDTO,
  OperationActivityDTO,
  OperationAssigneeDTO,
  OperationTimingEventDTO,
  WarehouseOperationDetailDTO,
  WarehouseOperationDTO
} from "@royal-packaging/contracts";
import {
  ALL_MAPPED_TASK_TYPES,
  classifyTaskType,
  TASK_TYPE_OPERATION_SYNONYMS,
  taskDisplayCode,
  TIMING_EVENT_TYPES
} from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";

export interface WarehouseReadServiceConfig {
  readonly database: DatabaseConnection;
}

export interface Page<T> {
  readonly items: T[];
  readonly total: number;
}

export interface OperationScope {
  /** When set, only tasks actively assigned to this employee are visible. */
  readonly employeeId?: string;
}

/**
 * Read-only warehouse projections over existing tables (tasks, assignments,
 * events, depots, locations, inventory, orders). No writes, no new model:
 * task lifecycle changes stay in TaskService.
 */
export class WarehouseReadService {
  private readonly database: DatabaseConnection;

  public constructor(config: WarehouseReadServiceConfig) {
    this.database = config.database;
  }

  /** Active employee linked to a user, or null (no employee profile = no personal task queue). */
  public async findActiveEmployeeId(userId: string): Promise<string | null> {
    const employee = await this.database
      .selectFrom("employees")
      .select("id")
      .where("user_id", "=", userId)
      .where("is_active", "=", true)
      .executeTakeFirst();
    return employee?.id ?? null;
  }

  /** Whether a depot with this code exists (active or not: history in a closed depot stays readable). */
  public async warehouseExists(code: string): Promise<boolean> {
    const row = await this.database.selectFrom("depots").select("id").where(sql<string>`upper(code)`, "=", code.toUpperCase()).executeTakeFirst();
    return !!row;
  }

  public async employeeExists(employeeId: string): Promise<boolean> {
    const row = await this.database.selectFrom("employees").select("id").where("id", "=", employeeId).executeTakeFirst();
    return !!row;
  }

  public async listOperations(
    filter: ListWarehouseOperationsFilter,
    scope: OperationScope,
    page: { limit: number; offset: number }
  ): Promise<Page<WarehouseOperationDTO>> {
    const [countRow, rows] = await Promise.all([
      this.filtered(filter, scope).select(sql<string>`count(*)`.as("total")).executeTakeFirst(),
      this.withColumns(this.filtered(filter, scope))
        .orderBy("tasks.created_at", "desc")
        .orderBy("tasks.id", "asc")
        .limit(page.limit)
        .offset(page.offset)
        .execute()
    ]);

    return { items: await this.hydrate(rows), total: Number(countRow?.total ?? 0) };
  }

  public async getOperation(taskId: string, scope: OperationScope): Promise<WarehouseOperationDetailDTO | null> {
    const row = await this.withColumns(this.filtered({}, scope)).where("tasks.id", "=", taskId).executeTakeFirst();
    if (!row) {
      return null;
    }
    const [operation] = await this.hydrate([row]);
    if (!operation) {
      return null;
    }

    const events = await this.database
      .selectFrom("task_events")
      .leftJoin("users", "users.id", "task_events.actor_user_id")
      .leftJoin("employees", (join) => join.onRef("employees.user_id", "=", "task_events.actor_user_id").on("employees.is_active", "=", true))
      .select([
        "task_events.id",
        "task_events.event_type",
        "task_events.event_at",
        "employees.name as employee_name",
        "users.login_identifier as login_identifier"
      ])
      .where("task_events.task_id", "=", taskId)
      .orderBy("task_events.event_at", "asc")
      .orderBy("task_events.id", "asc")
      .execute();

    const activity: OperationActivityDTO[] = events.map((event) => ({
      id: event.id,
      event_type: event.event_type,
      event_at: event.event_at,
      actor: event.employee_name ?? event.login_identifier ?? null
    }));

    return { ...operation, activity };
  }

  public async listLocations(filter: ListLocationsFilter, page: { limit: number; offset: number }): Promise<Page<LocationDTO>> {
    let base = this.database
      .selectFrom("locations")
      .innerJoin("depots", "depots.id", "locations.depot_id")
      .leftJoin("locations as parent", "parent.id", "locations.parent_location_id");

    if (filter.warehouse_code) {
      base = base.where(sql<string>`upper(depots.code)`, "=", filter.warehouse_code.toUpperCase());
    }
    if (filter.active !== undefined) {
      base = base.where("locations.active", "=", filter.active);
    }
    if (filter.search) {
      const term = `%${escapeLike(filter.search)}%`;
      base = base.where((eb) =>
        eb.or([eb("locations.code", "ilike", term), eb("locations.name", "ilike", term), eb("depots.code", "ilike", term), eb("depots.name", "ilike", term)])
      );
    }

    const [countRow, rows] = await Promise.all([
      base.select(sql<string>`count(*)`.as("total")).executeTakeFirst(),
      base
        .select([
          "locations.id",
          "locations.code",
          "locations.name",
          "locations.active",
          "depots.id as depot_id",
          "depots.code as depot_code",
          "depots.name as depot_name",
          "depots.active as depot_active",
          "parent.id as parent_id",
          "parent.code as parent_code",
          "parent.name as parent_name",
          sql<string>`(select coalesce(sum(ib.box_quantity), 0) from inventory_balances ib where ib.location_id = locations.id)`.as("box_on_hand")
        ])
        .orderBy("depots.code", "asc")
        .orderBy("locations.code", "asc")
        .orderBy("locations.id", "asc")
        .limit(page.limit)
        .offset(page.offset)
        .execute()
    ]);

    return {
      total: Number(countRow?.total ?? 0),
      items: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        active: row.active,
        warehouse: { id: row.depot_id, code: row.depot_code, name: row.depot_name, active: row.depot_active },
        parent: row.parent_id && row.parent_code && row.parent_name ? { id: row.parent_id, code: row.parent_code, name: row.parent_name } : null,
        box_on_hand: Number(row.box_on_hand)
      }))
    };
  }

  // -------------------------------------------------------------------------

  /** tasks + joined references, with every filter and the scope applied. */
  private filtered(filter: ListWarehouseOperationsFilter, scope: OperationScope) {
    let query = this.database
      .selectFrom("tasks")
      .leftJoin("depots", "depots.id", "tasks.depot_id")
      .leftJoin("locations as src", "src.id", "tasks.source_location_id")
      .leftJoin("locations as dst", "dst.id", "tasks.destination_location_id")
      .leftJoin("inventory_items", "inventory_items.id", "tasks.inventory_item_id")
      .leftJoin("orders", "orders.id", "tasks.order_id");

    for (const employeeId of [scope.employeeId, filter.employee_id]) {
      if (!employeeId) continue;
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom("task_assignments")
            .select("task_assignments.id")
            .whereRef("task_assignments.task_id", "=", "tasks.id")
            .where("task_assignments.employee_id", "=", employeeId)
            .where("task_assignments.unassigned_at", "is", null)
        )
      );
    }
    if (filter.status) {
      query = query.where("tasks.status", "=", filter.status);
    }
    if (filter.operation_type && filter.operation_type.length > 0) {
      const operationTypes = filter.operation_type;
      query = query.where((eb) =>
        eb.or(
          operationTypes.map((operationType) =>
            operationType === "OTHER"
              ? eb.or([eb("tasks.task_type", "is", null), eb(sql<string>`upper(trim(tasks.task_type))`, "not in", [...ALL_MAPPED_TASK_TYPES])])
              : eb(sql<string>`upper(trim(tasks.task_type))`, "in", [...TASK_TYPE_OPERATION_SYNONYMS[operationType]])
          )
        )
      );
    }
    if (filter.warehouse_code) {
      query = query.where(sql<string>`upper(depots.code)`, "=", filter.warehouse_code.toUpperCase());
    }
    if (filter.search) {
      const term = `%${escapeLike(filter.search)}%`;
      query = query.where((eb) =>
        eb.or([
          eb(sql<string>`'TSK-' || upper(substr(replace(tasks.id::text, '-', ''), 1, 8))`, "ilike", term),
          eb("tasks.task_type", "ilike", term),
          eb("depots.code", "ilike", term),
          eb("depots.name", "ilike", term),
          eb("src.code", "ilike", term),
          eb("dst.code", "ilike", term),
          eb("inventory_items.name", "ilike", term),
          eb("inventory_items.product_code", "ilike", term),
          eb("orders.order_code", "ilike", term),
          eb.exists(
            eb
              .selectFrom("task_assignments")
              .innerJoin("employees", "employees.id", "task_assignments.employee_id")
              .select("task_assignments.id")
              .whereRef("task_assignments.task_id", "=", "tasks.id")
              .where("task_assignments.unassigned_at", "is", null)
              .where((inner) => inner.or([inner("employees.name", "ilike", term), inner("employees.employee_code", "ilike", term)]))
          )
        ])
      );
    }
    return query;
  }

  private withColumns(query: ReturnType<WarehouseReadService["filtered"]>) {
    return query.select([
      "tasks.id",
      "tasks.task_type",
      "tasks.status",
      "tasks.planned_box_quantity",
      "tasks.completed_box_quantity",
      "tasks.started_at",
      "tasks.paused_at",
      "tasks.completed_at",
      "tasks.created_at",
      "tasks.updated_at",
      "depots.id as depot_id",
      "depots.code as depot_code",
      "depots.name as depot_name",
      "src.id as src_id",
      "src.code as src_code",
      "src.name as src_name",
      "dst.id as dst_id",
      "dst.code as dst_code",
      "dst.name as dst_name",
      "inventory_items.id as item_id",
      "inventory_items.product_code as item_code",
      "inventory_items.name as item_name",
      "orders.id as order_id",
      "orders.order_code as order_code",
      "orders.priority as order_priority"
    ]);
  }

  private async hydrate(rows: OperationRow[]): Promise<WarehouseOperationDTO[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.id);

    const [assignments, timing] = await Promise.all([
      this.database
        .selectFrom("task_assignments")
        .innerJoin("employees", "employees.id", "task_assignments.employee_id")
        .select(["task_assignments.task_id", "employees.id as employee_id", "employees.employee_code", "employees.name"])
        .where("task_assignments.task_id", "in", ids)
        .where("task_assignments.unassigned_at", "is", null)
        .orderBy("task_assignments.assigned_at", "asc")
        .execute(),
      this.database
        .selectFrom("task_events")
        .select(["task_events.id", "task_events.task_id", "task_events.event_type", "task_events.event_at"])
        .where("task_events.task_id", "in", ids)
        .where("task_events.event_type", "in", [...TIMING_EVENT_TYPES])
        .orderBy("task_events.event_at", "asc")
        .orderBy("task_events.id", "asc")
        .execute()
    ]);

    return rows.map((row) => {
      const assignees: OperationAssigneeDTO[] = assignments
        .filter((assignment) => assignment.task_id === row.id)
        .map((assignment) => ({ employee_id: assignment.employee_id, employee_code: assignment.employee_code, name: assignment.name }));
      const timingEvents: OperationTimingEventDTO[] = timing
        .filter((event) => event.task_id === row.id)
        .map((event) => ({ id: event.id, event_type: event.event_type, event_at: event.event_at }));

      return {
        id: row.id,
        task_code: taskDisplayCode(row.id),
        task_type: row.task_type,
        operation_type: classifyTaskType(row.task_type),
        status: row.status,
        warehouse: ref(row.depot_id, row.depot_code, row.depot_name),
        source_location: ref(row.src_id, row.src_code, row.src_name),
        destination_location: ref(row.dst_id, row.dst_code, row.dst_name),
        inventory_item: row.item_id && row.item_code ? { id: row.item_id, product_code: row.item_code, name: row.item_name } : null,
        order: row.order_id && row.order_code && row.order_priority ? { id: row.order_id, order_code: row.order_code, priority: row.order_priority } : null,
        assignees,
        planned_box_quantity: toNumber(row.planned_box_quantity),
        completed_box_quantity: toNumber(row.completed_box_quantity),
        started_at: row.started_at,
        paused_at: row.paused_at,
        completed_at: row.completed_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        timing_events: timingEvents,
        sla: { target_seconds: null, status: "NOT_DEFINED" }
      };
    });
  }
}

interface OperationRow {
  id: string;
  task_type: string | null;
  status: string;
  planned_box_quantity: string | null;
  completed_box_quantity: string | null;
  started_at: Date | null;
  paused_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  depot_id: string | null;
  depot_code: string | null;
  depot_name: string | null;
  src_id: string | null;
  src_code: string | null;
  src_name: string | null;
  dst_id: string | null;
  dst_code: string | null;
  dst_name: string | null;
  item_id: string | null;
  item_code: string | null;
  item_name: string | null;
  order_id: string | null;
  order_code: string | null;
  order_priority: string | null;
}

function ref(id: string | null, code: string | null, name: string | null) {
  return id && code && name ? { id, code, name } : null;
}

function toNumber(value: string | number | bigint | null): number | null {
  return value === null ? null : Number(value);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
