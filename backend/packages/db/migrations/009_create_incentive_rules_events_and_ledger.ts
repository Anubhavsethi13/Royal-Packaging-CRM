import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .createTable("incentive_rules")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("rule_version", "text", (column) => column.notNull())
    .addColumn("effective_from", "timestamptz", (column) => column.notNull())
    .addColumn("effective_to", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("incentive_rules_version_positive", sql`version >= 1`)
    .addCheckConstraint("incentive_rules_effective_range", sql`effective_to is null or effective_to >= effective_from`)
    .execute();

  await database.schema
    .createIndex("incentive_rules_rule_version_unique_index")
    .on("incentive_rules")
    .column("rule_version")
    .unique()
    .execute();

  await database.schema
    .createIndex("incentive_rules_effective_period_index")
    .on("incentive_rules")
    .columns(["effective_from", "effective_to"])
    .execute();

  await database.schema
    .createTable("incentive_events")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("task_id", "uuid", (column) => column.notNull().references("tasks.id").onDelete("restrict"))
    .addColumn("incentive_rule_id", "uuid", (column) => column.references("incentive_rules.id").onDelete("restrict"))
    .addColumn("event_type", "text", (column) => column.notNull())
    .addColumn("event_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("actor_user_id", "uuid", (column) => column.references("users.id").onDelete("restrict"))
    .addColumn("correlation_id", "uuid")
    .addColumn("metadata", "jsonb")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .execute();

  await database.schema
    .createIndex("incentive_events_task_id_event_at_index")
    .on("incentive_events")
    .columns(["task_id", "event_at"])
    .execute();

  await database.schema
    .createIndex("incentive_events_event_type_event_at_index")
    .on("incentive_events")
    .columns(["event_type", "event_at"])
    .execute();

  await database.schema
    .createIndex("incentive_events_incentive_rule_id_index")
    .on("incentive_events")
    .column("incentive_rule_id")
    .execute();

  await database.schema
    .createIndex("incentive_events_actor_user_id_index")
    .on("incentive_events")
    .column("actor_user_id")
    .execute();

  await database.schema
    .createTable("incentive_ledger")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("task_id", "uuid", (column) => column.notNull().references("tasks.id").onDelete("restrict"))
    .addColumn("employee_id", "uuid", (column) => column.notNull().references("employees.id").onDelete("restrict"))
    .addColumn("incentive_rule_id", "uuid", (column) => column.references("incentive_rules.id").onDelete("restrict"))
    .addColumn("amount", "numeric", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("idempotency_key", "text")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("incentive_ledger_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("incentive_ledger_employee_status_index")
    .on("incentive_ledger")
    .columns(["employee_id", "status"])
    .execute();

  await database.schema
    .createIndex("incentive_ledger_task_id_index")
    .on("incentive_ledger")
    .column("task_id")
    .execute();

  await database.schema
    .createIndex("incentive_ledger_incentive_rule_id_index")
    .on("incentive_ledger")
    .column("incentive_rule_id")
    .execute();

  await database.schema
    .createIndex("incentive_ledger_idempotency_key_index")
    .on("incentive_ledger")
    .column("idempotency_key")
    .execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema.dropTable("incentive_ledger").execute();
  await database.schema.dropTable("incentive_events").execute();
  await database.schema.dropTable("incentive_rules").execute();
}
