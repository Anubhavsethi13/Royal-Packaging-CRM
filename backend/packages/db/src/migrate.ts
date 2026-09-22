import { loadProjectEnv } from "@royal-packaging/config";
import { checkDatabaseHealth, createDatabase, createMigrator, destroyDatabase } from "./index.js";

async function runMigrations(): Promise<void> {
  // Load .env from project root if present
  loadProjectEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(`[FATAL] Missing DATABASE_URL environment variable.`);
    process.exit(1);
  }

  const database = createDatabase({ DATABASE_URL: databaseUrl });

  try {
    // 1. Check DB connectivity
    await checkDatabaseHealth(database);
    console.log(`[INFO] Connected to database for migration.`);

    // 2. Run migrations
    const migrator = createMigrator(database);
    console.log(`[INFO] Running migrations to latest schema...`);

    const { error, results } = await migrator.migrateToLatest();

    if (results && results.length > 0) {
      for (const res of results) {
        if (res.status === "Success") {
          console.log(`[MIGRATION] ✓ ${res.migrationName} applied successfully.`);
        } else if (res.status === "Error") {
          console.error(`[MIGRATION] ✗ ${res.migrationName} failed.`);
        }
      }
    } else {
      console.log(`[INFO] Database is already up to date. No pending migrations.`);
    }

    if (error) {
      console.error(`[FATAL] Migration error:`, error);
      process.exit(1);
    }

    console.log(`[INFO] All migrations completed successfully.`);
  } finally {
    await destroyDatabase(database).catch(() => {});
  }
}

runMigrations().catch((err) => {
  console.error(`[FATAL] Unhandled migration error:`, err);
  process.exit(1);
});
