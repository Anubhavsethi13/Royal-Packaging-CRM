import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { ApplicationConfig } from "@royal-packaging/config";
import { DEVELOPMENT_FRONTEND_ORIGIN, parseAllowedOrigins } from "@royal-packaging/config";
import type { DatabaseConnection } from "@royal-packaging/db";
import {
  type AuthorizationPolicy,
  DatabaseRBACAuthorizationPolicy
} from "./middleware/auth-middleware.js";
import { InMemoryRateLimiter, rateLimit } from "./middleware/rate-limit-middleware.js";
import { EtimeOfficeClient } from "./integrations/etime-office/etime-office-client.js";
import { AttendanceReadService } from "./modules/attendance/attendance-read-service.js";
import { AttendanceSyncService } from "./modules/attendance/attendance-sync-service.js";
import { AuditService } from "./modules/audit/audit-service.js";
import { ClientsService } from "./modules/clients/clients-service.js";
import { DashboardService } from "./modules/dashboard/dashboard-service.js";
import { AuthService } from "./modules/identity/auth-service.js";
import { RBACService } from "./modules/identity/rbac-service.js";
import { IncentiveService } from "./modules/incentives/incentive-service.js";
import { InventoryService } from "./modules/inventory/inventory-service.js";
import { KpiService } from "./modules/kpi/kpi-service.js";
import { OrdersService } from "./modules/orders/orders-service.js";
import { OrganizationService } from "./modules/organization/organization-service.js";
import { PayrollService } from "./modules/payroll/payroll-service.js";
import { QualityService } from "./modules/quality/quality-service.js";
import { ReportService } from "./modules/reports/report-service.js";
import { ShiftEntryService } from "./modules/shift-entries/shift-entry-service.js";
import { DailyReportService } from "./modules/daily-reports/daily-report-service.js";
import { TaskService } from "./modules/warehouse/task-service.js";
import { WarehouseOrchestrator } from "./modules/warehouse/warehouse-orchestrator.js";
import { WarehouseReadService } from "./modules/warehouse/warehouse-read-service.js";
import { Router } from "./router.js";
import { registerAttendanceRoutes } from "./routes/attendance-routes.js";
import { registerAuditRoutes } from "./routes/audit-routes.js";
import { registerAuthRoutes } from "./routes/auth-routes.js";
import { registerClientsRoutes } from "./routes/clients-routes.js";
import { registerDashboardRoutes } from "./routes/dashboard-routes.js";
import { registerHealthRoutes } from "./routes/health-routes.js";
import { registerIncentiveRoutes } from "./routes/incentive-routes.js";
import { registerInventoryRoutes } from "./routes/inventory-routes.js";
import { registerKpiRoutes } from "./routes/kpi-routes.js";
import { registerOrdersRoutes } from "./routes/orders-routes.js";
import { registerOrganizationRoutes } from "./routes/organization-routes.js";
import { registerPayrollRoutes } from "./routes/payroll-routes.js";
import { registerQualityRoutes } from "./routes/quality-routes.js";
import { registerReportRoutes } from "./routes/report-routes.js";
import { registerResyncRoutes } from "./routes/resync-routes.js";
import { registerShiftEntryRoutes } from "./routes/shift-entry-routes.js";
import { registerDailyReportRoutes } from "./routes/daily-report-routes.js";
import { DepotDirectory } from "./middleware/depot-scope.js";
import { registerTaskRoutes } from "./routes/task-routes.js";
import { registerWarehouseRoutes } from "./routes/warehouse-routes.js";
import { registerWarehouseOperationsRoutes } from "./routes/warehouse-operations-routes.js";

export interface ApiAppOptions {
  readonly database: DatabaseConnection;
  readonly appConfig?: ApplicationConfig;
  readonly authService?: AuthService;
  readonly rbacService?: RBACService;
  readonly inventoryService?: InventoryService;
  readonly taskService?: TaskService;
  readonly qualityService?: QualityService;
  readonly incentiveService?: IncentiveService;
  readonly orchestrator?: WarehouseOrchestrator;
  readonly authorizationPolicy?: AuthorizationPolicy;
  readonly clientsService?: ClientsService;
  readonly ordersService?: OrdersService;
  readonly organizationService?: OrganizationService;
  readonly auditService?: AuditService;
  readonly kpiService?: KpiService;
  readonly dashboardService?: DashboardService;
  readonly payrollService?: PayrollService;
  readonly reportService?: ReportService;
  readonly shiftEntryService?: ShiftEntryService;
  readonly warehouseReadService?: WarehouseReadService;
  readonly dailyReportService?: DailyReportService;
  readonly attendanceSyncService?: AttendanceSyncService;
  readonly attendanceReadService?: AttendanceReadService;
}

