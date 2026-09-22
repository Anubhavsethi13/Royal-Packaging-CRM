import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .createTable("tasks")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("depot_id", "uuid", (column) => column.references("depots.id").onDelete("restrict"))
    .addColumn("task_type", "text")
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("client_id", "uuid", (column) => column.references("clients.id").onDelete("restrict"))
    .addColumn("order_id", "uuid", (column) => column.references("orders.id").onDelete("restrict"))
    .addColumn("order_item_id", "uuid", (column) => column.references("order_items.id").onDelete("restrict"))
    .addColumn("inventory_item_id", "uuid", (column) => column.references("inventory_items.id").onDelete("restrict"))
    .addColumn("inventory_batch_id", "uuid", (column) => column.references("inventory_batches.id").onDelete("restrict"))
    .addColumn("source_location_id", "uuid", (column) => column.references("locations.id").onDelete("restrict"))
    .addColumn("destination_location_id", "uuid", (column) => column.references("locations.id").onDelete("restrict"))
    .addColumn("shift_id", "uuid", (column) => column.references("shifts.id").onDelete("restrict"))
    .addColumn("planned_box_quantity", "bigint")
    .addColumn("completed_box_quantity", "bigint")
    .addColumn("started_at", "timestamptz")
    .addColumn("paused_at", "timestamptz")
    .addColumn("completed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("tasks_version_positive", sql`version >= 1`)
    .addCheckConstraint("tasks_planned_box_quantity_non_negative", sql`planned_box_quantity is null or planned_box_quantity >= 0`)
    .addCheckConstraint("tasks_completed_box_quantity_non_negative", sql`completed_box_quantity is null or completed_box_quantity >= 0`)
    .execute();

  await database.schema
    .createIndex("tasks_status_index")
    .on("tasks")
    .column("status")
    .execute();

  await database.schema
    .createIndex("tasks_depot_id_index")
    .on("tasks")
    .column("depot_id")
    .execute();

  await database.schema
    .createIndex("tasks_order_id_index")
    .on("tasks")
    .column("order_id")
    .execute();

  await database.schema
    .createIndex("tasks_inventory_batch_id_index")
    .on("tasks")
    .column("inventory_batch_id")
    .execute();

  await database.schema
    .createIndex("tasks_source_location_id_index")
    .on("tasks")
    .column("source_location_id")
    .execute();

  await database.schema
    .createIndex("tasks_destination_location_id_index")
    .on("tasks")
    .column("destination_location_id")
    .execute();

  await database.schema
    .createTable("task_assignments")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("task_id", "uuid", (column) => column.notNull().references("tasks.id").onDelete("restrict"))
    .addColumn("employee_id", "uuid", (column) => column.notNull().references("employees.id").onDelete("restrict"))
    .addColumn("assigned_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("assigned_by_user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("restrict"))
    .addColumn("unassigned_at", "timestamptz")
    .addColumn("unassigned_by_user_id", "uuid", (column) => column.references("users.id").onDelete("restrict"))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("task_assignments_version_positive", sql`version >= 1`)
    .addCheckConstraint("task_assignments_unassigned_after_assigned", sql`unassigned_at is null or unassigned_at >= assigned_at`)
    .execute();

  await database.schema
    .createIndex("task_assignments_task_active_index")
    .on("task_assignments")
    .columns(["task_id", "unassigned_at"])
    .execute();

  await database.schema
    .createIndex("task_assignments_employee_active_index")
    .on("task_assignments")
    .columns(["employee_id", "unassigned_at"])
    .execute();

  await database.schema
    .createIndex("task_assignments_assigned_by_user_id_index")
    .on("task_assignments")
    .column("assigned_by_user_id")
    .execute();

  await database.schema
    .createTable("task_events")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("task_id", "uuid", (column) => column.notNull().references("tasks.id").onDelete("restrict"))
    .addColumn("event_type", "text", (column) => column.notNull())
    .addColumn("event_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("actor_user_id", "uuid", (column) => column.references("users.id").onDelete("restrict"))
    .addColumn("correlation_id", "uuid")
    .addColumn("metadata", "jsonb")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .execute();

  await database.schema
    .createIndex("task_events_task_id_event_at_index")
    .on("task_events")
    .columns(["task_id", "event_at"])
    .execute();

  await database.schema
    .createIndex("task_events_event_type_event_at_index")
    .on("task_events")
    .columns(["event_type", "event_at"])
    .execute();

  await database.schema
    .createIndex("task_events_actor_user_id_index")
    .on("task_events")
    .column("actor_user_id")
    .execute();

  await database.schema
    .createIndex("task_events_correlation_id_index")
    .on("task_events")
    .column("correlation_id")
    .execute();

  await database.schema
    .alterTable("inventory_movements")
    .addForeignKeyConstraint(
      "inventory_movements_task_id_foreign",
      ["task_id"],
      "tasks",
      ["id"]
    )
    .onDelete("restrict")
    .execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .alterTable("inventory_movements")
    .dropConstraint("inventory_movements_task_id_foreign")
    .execute();

  await database.schema.dropTable("task_events").execute();
  await database.schema.dropTable("task_assignments").execute();
  await database.schema.dropTable("tasks").execute();
}
