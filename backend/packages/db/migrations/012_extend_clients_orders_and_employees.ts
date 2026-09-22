import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

/**
 * Additive-only migration extending clients/orders/employees for the
 * Commercial domain (clients, orders, employees + shift assignment).
 *
 * account_code / order_code / employee_code are backfilled from the row's
 * own id BEFORE the NOT NULL + unique constraints are added, so this is
 * safe to run against a populated table.
 */
export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  // --- clients -------------------------------------------------------
  await database.schema
    .alterTable("clients")
    .addColumn("account_code", "text")
    .addColumn("contact_name", "text")
    .addColumn("phone", "text")
    .addColumn("status", "text", (column) => column.notNull().defaultTo("active"))
    .execute();

  await sql`UPDATE clients SET account_code = 'CL-' || substr(id::text, 1, 8) WHERE account_code IS NULL`.execute(
    database
  );

  await database.schema
    .alterTable("clients")
    .alterColumn("account_code", (column) => column.setNotNull())
    .execute();

  await database.schema
    .createIndex("clients_account_code_unique_index")
    .on("clients")
    .column("account_code")
    .unique()
    .execute();

  // --- orders ----------------------------------------------------------
  await database.schema
    .alterTable("orders")
    .addColumn("order_code", "text")
    .addColumn("material_name", "text")
    .addColumn("quantity", "bigint")
    .addColumn("unit", "text")
    .addColumn("status", "text", (column) => column.notNull().defaultTo("draft"))
    .addColumn("priority", "text", (column) => column.notNull().defaultTo("normal"))
    .addColumn("due_at", "timestamptz")
    .addColumn("notes", "text")
    .addColumn("cancelled_at", "timestamptz")
    .addColumn("cancellation_reason", "text")
    .execute();

  await sql`UPDATE orders SET order_code = 'ORD-' || substr(id::text, 1, 8) WHERE order_code IS NULL`.execute(
    database
  );

  await database.schema
    .alterTable("orders")
    .alterColumn("order_code", (column) => column.setNotNull())
    .execute();

  await database.schema
    .createIndex("orders_order_code_unique_index")
    .on("orders")
    .column("order_code")
    .unique()
    .execute();

  await database.schema
    .alterTable("orders")
    .addCheckConstraint("orders_quantity_non_negative", sql`quantity IS NULL OR quantity >= 0`)
    .execute();

  await database.schema.createIndex("orders_status_index").on("orders").column("status").execute();

  // --- employees ---------------------------------------------------------
  await database.schema
    .alterTable("employees")
    .addColumn("employee_code", "text")
    .addColumn("name", "text")
    .addColumn("department", "text")
    .addColumn("depot_id", "uuid", (column) => column.references("depots.id").onDelete("set null"))
    .execute();

  await sql`UPDATE employees SET employee_code = 'EMP-' || substr(id::text, 1, 8) WHERE employee_code IS NULL`.execute(
    database
  );

  await database.schema
    .alterTable("employees")
    .alterColumn("employee_code", (column) => column.setNotNull())
    .execute();

  await database.schema
    .createIndex("employees_employee_code_unique_index")
    .on("employees")
    .column("employee_code")
    .unique()
    .execute();

  await database.schema.createIndex("employees_depot_id_index").on("employees").column("depot_id").execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema.dropIndex("employees_depot_id_index").execute();
  await database.schema.dropIndex("employees_employee_code_unique_index").execute();
  await database.schema
    .alterTable("employees")
    .dropColumn("depot_id")
    .dropColumn("department")
    .dropColumn("name")
    .dropColumn("employee_code")
    .execute();

  await database.schema.dropIndex("orders_status_index").execute();
  await database.schema.alterTable("orders").dropConstraint("orders_quantity_non_negative").execute();
  await database.schema.dropIndex("orders_order_code_unique_index").execute();
  await database.schema
    .alterTable("orders")
    .dropColumn("cancellation_reason")
    .dropColumn("cancelled_at")
    .dropColumn("notes")
    .dropColumn("due_at")
    .dropColumn("priority")
    .dropColumn("status")
    .dropColumn("unit")
    .dropColumn("quantity")
    .dropColumn("material_name")
    .dropColumn("order_code")
    .execute();

  await database.schema.dropIndex("clients_account_code_unique_index").execute();
  await database.schema
    .alterTable("clients")
    .dropColumn("status")
    .dropColumn("phone")
    .dropColumn("contact_name")
    .dropColumn("account_code")
    .execute();
}
