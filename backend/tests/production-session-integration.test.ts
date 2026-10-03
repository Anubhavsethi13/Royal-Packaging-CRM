import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before } from "node:test";
import bcrypt from "bcryptjs";
import type { DatabaseConnection } from "@royal-packaging/db";
import { loadConfig } from "../packages/config/src/index.js";
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
 * Production-mode cookie and CORS behaviour over real HTTP, for both supported
 * deployment topologies:
 * - cross-site (browser calls the backend origin directly): SameSite=None; Secure
 * - same-origin proxy (frontend host proxies /api): SameSite=Lax; Secure
 */

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);
const FRONTEND = "https://crm-frontend.example";
const EVIL = "https://evil.example";
const PASSWORD = "Password123!";

let db: DatabaseConnection;
const servers: Array<() => Promise<void>> = [];
let crossSiteUrl: string;
let sameOriginUrl: string;

async function start(sameSite: "lax" | "none"): Promise<string> {
  const appConfig = loadConfig({
    NODE_ENV: "production",
    DATABASE_URL: TEST_DATABASE_URL,
    SESSION_SECRET: "s".repeat(48),
    FRONTEND_ORIGIN: FRONTEND,
    OPERATIONS_TIMEZONE: "Asia/Kolkata",
    SESSION_COOKIE_SAMESITE: sameSite
  });
  const server = createApiApp({ database: db, appConfig }).createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(() => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);
  await truncateAllTables(db);

  const userId = crypto.randomUUID();
  await db.insertInto("users").values({ id: userId, login_identifier: "ps_supervisor", password_hash: await bcrypt.hash(PASSWORD, 4), is_active: true }).execute();
  const roleId = crypto.randomUUID();
  await db.insertInto("access_roles").values({ id: roleId, code: "SUPERVISOR", name: "SUPERVISOR", active: true }).execute();
  await db.insertInto("user_access_roles").values({ id: crypto.randomUUID(), user_id: userId, role_id: roleId, assigned_at: new Date(), assigned_by_user_id: userId, revoked_at: null, revoked_by_user_id: null, version: "1" }).execute();
  // Supervisors are depot-confined, so this one works in a depot.
  const depotId = crypto.randomUUID();
  await db.insertInto("depots").values({ id: depotId, code: "DEP-PS", name: "Session depot", active: true }).execute();
  await db.insertInto("employees").values({ id: crypto.randomUUID(), user_id: userId, employee_code: "EMP-PS", name: "Session Supervisor", depot_id: depotId, is_active: true }).execute();

  crossSiteUrl = await start("none");
  sameOriginUrl = await start("lax");
});

after(async () => {
  for (const stop of servers) await stop();
  if (db) await cleanupTestDatabase(db);
});

async function login(url: string, origin: string): Promise<Response> {
  return fetch(`${url}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ login_identifier: "ps_supervisor", password: PASSWORD }) });
}
function cookieOf(res: Response): string {
  return (res.headers.get("set-cookie") ?? "").split(";")[0] as string;
}

test("PS-1: cross-site deployment: login sets an HttpOnly, Secure, SameSite=None, host-only cookie for the allowed origin", async () => {
  const res = await login(crossSiteUrl, FRONTEND);
  assert.equal(res.status, 200);
  const setCookie = res.headers.get("set-cookie") ?? "";
  for (const part of ["rp_session=", "HttpOnly", "Secure", "SameSite=None", "Path=/"]) assert.ok(setCookie.includes(part), `${part} in ${setCookie}`);
  assert.doesNotMatch(setCookie, /Domain=/i);
  assert.equal(res.headers.get("access-control-allow-origin"), FRONTEND);
  assert.equal(res.headers.get("access-control-allow-credentials"), "true");
  assert.match(res.headers.get("vary") ?? "", /Origin/);
});

test("PS-2: same-origin proxy deployment: production cookie is SameSite=Lax and still Secure", async () => {
  const setCookie = (await login(sameOriginUrl, FRONTEND)).headers.get("set-cookie") ?? "";
  for (const part of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) assert.ok(setCookie.includes(part), `${part} in ${setCookie}`);
});

test("PS-3: an authenticated request with the session cookie succeeds; anonymous is 401 (readable by the allowed origin)", async () => {
  const cookie = cookieOf(await login(crossSiteUrl, FRONTEND));
  const session = await fetch(`${crossSiteUrl}/api/auth/session`, { headers: { Cookie: cookie, Origin: FRONTEND } });
  assert.equal(session.status, 200);
  assert.equal(session.headers.get("access-control-allow-origin"), FRONTEND);
  assert.equal((await fetch(`${crossSiteUrl}/api/kpi/results`, { headers: { Cookie: cookie, Origin: FRONTEND } })).status, 200);

  const anonymous = await fetch(`${crossSiteUrl}/api/kpi/results`, { headers: { Origin: FRONTEND } });
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get("access-control-allow-origin"), FRONTEND);
  assert.equal(((await anonymous.json()) as { code: string }).code, "UNAUTHORIZED");
});

test("PS-4: an invalid origin never receives CORS permission (the browser blocks it); '*' is never sent", async () => {
  const res = await login(crossSiteUrl, EVIL);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  assert.equal(res.headers.get("access-control-allow-credentials"), null);
  for (const origin of [EVIL, "null", `${FRONTEND}.evil.example`, FRONTEND.replace("https", "http")]) {
    const response = await fetch(`${crossSiteUrl}/api/health`, { headers: { Origin: origin } });
    assert.equal(response.headers.get("access-control-allow-origin"), null, origin);
  }
  const allowed = await fetch(`${crossSiteUrl}/api/health`, { headers: { Origin: FRONTEND } });
  assert.notEqual(allowed.headers.get("access-control-allow-origin"), "*");
});

test("PS-5: preflight allows credentials only for the configured origin", async () => {
  const preflight = (origin: string) => fetch(`${crossSiteUrl}/api/kpi/results`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "content-type" } });
  const good = await preflight(FRONTEND);
  assert.equal(good.status, 204);
  assert.equal(good.headers.get("access-control-allow-origin"), FRONTEND);
  assert.equal(good.headers.get("access-control-allow-credentials"), "true");
  assert.match(good.headers.get("access-control-allow-methods") ?? "", /GET/);
  const bad = await preflight(EVIL);
  assert.equal(bad.headers.get("access-control-allow-origin"), null);
  assert.equal(bad.headers.get("access-control-allow-credentials"), null);
});

test("PS-6: logout revokes the session and clears the cookie with the same SameSite/Secure policy", async () => {
  const cookie = cookieOf(await login(crossSiteUrl, FRONTEND));
  const logout = await fetch(`${crossSiteUrl}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie, Origin: FRONTEND } });
  assert.equal(logout.status, 200);
  const cleared = logout.headers.get("set-cookie") ?? "";
  for (const part of ["rp_session=", "Max-Age=0", "SameSite=None", "Secure", "HttpOnly"]) assert.ok(cleared.includes(part), `${part} in ${cleared}`);
  assert.equal((await fetch(`${crossSiteUrl}/api/auth/session`, { headers: { Cookie: cookie } })).status, 401);
});

