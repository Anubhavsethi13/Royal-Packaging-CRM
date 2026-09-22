import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, createMigrator, destroyDatabase, type DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";
import { Client } from "pg";
import type { DatabaseError } from "pg";

export const DEFAULT_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/royal_packaging_test";

/**
 * Parses a database connection string to extract base server info and database name.
 */
function parseDatabaseUrl(databaseUrl: string): { adminUrl: string; databaseName: string } {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, "") || "royal_packaging_test";
  parsed.pathname = "/postgres";
  return {
    adminUrl: parsed.toString(),
    databaseName
  };
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function sanitizeDatabaseNamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

export function getScopedTestDatabaseUrl(
  scope: string,
  databaseUrl: string = DEFAULT_TEST_DATABASE_URL
): string {
  const parsed = new URL(databaseUrl);
  const baseName = parsed.pathname.replace(/^\//, "") || "royal_packaging_test";
  const scopePath = scope.startsWith("file:") ? fileURLToPath(scope) : scope;
  const scopeName = sanitizeDatabaseNamePart(path.basename(scopePath, path.extname(scopePath)));

  parsed.pathname = `/${baseName}_${scopeName || "default"}`;

  return parsed.toString();
}

function isDatabaseAlreadyExistsRace(err: unknown): err is DatabaseError {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return false;
  }

  const code = (err as { code?: unknown }).code;
  return code === "42P04" || code === "23505";
}

/**
 * Ensures the target PostgreSQL database exists.
 */
export async function ensureTestDatabase(databaseUrl: string = DEFAULT_TEST_DATABASE_URL): Promise<void> {
  const { adminUrl, databaseName } = parseDatabaseUrl(databaseUrl);
  const client = new Client({ connectionString: adminUrl });

  try {
    await client.connect();
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName]
    );

    if (result.rows.length === 0) {
      try {
        await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
      } catch (err) {
        if (!isDatabaseAlreadyExistsRace(err)) {
          throw err;
        }

        const recheck = await client.query(
          "SELECT 1 FROM pg_database WHERE datname = $1",
          [databaseName]
        );

        if (recheck.rows.length === 0) {
          throw err;
        }
      }
    }
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Creates a Kysely connection to the test database.
 */
export function getTestDatabase(databaseUrl: string = DEFAULT_TEST_DATABASE_URL): DatabaseConnection {
  return createDatabase({ DATABASE_URL: databaseUrl });
}

/**
 * Migrates test database to the latest schema using production migrations.
 */
export async function migrateTestDatabase(database: DatabaseConnection): Promise<void> {
  const migrator = createMigrator(database);
  const { error, results } = await migrator.migrateToLatest();
  if (error) {
    throw error;
  }
  const failed = results?.filter((r) => r.status === "Error");
  if (failed && failed.length > 0) {
    throw new Error(`Migrations failed: ${JSON.stringify(failed)}`);
  }
}

/**
 * Cleanly truncates all domain and foundation tables between integration tests.
 */
export async function truncateAllTables(database: DatabaseConnection): Promise<void> {
  await sql`
    TRUNCATE TABLE
      report_executions,
      report_definitions,
      payroll_approvals,
      payroll_entries,
      task_photos,
      quality_records,
      manual_penalties,
      monthly_kot,
      incentive_ledger,
      incentive_events,
      incentive_rules,
      kpi_snapshots,
      kpi_targets,
      kpi_definitions,
      inventory_movements,
      inventory_balances,
      inventory_batches,
      inventory_items,
      task_events,
      task_assignments,
      tasks,
      order_items,
      orders,
      clients,
      login_attempts,
      sessions,
      employee_shift_assignments,
      employees,
      shifts,
      locations,
      depots,
      user_access_roles,
      access_role_permissions,
      access_permissions,
      access_roles,
      users
    CASCADE;
  `.execute(database);
}

/**
 * Cleanly closes the database connection.
 */
export async function cleanupTestDatabase(database: DatabaseConnection): Promise<void> {
  await destroyDatabase(database);
}
