import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .createTable("login_attempts")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("login_identifier", "text", (column) => column.notNull())
    .addColumn("attempted_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("succeeded", "boolean", (column) => column.notNull())
    .addColumn("user_id", "uuid", (column) => column.references("users.id").onDelete("restrict"))
    .addColumn("lockout_until", "timestamptz")
    .addColumn("correlation_id", "uuid")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("login_attempts_lockout_order", sql`lockout_until is null or lockout_until > attempted_at`)
    .execute();

  await database.schema
    .createIndex("login_attempts_identifier_attempted_index")
    .on("login_attempts")
    .columns(["login_identifier", "attempted_at"])
    .execute();

  await database.schema
    .createIndex("login_attempts_user_id_index")
    .on("login_attempts")
    .column("user_id")
    .execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema.dropTable("login_attempts").execute();
}
