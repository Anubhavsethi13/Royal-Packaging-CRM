import assert from "node:assert/strict";
import test from "node:test";
import { DEVELOPMENT_OPERATIONS_TIMEZONE, frontendOriginProblem, loadConfig } from "../packages/config/src/index.js";
import { createSessionCookie, sessionCookieIsSecure } from "../apps/api/src/modules/identity/session.js";
import { formatClearCookie, formatSetCookie } from "../apps/api/src/utils/http-utils.js";

const base: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/royal_packaging_test",
  SESSION_SECRET: "x".repeat(48)
};
const production: NodeJS.ProcessEnv = {
  ...base,
  NODE_ENV: "production",
  FRONTEND_ORIGIN: "https://crm.example.com",
  OPERATIONS_TIMEZONE: "Asia/Kolkata"
};

// ---------------------------------------------------------------------------
// OPERATIONS_TIMEZONE
// ---------------------------------------------------------------------------

test("PC-1: OPERATIONS_TIMEZONE accepts IANA names and rejects anything else", () => {
  assert.equal(loadConfig({ ...base, OPERATIONS_TIMEZONE: "Asia/Kolkata" }).OPERATIONS_TIMEZONE, "Asia/Kolkata");
  assert.equal(loadConfig({ ...base, OPERATIONS_TIMEZONE: " Asia/Kolkata " }).OPERATIONS_TIMEZONE, "Asia/Kolkata");
  for (const bad of ["Mars/Olympus", "IST+5:30", "India", "   "]) {
    assert.throws(() => loadConfig({ ...base, OPERATIONS_TIMEZONE: bad }), /OPERATIONS_TIMEZONE/, bad);
  }
});

test("PC-2: production refuses to start without OPERATIONS_TIMEZONE; development falls back to UTC", () => {
  assert.equal(loadConfig(production).OPERATIONS_TIMEZONE, "Asia/Kolkata");
  assert.throws(() => loadConfig({ ...production, OPERATIONS_TIMEZONE: undefined }), /OPERATIONS_TIMEZONE/);
  assert.equal(loadConfig(base).OPERATIONS_TIMEZONE, DEVELOPMENT_OPERATIONS_TIMEZONE);
  assert.equal(DEVELOPMENT_OPERATIONS_TIMEZONE, "UTC");
});

// ---------------------------------------------------------------------------
// FRONTEND_ORIGIN (CORS allowlist)
// ---------------------------------------------------------------------------

test("PC-3: production requires an explicit https FRONTEND_ORIGIN", () => {
  assert.equal(loadConfig(production).FRONTEND_ORIGIN, "https://crm.example.com");
  assert.throws(() => loadConfig({ ...production, FRONTEND_ORIGIN: undefined }), /FRONTEND_ORIGIN/);
  assert.throws(() => loadConfig({ ...production, FRONTEND_ORIGIN: "http://crm.example.com" }), /https/);
  assert.equal(loadConfig({ ...production, FRONTEND_ORIGIN: "https://a.example.com,https://b.vercel.app" }).FRONTEND_ORIGIN, "https://a.example.com,https://b.vercel.app");
  // Development keeps the local default and may use http.
  assert.equal(loadConfig(base).FRONTEND_ORIGIN, "http://localhost:5173");
  assert.equal(loadConfig({ ...base, FRONTEND_ORIGIN: "http://localhost:5199" }).FRONTEND_ORIGIN, "http://localhost:5199");
});

test("PC-4: wildcard, path, and malformed origins are rejected in every environment", () => {
  for (const env of [base, production]) {
    for (const bad of ["*", "https://*.vercel.app", "https://crm.example.com/", "https://crm.example.com/app", "crm.example.com"]) {
      assert.throws(() => loadConfig({ ...env, FRONTEND_ORIGIN: bad }), /FRONTEND_ORIGIN/, `${env.NODE_ENV} ${bad}`);
    }
  }
  assert.equal(frontendOriginProblem("https://crm.example.com", true), null);
  assert.equal(frontendOriginProblem("https://crm.example.com:8443", true), null);
});

// ---------------------------------------------------------------------------
// Session cookie
// ---------------------------------------------------------------------------

test("PC-5: SESSION_COOKIE_SAMESITE defaults to lax and accepts only lax, strict, none", () => {
  assert.equal(loadConfig(base).SESSION_COOKIE_SAMESITE, "lax");
  assert.equal(loadConfig({ ...production, SESSION_COOKIE_SAMESITE: "none" }).SESSION_COOKIE_SAMESITE, "none");
  assert.throws(() => loadConfig({ ...base, SESSION_COOKIE_SAMESITE: "None; Domain=evil.example" }));
});

test("PC-6: production cookies are always Secure; SameSite=None is Secure even outside production", () => {
  assert.equal(sessionCookieIsSecure(true, "lax"), true);
  assert.equal(sessionCookieIsSecure(true, "none"), true);
  assert.equal(sessionCookieIsSecure(false, "none"), true);
  assert.equal(sessionCookieIsSecure(false, "lax"), false);
});

test("PC-7: the session cookie is HttpOnly, host-only (no Domain), Path=/, with the configured SameSite", () => {
  const expires = new Date(Date.now() + 3600_000);
  const cross = formatSetCookie(createSessionCookie("token-1", expires, { isProduction: true, sameSite: "none" }));
  assert.match(cross, /^rp_session=token-1; /);
  for (const part of ["Path=/", "SameSite=None", "HttpOnly", "Secure", "Max-Age="]) assert.ok(cross.includes(part), `${part} in ${cross}`);
  assert.doesNotMatch(cross, /Domain=/i);

  const same = formatSetCookie(createSessionCookie("token-2", expires, { isProduction: true }));
  assert.ok(same.includes("SameSite=Lax") && same.includes("Secure") && same.includes("HttpOnly"));

  const dev = formatSetCookie(createSessionCookie("token-3", expires, { isProduction: false }));
  assert.ok(dev.includes("SameSite=Lax") && !dev.includes("Secure"));
});

test("PC-8: the logout clearing cookie matches the login cookie's SameSite/Secure policy", () => {
  const cross = formatClearCookie("rp_session", true, "/", "none");
  for (const part of ["rp_session=", "Max-Age=0", "SameSite=None", "Secure", "HttpOnly", "Path=/"]) assert.ok(cross.includes(part), part);
  assert.ok(formatClearCookie("rp_session", false, "/", "none").includes("Secure"));
  assert.ok(formatClearCookie("rp_session", true).includes("SameSite=Lax"));
  assert.ok(!formatClearCookie("rp_session", false).includes("Secure"));
});
