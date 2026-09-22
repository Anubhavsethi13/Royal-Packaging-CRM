import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after, beforeEach } from "node:test";
import bcrypt from "bcryptjs";
import type { DatabaseConnection } from "@royal-packaging/db";
import { createApiApp } from "../apps/api/src/app.js";
import { PermissiveAuthorizationPolicy } from "../apps/api/src/middleware/auth-middleware.js";
import { AuthService } from "../apps/api/src/modules/identity/auth-service.js";
import { RBACService } from "../apps/api/src/modules/identity/rbac-service.js";
import { ClientsService } from "../apps/api/src/modules/clients/clients-service.js";
import { OrdersService } from "../apps/api/src/modules/orders/orders-service.js";
import { OrganizationService } from "../apps/api/src/modules/organization/organization-service.js";
import { TaskService } from "../apps/api/src/modules/warehouse/task-service.js";
import { InventoryService } from "../apps/api/src/modules/inventory/inventory-service.js";
import { QualityService } from "../apps/api/src/modules/quality/quality-service.js";
import { WarehouseOrchestrator } from "../apps/api/src/modules/warehouse/warehouse-orchestrator.js";
import {
  ensureTestDatabase,
  getScopedTestDatabaseUrl,
  getTestDatabase,
  migrateTestDatabase,
  truncateAllTables,
  cleanupTestDatabase
} from "./helpers/postgres-test-helper.js";

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);

let db: DatabaseConnection;
let authService: AuthService;
let rbacService: RBACService;
let clientsService: ClientsService;
let ordersService: OrdersService;
let organizationService: OrganizationService;
let taskService: TaskService;
let inventoryService: InventoryService;
let qualityService: QualityService;
let orchestrator: WarehouseOrchestrator;

let serverUrl: string;
let stopServer: () => Promise<void>;

let testUserId: string;
let testEmployeeId: string;
let testDepotId: string;
let authCookie: string;

interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

interface ListResponse<T = Record<string, unknown>> {
  success: boolean;
  data: T[];
  meta: PageMeta;
  error?: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message: string }>;
  };
}

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);

  authService = new AuthService({ database: db });
  rbacService = new RBACService({ database: db });
  clientsService = new ClientsService({ database: db });
  ordersService = new OrdersService({ database: db });
  organizationService = new OrganizationService({ database: db });
  taskService = new TaskService({ database: db });
  inventoryService = new InventoryService({ database: db });
  qualityService = new QualityService({ database: db });
  orchestrator = new WarehouseOrchestrator({
    database: db,
    taskService,
    inventoryService,
    qualityService
  });

  const app = createApiApp({
    database: db,
    authService,
    rbacService,
    clientsService,
    ordersService,
    organizationService,
    taskService,
    inventoryService,
    qualityService,
    orchestrator,
    authorizationPolicy: new PermissiveAuthorizationPolicy()
  });

  const server = app.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  serverUrl = `http://127.0.0.1:${address.port}`;
  stopServer = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

after(async () => {
  if (stopServer) {
    await stopServer();
  }
  if (db) {
    await cleanupTestDatabase(db);
  }
});

