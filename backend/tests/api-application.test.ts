import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  createApiApp,
  type ApiApp
} from "../apps/api/src/app.js";
import {
  type AuthorizationPolicy,
  FailClosedAuthorizationPolicy,
  PermissiveAuthorizationPolicy
} from "../apps/api/src/middleware/auth-middleware.js";
import {
  AuthService,
  hashPassword
} from "../apps/api/src/modules/identity/index.js";
import { InventoryService } from "../apps/api/src/modules/inventory/index.js";
import { QualityService } from "../apps/api/src/modules/quality/index.js";
import { TaskService, WarehouseOrchestrator } from "../apps/api/src/modules/warehouse/index.js";
import type { DatabaseConnection, DatabaseTransaction } from "../packages/db/src/index.js";

// Mock Database Entity Interfaces
interface MockUser {
  id: string;
  login_identifier: string;
  password_hash: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface MockSession {
  id: string;
  user_id: string;
  session_token_hash: string;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  last_seen_at: Date;
  version: string;
}

interface MockLoginAttempt {
  id: string;
  login_identifier: string;
  attempted_at: Date;
  succeeded: boolean;
  user_id: string | null;
  lockout_until: Date | null;
  correlation_id: string | null;
  created_at: Date;
}

interface MockClient {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockOrder {
  id: string;
  client_id: string;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockOrderItem {
  id: string;
  order_id: string;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockInventoryItem {
  id: string;
  product_code: string;
  name: string | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockInventoryBatch {
  id: string;
  inventory_item_id: string;
  batch_number: string;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockLocation {
  id: string;
  depot_id: string;
  name: string;
  location_type: string;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockInventoryBalance {
  id: string;
  inventory_batch_id: string;
  location_id: string;
  box_quantity: string;
  version: string;
  created_at: Date;
  updated_at: Date;
}

interface MockInventoryMovement {
  id: string;
  depot_id: string | null;
  item_id: string | null;
  inventory_batch_id: string;
  source_location_id: string | null;
  destination_location_id: string | null;
  box_quantity: string;
  movement_type: string;
  task_id: string | null;
  occurred_at: Date;
  actor_user_id: string | null;
  idempotency_key: string | null;
  correlation_id: string | null;
  created_at: Date;
}

interface MockTask {
  id: string;
  depot_id: string | null;
  task_type: string | null;
  status: string;
  client_id: string | null;
  order_id: string | null;
  order_item_id: string | null;
  inventory_item_id: string | null;
  inventory_batch_id: string | null;
  source_location_id: string | null;
  destination_location_id: string | null;
  shift_id: string | null;
  planned_box_quantity: string | null;
  completed_box_quantity: string | null;
  started_at: Date | null;
  paused_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockTaskAssignment {
  id: string;
  task_id: string;
  employee_id: string;
  assigned_at: Date;
  assigned_by_user_id: string;
  unassigned_at: Date | null;
  unassigned_by_user_id: string | null;
  version: string;
}

interface MockTaskEvent {
  id: string;
  task_id: string;
  event_type: string;
  event_at: Date;
  actor_user_id: string | null;
  correlation_id: string | null;
  metadata: string | null;
  created_at: Date;
}

interface MockQualityRecord {
  id: string;
  task_id: string;
  outcome: string;
  quality_score: string | null;
  damage_rate: string | null;
  task_accuracy: string | null;
  final_inventory_status: string | null;
  inspected_at: Date;
  inspected_by_user_id: string | null;
  superseded_by_record_id: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockTaskPhoto {
  id: string;
  task_id: string;
  layer_number: number;
  box_quantity: string;
  captured_by_employee_id: string | null;
  captured_at: Date;
  storage_key: string;
  status: string | null;
  superseded_by_photo_id: string | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockEmployee {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

class MockDatabaseState {
  public users: MockUser[] = [];
  public sessions: MockSession[] = [];
  public loginAttempts: MockLoginAttempt[] = [];
  public clients: MockClient[] = [];
  public orders: MockOrder[] = [];
  public orderItems: MockOrderItem[] = [];
  public inventoryItems: MockInventoryItem[] = [];
  public inventoryBatches: MockInventoryBatch[] = [];
  public locations: MockLocation[] = [];
  public inventoryBalances: MockInventoryBalance[] = [];
  public inventoryMovements: MockInventoryMovement[] = [];
  public tasks: MockTask[] = [];
  public taskAssignments: MockTaskAssignment[] = [];
  public taskEvents: MockTaskEvent[] = [];
  public qualityRecords: MockQualityRecord[] = [];
  public taskPhotos: MockTaskPhoto[] = [];
  public employees: MockEmployee[] = [];

  public clone(): MockDatabaseState {
    const copy = new MockDatabaseState();
    copy.users = this.users.map((x) => ({ ...x }));
    copy.sessions = this.sessions.map((x) => ({ ...x }));
    copy.loginAttempts = this.loginAttempts.map((x) => ({ ...x }));
    copy.clients = this.clients.map((x) => ({ ...x }));
    copy.orders = this.orders.map((x) => ({ ...x }));
    copy.orderItems = this.orderItems.map((x) => ({ ...x }));
    copy.inventoryItems = this.inventoryItems.map((x) => ({ ...x }));
    copy.inventoryBatches = this.inventoryBatches.map((x) => ({ ...x }));
    copy.locations = this.locations.map((x) => ({ ...x }));
    copy.inventoryBalances = this.inventoryBalances.map((x) => ({ ...x }));
    copy.inventoryMovements = this.inventoryMovements.map((x) => ({ ...x }));
    copy.tasks = this.tasks.map((x) => ({ ...x }));
    copy.taskAssignments = this.taskAssignments.map((x) => ({ ...x }));
    copy.taskEvents = this.taskEvents.map((x) => ({ ...x }));
    copy.qualityRecords = this.qualityRecords.map((x) => ({ ...x }));
    copy.taskPhotos = this.taskPhotos.map((x) => ({ ...x }));
    copy.employees = this.employees.map((x) => ({ ...x }));
    return copy;
  }

  public restore(from: MockDatabaseState): void {
    this.users = from.users.map((x) => ({ ...x }));
    this.sessions = from.sessions.map((x) => ({ ...x }));
    this.loginAttempts = from.loginAttempts.map((x) => ({ ...x }));
    this.clients = from.clients.map((x) => ({ ...x }));
    this.orders = from.orders.map((x) => ({ ...x }));
    this.orderItems = from.orderItems.map((x) => ({ ...x }));
    this.inventoryItems = from.inventoryItems.map((x) => ({ ...x }));
    this.inventoryBatches = from.inventoryBatches.map((x) => ({ ...x }));
    this.locations = from.locations.map((x) => ({ ...x }));
    this.inventoryBalances = from.inventoryBalances.map((x) => ({ ...x }));
    this.inventoryMovements = from.inventoryMovements.map((x) => ({ ...x }));
    this.tasks = from.tasks.map((x) => ({ ...x }));
    this.taskAssignments = from.taskAssignments.map((x) => ({ ...x }));
    this.taskEvents = from.taskEvents.map((x) => ({ ...x }));
    this.qualityRecords = from.qualityRecords.map((x) => ({ ...x }));
    this.taskPhotos = from.taskPhotos.map((x) => ({ ...x }));
    this.employees = from.employees.map((x) => ({ ...x }));
  }
}

function getTableList(targetState: MockDatabaseState, table: string): unknown[] {
  switch (table) {
    case "users": return targetState.users;
    case "sessions": return targetState.sessions;
    case "login_attempts": return targetState.loginAttempts;
    case "clients": return targetState.clients;
    case "orders": return targetState.orders;
    case "order_items": return targetState.orderItems;
    case "inventory_items": return targetState.inventoryItems;
    case "inventory_batches": return targetState.inventoryBatches;
    case "locations": return targetState.locations;
    case "inventory_balances": return targetState.inventoryBalances;
    case "inventory_movements": return targetState.inventoryMovements;
    case "tasks": return targetState.tasks;
    case "task_assignments": return targetState.taskAssignments;
    case "task_events": return targetState.taskEvents;
    case "quality_records": return targetState.qualityRecords;
    case "task_photos": return targetState.taskPhotos;
    case "employees": return targetState.employees;
    default: return [];
  }
}

function createMockDatabase(state: MockDatabaseState): DatabaseConnection {
  const createQueryExecutor = (targetState: MockDatabaseState) => {
    return {
      selectFrom: (table: string) => {
        const filters: Array<(row: unknown) => boolean> = [];
        let orderByField: string | null = null;
        let orderByDir: "asc" | "desc" = "asc";
        let limitVal: number | null = null;
        let innerJoinTable: string | null = null;
        let innerJoinOn: { left: string; right: string } | null = null;
        let isCount = false;

        const builder = {
          selectAll: () => builder,
          select: (selection: unknown) => {
            if (typeof selection === "function") {
              isCount = true;
            }
            return builder;
          },
          innerJoin: (joinTable: string, left: string, right: string) => {
            innerJoinTable = joinTable;
            innerJoinOn = { left, right };
            return builder;
          },
          where: (fieldOrEb: unknown, op?: string, value?: unknown) => {
            if (typeof fieldOrEb === "string" && op === "=") {
              filters.push((row: unknown) => {
                const r = row as Record<string, unknown>;
                const fieldName = fieldOrEb.includes(".") ? fieldOrEb.split(".")[1]! : fieldOrEb;
                return r[fieldName] === value;
              });
            } else if (typeof fieldOrEb === "string" && op === ">") {
              filters.push((row: unknown) => {
                const r = row as Record<string, unknown>;
                const fieldName = fieldOrEb.includes(".") ? fieldOrEb.split(".")[1]! : fieldOrEb;
                return (r[fieldName] as Date) > (value as Date);
              });
            } else if (typeof fieldOrEb === "string" && op === ">=") {
              filters.push((row: unknown) => {
                const r = row as Record<string, unknown>;
                const fieldName = fieldOrEb.includes(".") ? fieldOrEb.split(".")[1]! : fieldOrEb;
                return (r[fieldName] as Date) >= (value as Date);
              });
            } else if (typeof fieldOrEb === "string" && op === "is" && value === null) {
              filters.push((row: unknown) => {
                const r = row as Record<string, unknown>;
                const fieldName = fieldOrEb.includes(".") ? fieldOrEb.split(".")[1]! : fieldOrEb;
                return r[fieldName] === null;
              });
            }
            return builder;
          },
          forUpdate: () => builder,
          orderBy: (field: string, dir: "asc" | "desc" = "asc") => {
            orderByField = field;
            orderByDir = dir;
            return builder;
          },
          limit: (n: number) => {
            limitVal = n;
            return builder;
          },
          execute: async () => {
            const tableList = getTableList(targetState, table);
            let result: unknown[] = [];

            if (innerJoinTable && innerJoinOn) {
              const joinedList = getTableList(targetState, innerJoinTable);
              const combined: unknown[] = [];
              for (const r of tableList) {
                const rObj = r as Record<string, unknown>;
                const leftKey = innerJoinOn.left.includes(".") ? innerJoinOn.left.split(".")[1]! : innerJoinOn.left;
                const rightKey = innerJoinOn.right.includes(".") ? innerJoinOn.right.split(".")[1]! : innerJoinOn.right;
                for (const j of joinedList) {
                  const jObj = j as Record<string, unknown>;
                  if (rObj[leftKey] === jObj[rightKey] || rObj[rightKey] === jObj[leftKey]) {
                    combined.push({
                      ...rObj,
                      ...jObj,
                      user_id: jObj.id,
                      login_identifier: jObj.login_identifier,
                      is_active: jObj.is_active,
                      user_created_at: jObj.created_at,
                      user_updated_at: jObj.updated_at,
                      session_id: rObj.id,
                      expires_at: rObj.expires_at,
                      revoked_at: rObj.revoked_at
                    });
                  }
                }
              }
              result = combined.filter((row) => filters.every((f) => f(row)));
            } else {
              result = tableList.filter((row) => filters.every((f) => f(row)));
            }

            if (isCount) {
              return [{ failure_count: String(result.length) }];
            }

            if (orderByField) {
              result.sort((a, b) => {
                const fieldName = orderByField!.includes(".") ? orderByField!.split(".")[1]! : orderByField!;
                const valA = (a as Record<string, unknown>)[fieldName];
                const valB = (b as Record<string, unknown>)[fieldName];
                if (valA instanceof Date && valB instanceof Date) {
                  return orderByDir === "asc"
                    ? valA.getTime() - valB.getTime()
                    : valB.getTime() - valA.getTime();
                }
                if (typeof valA === "number" && typeof valB === "number") {
                  return orderByDir === "asc" ? valA - valB : valB - valA;
                }
                return 0;
              });
            }

            if (limitVal !== null) {
              result = result.slice(0, limitVal);
            }

            return result;
          },
          executeTakeFirst: async () => {
            const rows = await builder.execute();
            return rows[0] ?? undefined;
          },
          executeTakeFirstOrThrow: async () => {
            const rows = await builder.execute();
            if (!rows[0]) throw new Error("Row not found");
            return rows[0];
          }
        };
        return builder;
      },
      insertInto: (table: string) => {
        return {
          values: (vals: Record<string, unknown>) => ({
            execute: async () => {
              const tableList = getTableList(targetState, table);
              const cleanVals: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(vals)) {
                if (k === "version" && typeof v !== "string" && typeof v !== "number" && typeof v !== "bigint") {
                  cleanVals[k] = "1";
                } else if (typeof v === "object" && v !== null && !(v instanceof Date)) {
                  cleanVals[k] = "1";
                } else {
                  cleanVals[k] = v;
                }
              }
              tableList.push(cleanVals);
              return { insertId: undefined };
            }
          })
        };
      },
      updateTable: (table: string) => {
        let updates: Record<string, unknown> = {};
        const filters: Array<(row: unknown) => boolean> = [];

        const builder = {
          set: (vals: Record<string, unknown>) => {
            updates = vals;
            return builder;
          },
          where: (field: string, op: string, val: unknown) => {
            if (op === "=") {
              filters.push((row: unknown) => (row as Record<string, unknown>)[field] === val);
            } else if (op === "is" && val === null) {
              filters.push((row: unknown) => (row as Record<string, unknown>)[field] === null);
            }
            return builder;
          },
          execute: async () => {
            const tableList = getTableList(targetState, table);
            let count = 0;
            for (const row of tableList) {
              if (filters.every((f) => f(row))) {
                count++;
                const r = row as Record<string, unknown>;
                for (const [k, v] of Object.entries(updates)) {
                  if (k === "version") {
                    r[k] = String(BigInt((r[k] as string) || "1") + 1n);
                  } else {
                    r[k] = v;
                  }
                }
              }
            }
            return { numUpdatedRows: BigInt(count) };
          },
          executeTakeFirst: async () => {
            return builder.execute();
          }
        };
        return builder;
      }
    };
  };

  const connection: DatabaseConnection = {
    ...createQueryExecutor(state),
    getExecutor: () => ({
      transformQuery: (node: unknown) => node,
      compileQuery: (node: unknown) => ({ sql: "select 1 as database_healthy", parameters: [], query: node }),
      executeQuery: async () => ({ rows: [{ database_healthy: 1 }] })
    }),
    executeQuery: async () => ({ rows: [{ database_healthy: 1 }] }),
    transaction: () => ({
      execute: async <T>(cb: (trx: DatabaseTransaction) => Promise<T>): Promise<T> => {
        const snapshot = state.clone();
        try {
          const trxExecutor = createQueryExecutor(state) as unknown as DatabaseTransaction;
          return await cb(trxExecutor);
        } catch (err) {
          state.restore(snapshot);
          throw err;
        }
      }
    })
  } as unknown as DatabaseConnection;

  return connection;
}

interface TestServerContext {
  app: ApiApp;
  state: MockDatabaseState;
  baseUrl: string;
  close: () => Promise<void>;
}

async function startTestServer(options: { authorizationPolicy?: AuthorizationPolicy } = {}): Promise<TestServerContext> {
  const state = new MockDatabaseState();
  const db = createMockDatabase(state);

  const authService = new AuthService({ database: db });
  const taskService = new TaskService({ database: db });
  const inventoryService = new InventoryService({ database: db });
  const qualityService = new QualityService({ database: db });
  const orchestrator = new WarehouseOrchestrator({
    database: db,
    taskService,
    inventoryService,
    qualityService
  });

  const app = createApiApp({
    database: db,
    authService,
    taskService,
    inventoryService,
    qualityService,
    orchestrator,
    ...(options.authorizationPolicy ? { authorizationPolicy: options.authorizationPolicy } : {})
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));

  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const close = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return { app, state, baseUrl, close };
}

// Helper to seed user and log in, returning session cookie
async function createAuthenticatedSession(
  state: MockDatabaseState,
  baseUrl: string,
  credentials = { login_identifier: "wh_operator_1", password: "SecurePassword123!" }
): Promise<{ cookie: string; user: MockUser; sessionToken: string }> {
  const now = new Date();
  const passwordHash = await hashPassword(credentials.password);
  const user: MockUser = {
    id: crypto.randomUUID(),
    login_identifier: credentials.login_identifier,
    password_hash: passwordHash,
    is_active: true,
    created_at: now,
    updated_at: now
  };
  state.users.push(user);

  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials)
  });

  assert.equal(res.status, 200);
  const setCookie = res.headers.get("set-cookie") ?? "";
  assert.ok(setCookie.includes("rp_session="));

  const match = /rp_session=([^;]+)/.exec(setCookie);
  const token = match?.[1] ? decodeURIComponent(match[1]) : "";

  return { cookie: setCookie, user, sessionToken: token };
}

// Helper to seed common warehouse master data
function seedMasterData(state: MockDatabaseState) {
  const now = new Date();
  const clientId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const orderItemId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const batchId = crypto.randomUUID();
  const depotId = crypto.randomUUID();
  const locSrcId = crypto.randomUUID();
  const locDstId = crypto.randomUUID();
  const employeeId = crypto.randomUUID();

  state.clients.push({ id: clientId, name: "Acme Logistics", created_at: now, updated_at: now, version: "1" });
  state.orders.push({ id: orderId, client_id: clientId, created_at: now, updated_at: now, version: "1" });
  state.orderItems.push({ id: orderItemId, order_id: orderId, created_at: now, updated_at: now, version: "1" });
  state.inventoryItems.push({ id: itemId, product_code: "BOX-LARGE-100", name: "Large Box", created_at: now, updated_at: now, version: "1" });
  state.inventoryBatches.push({ id: batchId, inventory_item_id: itemId, batch_number: "BATCH-2026-001", created_at: now, updated_at: now, version: "1" });
  state.locations.push({ id: locSrcId, depot_id: depotId, name: "Aisle 1 - Bay 1", location_type: "STORAGE", created_at: now, updated_at: now, version: "1" });
  state.locations.push({ id: locDstId, depot_id: depotId, name: "Packing Station 1", location_type: "PACKING", created_at: now, updated_at: now, version: "1" });
  state.inventoryBalances.push({
    id: crypto.randomUUID(),
    inventory_batch_id: batchId,
    location_id: locSrcId,
    box_quantity: "100",
    version: "1",
    created_at: now,
    updated_at: now
  });
  state.employees.push({
    id: employeeId,
    user_id: null,
    first_name: "John",
    last_name: "Doe",
    is_active: true,
    created_at: now,
    updated_at: now
  });

  return { clientId, orderId, orderItemId, itemId, batchId, depotId, locSrcId, locDstId, employeeId };
}

// -------------------------------------------------------------
// TEST SUITE
// -------------------------------------------------------------

test("1. Health check endpoints (/health, /health/ready)", async () => {
  const ctx = await startTestServer();
  try {
    const healthRes = await fetch(`${ctx.baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const healthBody = await healthRes.json() as { success: boolean; data: { status: string; timestamp: string } };
    assert.equal(healthBody.success, true);
    assert.equal(healthBody.data.status, "ok");

    const readyRes = await fetch(`${ctx.baseUrl}/health/ready`);
    assert.equal(readyRes.status, 200);
    const readyBody = await readyRes.json() as { success: boolean; data: { status: string; database: { ready: boolean } } };
    assert.equal(readyBody.success, true);
    assert.equal(readyBody.data.database.ready, true);
  } finally {
    await ctx.close();
  }
});

test("2. Authentication login, session retrieval, and logout lifecycle", async () => {
  const ctx = await startTestServer();
  try {
    const { cookie, user } = await createAuthenticatedSession(ctx.state, ctx.baseUrl);

    // GET /auth/session with cookie
    const sessionRes = await fetch(`${ctx.baseUrl}/auth/session`, {
      headers: { Cookie: cookie }
    });
    assert.equal(sessionRes.status, 200);
    const sessionBody = await sessionRes.json() as { success: boolean; data: { user: { id: string; login_identifier: string } } };
    assert.equal(sessionBody.success, true);
    assert.equal(sessionBody.data.user.id, user.id);
    assert.equal(sessionBody.data.user.login_identifier, user.login_identifier);

    // POST /auth/logout with cookie
    const logoutRes = await fetch(`${ctx.baseUrl}/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie }
    });
    assert.equal(logoutRes.status, 200);
    const logoutCookie = logoutRes.headers.get("set-cookie") ?? "";
    assert.ok(logoutCookie.includes("Max-Age=0") || logoutCookie.includes("Expires="));

    // GET /auth/session after logout is rejected
    const afterLogoutRes = await fetch(`${ctx.baseUrl}/auth/session`, {
      headers: { Cookie: cookie }
    });
    assert.equal(afterLogoutRes.status, 401);
  } finally {
    await ctx.close();
  }
});

test("3. Unauthenticated requests to protected endpoints are rejected with 401", async () => {
  const ctx = await startTestServer();
  try {
    const res = await fetch(`${ctx.baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_type: "PICKING" })
    });
    assert.equal(res.status, 401);
    const body = await res.json() as { success: boolean; error: { code: string; message: string } };
    assert.equal(body.success, false);
    assert.equal(body.error.code, "UNAUTHORIZED");
  } finally {
    await ctx.close();
  }
});

test("4. Fail-closed authorization policy blocks unresolved B-01/B-02 operations (403 Forbidden)", async () => {
  // Default server uses FailClosedAuthorizationPolicy
  const ctx = await startTestServer({ authorizationPolicy: new FailClosedAuthorizationPolicy() });
  try {
    const { cookie } = await createAuthenticatedSession(ctx.state, ctx.baseUrl);
    const master = seedMasterData(ctx.state);

    // Operational mutation attempt: POST /tasks
    const res = await fetch(`${ctx.baseUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie
      },
      body: JSON.stringify({ depot_id: master.depotId, task_type: "PICKING" })
    });

    assert.equal(res.status, 403);
    const body = await res.json() as { success: boolean; error: { code: string; message: string } };
    assert.equal(body.success, false);
    assert.equal(body.error.code, "FORBIDDEN");
    assert.match(body.error.message, /not authorized/i);
  } finally {
    await ctx.close();
  }
});

test("5. Client role/permission claims or fake headers cannot bypass authorization", async () => {
  const ctx = await startTestServer({ authorizationPolicy: new FailClosedAuthorizationPolicy() });
  try {
    const { cookie } = await createAuthenticatedSession(ctx.state, ctx.baseUrl);
    const master = seedMasterData(ctx.state);

    // Client attempts to supply forged headers asserting admin roles
    const res = await fetch(`${ctx.baseUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Role": "SUPER_ADMIN",
        "X-Permissions": "tasks:create,tasks:all",
        Cookie: cookie
      },
      body: JSON.stringify({
        depot_id: master.depotId,
        roles: ["SUPER_ADMIN"],
        permissions: ["tasks:create"]
      })
    });

    assert.equal(res.status, 403);
    const body = await res.json() as { success: boolean; error: { code: string } };
    assert.equal(body.error.code, "FORBIDDEN");
  } finally {
    await ctx.close();
  }
});

test("6. Invalid payload is rejected with 400 Bad Request when permitted", async () => {
  const ctx = await startTestServer({ authorizationPolicy: new PermissiveAuthorizationPolicy() });
  try {
    const { cookie } = await createAuthenticatedSession(ctx.state, ctx.baseUrl);

    // Invalid UUID for depot_id
    const res = await fetch(`${ctx.baseUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie
      },
      body: JSON.stringify({ depot_id: "not-a-uuid" })
    });

    assert.equal(res.status, 400);
    const body = await res.json() as { success: boolean; error: { code: string; message: string; details: unknown[] } };
    assert.equal(body.success, false);
    assert.equal(body.error.code, "VALIDATION_FAILED");
    assert.ok(Array.isArray(body.error.details));
  } finally {
    await ctx.close();
  }
});

test("7. Task lifecycle operations through API endpoints when authorized", async () => {
  const ctx = await startTestServer({ authorizationPolicy: new PermissiveAuthorizationPolicy() });
  try {
    const { cookie } = await createAuthenticatedSession(ctx.state, ctx.baseUrl);
    const master = seedMasterData(ctx.state);

    // 1. Create Task
    const createRes = await fetch(`${ctx.baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        depot_id: master.depotId,
        task_type: "REPACK",
        planned_box_quantity: 50
      })
    });
    assert.equal(createRes.status, 201);
    const createBody = await createRes.json() as { success: boolean; data: { id: string; status: string } };
    const taskId = createBody.data.id;
    assert.equal(createBody.data.status, "PENDING");

    // 2. Assign Task
    const assignRes = await fetch(`${ctx.baseUrl}/tasks/${taskId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ employee_id: master.employeeId })
    });
    assert.equal(assignRes.status, 200);
    const assignBody = await assignRes.json() as { success: boolean; data: { status: string } };
    assert.equal(assignBody.data.status, "ASSIGNED");

    // 3. Start Task
    const startRes = await fetch(`${ctx.baseUrl}/tasks/${taskId}/start`, {
      method: "POST",
      headers: { Cookie: cookie }
    });
    assert.equal(startRes.status, 200);
    const startBody = await startRes.json() as { success: boolean; data: { status: string } };
    assert.equal(startBody.data.status, "IN_PROGRESS");

    // 4. Pause Task
    const pauseRes = await fetch(`${ctx.baseUrl}/tasks/${taskId}/pause`, {
      method: "POST",
      headers: { Cookie: cookie }
    });
    assert.equal(pauseRes.status, 200);
    const pauseBody = await pauseRes.json() as { success: boolean; data: { status: string } };
    assert.equal(pauseBody.data.status, "PAUSED");

    // 5. Resume Task
    const resumeRes = await fetch(`${ctx.baseUrl}/tasks/${taskId}/resume`, {
      method: "POST",
      headers: { Cookie: cookie }
    });
    assert.equal(resumeRes.status, 200);
    const resumeBody = await resumeRes.json() as { success: boolean; data: { status: string } };
    assert.equal(resumeBody.data.status, "IN_PROGRESS");

    // 6. Complete Task
    const completeRes = await fetch(`${ctx.baseUrl}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ completed_box_quantity: 50 })
    });
    assert.equal(completeRes.status, 200);
    const completeBody = await completeRes.json() as { success: boolean; data: { status: string; completed_box_quantity: string } };
    assert.equal(completeBody.data.status, "COMPLETED");
    assert.equal(completeBody.data.completed_box_quantity, "50");

    // 7. Reopen Task
    const reopenRes = await fetch(`${ctx.baseUrl}/tasks/${taskId}/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ reason: "Quality re-inspection required" })
    });
    assert.equal(reopenRes.status, 200);
    const reopenBody = await reopenRes.json() as { success: boolean; data: { status: string } };
    assert.equal(reopenBody.data.status, "IN_PROGRESS");

