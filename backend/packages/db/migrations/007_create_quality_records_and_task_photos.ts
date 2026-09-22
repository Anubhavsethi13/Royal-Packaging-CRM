import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .createTable("task_photos")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("task_id", "uuid", (column) => column.notNull().references("tasks.id").onDelete("restrict"))
    .addColumn("layer_number", "integer", (column) => column.notNull())
    .addColumn("box_quantity", "bigint", (column) => column.notNull())
    .addColumn("captured_by_employee_id", "uuid", (column) => column.references("employees.id").onDelete("restrict"))
    .addColumn("captured_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("storage_key", "text", (column) => column.notNull())
    .addColumn("status", "text")
    .addColumn("superseded_by_photo_id", "uuid", (column) => column.references("task_photos.id").onDelete("restrict"))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("task_photos_layer_number_positive", sql`layer_number > 0`)
    .addCheckConstraint("task_photos_box_quantity_positive", sql`box_quantity > 0`)
    .addCheckConstraint("task_photos_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("task_photos_task_id_index")
    .on("task_photos")
    .column("task_id")
    .execute();

  await database.schema
    .createIndex("task_photos_task_layer_index")
    .on("task_photos")
    .columns(["task_id", "layer_number"])
    .execute();

  await database.schema
    .createIndex("task_photos_storage_key_index")
    .on("task_photos")
    .column("storage_key")
    .execute();

  await database.schema
    .createIndex("task_photos_captured_by_employee_id_index")
    .on("task_photos")
    .column("captured_by_employee_id")
    .execute();

  await database.schema
    .createIndex("task_photos_status_index")
    .on("task_photos")
    .column("status")
    .execute();

  await database.schema
    .createTable("quality_records")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("task_id", "uuid", (column) => column.notNull().references("tasks.id").onDelete("restrict"))
    .addColumn("outcome", "text", (column) => column.notNull())
    .addColumn("quality_score", "numeric")
    .addColumn("damage_rate", "numeric")
    .addColumn("task_accuracy", "numeric")
    .addColumn("final_inventory_status", "text")
    .addColumn("inspected_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("inspected_by_user_id", "uuid", (column) => column.references("users.id").onDelete("restrict"))
    .addColumn("superseded_by_record_id", "uuid", (column) => column.references("quality_records.id").onDelete("restrict"))
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("quality_records_version_positive", sql`version >= 1`)
    .addCheckConstraint("quality_records_quality_score_range", sql`quality_score is null or (quality_score >= 0 and quality_score <= 100)`)
    .addCheckConstraint("quality_records_damage_rate_range", sql`damage_rate is null or (damage_rate >= 0 and damage_rate <= 100)`)
    .addCheckConstraint("quality_records_task_accuracy_range", sql`task_accuracy is null or (task_accuracy >= 0 and task_accuracy <= 100)`)
    .execute();

  await database.schema
    .createIndex("quality_records_task_id_index")
    .on("quality_records")
    .column("task_id")
    .execute();

  await database.schema
    .createIndex("quality_records_inspected_by_user_id_index")
    .on("quality_records")
    .column("inspected_by_user_id")
    .execute();

  await database.schema
    .createIndex("quality_records_inspected_at_index")
    .on("quality_records")
    .column("inspected_at")
    .execute();

  await database.schema
    .createIndex("quality_records_outcome_index")
    .on("quality_records")
    .column("outcome")
    .execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema.dropTable("quality_records").execute();
  await database.schema.dropTable("task_photos").execute();
}
