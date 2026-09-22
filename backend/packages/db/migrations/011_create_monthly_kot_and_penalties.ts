import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .createTable("monthly_kot")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("effective_month", "text", (column) => column.notNull())
    .addColumn("kot_value", "numeric", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull().defaultTo("ACTIVE"))
    .addColumn("created_by_user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("restrict"))
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("monthly_kot_version_positive", sql`version >= 1`)
    .addCheckConstraint("monthly_kot_value_non_negative", sql`kot_value >= 0`)
    .execute();

  await database.schema
    .createIndex("monthly_kot_effective_month_unique_index")
    .on("monthly_kot")
    .column("effective_month")
    .unique()
    .execute();

  await database.schema
    .createIndex("monthly_kot_created_by_user_id_index")
    .on("monthly_kot")
    .column("created_by_user_id")
    .execute();

  await database.schema
    .createTable("manual_penalties")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("employee_id", "uuid", (column) => column.notNull().references("employees.id").onDelete("restrict"))
    .addColumn("task_id", "uuid", (column) => column.references("tasks.id").onDelete("restrict"))
    .addColumn("amount", "numeric", (column) => column.notNull())
    .addColumn("reason", "text", (column) => column.notNull())
    .addColumn("effective_month", "text", (column) => column.notNull())
    .addColumn("recorded_by_user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("restrict"))
    .addColumn("status", "text", (column) => column.notNull().defaultTo("ACTIVE"))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("manual_penalties_version_positive", sql`version >= 1`)
    .addCheckConstraint("manual_penalties_amount_positive", sql`amount > 0`)
    .execute();

  await database.schema
    .createIndex("manual_penalties_employee_month_index")
    .on("manual_penalties")
    .columns(["employee_id", "effective_month"])
    .execute();

  await database.schema
    .createIndex("manual_penalties_task_id_index")
    .on("manual_penalties")
    .column("task_id")
    .execute();

  await database.schema
    .createIndex("manual_penalties_recorded_by_user_id_index")
    .on("manual_penalties")
    .column("recorded_by_user_id")
    .execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema.dropTable("manual_penalties").execute();
  await database.schema.dropTable("monthly_kot").execute();
}
