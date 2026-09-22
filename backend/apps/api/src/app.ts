import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { ApplicationConfig } from "@royal-packaging/config";
import { parseAllowedOrigins } from "@royal-packaging/config";
import type { DatabaseConnection } from "@royal-packaging/db";
import {
  type AuthorizationPolicy,
  DatabaseRBACAuthorizationPolicy
} from "./middleware/auth-middleware.js";
import { InMemoryRateLimiter, rateLimit } from "./middleware/rate-limit-middleware.js";
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
import { TaskService } from "./modules/warehouse/task-service.js";
import { WarehouseOrchestrator } from "./modules/warehouse/warehouse-orchestrator.js";
import { Router } from "./router.js";
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
import { registerTaskRoutes } from "./routes/task-routes.js";
import { registerWarehouseRoutes } from "./routes/warehouse-routes.js";

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
      ...(appConfig ? { appConfig: { NODE_ENV: appConfig.NODE_ENV } } : {})
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
  const kpiService = options.kpiService ?? new KpiService({ database });
  const dashboardService = options.dashboardService ?? new DashboardService({ database });
  const payrollService = options.payrollService ?? new PayrollService({ database });
  const reportService = options.reportService ?? new ReportService({ database });

  // Default to server-side authoritative RBAC policy
  const authorizationPolicy =
    options.authorizationPolicy ??
    new DatabaseRBACAuthorizationPolicy({
      database,
      rbacService
    });

  const router = new Router();

  const allowedOrigins = parseAllowedOrigins(appConfig?.FRONTEND_ORIGIN ?? "http://localhost:5173");
  router.configureCors({ allowedOrigins, allowCredentials: true });

  // In-memory, single-instance rate limiter (see rate-limit-middleware.ts
  // for the documented known limitation). A generous default so it guards
  // against runaway/abusive clients without interfering with normal use;
  // login already has its own dedicated DB-backed lockout policy.
  const rateLimiter = new InMemoryRateLimiter({ windowMs: 60_000, maxRequests: 300 });
  router.use(rateLimit(rateLimiter));

  // Register route groups
  registerHealthRoutes(router, database);
  registerAuthRoutes(router, authService, { isProduction, rbacService });
  registerTaskRoutes(router, authService, taskService, orchestrator, authorizationPolicy);
  registerInventoryRoutes(router, authService, inventoryService, authorizationPolicy);
  registerQualityRoutes(router, authService, qualityService, authorizationPolicy);
  registerIncentiveRoutes(router, authService, incentiveService, authorizationPolicy);
  registerClientsRoutes(router, authService, clientsService, authorizationPolicy);
  registerOrdersRoutes(router, authService, ordersService, authorizationPolicy);
  registerOrganizationRoutes(router, authService, organizationService, authorizationPolicy);
  registerWarehouseRoutes(router, authService, inventoryService, taskService, database, authorizationPolicy);
  registerAuditRoutes(router, authService, auditService, authorizationPolicy);
  registerKpiRoutes(router, authService, kpiService, authorizationPolicy);
  registerDashboardRoutes(router, authService, dashboardService, authorizationPolicy);
  registerResyncRoutes(router, authService, taskService, inventoryService, kpiService, authorizationPolicy);
  registerPayrollRoutes(router, authService, payrollService, authorizationPolicy);
  registerReportRoutes(router, authService, reportService, authorizationPolicy);

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
      reports: reportService
    },
    authorizationPolicy,
    handleRequest,
    createServer,
    listen
  };
}
