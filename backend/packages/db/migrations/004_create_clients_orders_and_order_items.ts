import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .createTable("clients")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("clients_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createTable("orders")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("client_id", "uuid", (column) => column.notNull().references("clients.id").onDelete("restrict"))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("orders_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("orders_client_id_index")
    .on("orders")
    .column("client_id")
    .execute();

  await database.schema
    .createTable("order_items")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("order_id", "uuid", (column) => column.notNull().references("orders.id").onDelete("restrict"))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("order_items_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("order_items_order_id_index")
    .on("order_items")
    .column("order_id")
    .execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema.dropTable("order_items").execute();
  await database.schema.dropTable("orders").execute();
  await database.schema.dropTable("clients").execute();
}
