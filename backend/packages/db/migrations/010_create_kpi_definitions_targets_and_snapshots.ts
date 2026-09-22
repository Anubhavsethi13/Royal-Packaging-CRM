import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .createTable("kpi_definitions")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("code", "text", (column) => column.notNull())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("pillar", "text")
    .addColumn("description", "text")
    .addColumn("unit", "text")
    .addColumn("formula_reference", "text")
    .addColumn("active", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("effective_from", "timestamptz")
    .addColumn("effective_to", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("kpi_definitions_version_positive", sql`version >= 1`)
    .addCheckConstraint("kpi_definitions_effective_range", sql`effective_to is null or effective_from is null or effective_to >= effective_from`)
    .execute();

  await database.schema
    .createIndex("kpi_definitions_code_unique_index")
    .on("kpi_definitions")
    .column("code")
    .unique()
    .execute();

  await database.schema
    .createIndex("kpi_definitions_active_index")
    .on("kpi_definitions")
    .column("active")
    .execute();

  await database.schema
    .createIndex("kpi_definitions_pillar_index")
    .on("kpi_definitions")
    .column("pillar")
    .execute();

  await database.schema
    .createTable("kpi_targets")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("kpi_definition_id", "uuid", (column) => column.notNull().references("kpi_definitions.id").onDelete("restrict"))
    .addColumn("target_value", "numeric", (column) => column.notNull())
    .addColumn("warning_threshold", "numeric")
    .addColumn("critical_threshold", "numeric")
    .addColumn("effective_from", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("effective_to", "timestamptz")
    .addColumn("depot_id", "uuid", (column) => column.references("depots.id").onDelete("restrict"))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("kpi_targets_version_positive", sql`version >= 1`)
    .addCheckConstraint("kpi_targets_effective_range", sql`effective_to is null or effective_to >= effective_from`)
    .execute();

  await database.schema
    .createIndex("kpi_targets_kpi_definition_id_index")
    .on("kpi_targets")
    .column("kpi_definition_id")
    .execute();

  await database.schema
    .createIndex("kpi_targets_depot_id_index")
    .on("kpi_targets")
    .column("depot_id")
    .execute();

  await database.schema
    .createIndex("kpi_targets_effective_period_index")
    .on("kpi_targets")
    .columns(["effective_from", "effective_to"])
    .execute();

  await database.schema
    .createTable("kpi_snapshots")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("kpi_definition_id", "uuid", (column) => column.notNull().references("kpi_definitions.id").onDelete("restrict"))
    .addColumn("snapshot_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("period_start", "timestamptz")
    .addColumn("period_end", "timestamptz")
    .addColumn("value", "numeric", (column) => column.notNull())
    .addColumn("target_value", "numeric")
    .addColumn("depot_id", "uuid", (column) => column.references("depots.id").onDelete("restrict"))
    .addColumn("employee_id", "uuid", (column) => column.references("employees.id").onDelete("restrict"))
    .addColumn("task_type", "text")
    .addColumn("client_id", "uuid", (column) => column.references("clients.id").onDelete("restrict"))
    .addColumn("inventory_item_id", "uuid", (column) => column.references("inventory_items.id").onDelete("restrict"))
    .addColumn("shift_id", "uuid", (column) => column.references("shifts.id").onDelete("restrict"))
    .addColumn("calculation_version", "text")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("kpi_snapshots_period_range", sql`period_end is null or period_start is null or period_end >= period_start`)
    .execute();

  await database.schema
    .createIndex("kpi_snapshots_kpi_definition_snapshot_index")
    .on("kpi_snapshots")
    .columns(["kpi_definition_id", "snapshot_at"])
    .execute();

  await database.schema
    .createIndex("kpi_snapshots_depot_id_index")
    .on("kpi_snapshots")
    .column("depot_id")
    .execute();

  await database.schema
    .createIndex("kpi_snapshots_employee_id_index")
    .on("kpi_snapshots")
    .column("employee_id")
    .execute();

  await database.schema
    .createIndex("kpi_snapshots_client_id_index")
    .on("kpi_snapshots")
    .column("client_id")
    .execute();

  await database.schema
    .createIndex("kpi_snapshots_inventory_item_id_index")
    .on("kpi_snapshots")
    .column("inventory_item_id")
    .execute();

  await database.schema
    .createIndex("kpi_snapshots_shift_id_index")
    .on("kpi_snapshots")
    .column("shift_id")
    .execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema.dropTable("kpi_snapshots").execute();
  await database.schema.dropTable("kpi_targets").execute();
  await database.schema.dropTable("kpi_definitions").execute();
}
