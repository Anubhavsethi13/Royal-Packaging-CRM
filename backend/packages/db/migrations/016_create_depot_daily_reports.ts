import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

/**
 * Supervisor daily depot report (one per depot per operational date).
 *
 * Reconciled with existing structures before adding anything:
 * - `shift_entries` (015) is a per-employee personal entry whose loading and
 *   unloading totals are BOX quantities, with no status or depot ownership;
 *   it is not a depot-level operational report, so it is not reused here.
 * - Depots reuse `depots`, the supervisor reuses `employees`, vehicle types
 *   reuse `truck_types` (32FT, CROSSING, OTHER); nothing is copied.
 *
 * Derived values (total operations = loading + unloading; duration = end -
 * start) are computed on read and never stored, so they cannot be edited.
 * `depot_daily_report_events` is the audit trail (who, what, when, which
 * depot, which report). Additive only.
 */
export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .createTable("depot_daily_reports")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("depot_id", "uuid", (column) => column.notNull().references("depots.id").onDelete("restrict"))
    .addColumn("supervisor_employee_id", "uuid", (column) => column.references("employees.id").onDelete("restrict"))
    .addColumn("report_date", "date", (column) => column.notNull())
    .addColumn("loading_count", "integer", (column) => column.notNull())
    .addColumn("unloading_count", "integer", (column) => column.notNull())
    .addColumn("start_time", "time")
    .addColumn("end_time", "time")
    .addColumn("labour_required", "integer")
    .addColumn("labour_present", "integer")
    .addColumn("status", "text", (column) => column.notNull().defaultTo("DRAFT"))
    .addColumn("submitted_at", "timestamptz")
    .addColumn("submitted_by_user_id", "uuid", (column) => column.references("users.id").onDelete("restrict"))
    .addColumn("approved_at", "timestamptz")
    .addColumn("approved_by_user_id", "uuid", (column) => column.references("users.id").onDelete("restrict"))
    .addColumn("created_by_user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("restrict"))
    .addColumn("updated_by_user_id", "uuid", (column) => column.references("users.id").onDelete("restrict"))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addUniqueConstraint("depot_daily_reports_depot_date_unique", ["depot_id", "report_date"])
    .addCheckConstraint("depot_daily_reports_status_valid", sql`status in ('DRAFT', 'SUBMITTED')`)
    .addCheckConstraint("depot_daily_reports_loading_non_negative", sql`loading_count >= 0`)
    .addCheckConstraint("depot_daily_reports_unloading_non_negative", sql`unloading_count >= 0`)
    .addCheckConstraint("depot_daily_reports_labour_required_non_negative", sql`labour_required is null or labour_required >= 0`)
    .addCheckConstraint("depot_daily_reports_labour_present_non_negative", sql`labour_present is null or labour_present >= 0`)
    .addCheckConstraint("depot_daily_reports_end_after_start", sql`start_time is null or end_time is null or end_time > start_time`)
    .addCheckConstraint(
      "depot_daily_reports_submission_complete",
      sql`status <> 'SUBMITTED' or (submitted_at is not null and submitted_by_user_id is not null and start_time is not null and end_time is not null and labour_required is not null and labour_present is not null)`
    )
    .addCheckConstraint("depot_daily_reports_version_positive", sql`version >= 1`)
    .execute();

  await database.schema.createIndex("depot_daily_reports_report_date_index").on("depot_daily_reports").column("report_date").execute();

  await database.schema
    .createTable("depot_daily_report_vehicles")
    .addColumn("report_id", "uuid", (column) => column.notNull().references("depot_daily_reports.id").onDelete("cascade"))
    .addColumn("truck_type_id", "uuid", (column) => column.notNull().references("truck_types.id").onDelete("restrict"))
    .addColumn("vehicle_count", "integer", (column) => column.notNull())
    .addPrimaryKeyConstraint("depot_daily_report_vehicles_primary_key", ["report_id", "truck_type_id"])
    .addCheckConstraint("depot_daily_report_vehicles_count_non_negative", sql`vehicle_count >= 0`)
    .execute();

  await database.schema
    .createTable("depot_daily_report_events")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("report_id", "uuid", (column) => column.notNull().references("depot_daily_reports.id").onDelete("restrict"))
    .addColumn("depot_id", "uuid", (column) => column.notNull().references("depots.id").onDelete("restrict"))
    .addColumn("event_type", "text", (column) => column.notNull())
    .addColumn("event_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("actor_user_id", "uuid", (column) => column.references("users.id").onDelete("restrict"))
    .addColumn("metadata", "text")
    .addCheckConstraint("depot_daily_report_events_type_valid", sql`event_type in ('DAILY_REPORT_CREATED', 'DAILY_REPORT_UPDATED', 'DAILY_REPORT_SUBMITTED')`)
    .execute();

  await database.schema.createIndex("depot_daily_report_events_report_id_index").on("depot_daily_report_events").column("report_id").execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema.dropTable("depot_daily_report_events").execute();
  await database.schema.dropTable("depot_daily_report_vehicles").execute();
  await database.schema.dropTable("depot_daily_reports").execute();
}