    // 8. Started/In-progress task cannot be cancelled (HTTP 409 Conflict)
    const inProgressCancelRes = await fetch(`${ctx.baseUrl}/tasks/${taskId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ reason: "Attempt cancel on started task" })
    });
    assert.equal(inProgressCancelRes.status, 409);

    // 9. Cancel unstarted Task
    const unstartedTaskRes = await fetch(`${ctx.baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        depot_id: master.depotId,
        task_type: "PICKING",
        planned_box_quantity: 20
      })
    });
    const unstartedTaskId = ((await unstartedTaskRes.json()) as { data: { id: string } }).data.id;

    const cancelRes = await fetch(`${ctx.baseUrl}/tasks/${unstartedTaskId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ reason: "Order cancelled by client" })
    });
    assert.equal(cancelRes.status, 200);
    const cancelBody = await cancelRes.json() as { success: boolean; data: { status: string } };
    assert.equal(cancelBody.data.status, "CANCELLED");
  } finally {
    await ctx.close();
  }
});

test("8. Atomic task movement execution (/tasks/:id/movement)", async () => {
  const ctx = await startTestServer({ authorizationPolicy: new PermissiveAuthorizationPolicy() });
  try {
    const { cookie } = await createAuthenticatedSession(ctx.state, ctx.baseUrl);
    const master = seedMasterData(ctx.state);

    // Create task
    const taskRes = await fetch(`${ctx.baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ depot_id: master.depotId, task_type: "INTERNAL_MOVE" })
    });
    const taskData = await taskRes.json() as { data: { id: string } };
    const taskId = taskData.data.id;

    const idempotencyKey = crypto.randomUUID();

    // Execute movement via API
    const moveRes = await fetch(`${ctx.baseUrl}/tasks/${taskId}/movement`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        Cookie: cookie
      },
      body: JSON.stringify({
        inventory_batch_id: master.batchId,
        source_location_id: master.locSrcId,
        destination_location_id: master.locDstId,
        box_quantity: 25,
        movement_type: "STAGE_MOVE"
      })
    });

    assert.equal(moveRes.status, 200);
    const moveBody = await moveRes.json() as {
      success: boolean;
      data: {
        task: { id: string; version: string };
        movement: {
          movement: { box_quantity: string; idempotency_key: string };
          source_balance_after: string;
          destination_balance_after: string;
        };
      };
    };

    assert.equal(moveBody.success, true);
    assert.equal(moveBody.data.movement.movement.box_quantity, "25");
    assert.equal(moveBody.data.movement.source_balance_after, "75");
    assert.equal(moveBody.data.movement.destination_balance_after, "25");
  } finally {
    await ctx.close();
  }
});

