# Production configuration: Vercel (frontend) + Render (backend)

This document covers the configuration and smoke test for deploying the frontend on Vercel and the API on Render with Neon PostgreSQL. It contains no secret values. Set real values only in the Vercel and Render dashboards.

**Current deployment (topology A, same-origin proxy):**

| | Value |
|---|---|
| Frontend origin (Vercel) | `https://royal-packaging-crm.vercel.app` |
| Backend origin (Render) | `https://royal-packaging-crm-kzp9.onrender.com` |
| Browser → API | `https://royal-packaging-crm.vercel.app/api/*`, rewritten by Vercel to `https://royal-packaging-crm-kzp9.onrender.com/api/*` |

The Render URL appears only in `frontend/vercel.json` (deployment configuration) and in this document. Application code refers only to the relative `/api` base (`VITE_API_URL`).

Origins have no path: use `https://royal-packaging-crm.vercel.app`, not `…/login`. The backend refuses to start if `FRONTEND_ORIGIN` contains a path.

## 1. Environment variables

### Backend (Render)

| Variable | Required in production | Example (not a secret) | Notes |
|---|---|---|---|
| `NODE_ENV` | yes | `production` | Enables the strict checks below and Secure cookies. |
| `DATABASE_URL` | yes | `postgresql://…?sslmode=require` | Neon connection string. **Secret.** |
| `SESSION_SECRET` | yes | — | At least 32 characters of high entropy. **Secret.** |
| `FRONTEND_ORIGIN` | yes | `https://royal-packaging-crm.vercel.app` | Exact origins, comma-separated. Each must be https with no path, no trailing slash and no wildcard; the server refuses to start otherwise. Include the custom domain if one is used. |
| `OPERATIONS_TIMEZONE` | yes | `Asia/Kolkata` | IANA zone for KPI day/week/month boundaries. The server refuses to start if it is missing or invalid. |
| `SESSION_COOKIE_SAMESITE` | no (default `lax`) | `lax` or `none` | See §2. `none` always implies `Secure`. |
| `SERVER_HOST` / `SERVER_PORT` | Render sets the port | `0.0.0.0` | |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | only for `npm run db:seed` | — | **Secret.** Remove after seeding. |

### Frontend (Vercel, build-time, public)

| Variable | Value | Notes |
|---|---|---|
| `VITE_DATA_MODE` | `api` | The production build refuses any other value. |
| `VITE_API_URL` | `/api` (topology A, **current**) or `https://royal-packaging-crm-kzp9.onrender.com/api` (topology B, not used) | Cannot be empty or localhost in production. It is embedded in the bundle, so never put secrets in it. |

`VITE_*` values are public. Never put credentials in them.

## 2. Session cookie and CORS topology

The session cookie `rp_session` is:
- `HttpOnly`
- `Path=/`
- host-only, with no `Domain` attribute
- `Secure` whenever `NODE_ENV=production` or `SameSite=None`

CORS:
- returns `Access-Control-Allow-Origin` only for an exact `FRONTEND_ORIGIN` match (never `*`), with `Access-Control-Allow-Credentials: true` and `Vary: Origin`;
- sends no CORS headers for any other origin;
- the frontend sends `credentials: 'include'` and never sends identity or role headers.

`*.vercel.app` and `*.onrender.com` are both on the Public Suffix List. A Vercel page calling a Render API is therefore **cross-site**. A `SameSite=Lax` cookie set by Render is then not sent on the frontend's `fetch` calls: login returns 200, but every following request is 401. This was reproduced locally (§4).

### Topology A: same-origin proxy (RECOMMENDED)

The browser only talks to the Vercel origin, and Vercel forwards `/api/*` to Render. The cookie is first-party, so it works in every browser, including Safari with third-party cookies blocked.

- Render: `SESSION_COOKIE_SAMESITE=lax` (or leave it unset; `lax` is the default) and `FRONTEND_ORIGIN=https://royal-packaging-crm.vercel.app`.
- Vercel: `VITE_API_URL=/api`.
- `frontend/vercel.json`: the `/api` rewrite comes **before** the SPA fallback, so API calls are never answered with `index.html`. Query strings are forwarded, and `Set-Cookie` from Render reaches the browser as a first-party cookie for the Vercel host:

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://royal-packaging-crm-kzp9.onrender.com/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

- **Vercel project setting:** Root Directory must be `frontend`, where `vercel.json` lives.
- **Proxy notes:**
  - **Render cold starts:** on a sleeping instance, the first proxied request may be slow or time out at the Vercel edge. Retry, or keep the service warm.
  - **Anonymous rate limit:** the anonymous general rate limit (300 requests/min) is keyed by the connecting address. Behind Render's load balancer and the Vercel proxy, anonymous clients share that bucket. Authenticated requests are limited per user, and the login lockout is per account (database-backed), so neither is affected. The behaviour is unchanged by this configuration.

