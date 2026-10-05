import { loadConfig, loadProjectEnv } from "@royal-packaging/config";
import { checkDatabaseHealth, createDatabaseFromEnvironment, destroyDatabase } from "@royal-packaging/db";
import { createApiApp } from "./app.js";
import { AttendancePoller } from "./modules/attendance/attendance-poller.js";

async function main(): Promise<void> {
  // 1. Load environment variables from .env if present
  loadProjectEnv();

  // 2. Load and validate environment configuration
  const config = loadConfig(process.env);

  // 2. Initialize database connection pool
  const database = createDatabaseFromEnvironment(process.env);

  // 3. Verify database connectivity before opening HTTP listener
  try {
    await checkDatabaseHealth(database);
    console.log(`[INFO] PostgreSQL database connected successfully.`);
  } catch (err) {
    console.error(`[FATAL] Database health check failed during startup:`, err);
    await destroyDatabase(database).catch(() => {});
    process.exit(1);
  }

  // 4. Create API application with all domain services and routes
  const app = createApiApp({
    database,
    appConfig: config
  });

  // 5. Start HTTP server
  const server = app.listen(config.SERVER_PORT, config.SERVER_HOST, () => {
    console.log(
      `[INFO] Royal Packaging CRM API listening on http://${config.SERVER_HOST}:${config.SERVER_PORT} [env=${config.NODE_ENV}]`
    );
  });

  // 6. e-Time Office attendance polling (opt-in: ETIME_SYNC_ENABLED=true with credentials).
  const attendancePoller = config.ETIME_SYNC_ENABLED
    ? new AttendancePoller({ syncService: app.services.attendanceSync, intervalMs: config.ETIME_POLL_INTERVAL_MINUTES * 60_000 })
    : null;
  attendancePoller?.start();

  // 7. Graceful shutdown handler
  let isShuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`[INFO] Received ${signal}. Starting graceful shutdown...`);

    // Stop polling; a sync in progress finishes its transaction first.
    await attendancePoller?.stop().catch(() => {});

    // Stop accepting new HTTP connections
    server.close(async () => {
      console.log(`[INFO] HTTP server closed.`);

      // Destroy database pool
      try {
        await destroyDatabase(database);
        console.log(`[INFO] Database connection pool closed.`);
      } catch (dbErr) {
        console.error(`[ERROR] Error closing database connection pool:`, dbErr);
      }

      process.exit(0);
    });

    // Force close after 10s if graceful shutdown hangs
    setTimeout(() => {
      console.error(`[WARN] Graceful shutdown timed out. Forcing exit.`);
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(`[FATAL] Unhandled bootstrap error:`, err);
  process.exit(1);
});