test("PS-8: deployed configuration (Vercel /api proxy → Render): exact Vercel origin, Lax + Secure cookie, matching logout", async () => {
  const VERCEL = "https://royal-packaging-crm.vercel.app";
  const deployed = { NODE_ENV: "production", DATABASE_URL: TEST_DATABASE_URL, SESSION_SECRET: "s".repeat(48), OPERATIONS_TIMEZONE: "Asia/Kolkata" };
  // The URL of the login page is not an origin and must be rejected.
  assert.throws(() => loadConfig({ ...deployed, FRONTEND_ORIGIN: `${VERCEL}/login` }), /FRONTEND_ORIGIN/);
  const appConfig = loadConfig({ ...deployed, FRONTEND_ORIGIN: VERCEL });
  assert.equal(appConfig.SESSION_COOKIE_SAMESITE, "lax");

  const server = createApiApp({ database: db, appConfig }).createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(() => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const res = await login(url, VERCEL);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), VERCEL);
  assert.equal(res.headers.get("access-control-allow-credentials"), "true");
  const setCookie = res.headers.get("set-cookie") ?? "";
  for (const part of ["rp_session=", "HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) assert.ok(setCookie.includes(part), `${part} in ${setCookie}`);
  assert.doesNotMatch(setCookie, /Domain=|SameSite=None/i);

  for (const other of [`${VERCEL}/`, "https://royal-packaging-crm-git-main.vercel.app", "https://royal-packaging-crm-kzp9.onrender.com", "http://royal-packaging-crm.vercel.app"]) {
    assert.equal((await fetch(`${url}/api/health`, { headers: { Origin: other } })).headers.get("access-control-allow-origin"), null, other);
  }

  // Same-origin proxied requests carry no Origin header on GET; the cookie alone authenticates.
  const cookie = cookieOf(res);
  assert.equal((await fetch(`${url}/api/auth/session`, { headers: { Cookie: cookie } })).status, 200);
  const logout = await fetch(`${url}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie, Origin: VERCEL } });
  assert.equal(logout.status, 200);
  const cleared = logout.headers.get("set-cookie") ?? "";
  for (const part of ["rp_session=", "Max-Age=0", "HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) assert.ok(cleared.includes(part), `${part} in ${cleared}`);
  assert.doesNotMatch(cleared, /Domain=/i);
  assert.equal((await fetch(`${url}/api/auth/session`, { headers: { Cookie: cookie } })).status, 401);
});

test("PS-7: forged identity headers do not authenticate", async () => {
  const forged = await fetch(`${crossSiteUrl}/api/kpi/results`, { headers: { Origin: FRONTEND, "X-User-Id": crypto.randomUUID(), "X-User-Role": "SUPER_ADMIN", Authorization: "Bearer forged" } });
  assert.equal(forged.status, 401);
});
