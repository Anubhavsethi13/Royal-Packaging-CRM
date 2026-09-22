import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

/**
 * Payroll framework (entries + approvals). There is deliberately no "paid"
 * terminal state or disbursement column yet - the actual payment-posting
 * business rule was never specified by requirements (see docs/integration/
 * backend-frontend-reconciliation.md). This migration only adds the
 * entry/approval tracking scaffolding described by the spec so far.
 */
export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .createTable("payroll_entries")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("incentive_ledger_id", "uuid", (column) =>
      column.notNull().references("incentive_ledger.id").onDelete("restrict")
    )
    .addColumn("employee_id", "uuid", (column) => column.notNull().references("employees.id").onDelete("restrict"))
    .addColumn("amount", "numeric", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull().defaultTo("PENDING"))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("payroll_entries_version_positive", sql`version >= 1`)
    .addCheckConstraint("payroll_entries_amount_non_negative", sql`amount >= 0`)
    .execute();

  await database.schema
    .createIndex("payroll_entries_incentive_ledger_id_unique_index")
    .on("payroll_entries")
    .column("incentive_ledger_id")
    .unique()
    .execute();

  await database.schema
    .createIndex("payroll_entries_employee_id_index")
    .on("payroll_entries")
    .column("employee_id")
    .execute();

  await database.schema
    .createTable("payroll_approvals")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("payroll_entry_id", "uuid", (column) =>
      column.notNull().references("payroll_entries.id").onDelete("restrict")
    )
    // IMPORTANT: actor_user_id references users.id, NOT employees.id -
    // the approving actor is an authenticated user (an admin/manager),
    // not necessarily the employee the payroll entry is for.
    .addColumn("actor_user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("restrict"))
    .addColumn("decision", "text", (column) => column.notNull())
    .addColumn("notes", "text")
    .addColumn("decided_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .execute();

  await database.schema
    .createIndex("payroll_approvals_payroll_entry_id_unique_index")
    .on("payroll_approvals")
    .column("payroll_entry_id")
    .unique()
    .execute();

  await database.schema
    .createIndex("payroll_approvals_actor_user_id_index")
    .on("payroll_approvals")
    .column("actor_user_id")
    .execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema.dropTable("payroll_approvals").execute();
  await database.schema.dropTable("payroll_entries").execute();
}
