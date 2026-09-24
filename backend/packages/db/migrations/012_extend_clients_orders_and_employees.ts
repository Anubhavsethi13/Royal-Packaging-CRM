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
  await sql`
    ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS account_code text,
      ADD COLUMN IF NOT EXISTS contact_name text,
      ADD COLUMN IF NOT EXISTS phone text,
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
  `.execute(database);

  await sql`UPDATE clients SET account_code = 'CL-' || substr(id::text, 1, 8) WHERE account_code IS NULL`.execute(
    database
  );

  await sql`ALTER TABLE clients ALTER COLUMN account_code SET NOT NULL`.execute(database);

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS clients_account_code_unique_index ON clients (account_code)`.execute(
    database
  );

  // --- orders ----------------------------------------------------------
  await sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS order_code text,
      ADD COLUMN IF NOT EXISTS material_name text,
      ADD COLUMN IF NOT EXISTS quantity bigint,
      ADD COLUMN IF NOT EXISTS unit text,
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
      ADD COLUMN IF NOT EXISTS due_at timestamptz,
      ADD COLUMN IF NOT EXISTS notes text,
      ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
      ADD COLUMN IF NOT EXISTS cancellation_reason text;
  `.execute(database);

  await sql`UPDATE orders SET order_code = 'ORD-' || substr(id::text, 1, 8) WHERE order_code IS NULL`.execute(
    database
  );

  await sql`ALTER TABLE orders ALTER COLUMN order_code SET NOT NULL`.execute(database);

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS orders_order_code_unique_index ON orders (order_code)`.execute(
    database
  );

  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_quantity_non_negative') THEN
        ALTER TABLE orders ADD CONSTRAINT orders_quantity_non_negative CHECK (quantity IS NULL OR quantity >= 0);
      END IF;
    END $$;
  `.execute(database);

  await sql`CREATE INDEX IF NOT EXISTS orders_status_index ON orders (status)`.execute(database);

  // --- employees ---------------------------------------------------------
  await sql`
    ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS employee_code text,
      ADD COLUMN IF NOT EXISTS name text,
      ADD COLUMN IF NOT EXISTS department text,
      ADD COLUMN IF NOT EXISTS depot_id uuid REFERENCES depots(id) ON DELETE SET NULL;
  `.execute(database);

  await sql`UPDATE employees SET employee_code = 'EMP-' || substr(id::text, 1, 8) WHERE employee_code IS NULL`.execute(
    database
  );

  await sql`ALTER TABLE employees ALTER COLUMN employee_code SET NOT NULL`.execute(database);

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_code_unique_index ON employees (employee_code)`.execute(
    database
  );

  await sql`CREATE INDEX IF NOT EXISTS employees_depot_id_index ON employees (depot_id)`.execute(database);
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
