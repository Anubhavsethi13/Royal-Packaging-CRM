import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

/**
 * Reports framework (definitions + execution tracking only). No real report
 * templates/content were ever supplied by requirements (AGENTS.md says to
 * use "the supplied Royal Packaging report specifications" and explicitly
 * not to implement MB51/MB52 - but no specifications were actually
 * attached), so this is a genuinely empty framework - a real blocker, not
 * an oversight. See docs/integration/backend-frontend-reconciliation.md.
 */
export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .createTable("report_definitions")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("code", "text", (column) => column.notNull())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("description", "text")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("report_definitions_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("report_definitions_code_unique_index")
    .on("report_definitions")
    .column("code")
    .unique()
    .execute();

  await database.schema
    .createTable("report_executions")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("report_definition_id", "uuid", (column) =>
      column.notNull().references("report_definitions.id").onDelete("restrict")
    )
    .addColumn("status", "text", (column) => column.notNull().defaultTo("PENDING"))
    .addColumn("export_format", "text", (column) => column.notNull())
    .addColumn("filters", "jsonb")
    .addColumn("requested_by_user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("restrict"))
    .addColumn("requested_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("completed_at", "timestamptz")
    .addColumn("result_reference", "text")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("report_executions_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("report_executions_report_definition_id_index")
    .on("report_executions")
    .column("report_definition_id")
    .execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema.dropTable("report_executions").execute();
  await database.schema.dropTable("report_definitions").execute();
}
