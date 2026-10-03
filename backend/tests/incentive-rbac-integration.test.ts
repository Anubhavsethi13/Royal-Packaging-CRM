import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before } from "node:test";
import bcrypt from "bcryptjs";
import type { DatabaseConnection } from "@royal-packaging/db";
import { createApiApp } from "../apps/api/src/app.js";
import {
  ensureTestDatabase,
  getScopedTestDatabaseUrl,
  getTestDatabase,
  migrateTestDatabase,
  truncateAllTables,
  cleanupTestDatabase
} from "./helpers/postgres-test-helper.js";

/**
 * Product RBAC requirement: incentives (and payroll, which snapshots incentive
 * amounts) are SUPER_ADMIN ONLY, enforced by the real server-side policy for
 * every endpoint and every place incentive data could leak (dashboard, audit).
 */

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);
const PASSWORD = "Password123!";

type ActorKey = "superAdmin" | "admin" | "accountant" | "supervisor" | "manager" | "others" | "noRole";
const ROLE_OF: Record<ActorKey, string | null> = {
  superAdmin: "SUPER_ADMIN",
  admin: "ADMIN",
  accountant: "ACCOUNTANT",
  supervisor: "SUPERVISOR",
  manager: "MANAGER",
  others: "EMPLOYEE",
  noRole: null
};
const DENIED: ActorKey[] = ["admin", "accountant", "supervisor", "manager", "others", "noRole"];