test("9. Closed-loop task summary (/tasks/:id/summary)", async () => {
  const ctx = await startTestServer({ authorizationPolicy: new PermissiveAuthorizationPolicy() });
  try {
    const { cookie } = await createAuthenticatedSession(ctx.state, ctx.baseUrl);
    const master = seedMasterData(ctx.state);

    // Initialize task from order
    const initRes = await fetch(`${ctx.baseUrl}/tasks/initialize-from-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        order_id: master.orderId,
        order_item_id: master.orderItemId,
        depot_id: master.depotId,
        planned_box_quantity: 30
      })
    });
    assert.equal(initRes.status, 201);
    const initBody = await initRes.json() as { data: { id: string } };
    const taskId = initBody.data.id;

    // Get summary
    const summaryRes = await fetch(`${ctx.baseUrl}/tasks/${taskId}/summary`, {
      headers: { Cookie: cookie }
    });
    assert.equal(summaryRes.status, 200);
    const summaryBody = await summaryRes.json() as {
      success: boolean;
      data: {
        task: { id: string };
        order: { id: string };
        order_item: { id: string };
        assignments: unknown[];
        photos: unknown[];
        quality_records: unknown[];
      };
    };

    assert.equal(summaryBody.success, true);
    assert.equal(summaryBody.data.task.id, taskId);
    assert.equal(summaryBody.data.order.id, master.orderId);
    assert.equal(summaryBody.data.order_item.id, master.orderItemId);
  } finally {
    await ctx.close();
  }
});

test("10. Quality inspection and photo registration endpoints", async () => {
  const ctx = await startTestServer({ authorizationPolicy: new PermissiveAuthorizationPolicy() });
  try {
    const { cookie } = await createAuthenticatedSession(ctx.state, ctx.baseUrl);
    const master = seedMasterData(ctx.state);

    // Create task
    const taskRes = await fetch(`${ctx.baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ depot_id: master.depotId, task_type: "REPACK" })
    });
    const taskData = await taskRes.json() as { data: { id: string } };
    const taskId = taskData.data.id;

    // 1. Record Photo
    const photoRes = await fetch(`${ctx.baseUrl}/tasks/${taskId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        layer_number: 1,
        box_quantity: 10,
        storage_key: "warehouse/2026/09/layer_1.jpg",
        captured_by_employee_id: master.employeeId
      })
    });
    assert.equal(photoRes.status, 201);
    const photoBody = await photoRes.json() as { success: boolean; data: { id: string; layer_number: number } };
    assert.equal(photoBody.data.layer_number, 1);

    // 2. Query photos
    const getPhotosRes = await fetch(`${ctx.baseUrl}/tasks/${taskId}/photos`, {
      headers: { Cookie: cookie }
    });
    assert.equal(getPhotosRes.status, 200);
    const photosList = await getPhotosRes.json() as { data: unknown[] };
    assert.equal(photosList.data.length, 1);

    // 3. Record Inspection with damage_rate >= 5 -> DAMAGED
    const inspectRes = await fetch(`${ctx.baseUrl}/tasks/${taskId}/quality-inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        outcome: "ADJUST",
        damage_rate: 6.5,
        quality_score: 92,
        notes: "Minor crushed corners"
      })
    });
    assert.equal(inspectRes.status, 201);
    const inspectBody = await inspectRes.json() as {
      success: boolean;
      data: { id: string; final_inventory_status: string; damage_rate: number };
    };
    assert.equal(inspectBody.data.final_inventory_status, "DAMAGED");
    assert.equal(inspectBody.data.damage_rate, 6.5);

    // 4. Query individual quality record
    const recordRes = await fetch(`${ctx.baseUrl}/quality-records/${inspectBody.data.id}`, {
      headers: { Cookie: cookie }
    });
    assert.equal(recordRes.status, 200);
    const recordBody = await recordRes.json() as { data: { id: string } };
    assert.equal(recordBody.data.id, inspectBody.data.id);
  } finally {
    await ctx.close();
  }
});

