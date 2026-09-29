import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

/**
 * Daily Shift Entry (KPI_DAILY_SHIFT_TRACKING V1).
 *
 * `shift_entries` records what an employee actually worked on a given
 * operational date. It is deliberately separate from the pre-existing
 * `shifts` table (migration 003), which holds named shift templates
 * (e.g. "Morning 08:00-16:00") assigned to employees.
 *
 * Warehouses reuse `depots` and employees reuse `employees`; nothing from
 * either master table is copied. `truck_types` is new because no truck
 * model existed. Additive only.
 */
export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .createTable("truck_types")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("code", "text", (column) => column.notNull())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("active", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addUniqueConstraint("truck_types_code_unique", ["code"])
    .addCheckConstraint("truck_types_version_positive", sql`version >= 1`)
    .execute();

  await sql`
    INSERT INTO truck_types (id, code, name) VALUES
      (gen_random_uuid(), '32FT', '32ft'),
      (gen_random_uuid(), 'CROSSING', 'Crossing'),
      (gen_random_uuid(), 'OTHER', 'Other')
  `.execute(database);

  await database.schema
    .createTable("shift_entries")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("employee_id", "uuid", (column) => column.notNull().references("employees.id").onDelete("restrict"))
    .addColumn("work_date", "date", (column) => column.notNull())
    .addColumn("shift_start", "time", (column) => column.notNull())
    .addColumn("shift_end", "time", (column) => column.notNull())
    .addColumn("labour_count", "integer", (column) => column.notNull())
    .addColumn("unloading_total", "integer", (column) => column.notNull())
    .addColumn("loading_total", "integer", (column) => column.notNull())
    .addColumn("created_by_user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("restrict"))
    .addColumn("updated_by_user_id", "uuid", (column) => column.references("users.id").onDelete("restrict"))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addUniqueConstraint("shift_entries_employee_work_date_unique", ["employee_id", "work_date"])
    .addCheckConstraint("shift_entries_end_after_start", sql`shift_end > shift_start`)
    .addCheckConstraint("shift_entries_labour_count_non_negative", sql`labour_count >= 0`)
    .addCheckConstraint("shift_entries_unloading_total_non_negative", sql`unloading_total >= 0`)
    .addCheckConstraint("shift_entries_loading_total_non_negative", sql`loading_total >= 0`)
    .addCheckConstraint("shift_entries_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("shift_entries_work_date_index")
    .on("shift_entries")
    .column("work_date")
    .execute();

  await database.schema
    .createIndex("shift_entries_created_by_user_id_index")
    .on("shift_entries")
    .column("created_by_user_id")
    .execute();

  await database.schema
    .createTable("shift_entry_depots")
    .addColumn("shift_entry_id", "uuid", (column) => column.notNull().references("shift_entries.id").onDelete("cascade"))
    .addColumn("depot_id", "uuid", (column) => column.notNull().references("depots.id").onDelete("restrict"))
    .addPrimaryKeyConstraint("shift_entry_depots_primary_key", ["shift_entry_id", "depot_id"])
    .execute();

  await database.schema
    .createIndex("shift_entry_depots_depot_id_index")
    .on("shift_entry_depots")
    .column("depot_id")
    .execute();

  await database.schema
    .createTable("shift_entry_truck_types")
    .addColumn("shift_entry_id", "uuid", (column) => column.notNull().references("shift_entries.id").onDelete("cascade"))
    .addColumn("truck_type_id", "uuid", (column) => column.notNull().references("truck_types.id").onDelete("restrict"))
    .addPrimaryKeyConstraint("shift_entry_truck_types_primary_key", ["shift_entry_id", "truck_type_id"])
    .execute();

  await database.schema
    .createIndex("shift_entry_truck_types_truck_type_id_index")
    .on("shift_entry_truck_types")
    .column("truck_type_id")
    .execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema.dropTable("shift_entry_truck_types").execute();
  await database.schema.dropTable("shift_entry_depots").execute();
  await database.schema.dropTable("shift_entries").execute();
  await database.schema.dropTable("truck_types").execute();
}
