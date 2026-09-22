import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .createTable("users")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("login_identifier", "text", (column) => column.notNull())
    .addColumn("password_hash", "text", (column) => column.notNull())
    .addColumn("is_active", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addUniqueConstraint("users_login_identifier_unique", ["login_identifier"])
    .addCheckConstraint("users_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("users_active_login_identifier_index")
    .on("users")
    .columns(["is_active", "login_identifier"])
    .execute();

  await database.schema
    .createTable("access_roles")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("code", "text", (column) => column.notNull())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("active", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addUniqueConstraint("access_roles_code_unique", ["code"])
    .addCheckConstraint("access_roles_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("access_roles_active_index")
    .on("access_roles")
    .column("active")
    .execute();

  await database.schema
    .createTable("access_permissions")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("code", "text", (column) => column.notNull())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("description", "text")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addUniqueConstraint("access_permissions_code_unique", ["code"])
    .addCheckConstraint("access_permissions_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createTable("access_role_permissions")
    .addColumn("role_id", "uuid", (column) => column.notNull().references("access_roles.id").onDelete("restrict"))
    .addColumn("permission_id", "uuid", (column) => column.notNull().references("access_permissions.id").onDelete("restrict"))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("created_by_user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("restrict"))
    .addPrimaryKeyConstraint("access_role_permissions_primary_key", ["role_id", "permission_id"])
    .execute();

  await database.schema
    .createIndex("access_role_permissions_role_id_index")
    .on("access_role_permissions")
    .column("role_id")
    .execute();

  await database.schema
    .createIndex("access_role_permissions_permission_id_index")
    .on("access_role_permissions")
    .column("permission_id")
    .execute();

  await database.schema
    .createIndex("access_role_permissions_created_by_user_id_index")
    .on("access_role_permissions")
    .column("created_by_user_id")
    .execute();

  await database.schema
    .createTable("user_access_roles")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("restrict"))
    .addColumn("role_id", "uuid", (column) => column.notNull().references("access_roles.id").onDelete("restrict"))
    .addColumn("assigned_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("assigned_by_user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("restrict"))
    .addColumn("revoked_at", "timestamptz")
    .addColumn("revoked_by_user_id", "uuid", (column) => column.references("users.id").onDelete("restrict"))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("user_access_roles_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("user_access_roles_user_revoked_index")
    .on("user_access_roles")
    .columns(["user_id", "revoked_at"])
    .execute();

  await database.schema
    .createIndex("user_access_roles_role_revoked_index")
    .on("user_access_roles")
    .columns(["role_id", "revoked_at"])
    .execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema.dropTable("user_access_roles").execute();
  await database.schema.dropTable("access_role_permissions").execute();
  await database.schema.dropTable("access_permissions").execute();
  await database.schema.dropTable("access_roles").execute();
  await database.schema.dropTable("users").execute();
}
