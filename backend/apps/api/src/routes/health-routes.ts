import { checkDatabaseHealth, type DatabaseConnection } from "@royal-packaging/db";
import type { ApiContext, Router } from "../router.js";
import { sendJson } from "../utils/http-utils.js";

export function registerHealthRoutes(router: Router, database?: DatabaseConnection): void {
  router.get("/health", (ctx: ApiContext) => {
    sendJson(ctx.res, 200, {
      success: true,
      data: {
        status: "ok",
        timestamp: new Date().toISOString()
      }
    });
  });

  router.get("/health/ready", async (ctx: ApiContext) => {
    let dbReady = false;

    if (database) {
      try {
        await checkDatabaseHealth(database);
        dbReady = true;
      } catch (err) {
        dbReady = false;
        console.error(
          "[WARN] Database readiness check failed:",
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    const statusCode = dbReady ? 200 : 503;
    sendJson(ctx.res, statusCode, {
      success: dbReady,
      data: {
        status: dbReady ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
        database: {
          ready: dbReady
        }
      }
    });
  });
}