### Topology B: direct cross-site

The browser calls `https://<service>.onrender.com/api` directly.

- Render: `SESSION_COOKIE_SAMESITE=none` (the cookie becomes `SameSite=None; Secure`) and `FRONTEND_ORIGIN=https://<project>.vercel.app`.
- Vercel: `VITE_API_URL=https://<service>.onrender.com/api`.
- **Limitation:** this is a third-party cookie. Safari (ITP), Firefox strict mode, Chrome with third-party cookies blocked, and some privacy extensions will not send it, and those users cannot stay logged in. Use this only if topology A is not possible.

## 3. Deployment order

1. Render: set every backend variable, deploy, and run `npm run db:migrate`.
2. Optionally run `npm run db:seed` once with the `SEED_ADMIN_*` values set. It is idempotent: it also creates the 8 V1 KPI definitions and skips existing ones.
3. Vercel: set the `VITE_*` values and deploy the `vercel.json` rewrite (topology A).
4. Run the smoke test below.

## 4. What has been verified, and where

| Check | LOCAL VERIFIED | PRODUCTION VERIFIED |
|---|---|---|
| Config validation (timezone, origins, SameSite) | yes: `tests/production-config.test.ts` | no |
| Production cookie attributes and CORS over HTTP | yes: `tests/production-session-integration.test.ts` | no |
| Real browser, cross-site (`localhost:5173` → `127.0.0.1:3100`), SameSite=Lax | reproduced the failure: login 200, then session 401 | no |
| Real browser, cross-site, SameSite=None | works in the Chromium-based app browser: session and five pages 200 after reload | no |
| Real browser, same-origin proxy (`/api` rewrite emulated), SameSite=Lax | works: session and pages 200 after reload | no |
| Secure cookies over real HTTPS | not tested locally in a browser (local runs were http) | no |
| Safari / third-party-cookie-blocking behaviour | not tested | no |

## 5. Deployment smoke test (run against the real deployment)

Use a private browser window. Record each result.

1. `GET https://royal-packaging-crm-kzp9.onrender.com/api/health` returns 200.
2. Open the Vercel URL; the login page renders, and there are no console errors about `VITE_API_URL`.
3. In DevTools → Network, `GET …/api/auth/session` before login returns 401, and the page stays on login (anonymous access is rejected).
4. Log in as the supervisor test account. `POST …/api/auth/login` returns 200.
5. Inspect the `Set-Cookie` of the login response: `rp_session`, `HttpOnly`, `Secure`, `Path=/`, no `Domain`, and `SameSite=Lax` (A) or `SameSite=None` (B).
6. Topology B only: the response has `Access-Control-Allow-Origin` equal to the exact Vercel origin (not `*`) and `Access-Control-Allow-Credentials: true`.
7. Reload the page (F5). The user is still logged in, and `GET …/api/auth/session` returns 200.
8. Open **Warehouse operations**: live data or an empty state. No error state; the API calls return 200.
9. Open **Locations**: same check.
10. Open **Loading & unloading**: same check.
11. Open **KPI configuration**: the definitions list includes the 8 seeded codes (if seeded); no SLA definitions were auto-created.
12. Open **KPI results** with period DAILY: the results or empty state load, and `period.timezone` in the `…/api/kpi/results` response is `Asia/Kolkata`.
13. Timezone spot check: complete a test task shortly after 00:00 IST, or use existing data. Its DAILY result appears on the Indian date, not the previous UTC date.
14. Log in as an EMPLOYEE test account. `…/api/kpi/results?employee_id=<another employee>` returns 403; the employee's own results return 200.
15. Log in as an account without a role (or a role lacking KPI access). The supervisor pages show the unauthorized state, and the API returns 403.
16. From a different origin (e.g. `curl -H "Origin: https://evil.example" https://royal-packaging-crm-kzp9.onrender.com/api/health -i`): there is no `Access-Control-Allow-Origin` header.
17. Log out. The `Set-Cookie` clears `rp_session` (`Max-Age=0`, same SameSite/Secure). After that, `…/api/auth/session` returns 401, and the Back button doesn't restore data.
18. Repeat steps 4–7 in Safari (or a browser with third-party cookies blocked). This must pass for topology A; for topology B a failure is expected, and it is the reason topology A is recommended.

Only after all 18 steps pass on the real deployment can this be marked **PRODUCTION VERIFIED**.
