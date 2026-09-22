import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .createTable("sessions")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("restrict"))
    .addColumn("session_token_hash", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .addColumn("revoked_at", "timestamptz")
    .addColumn("last_seen_at", "timestamptz")
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addUniqueConstraint("sessions_session_token_hash_unique", ["session_token_hash"])
    .addCheckConstraint("sessions_expires_after_creation", sql`expires_at > created_at`)
    .addCheckConstraint("sessions_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("sessions_user_revoked_expires_index")
    .on("sessions")
    .columns(["user_id", "revoked_at", "expires_at"])
    .execute();

  await database.schema
    .createTable("employees")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("user_id", "uuid", (column) => column.references("users.id").onDelete("restrict"))
    .addColumn("is_active", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("employees_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("employees_user_id_index")
    .on("employees")
    .column("user_id")
    .execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema.dropTable("employees").execute();
  await database.schema.dropTable("sessions").execute();
}