beforeEach(async () => {
  await truncateAllTables(db);

  const passwordHash = await bcrypt.hash("Password123!", 4);
  testUserId = crypto.randomUUID();
  await db
    .insertInto("users")
    .values({
      id: testUserId,
      login_identifier: "test_admin",
      password_hash: passwordHash,
      is_active: true
    })
    .execute();

  testDepotId = crypto.randomUUID();
  await db
    .insertInto("depots")
    .values({
      id: testDepotId,
      code: "DEP-01",
      name: "Main Depot",
      active: true
    })
    .execute();

  testEmployeeId = crypto.randomUUID();
  await db
    .insertInto("employees")
    .values({
      id: testEmployeeId,
      user_id: testUserId,
      depot_id: testDepotId,
      employee_code: "EMP-001",
      name: "Admin User",
      department: "Warehouse",
      is_active: true
    })
    .execute();

  // Login via API to obtain session cookie
  const loginRes = await fetch(`${serverUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login_identifier: "test_admin",
      password: "Password123!"
    })
  });
  assert.equal(loginRes.status, 200);
  const cookie = loginRes.headers.get("set-cookie");
  assert.ok(cookie);
  authCookie = cookie;
});

// ============================================================================
// 1. CLIENTS COLLECTION ENDPOINT
// ============================================================================

test("Clients: pagination, search, sorting, and error handling", async () => {
  // Seed 3 clients
  await clientsService.createClient({ name: "Alpha Logistics", account_code: "CL-01" });
  await clientsService.createClient({ name: "Beta Packaging", account_code: "CL-02" });
  await clientsService.createClient({ name: "Gamma Freight", account_code: "CL-03" });

  // 1. Default pagination (page=1, pageSize=25)
  const res1 = await fetch(`${serverUrl}/clients`, { headers: { Cookie: authCookie } });
  assert.equal(res1.status, 200);
  const body1 = (await res1.json()) as ListResponse;
  assert.equal(body1.success, true);
  assert.equal(body1.data.length, 3);
  assert.deepEqual(body1.meta, {
    page: 1,
    pageSize: 25,
    total: 3,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false
  });

  // 2. Custom pagination: first page (pageSize=2)
  const res2 = await fetch(`${serverUrl}/clients?page=1&pageSize=2`, { headers: { Cookie: authCookie } });
  const body2 = (await res2.json()) as ListResponse;
  assert.equal(body2.data.length, 2);
  assert.deepEqual(body2.meta, {
    page: 1,
    pageSize: 2,
    total: 3,
    totalPages: 2,
    hasNext: true,
    hasPrevious: false
  });

  // 3. Middle/Last page (page=2, pageSize=2)
  const res3 = await fetch(`${serverUrl}/clients?page=2&pageSize=2`, { headers: { Cookie: authCookie } });
  const body3 = (await res3.json()) as ListResponse;
  assert.equal(body3.data.length, 1);
  assert.deepEqual(body3.meta, {
    page: 2,
    pageSize: 2,
    total: 3,
    totalPages: 2,
    hasNext: false,
    hasPrevious: true
  });

  // 4. Search filtering
  const resSearch = await fetch(`${serverUrl}/clients?search=Beta`, { headers: { Cookie: authCookie } });
  const bodySearch = (await resSearch.json()) as ListResponse;
  assert.equal(bodySearch.data.length, 1);
  assert.equal((bodySearch.data[0] as Record<string, unknown>).name, "Beta Packaging");
  assert.equal(bodySearch.meta.total, 1);
  assert.equal(bodySearch.meta.totalPages, 1);

  // 5. Empty search (0 results) -> total=0, totalPages=0, hasNext=false, hasPrevious=false
  const resEmpty = await fetch(`${serverUrl}/clients?search=NonExistentCorp`, { headers: { Cookie: authCookie } });
  const bodyEmpty = (await resEmpty.json()) as ListResponse;
  assert.equal(bodyEmpty.data.length, 0);
  assert.deepEqual(bodyEmpty.meta, {
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false
  });

  // 6. Safe sorting (asc / desc)
  const resSortAsc = await fetch(`${serverUrl}/clients?sortBy=name&sortDirection=asc`, { headers: { Cookie: authCookie } });
  const bodySortAsc = (await resSortAsc.json()) as ListResponse;
  assert.equal((bodySortAsc.data[0] as Record<string, unknown>).name, "Alpha Logistics");

  const resSortDesc = await fetch(`${serverUrl}/clients?sortBy=name&sortDirection=desc`, { headers: { Cookie: authCookie } });
  const bodySortDesc = (await resSortDesc.json()) as ListResponse;
  assert.equal((bodySortDesc.data[0] as Record<string, unknown>).name, "Gamma Freight");

  // 7. Invalid pagination (page=0) -> 400 VALIDATION_FAILED
  const resInvalidPage = await fetch(`${serverUrl}/clients?page=0`, { headers: { Cookie: authCookie } });
  assert.equal(resInvalidPage.status, 400);
  const bodyInvalidPage = (await resInvalidPage.json()) as ListResponse;
  assert.equal(bodyInvalidPage.success, false);
  assert.equal(bodyInvalidPage.error?.code, "VALIDATION_FAILED");

  // 8. Invalid pageSize (pageSize=-5) -> 400 VALIDATION_FAILED
  const resInvalidSize = await fetch(`${serverUrl}/clients?pageSize=-5`, { headers: { Cookie: authCookie } });
  assert.equal(resInvalidSize.status, 400);

  // 9. Unauthenticated request -> 401
  const resUnauth = await fetch(`${serverUrl}/clients`);
  assert.equal(resUnauth.status, 401);
});

// ============================================================================
// 2. ORDERS COLLECTION ENDPOINT
// ============================================================================

test("Orders: pagination, status filter, sorting, and error handling", async () => {
  const client = await clientsService.createClient({ name: "Order Client", account_code: "ORD-CL" });

  await ordersService.createOrder({
    client_id: client.id,
    order_code: "ORD-001",
    priority: "normal"
  });
  const order2 = await ordersService.createOrder({
    client_id: client.id,
    order_code: "ORD-002",
    priority: "high"
  });
  await ordersService.updateOrder(order2.id, { status: "confirmed" });
  await ordersService.createOrder({
    client_id: client.id,
    order_code: "ORD-003",
    priority: "urgent"
  });

  // 1. Default pagination
  const res = await fetch(`${serverUrl}/orders`, { headers: { Cookie: authCookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as ListResponse;
  assert.equal(body.data.length, 3);
  assert.equal(body.meta.total, 3);
  assert.equal(body.meta.totalPages, 1);

  // 2. Status filter
  const resFilter = await fetch(`${serverUrl}/orders?status=confirmed`, { headers: { Cookie: authCookie } });
  const bodyFilter = (await resFilter.json()) as ListResponse;
  assert.equal(bodyFilter.data.length, 1);
  assert.equal((bodyFilter.data[0] as Record<string, unknown>).order_code, "ORD-002");
  assert.equal(bodyFilter.meta.total, 1);

  // 3. Status "all" should be ignored (returns all orders)
  const resAll = await fetch(`${serverUrl}/orders?status=all`, { headers: { Cookie: authCookie } });
  const bodyAll = (await resAll.json()) as ListResponse;
  assert.equal(bodyAll.data.length, 3);

  // 4. Pagination slicing
  const resPage = await fetch(`${serverUrl}/orders?page=1&pageSize=2`, { headers: { Cookie: authCookie } });
  const bodyPage = (await resPage.json()) as ListResponse;
  assert.equal(bodyPage.data.length, 2);
  assert.equal(bodyPage.meta.hasNext, true);
  assert.equal(bodyPage.meta.totalPages, 2);

  // 5. Invalid page
  const resInvalid = await fetch(`${serverUrl}/orders?page=-1`, { headers: { Cookie: authCookie } });
  assert.equal(resInvalid.status, 400);
});

// ============================================================================
// 3. EMPLOYEES COLLECTION ENDPOINT
// ============================================================================

test("Employees: pagination, department filtering, and sorting", async () => {
  // We already have EMP-001 in Warehouse from beforeEach.
  // Add another employee in Production.
  const user2 = crypto.randomUUID();
  const passwordHash = await bcrypt.hash("Pass123!", 4);
  await db.insertInto("users").values({ id: user2, login_identifier: "prod_user", password_hash: passwordHash, is_active: true }).execute();
  await organizationService.createEmployee({
    user_id: user2,
    depot_id: testDepotId,
    employee_code: "EMP-002",
    name: "Bob Builder",
    department: "Production"
  });

  // 1. Total is 2
  const res = await fetch(`${serverUrl}/employees`, { headers: { Cookie: authCookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as ListResponse;
  assert.equal(body.data.length, 2);
  assert.equal(body.meta.total, 2);

  // 2. Department filter
  const resDept = await fetch(`${serverUrl}/employees?department=Production`, { headers: { Cookie: authCookie } });
  const bodyDept = (await resDept.json()) as ListResponse;
  assert.equal(bodyDept.data.length, 1);
  assert.equal((bodyDept.data[0] as Record<string, unknown>).department, "Production");

  // 3. Paging
  const resPaged = await fetch(`${serverUrl}/employees?page=1&pageSize=1`, { headers: { Cookie: authCookie } });
  const bodyPaged = (await resPaged.json()) as ListResponse;
  assert.equal(bodyPaged.data.length, 1);
  assert.equal(bodyPaged.meta.total, 2);
  assert.equal(bodyPaged.meta.totalPages, 2);
  assert.equal(bodyPaged.meta.hasNext, true);

  // 4. Invalid pageSize
  const resBadSize = await fetch(`${serverUrl}/employees?pageSize=0`, { headers: { Cookie: authCookie } });
  assert.equal(resBadSize.status, 400);
});

// ============================================================================
// 4. TASKS COLLECTION ENDPOINT
// ============================================================================

test("Tasks: pagination, filtering, and empty list", async () => {
  await taskService.createTask({ depot_id: testDepotId, task_type: "PICK" }, testUserId);
  await taskService.createTask({ depot_id: testDepotId, task_type: "REPACK" }, testUserId);

  // 1. Default pagination
  const res = await fetch(`${serverUrl}/tasks`, { headers: { Cookie: authCookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as ListResponse;
  assert.equal(body.data.length, 2);
  assert.equal(body.meta.total, 2);

  // 2. Filter by status=PENDING
  const resStatus = await fetch(`${serverUrl}/tasks?status=PENDING`, { headers: { Cookie: authCookie } });
  const bodyStatus = (await resStatus.json()) as ListResponse;
  assert.equal(bodyStatus.data.length, 2);

  // 3. Filter by task_type=REPACK
  const resType = await fetch(`${serverUrl}/tasks?task_type=REPACK`, { headers: { Cookie: authCookie } });
  const bodyType = (await resType.json()) as ListResponse;
  assert.equal(bodyType.data.length, 1);
  assert.equal((bodyType.data[0] as Record<string, unknown>).task_type, "REPACK");

  // 4. Empty result
  const resEmpty = await fetch(`${serverUrl}/tasks?status=CANCELLED`, { headers: { Cookie: authCookie } });
  const bodyEmpty = (await resEmpty.json()) as ListResponse;
  assert.equal(bodyEmpty.data.length, 0);
  assert.deepEqual(bodyEmpty.meta, {
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false
  });

  // 5. Invalid pagination
  const resInvalid = await fetch(`${serverUrl}/tasks?page=-2`, { headers: { Cookie: authCookie } });
  assert.equal(resInvalid.status, 400);
});

// ============================================================================
// 5. INVENTORY COLLECTION ENDPOINT
// ============================================================================

test("Inventory: pagination, search, and sorting", async () => {
  await db
    .insertInto("inventory_items")
    .values({ id: crypto.randomUUID(), product_code: "SKU-A", name: "Cardboard Box Small" })
    .execute();
  await db
    .insertInto("inventory_items")
    .values({ id: crypto.randomUUID(), product_code: "SKU-B", name: "Cardboard Box Medium" })
    .execute();
  await db
    .insertInto("inventory_items")
    .values({ id: crypto.randomUUID(), product_code: "SKU-C", name: "Plastic Wrap Roll" })
    .execute();

  // 1. Default pagination
  const res = await fetch(`${serverUrl}/inventory`, { headers: { Cookie: authCookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as ListResponse;
  assert.equal(body.data.length, 3);
  assert.equal(body.meta.total, 3);

  // 2. Search
  const resSearch = await fetch(`${serverUrl}/inventory?search=Plastic`, { headers: { Cookie: authCookie } });
  const bodySearch = (await resSearch.json()) as ListResponse;
  assert.equal(bodySearch.data.length, 1);
  assert.equal((bodySearch.data[0] as Record<string, unknown>).product_code, "SKU-C");

  // 3. Sorting
  const resSort = await fetch(`${serverUrl}/inventory?sortBy=product_code&sortDirection=desc`, { headers: { Cookie: authCookie } });
  const bodySort = (await resSort.json()) as ListResponse;
  assert.equal((bodySort.data[0] as Record<string, unknown>).product_code, "SKU-C");

  // 4. Invalid pagination
  const resInvalid = await fetch(`${serverUrl}/inventory?page=0`, { headers: { Cookie: authCookie } });
  assert.equal(resInvalid.status, 400);
});

// ============================================================================
// 6. WAREHOUSE TASKS COLLECTION ENDPOINT
// ============================================================================

test("Warehouse Tasks: employee-scoped tasks pagination", async () => {
  // Create tasks and assign one to testEmployeeId
  const task1 = await taskService.createTask({ depot_id: testDepotId, task_type: "PICK" }, testUserId);
  const task2 = await taskService.createTask({ depot_id: testDepotId, task_type: "PACK" }, testUserId);
  await taskService.assignTask({ task_id: task1.id, employee_id: testEmployeeId }, testUserId);

  // 1. Fetch assigned tasks
  const res = await fetch(`${serverUrl}/warehouse/tasks`, { headers: { Cookie: authCookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as ListResponse;
  assert.equal(body.data.length, 1);
  assert.equal(body.meta.total, 1);
  assert.equal((body.data[0] as Record<string, unknown>).id, task1.id);

  // Assign second task as well
  await taskService.assignTask({ task_id: task2.id, employee_id: testEmployeeId }, testUserId);

  // 2. Pagination on 2 tasks
  const resPaged = await fetch(`${serverUrl}/warehouse/tasks?page=1&pageSize=1`, { headers: { Cookie: authCookie } });
  const bodyPaged = (await resPaged.json()) as ListResponse;
  assert.equal(bodyPaged.data.length, 1);
  assert.equal(bodyPaged.meta.total, 2);
  assert.equal(bodyPaged.meta.totalPages, 2);
  assert.equal(bodyPaged.meta.hasNext, true);

  // 3. Invalid pagination
  const resInvalid = await fetch(`${serverUrl}/warehouse/tasks?pageSize=-1`, { headers: { Cookie: authCookie } });
  assert.equal(resInvalid.status, 400);
});