export interface ApiApp {
  readonly router: Router;
  readonly services: {
    readonly auth: AuthService;
    readonly rbac: RBACService;
    readonly inventory: InventoryService;
    readonly task: TaskService;
    readonly quality: QualityService;
    readonly incentive: IncentiveService;
    readonly orchestrator: WarehouseOrchestrator;
    readonly clients: ClientsService;
    readonly orders: OrdersService;
    readonly organization: OrganizationService;
    readonly audit: AuditService;
    readonly kpi: KpiService;
    readonly dashboard: DashboardService;
    readonly payroll: PayrollService;
    readonly reports: ReportService;
    readonly shiftEntries: ShiftEntryService;
    readonly warehouseRead: WarehouseReadService;
    readonly dailyReports: DailyReportService;
    readonly attendanceSync: AttendanceSyncService;
    readonly attendanceRead: AttendanceReadService;
  };
  readonly authorizationPolicy: AuthorizationPolicy;
  handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void>;
  createServer(): http.Server;
  listen(port: number, host?: string, callback?: () => void): http.Server;
}

export function createApiApp(options: ApiAppOptions): ApiApp {
  const { database, appConfig } = options;
  const isProduction = appConfig?.NODE_ENV === "production";

  // Initialize services if not injected
  const authService =
    options.authService ??
    new AuthService({
      database,
      ...(appConfig ? { appConfig: { NODE_ENV: appConfig.NODE_ENV, SESSION_COOKIE_SAMESITE: appConfig.SESSION_COOKIE_SAMESITE } } : {})
    });

  const rbacService =
    options.rbacService ??
    new RBACService({ database });

  const inventoryService =
    options.inventoryService ??
    new InventoryService({ database });

  const taskService =
    options.taskService ??
    new TaskService({ database });

  const qualityService =
    options.qualityService ??
    new QualityService({ database });

  const incentiveService =
    options.incentiveService ??
    new IncentiveService({ database });

  const orchestrator =
    options.orchestrator ??
    new WarehouseOrchestrator({
      database,
      taskService,
      inventoryService,
      qualityService
    });

  const clientsService = options.clientsService ?? new ClientsService({ database });
  const ordersService = options.ordersService ?? new OrdersService({ database });
  const organizationService = options.organizationService ?? new OrganizationService({ database });
  const auditService = options.auditService ?? new AuditService({ database });
  const kpiService =
    options.kpiService ??
    new KpiService({ database, ...(appConfig ? { timeZone: appConfig.OPERATIONS_TIMEZONE } : {}) });
  const dashboardService = options.dashboardService ?? new DashboardService({ database });
  const payrollService = options.payrollService ?? new PayrollService({ database });
  const reportService = options.reportService ?? new ReportService({ database });
  const shiftEntryService = options.shiftEntryService ?? new ShiftEntryService({ database });
  const warehouseReadService = options.warehouseReadService ?? new WarehouseReadService({ database });
  const dailyReportService =
    options.dailyReportService ??
    new DailyReportService({ database, ...(appConfig ? { timeZone: appConfig.OPERATIONS_TIMEZONE } : {}) });

  // e-Time Office attendance (backend only). The client exists only when all three
  // credentials are configured; without them sync reports NOT_CONFIGURED.
  const etimeCredentials =
    appConfig?.ETIME_CORPORATE_ID && appConfig.ETIME_USERNAME && appConfig.ETIME_PASSWORD
      ? { corporateId: appConfig.ETIME_CORPORATE_ID, username: appConfig.ETIME_USERNAME, password: appConfig.ETIME_PASSWORD }
      : null;
  const etimeClient =
    appConfig && etimeCredentials
      ? new EtimeOfficeClient({ baseUrl: appConfig.ETIME_BASE_URL, credentials: etimeCredentials, timeoutMs: appConfig.ETIME_REQUEST_TIMEOUT_MS, inOutDateFormat: appConfig.ETIME_INOUT_DATE_FORMAT })
      : null;
  const attendanceSyncService =
    options.attendanceSyncService ??
    new AttendanceSyncService({ database, client: etimeClient, initialLastRecord: appConfig?.ETIME_INITIAL_LAST_RECORD, empcode: appConfig?.ETIME_SYNC_EMPCODE ?? "ALL" });
  const attendanceReadService =
    options.attendanceReadService ??
    new AttendanceReadService({
      database,
      settings: {
        configured: attendanceSyncService.configured,
        pollingEnabled: appConfig?.ETIME_SYNC_ENABLED ?? false,
        pollIntervalMinutes: appConfig?.ETIME_POLL_INTERVAL_MINUTES ?? 5,
        empcode: attendanceSyncService.syncEmpcode
      }
    });

  // Default to server-side authoritative RBAC policy
  const authorizationPolicy =
    options.authorizationPolicy ??
    new DatabaseRBACAuthorizationPolicy({
      database,
      rbacService
    });

  // Depot isolation look-ups shared by every depot-scoped route group.
  const depotDirectory = new DepotDirectory(database);

  const router = new Router();

  const allowedOrigins = parseAllowedOrigins(appConfig?.FRONTEND_ORIGIN ?? DEVELOPMENT_FRONTEND_ORIGIN);
  router.configureCors({ allowedOrigins, allowCredentials: true });

  // In-memory, single-instance rate limiter (see rate-limit-middleware.ts
  // for the documented known limitation). A generous default so it guards
  // against runaway/abusive clients without interfering with normal use;
  // login already has its own dedicated DB-backed lockout policy.
  const rateLimiter = new InMemoryRateLimiter({ windowMs: 60_000, maxRequests: 300 });
  router.use(rateLimit(rateLimiter));

  // Register route groups
  registerHealthRoutes(router, database);
  registerAuthRoutes(router, authService, { isProduction, rbacService, cookieSameSite: appConfig?.SESSION_COOKIE_SAMESITE ?? "lax" });
  registerTaskRoutes(router, authService, taskService, orchestrator, authorizationPolicy, depotDirectory);
  registerInventoryRoutes(router, authService, inventoryService, authorizationPolicy, depotDirectory);
  registerQualityRoutes(router, authService, qualityService, authorizationPolicy, depotDirectory);
  registerIncentiveRoutes(router, authService, incentiveService, authorizationPolicy);
  registerClientsRoutes(router, authService, clientsService, authorizationPolicy);
  registerOrdersRoutes(router, authService, ordersService, authorizationPolicy);
  registerOrganizationRoutes(router, authService, organizationService, authorizationPolicy, depotDirectory);
  registerWarehouseRoutes(router, authService, inventoryService, taskService, database, authorizationPolicy);
  registerAuditRoutes(router, authService, auditService, authorizationPolicy);
  registerKpiRoutes(router, authService, kpiService, authorizationPolicy, depotDirectory);
  registerDashboardRoutes(router, authService, dashboardService, authorizationPolicy, depotDirectory);
  registerResyncRoutes(router, authService, taskService, inventoryService, kpiService, authorizationPolicy, depotDirectory);
  registerPayrollRoutes(router, authService, payrollService, authorizationPolicy);
  registerReportRoutes(router, authService, reportService, authorizationPolicy);
  registerShiftEntryRoutes(router, authService, shiftEntryService, authorizationPolicy, depotDirectory);
  registerWarehouseOperationsRoutes(router, authService, warehouseReadService, authorizationPolicy, depotDirectory);
  registerDailyReportRoutes(router, authService, dailyReportService, authorizationPolicy);
  registerAttendanceRoutes(router, authService, attendanceReadService, attendanceSyncService, authorizationPolicy);

  const handleRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    await router.handle(req, res);
  };

  const createServer = (): http.Server => {
    return http.createServer((req, res) => {
      void handleRequest(req, res);
    });
  };

  const listen = (port: number, host: string = "0.0.0.0", callback?: () => void): http.Server => {
    const server = createServer();
    server.listen(port, host, callback);
    return server;
  };

  return {
    router,
    services: {
      auth: authService,
      rbac: rbacService,
      inventory: inventoryService,
      task: taskService,
      quality: qualityService,
      incentive: incentiveService,
      orchestrator,
      clients: clientsService,
      orders: ordersService,
      organization: organizationService,
      audit: auditService,
      kpi: kpiService,
      dashboard: dashboardService,
      payroll: payrollService,
      reports: reportService,
      shiftEntries: shiftEntryService,
      warehouseRead: warehouseReadService,
      dailyReports: dailyReportService,
      attendanceSync: attendanceSyncService,
      attendanceRead: attendanceReadService
    },
    authorizationPolicy,
    handleRequest,
    createServer,
    listen
  };
}
