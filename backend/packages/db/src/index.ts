import type { ApplicationConfig } from "@royal-packaging/config";
import { loadConfig } from "@royal-packaging/config";
import type { Transaction } from "kysely";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import type { RoyalPackagingDatabase } from "./types.js";

export * from "./types.js";
export { createMigrator, migrationsDirectory } from "./migrator.js";

export type DatabaseConnection = Kysely<RoyalPackagingDatabase>;
export type DatabaseTransaction = Transaction<RoyalPackagingDatabase>;
export type DatabaseExecutor = DatabaseConnection | DatabaseTransaction;

export type PoolFactory = (connectionString: string) => Pool;

export interface DatabaseHealth {
  readonly healthy: true;
  readonly checkedAt: Date;
}

export function createPostgresPool(connectionString: string): Pool {
  try {
    const url = new URL(connectionString);
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const sslParam = url.searchParams.get("sslmode");

    if (!isLocalhost && sslParam !== "disable") {
      return new Pool({
        host: url.hostname,
        port: url.port ? parseInt(url.port, 10) : 5432,
        user: url.username ? decodeURIComponent(url.username) : undefined,
        password: url.password ? decodeURIComponent(url.password) : undefined,
        database: url.pathname ? url.pathname.replace(/^\//, "") : undefined,
        ssl: { rejectUnauthorized: false },
        sslnegotiation: "direct"
      });
    }

    return new Pool({ connectionString });
  } catch {
    return new Pool({ connectionString });
  }
}

/** Creates a lazy PostgreSQL/Kysely connection from validated configuration. */
export function createDatabase(
  config: Pick<ApplicationConfig, "DATABASE_URL">,
  poolFactory: PoolFactory = createPostgresPool
): DatabaseConnection {
  return new Kysely<RoyalPackagingDatabase>({
    dialect: new PostgresDialect({ pool: poolFactory(config.DATABASE_URL) })
  });
}

/** Validates environment configuration before constructing the database. */
export function createDatabaseFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  poolFactory: PoolFactory = createPostgresPool
): DatabaseConnection {
  return createDatabase(loadConfig(environment), poolFactory);
}

/** Performs a minimal PostgreSQL round-trip without touching domain tables. */
export async function checkDatabaseHealth(
  database: DatabaseConnection
): Promise<DatabaseHealth> {
  await sql`select 1 as database_healthy`.execute(database);

  return { healthy: true, checkedAt: new Date() };
}

/** Safely releases the connection pool owned by a Kysely instance. */
export async function destroyDatabase(database: DatabaseConnection): Promise<void> {
  await database.destroy();
}
