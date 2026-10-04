import { checkDatabaseHealth, type DatabaseConnection } from "@royal-packaging/db";
import type { ApiContext, Router } from "../router.js";
import { sendJson } from "../utils/http-utils.js";

export function registerHealthRoutes(router: Router, database?: DatabaseConnection): void {
  const liveness = (ctx: ApiContext): void => {
    sendJson(ctx.res, 200, {
      success: true,
      data: {
        status: "ok",
        timestamp: new Date().toISOString()
      }
    });
  };

  const readiness = async (ctx: ApiContext): Promise<void> => {
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
  };

  // HEAD reuses the GET handlers so uptime monitors that only send HEAD
  // (e.g. UptimeRobot Free) observe the same status code as GET.
  router.get("/health", liveness);
  router.head("/health", liveness);
  router.get("/health/ready", readiness);
  router.head("/health/ready", readiness);
}
