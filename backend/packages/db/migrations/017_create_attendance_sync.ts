import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

/**
 * e-Time Office attendance integration (read-only provider → CRM).
 *
 * - `attendance_sync_state`: the incremental checkpoint (`LastRecord`, updated to the
 *   returned `MaxRecord` only in the same transaction that stores the punches).
 * - `attendance_sync_runs`: one row per sync attempt (integration audit trail and
 *   monitoring). Credentials are never stored.
 * - `attendance_punches`: raw punches. The provider's `Table` + `ID` (DownloadLastPunchData)
 *   is the deduplication key; punches without a provider ID fall back to employee code +
 *   punch time + source. `punched_at_local` keeps the provider's wall-clock time exactly
 *   (no timezone is documented for it).
 * - `attendance_daily_records`: DownloadInOutPunchData rows, one per employee code and date.
 * - `attendance_sync_exceptions`: records that could not be attributed (e.g. an `Empcode`
 *   with no CRM employee). The punch itself is still stored with `employee_id` NULL.
 *
 * Employees are matched on `employees.employee_code` = provider `Empcode` (text, so
 * leading zeros are preserved). Additive only.
 */
export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .createTable("attendance_sync_state")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("provider", "text", (column) => column.notNull())
    .addColumn("scope", "text", (column) => column.notNull())
    .addColumn("empcode", "text", (column) => column.notNull())
    .addColumn("last_record", "text")
    .addColumn("last_attempt_at", "timestamptz")
    .addColumn("last_success_at", "timestamptz")
    .addColumn("records_received", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("records_inserted", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("sync_status", "text", (column) => column.notNull().defaultTo("NEVER_RUN"))
    .addColumn("error_code", "text")
    .addColumn("error_message", "text")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addUniqueConstraint("attendance_sync_state_scope_unique", ["provider", "scope", "empcode"])
    .addCheckConstraint("attendance_sync_state_status_valid", sql`sync_status in ('NEVER_RUN', 'RUNNING', 'SUCCEEDED', 'FAILED')`)
    .addCheckConstraint("attendance_sync_state_last_record_format", sql`last_record is null or last_record ~ '^(0[1-9]|1[0-2])[0-9]{4}[$][0-9]+$'`)
    .addCheckConstraint("attendance_sync_state_counts_non_negative", sql`records_received >= 0 and records_inserted >= 0`)
    .addCheckConstraint("attendance_sync_state_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createTable("attendance_sync_runs")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("provider", "text", (column) => column.notNull())
    .addColumn("endpoint", "text", (column) => column.notNull())
    .addColumn("empcode", "text", (column) => column.notNull())
    .addColumn("trigger", "text", (column) => column.notNull())
    .addColumn("actor_user_id", "uuid", (column) => column.references("users.id").onDelete("restrict"))
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("request_last_record", "text")
    .addColumn("response_max_record", "text")
    .addColumn("request_from", "text")
    .addColumn("request_to", "text")
    .addColumn("records_received", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("records_inserted", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("duplicates", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("unmapped", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("error_code", "text")
    .addColumn("error_message", "text")
    .addColumn("started_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("finished_at", "timestamptz")
    .addCheckConstraint("attendance_sync_runs_status_valid", sql`status in ('RUNNING', 'SUCCEEDED', 'FAILED')`)
    .addCheckConstraint("attendance_sync_runs_trigger_valid", sql`trigger in ('SCHEDULER', 'MANUAL')`)
    .addCheckConstraint("attendance_sync_runs_counts_non_negative", sql`records_received >= 0 and records_inserted >= 0 and duplicates >= 0 and unmapped >= 0`)
    .execute();

  await database.schema.createIndex("attendance_sync_runs_started_index").on("attendance_sync_runs").columns(["provider", "started_at"]).execute();

  await database.schema
    .createTable("attendance_punches")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("employee_id", "uuid", (column) => column.references("employees.id").onDelete("restrict"))
    .addColumn("employee_code", "text", (column) => column.notNull())
    .addColumn("punched_at_local", "timestamp", (column) => column.notNull())
    .addColumn("machine_id", "text")
    .addColumn("machine_flag", "text")
    .addColumn("external_record_id", "bigint")
    .addColumn("external_table", "text")
    .addColumn("emp_card_no", "text")
    .addColumn("provider_employee_name", "text")
    .addColumn("source", "text", (column) => column.notNull())
    .addColumn("sync_run_id", "uuid", (column) => column.notNull().references("attendance_sync_runs.id").onDelete("restrict"))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("attendance_punches_source_valid", sql`source in ('DownloadPunchData', 'DownloadPunchDataMCID', 'DownloadLastPunchData')`)
    .addCheckConstraint("attendance_punches_external_pair", sql`(external_record_id is null) = (external_table is null)`)
    .execute();

  // Strongest provider identifier first: Table + ID (DownloadLastPunchData).
  await sql`CREATE UNIQUE INDEX attendance_punches_external_unique ON attendance_punches (external_table, external_record_id) WHERE external_record_id IS NOT NULL`.execute(database);
  // Endpoints without a provider ID: employee code + punch time + source.
  await sql`CREATE UNIQUE INDEX attendance_punches_natural_unique ON attendance_punches (employee_code, punched_at_local, source) WHERE external_record_id IS NULL`.execute(database);
  await database.schema.createIndex("attendance_punches_employee_time_index").on("attendance_punches").columns(["employee_id", "punched_at_local"]).execute();
  await database.schema.createIndex("attendance_punches_code_time_index").on("attendance_punches").columns(["employee_code", "punched_at_local"]).execute();

  await database.schema
    .createTable("attendance_daily_records")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("employee_id", "uuid", (column) => column.references("employees.id").onDelete("restrict"))
    .addColumn("employee_code", "text", (column) => column.notNull())
    .addColumn("attendance_date", "date", (column) => column.notNull())
    .addColumn("in_time", "time")
    .addColumn("out_time", "time")
    .addColumn("work_minutes", "integer")
    .addColumn("overtime_minutes", "integer")
    .addColumn("late_in_minutes", "integer")
    .addColumn("early_out_minutes", "integer")
    .addColumn("status", "text")
    .addColumn("remark", "text")
    .addColumn("provider_employee_name", "text")
    .addColumn("raw_in_time", "text")
    .addColumn("raw_out_time", "text")
    .addColumn("source", "text", (column) => column.notNull().defaultTo("DownloadInOutPunchData"))
    .addColumn("sync_run_id", "uuid", (column) => column.notNull().references("attendance_sync_runs.id").onDelete("restrict"))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("attendance_daily_records_code_date_unique", ["employee_code", "attendance_date"])
    .addCheckConstraint("attendance_daily_records_minutes_non_negative", sql`coalesce(work_minutes, 0) >= 0 and coalesce(overtime_minutes, 0) >= 0 and coalesce(late_in_minutes, 0) >= 0 and coalesce(early_out_minutes, 0) >= 0`)
    .execute();

  await database.schema.createIndex("attendance_daily_records_employee_date_index").on("attendance_daily_records").columns(["employee_id", "attendance_date"]).execute();

  await database.schema
    .createTable("attendance_sync_exceptions")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("sync_run_id", "uuid", (column) => column.notNull().references("attendance_sync_runs.id").onDelete("restrict"))
    .addColumn("provider", "text", (column) => column.notNull())
    .addColumn("empcode", "text", (column) => column.notNull())
    .addColumn("error_type", "text", (column) => column.notNull())
    .addColumn("error_message", "text", (column) => column.notNull())
    .addColumn("payload", "jsonb", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("resolved_at", "timestamptz")
    .addCheckConstraint("attendance_sync_exceptions_type_valid", sql`error_type in ('EMPLOYEE_NOT_FOUND')`)
    .execute();

  await database.schema.createIndex("attendance_sync_exceptions_open_index").on("attendance_sync_exceptions").columns(["provider", "resolved_at"]).execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema.dropTable("attendance_sync_exceptions").execute();
  await database.schema.dropTable("attendance_daily_records").execute();
  await database.schema.dropTable("attendance_punches").execute();
  await database.schema.dropTable("attendance_sync_runs").execute();
  await database.schema.dropTable("attendance_sync_state").execute();
}