let db: DatabaseConnection;
let serverUrl: string;
let stopServer: () => Promise<void>;
const cookies = {} as Record<ActorKey, string>;
const ids = {} as Record<"task" | "employee" | "ledger" | "incentiveEvent" | "taskEvent" | "depot", string>;

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);
  await truncateAllTables(db);

  const server = createApiApp({ database: db }).createServer(); // real DatabaseRBACAuthorizationPolicy
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  stopServer = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  // Depot-confined roles need a depot assignment (depot isolation); the test task lives in that depot.
  ids.depot = crypto.randomUUID();
  await db.insertInto("depots").values({ id: ids.depot, code: "DEP-IR", name: "Lockdown test depot", active: true }).execute();

  for (const [key, role] of Object.entries(ROLE_OF) as Array<[ActorKey, string | null]>) {
    const userId = crypto.randomUUID();
    const login = `inc_${key}`;
    await db.insertInto("users").values({ id: userId, login_identifier: login, password_hash: await bcrypt.hash(PASSWORD, 4), is_active: true }).execute();
    if (role) {
      const existing = await db.selectFrom("access_roles").select("id").where("code", "=", role).executeTakeFirst();
      const roleId = existing?.id ?? crypto.randomUUID();
      if (!existing) await db.insertInto("access_roles").values({ id: roleId, code: role, name: role, active: true }).execute();
      await db.insertInto("user_access_roles").values({ id: crypto.randomUUID(), user_id: userId, role_id: roleId, assigned_at: new Date(), assigned_by_user_id: userId, revoked_at: null, revoked_by_user_id: null, version: "1" }).execute();
    }
    const employeeId = crypto.randomUUID();
    await db.insertInto("employees").values({ id: employeeId, user_id: userId, employee_code: `EMP-${key}`, name: key, depot_id: ids.depot, is_active: true }).execute();
    if (key === "others") ids.employee = employeeId;
    const res = await fetch(`${serverUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login_identifier: login, password: PASSWORD }) });
    assert.equal(res.status, 200, login);
    cookies[key] = (res.headers.get("set-cookie") ?? "").split(";")[0] as string;
  }

  ids.task = crypto.randomUUID();
  await db.insertInto("tasks").values({ id: ids.task, depot_id: ids.depot, task_type: "LOADING", status: "COMPLETED", client_id: null, order_id: null, order_item_id: null, inventory_item_id: null, inventory_batch_id: null, source_location_id: null, destination_location_id: null, shift_id: null, planned_box_quantity: "10", completed_box_quantity: "10", started_at: new Date(Date.now() - 3_600_000), paused_at: null, completed_at: new Date() }).execute();
  ids.ledger = crypto.randomUUID();
  await db.insertInto("incentive_ledger").values({ id: ids.ledger, task_id: ids.task, employee_id: ids.employee, incentive_rule_id: null, amount: "450.00", status: "PENDING", idempotency_key: null }).execute();
  ids.incentiveEvent = crypto.randomUUID();
  await db.insertInto("incentive_events").values({ id: ids.incentiveEvent, task_id: ids.task, incentive_rule_id: null, event_type: "INCENTIVE_CALCULATED", actor_user_id: null, correlation_id: null, metadata: JSON.stringify({ amount: "450.00" }) }).execute();
  ids.taskEvent = crypto.randomUUID();
  await db.insertInto("task_events").values({ id: ids.taskEvent, task_id: ids.task, event_type: "TASK_COMPLETED", event_at: new Date(), actor_user_id: null, correlation_id: null, metadata: null }).execute();
});

after(async () => {
  if (stopServer) await stopServer();
  if (db) await cleanupTestDatabase(db);
});

function call(actor: ActorKey | null, method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (actor) headers.Cookie = cookies[actor];
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${serverUrl}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

// Every incentive and payroll endpoint the API exposes.
const INCENTIVE_ENDPOINTS = (): Array<[string, string, unknown?]> => [
  ["GET", "/incentives/ledger"],
  ["GET", "/incentives/kot/2026-09"],
  ["GET", "/incentives/penalties"],
  ["POST", "/incentives/kot", { employee_id: ids.employee, month: "2026-09", kot_count: 1 }],
  ["POST", "/incentives/penalties", { employee_id: ids.employee, amount: "10.00", reason: "test" }],
  ["POST", "/incentives/monthly/calculate", { month: "2026-09" }],
  ["POST", `/tasks/${ids.task}/incentives/calculate`, {}],
  ["POST", "/incentives/approve", { ledger_entry_ids: [ids.ledger] }],
  ["GET", "/payroll"],
  ["GET", `/payroll/${crypto.randomUUID()}`],
  ["POST", "/payroll/entries", { incentive_ledger_id: ids.ledger }],
  ["POST", `/payroll/entries/${crypto.randomUUID()}/approvals`, { decision: "APPROVED" }]
];

test("IR-1: anonymous callers get 401 on every incentive and payroll endpoint", async () => {
  for (const [method, path, body] of INCENTIVE_ENDPOINTS()) {
    const res = await call(null, method, path, body);
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});

for (const actor of DENIED) {
  test(`IR-2 (${ROLE_OF[actor] ?? "no role"}): every incentive and payroll endpoint is 403 FORBIDDEN`, async () => {
    for (const [method, path, body] of INCENTIVE_ENDPOINTS()) {
      const res = await call(actor, method, path, body);
      assert.equal(res.status, 403, `${actor} ${method} ${path}`);
      assert.equal(((await res.json()) as { code: string }).code, "FORBIDDEN", `${actor} ${method} ${path}`);
    }
    // Nothing was written by the denied attempts.
    assert.equal((await db.selectFrom("payroll_entries").select("id").execute()).length, 0);
    assert.equal((await db.selectFrom("incentive_ledger").select("status").where("id", "=", ids.ledger).executeTakeFirstOrThrow()).status, "PENDING");
  });
}

test("IR-3: role claims in headers or bodies cannot grant incentive access", async () => {
  const forgedHeaders = { "X-User-Role": "SUPER_ADMIN", "X-Role": "SUPER_ADMIN", "X-User-Id": crypto.randomUUID() };
  assert.equal((await call("admin", "GET", "/incentives/ledger", undefined, forgedHeaders)).status, 403);
  assert.equal((await call("admin", "POST", "/incentives/monthly/calculate", { month: "2026-09", role: "SUPER_ADMIN", roles: ["SUPER_ADMIN"] })).status, 403);
  assert.equal((await call(null, "GET", "/incentives/ledger", undefined, forgedHeaders)).status, 401);
});

test("IR-4: Super Admin is authorized on every incentive and payroll endpoint", async () => {
  for (const [method, path, body] of INCENTIVE_ENDPOINTS()) {
    const res = await call("superAdmin", method, path, body);
    assert.ok(res.status !== 401 && res.status !== 403, `${method} ${path} → ${res.status}`);
  }
  const ledger = await call("superAdmin", "GET", "/incentives/ledger");
  assert.equal(ledger.status, 200);
  assert.match(await ledger.text(), new RegExp(ids.ledger));
});

test("IR-5: the dashboard includes incentive totals only for Super Admin", async () => {
  const sa = (await (await call("superAdmin", "GET", "/dashboard")).json()) as { data: Record<string, unknown> };
  assert.ok(sa.data.incentiveTotalsByStatus, "super admin sees incentive totals");
  for (const actor of ["admin", "accountant", "supervisor", "others"] as ActorKey[]) {
    const res = await call(actor, "GET", "/dashboard");
    assert.equal(res.status, 200, actor);
    const text = await res.text();
    assert.doesNotMatch(text, /incentive/i, `${actor} dashboard leaks incentive data`);
  }
});

test("IR-6: the audit feed hides incentive events from everyone but Super Admin", async () => {
  const sources = async (actor: ActorKey) => ((await (await call(actor, "GET", "/audit-logs")).json()) as { data: Array<{ id: string; source: string }> }).data;
  const saFeed = await sources("superAdmin");
  assert.ok(saFeed.some((entry) => entry.id === ids.incentiveEvent));
  for (const actor of ["admin", "accountant", "supervisor"] as ActorKey[]) {
    const feed = await sources(actor);
    assert.ok(feed.some((entry) => entry.id === ids.taskEvent), `${actor} still sees task events`);
    assert.ok(feed.every((entry) => entry.source !== "incentive"), `${actor} sees incentive events`);
    assert.equal((await call(actor, "GET", `/audit-logs/${ids.incentiveEvent}`)).status, 404, `${actor} resolves incentive event`);
  }
  assert.equal((await call("superAdmin", "GET", `/audit-logs/${ids.incentiveEvent}`)).status, 200);
  assert.equal((await call("others", "GET", "/audit-logs")).status, 403);
});

test("IR-7: Accountant is a read-only reporting role", async () => {
  for (const path of ["/dashboard", "/kpi/results", "/warehouse/operations", "/reports", "/audit-logs", "/employees"]) {
    assert.equal((await call("accountant", "GET", path)).status, 200, `accountant GET ${path}`);
  }
  // No KPI configuration and no operational writes.
  assert.equal((await call("accountant", "GET", "/kpi/definitions")).status, 403);
  assert.equal((await call("accountant", "POST", "/tasks", { depot_id: null, task_type: "LOADING" })).status, 403);
  assert.equal((await call("accountant", "POST", "/employees", { employee_code: "X", name: "X" })).status, 403);
});

test("IR-8: no other read endpoint leaks incentive or payroll data to any non-Super-Admin role", async () => {
  const readEndpoints = [
    "/employees", "/employees?search=inc", `/tasks`, `/tasks/${ids.task}`, `/tasks/${ids.task}/events`,
    "/kpi/results?period=MONTHLY", "/kpi/summary", "/kpi/depot-dashboard", "/kpis", "/dashboard", "/audit-logs",
    "/daily-reports", "/warehouse/operations", `/warehouse/operations/${ids.task}`, "/reports", "/resync/tasks", "/resync/kpis"
  ];
  for (const actor of DENIED) {
    for (const path of readEndpoints) {
      const res = await call(actor, "GET", path);
      if (res.status !== 200) {
        assert.ok([403, 404].includes(res.status), `${actor} ${path} → ${res.status}`);
        continue;
      }
      const text = await res.text();
      assert.doesNotMatch(text, /incentive|payroll/i, `${actor} ${path} leaks incentive/payroll data`);
      assert.ok(!text.includes(ids.ledger), `${actor} ${path} leaks the incentive ledger id`);
    }
  }
});
