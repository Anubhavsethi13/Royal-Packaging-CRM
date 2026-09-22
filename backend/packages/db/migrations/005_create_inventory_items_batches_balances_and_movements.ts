import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .createTable("inventory_items")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("product_code", "text", (column) => column.notNull())
    .addColumn("name", "text")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addUniqueConstraint("inventory_items_product_code_unique", ["product_code"])
    .addCheckConstraint("inventory_items_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createTable("inventory_batches")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("inventory_item_id", "uuid", (column) => column.notNull().references("inventory_items.id").onDelete("restrict"))
    .addColumn("batch_number", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addUniqueConstraint("inventory_batches_item_batch_unique", ["inventory_item_id", "batch_number"])
    .addCheckConstraint("inventory_batches_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("inventory_batches_inventory_item_id_index")
    .on("inventory_batches")
    .column("inventory_item_id")
    .execute();

  await database.schema
    .createTable("inventory_balances")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("inventory_batch_id", "uuid", (column) => column.notNull().references("inventory_batches.id").onDelete("restrict"))
    .addColumn("location_id", "uuid", (column) => column.notNull().references("locations.id").onDelete("restrict"))
    .addColumn("box_quantity", "bigint", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addUniqueConstraint("inventory_balances_batch_location_unique", ["inventory_batch_id", "location_id"])
    .addCheckConstraint("inventory_balances_box_quantity_non_negative", sql`box_quantity >= 0`)
    .addCheckConstraint("inventory_balances_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("inventory_balances_inventory_batch_id_index")
    .on("inventory_balances")
    .column("inventory_batch_id")
    .execute();

  await database.schema
    .createIndex("inventory_balances_location_id_index")
    .on("inventory_balances")
    .column("location_id")
    .execute();

  await database.schema
    .createIndex("inventory_balances_location_batch_index")
    .on("inventory_balances")
    .columns(["location_id", "inventory_batch_id"])
    .execute();

  await database.schema
    .createTable("inventory_movements")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("inventory_batch_id", "uuid", (column) => column.notNull().references("inventory_batches.id").onDelete("restrict"))
    .addColumn("source_location_id", "uuid", (column) => column.references("locations.id").onDelete("restrict"))
    .addColumn("destination_location_id", "uuid", (column) => column.references("locations.id").onDelete("restrict"))
    .addColumn("box_quantity", "bigint", (column) => column.notNull())
    .addColumn("task_id", "uuid")
    .addColumn("movement_type", "text", (column) => column.notNull())
    .addColumn("occurred_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("actor_user_id", "uuid", (column) => column.references("users.id").onDelete("restrict"))
    .addColumn("idempotency_key", "text")
    .addColumn("correlation_id", "uuid")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("inventory_movements_box_quantity_positive", sql`box_quantity > 0`)
    .addUniqueConstraint("inventory_movements_idempotency_key_unique", ["idempotency_key"])
    .execute();

  await database.schema
    .createIndex("inventory_movements_batch_occurred_index")
    .on("inventory_movements")
    .columns(["inventory_batch_id", "occurred_at"])
    .execute();

  await database.schema
    .createIndex("inventory_movements_source_location_id_index")
    .on("inventory_movements")
    .column("source_location_id")
    .execute();

  await database.schema
    .createIndex("inventory_movements_destination_location_id_index")
    .on("inventory_movements")
    .column("destination_location_id")
    .execute();

  await database.schema
    .createIndex("inventory_movements_task_id_index")
    .on("inventory_movements")
    .column("task_id")
    .execute();

  await database.schema
    .createIndex("inventory_movements_actor_user_id_index")
    .on("inventory_movements")
    .column("actor_user_id")
    .execute();

  await database.schema
    .createIndex("inventory_movements_correlation_id_index")
    .on("inventory_movements")
    .column("correlation_id")
    .execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema.dropTable("inventory_movements").execute();
  await database.schema.dropTable("inventory_balances").execute();
  await database.schema.dropTable("inventory_batches").execute();
  await database.schema.dropTable("inventory_items").execute();
}