test("11. Inventory balances and standalone movements endpoints", async () => {
  const ctx = await startTestServer({ authorizationPolicy: new PermissiveAuthorizationPolicy() });
  try {
    const { cookie } = await createAuthenticatedSession(ctx.state, ctx.baseUrl);
    const master = seedMasterData(ctx.state);

    // 1. Query balances
    const balRes = await fetch(`${ctx.baseUrl}/inventory/balances?batch_id=${master.batchId}&location_id=${master.locSrcId}`, {
      headers: { Cookie: cookie }
    });
    assert.equal(balRes.status, 200);
    const balBody = await balRes.json() as { success: boolean; data: { box_quantity: string } };
    assert.equal(balBody.data.box_quantity, "100");

    // 2. Standalone movement
    const moveRes = await fetch(`${ctx.baseUrl}/inventory/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        inventory_batch_id: master.batchId,
        source_location_id: master.locSrcId,
        destination_location_id: master.locDstId,
        box_quantity: 10,
        movement_type: "REPLENISHMENT"
      })
    });
    assert.equal(moveRes.status, 200);
    const moveBody = await moveRes.json() as { success: boolean; data: { movement: { id: string } } };
    const movementId = moveBody.data.movement.id;

    // 3. Query movement by ID
    const getMoveRes = await fetch(`${ctx.baseUrl}/inventory/movements/${movementId}`, {
      headers: { Cookie: cookie }
    });
    assert.equal(getMoveRes.status, 200);
    const getMoveBody = await getMoveRes.json() as { data: { id: string } };
    assert.equal(getMoveBody.data.id, movementId);
  } finally {
    await ctx.close();
  }
});

test("12. Server actor attribution cannot be forged from client payload", async () => {
  const ctx = await startTestServer({ authorizationPolicy: new PermissiveAuthorizationPolicy() });
  try {
    const { cookie, user } = await createAuthenticatedSession(ctx.state, ctx.baseUrl);
    const master = seedMasterData(ctx.state);

    const forgedActorId = crypto.randomUUID();

    // Client tries to supply a forged actor ID in payload
    const createRes = await fetch(`${ctx.baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        depot_id: master.depotId,
        actor_user_id: forgedActorId
      })
    });

    assert.equal(createRes.status, 201);

    // Inspect events: the event actor must be the verified user ID from session
    const events = ctx.state.taskEvents;
    const taskCreatedEvent = events.find((e) => e.event_type === "TASK_CREATED");
    assert.ok(taskCreatedEvent);
    assert.equal(taskCreatedEvent.actor_user_id, user.id);
    assert.notEqual(taskCreatedEvent.actor_user_id, forgedActorId);
  } finally {
    await ctx.close();
  }
});
