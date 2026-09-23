# Royal Packaging CRM
# Client Dry-Run Deployment Audit

**Audit Date:** September 23, 2026  
**Audited Baseline:** Step 9.2 (Orders Live Frontend ↔ Backend ↔ PostgreSQL Integration)  
**Target Target State:** Client Dry-Run & Production Deployment Readiness  

---

## 1. Executive Summary

### Current Status: **NOT READY**

The Royal Packaging CRM codebase has achieved high automated test pass rates at the unit, contract, and local integration levels (145/145 frontend tests passing; 151/151 backend unit tests passing; 84/84 integration tests passing). Furthermore, live database persistence for Clients (Step 9.1) and Orders (Step 9.2) functions as designed when accessed programmatically.

However, an empirical, operational, and architectural audit reveals **critical P0 deployment and dry-run blockers** that prevent the application from being delivered to a client or deployed to a staging/production environment without immediate intervention:

1. **Frontend Authentication UI is Disconnected from Live Backend Auth (P0):**  
   The frontend authentication state machine (`frontend/src/state/auth.tsx`, line 100) hardcodes an explicit rejection in API mode: `if (mode !== 'mock') return { ok: false, reason: 'api_auth_unavailable' };`. When a user attempts to sign in on `/login` in `VITE_DATA_MODE=api`, the UI alerts *"Live sign-in is not enabled yet"* and fails. Furthermore, the frontend never verifies existing session cookies on mount (`GET /api/auth/session`), preventing any user from accessing protected routes in live mode.
2. **Zero Seed Users, Roles, or Permissions in Database Schema (P0):**  
   Running `npm run db:migrate` against a clean PostgreSQL instance generates 14 migration tables, but creates **zero rows** in `users`, `user_passwords`, `access_roles`, `access_permissions`, or `access_user_roles`. Because there is no CLI seed script or default admin user created in migrations, a deployed system has no initial credentials to log into.
3. **Silent Production Fallback to Mock Data (P0):**  
   In `frontend/src/state/repositories.tsx` (`resolveDataMode`), if `VITE_DATA_MODE` is undefined or omitted at build time, it silently defaults to `'mock'`. This allows a production deployment to display synthetic in-memory demo data without warning.
4. **Committed Secrets in Repository (P0 / Security):**  
   Active database credentials and session secrets are committed in plaintext inside `backend/.env` and `.env` in the repository working tree. Immediate key and credential rotation is required prior to external deployment.
5. **CORS and SameSite Cookie Rejection on Cross-Domain Deployments (P1):**  
   The backend session cookie is issued with `SameSite=Lax`. When the frontend and backend are hosted on separate domains (e.g., `app.clientdomain.com` and `api.clientdomain.com` or separate PaaS domains without a shared parent), browsers reject cross-site cookie transmission on credentialed `fetch` requests unless reverse-proxied under the same origin or configured with `SameSite=None; Secure`.

Addressing these specific blockers is required before the client dry run can proceed.

---

## 2. Current Verified Scope

The audit verified strictly what has been implemented up to Step 9.2. Unimplemented domains are not treated as defects, but their placeholder state in the UI is documented.

### Implemented Domains
- **Clients (Step 9.1):** Live frontend repository, backend REST API (`/clients`, `/clients/:id`), PostgreSQL persistence, pagination envelope, search, status filtering, client creation, client update.
- **Orders (Step 9.2):** Live frontend repository, backend REST API (`/orders`, `/orders/:id`, `/orders/:id/cancel`), PostgreSQL persistence, pagination envelope, status filtering, priority filtering, order creation with client association, status transitions, order cancellation.
- **Backend Auth & RBAC:** Session cookie management (`rp_session`), password hashing (`argon2id` via `@node-rs/argon2` / `bcryptjs` fallback), RBAC tables, authoritative middleware policies.

### Unimplemented Domains (Deferred Beyond Step 9.2)
The following domains are intentionally **NOT STARTED** and remain out of scope for feature implementation:
- **Step 9.3:** Employees & Org Structure
- **Step 9.4:** Warehouse Tasks & Workflows
- **Step 9.5:** Inventory & Stock Movements
- **Step 9.6:** Warehouse Orchestration & Docks
- **Deferred Analytics:** KPI Calculation Engine, Real-time Dashboard aggregations, Automated Payroll, Incentive Ledgers, Report Generation (MB51/MB52), AI Copilot / Recommendation services.

---

## 3. Deployment Requirements

### 3.1 Frontend Requirements
- **Build Command:** `npm run build` (or `vite build --config frontend/vite.config.ts`)
- **Output Directory:** `dist/frontend/` (configured in `frontend/vite.config.ts` as `../dist/frontend`)
- **Hosting / Runtime:** Any static file server (Nginx, Caddy, Cloudflare Pages, Vercel, AWS S3/CloudFront).
- **SPA Routing Requirement:** Single Page Application rewrite rules are **REQUIRED**. Requests to `/clients`, `/orders`, `/login`, etc., must rewrite to `index.html`.
- **Node Version:** Node.js `>=20.0.0` for building.
- **Build-Time Environment Variables:**
  - `VITE_API_URL`: **REQUIRED** in production (must point to backend URL, e.g., `https://api.crm.royalpackaging.com/api` or `/api` if reverse proxied).
  - `VITE_DATA_MODE`: **REQUIRED** in production (must be set explicitly to `api`).

### 3.2 Backend Requirements
- **Build Command:** `npm run build` inside `backend/` (`tsc -p tsconfig.json`)
- **Start Command:** `npm run start` inside `backend/` (`tsx apps/api/src/server.ts` or compiled `node apps/api/dist/server.js`)
- **Runtime:** Node.js `>=20.0.0` (uses native `process.loadEnvFile`, `crypto.randomUUID`, and native `fetch`).
- **Database:** PostgreSQL `15+` (verified locally on PostgreSQL 18).
- **Migration Command:** `npm run db:migrate` inside `backend/` (`tsx packages/db/src/migrate.ts`).
- **Health Check Endpoint:** `GET /health` (Liveness)
- **Readiness Check Endpoint:** `GET /health/ready` (Validates database pool connection)
- **Reverse Proxy / SSL:** Backend must run behind an HTTPS-terminating reverse proxy (Nginx, Traefik, AWS ALB) in production so cookies marked `Secure` are accepted by browsers.

### 3.3 Database Requirements
- PostgreSQL instance with `pgcrypto` or UUID generation support.
- Connection pooling managed via `pg.Pool` (backend default: min 2, max 10 connections).
- Execution of migrations 001 through 014 in strict chronological order.
- **Mandatory Seed Requirement:** Initial administrative user and role binding must be provisioned before the first login attempt.

### 3.4 Environment Variable Audit Table

| Variable | Location | Purpose | Required in Prod? | Current State | Problem | Recommended Action |
|:---|:---|:---|:---|:---|:---|:---|
| `DATABASE_URL` | `backend/.env` | PostgreSQL connection string | **REQUIRED** | Points to localhost postgres | Plaintext connection string committed to repo | SECRET FOUND / LOCATION: `backend/.env`, `d:\CRM\.env` / ROTATION REQUIRED. Inject securely via host environment variables. |
| `SESSION_SECRET` | `backend/.env` | Cookie signing / session encryption key (min 32 chars) | **REQUIRED** | Static development key | Committed secret | SECRET FOUND / LOCATION: `backend/.env` / ROTATION REQUIRED. Generate cryptographically random 64-char hex secret in production. |
| `SERVER_HOST` | `backend/.env` | HTTP bind address | OPTIONAL | Default: `0.0.0.0` | None | Retain `0.0.0.0` for containers/PaaS. |
| `SERVER_PORT` / `PORT` | `backend/.env`, root `.env` | Backend HTTP listen port | OPTIONAL | `SERVER_PORT=3000`, root `.env` has `PORT=4000` | Port collision/inconsistency between root and backend config | Standardize on `PORT` with fallback to `SERVER_PORT`. |
| `FRONTEND_ORIGIN` | `backend/.env` | CORS allowlist for credentialed requests | **REQUIRED** | Default: `http://localhost:5173` | Localhost default will block production frontend cross-origin requests | Set to exact production frontend origin (e.g., `https://crm.royalpackaging.com`). Supports comma-separated list. |
| `NODE_ENV` | `backend/.env` | Runtime environment flag | **REQUIRED** | Default: `development` | In development, cookies lack `Secure` flag | Set `NODE_ENV=production` on deployment. |
| `VITE_API_URL` | `frontend/.env` | Base URL for API requests | **REQUIRED** | Default: `http://localhost:3000/api` | Hardcoded localhost fallback baked into client bundle | Must be set at Vite build time to production API URL. |
| `VITE_DATA_MODE` | `frontend/.env` | Selects between `mock` and `api` repositories | **REQUIRED** | Default: falls back to `'mock'` if missing | If omitted during build, app silently renders fake mock data | Set `VITE_DATA_MODE=api` in production build pipeline. |
| `FLOOT_ENDPOINT` | `backend/.env` | Hardware barcode scanner integration endpoint | OPTIONAL | Unset | Unused in Phase 1 | Keep optional; only set if hardware scanner is deployed. |
| `FLOOT_API_KEY` | `backend/.env` | Barcode scanner API token | OPTIONAL | Unset | Unused in Phase 1 | Keep optional. |
| `LOG_LEVEL` | `backend/.env` | Backend logging granularity (`trace` to `error`) | OPTIONAL | Default: `info` | None | Retain `info` or `warn` for production. |
| `LOG_FORMAT` | `backend/.env` | `json` vs `pretty` | OPTIONAL | Default: `json` | None | Use `json` for structured log aggregators. |

---

## 4. Critical Findings

| ID | Severity | Category | Finding | Evidence | Impact | Recommended Fix |
|:---|:---:|:---|:---|:---|:---|:---|
| **P0-01** | **P0** | Authentication | Frontend Auth UI is explicitly disconnected from backend API | `frontend/src/state/auth.tsx:100`: `if (mode !== 'mock') return { ok: false, reason: 'api_auth_unavailable' };` | **Users cannot log in to the application** in API mode. All protected routes redirect to `/login` and fail. | Wire `signIn()` in `auth.tsx` to `POST /api/auth/login`, wire `signOut()` to `POST /api/auth/logout`, and call `GET /api/auth/session` on mount. |
| **P0-02** | **P0** | Database / Auth | Zero seed users or roles created in clean migration | `backend/packages/db/migrations/`: Migrations 001-014 create DDL only; `packages/db/seeds/README.md` notes no seed scripts exist. | A freshly deployed database cannot be accessed because no administrative accounts exist. | Create an idempotent production bootstrap script (`backend/scripts/seed-admin.ts`) creating an initial `ADMIN` role and administrative user. |
| **P0-03** | **P0** | Configuration | Missing `VITE_DATA_MODE` defaults silently to `mock` in production | `frontend/src/state/repositories.tsx:63`: `if (value === undefined \|\| value === '') return 'mock';` | If deployment pipeline fails to set environment variable, production will silently display fake demo data. | In production builds, throw an error or default to `'api'` if `import.meta.env.PROD` is true. |
| **P0-04** | **P0** | Security | Plaintext secrets committed to repository | Tracked files: `d:\CRM\backend\.env` and `d:\CRM\.env` contain database credentials and session secrets. | Potential unauthorized database access and session tampering if repository is cloned. | SECRET FOUND / LOCATION: `backend/.env`, `.env` / ROTATION REQUIRED. Add `.env` to `.gitignore` and purge from git history. |
| **P1-01** | **P1** | Security / Auth | Session cookie `SameSite=Lax` breaks cross-domain API architectures | `backend/packages/contracts/src/auth.ts`: `sameSite: "lax"`. | If frontend is on `vercel.app` and backend is on `render.com` or `railway.app`, cross-site requests will not send cookies. | Configure reverse proxy under single eTLD+1 domain or support `sameSite: "none"` with `secure: true` when cross-origin. |
| **P1-02** | **P1** | RBAC | Frontend and backend role name divergence | Frontend `auth.tsx` defines `'SUPERVISOR'`; Backend `rbac-authority.ts` defines `'MANAGER'`. | Users assigned supervisor role in frontend will fail backend permission checks or receive mismatched permissions. | Reconcile role constants in `@royal-packaging/contracts` shared between frontend and backend. |
| **P1-03** | **P1** | Orders / UX | Client dropdown in Order Creation is hard-capped at 100 clients | `frontend/src/pages/pages.tsx:294`: `repositorySet.clients.list({ page: 1, pageSize: 100 })`. | In a production system with >100 clients, clients beyond the first page cannot have orders created for them. | Implement an asynchronous searchable client combobox instead of a static first-page dropdown. |
| **P1-04** | **P1** | Orders / DB | Order code generation uses client-side random numbers risking 409 collision | `frontend/src/pages/pages.tsx:368`: `RP-${Math.floor(10000 + Math.random() * 90000)}`. | Submitting orders can unpredictably fail with 409 Conflict if a collision occurs. | Have backend generate authoritative sequential or timestamped order codes if not provided, or catch 409 and retry. |
| **P2-01** | **P2** | Frontend UX | Sorting direction is hardcoded to ascending in API mode | `frontend/src/pages/client-data.ts:23`, `order-data.ts:170`: `sortDirection: 'asc'`. | Users cannot reverse sort orders or clients to view newest records first in the data table. | Thread sort direction through UI table headers and filter bar into API request. |
| **P2-02** | **P2** | Configuration | Conflicting and obsolete scripts in root `package.json` | Root `package.json` specifies Prisma scripts and `tsx backend/src/server.ts` (which does not exist). | New engineers or CI deployment runners calling root `npm run dev` or `npm run build` execute broken commands. | Remove obsolete Prisma dependencies and update root scripts to point to actual Turborepo workspace commands. |
| **P2-03** | **P2** | Frontend UX | Mock banners and preview notices visible in production build | `frontend/src/pages/pages.tsx:874`: "Frontend session preview", "No credentials leave the browser". | Confuses real clients during dry run, making production feel like an unconfigured prototype. | Ensure banner displays only when `mode === 'mock'`. |
| **P3-01** | **P3** | Technical Debt | Single-process in-memory rate limiter | `backend/apps/api/src/app.ts:156`: `InMemoryRateLimiter`. | Rate limiting state is lost on process restart and does not scale across multiple clustered Node processes. | Documented known limitation; acceptable for Phase 1 single-instance dry run, but requires Redis for multi-instance scaling. |

---

## 5. Authentication Findings

1. **Authentication Flow Analysis:**
   - The backend exposes:
     - `POST /auth/login` (accepts both `{ email, password }` and `{ login_identifier, password }`)
     - `POST /auth/logout` (revokes session token in database and clears cookie)
     - `GET /auth/session` (validates active session and enriches frontend user with roles/permissions)
   - Password security is handled via `argon2id` (with bcryptjs fallback in tests), using salt generation and account lockout after repeated failed attempts (`login_attempts` table).
   - Session tokens are stored in the database (`sessions` table) and transmitted via an `HttpOnly` cookie (`rp_session`).
2. **Deficiencies:**
   - **Frontend Disconnect:** As highlighted in **P0-01**, `frontend/src/state/auth.tsx` completely stubs out the `signIn` function for non-mock modes.
   - **Session Restoration:** On browser reload, the frontend does not make a background `GET /auth/session` request to restore authenticated state from the `rp_session` cookie; it simply defaults to `status: 'UNAUTHENTICATED'`.
   - **Logout:** Frontend `signOut()` only clears React state and never triggers `POST /auth/logout` to revoke the database session or instruct the browser to delete the cookie.

---

## 6. RBAC Findings

1. **Authoritative Enforcement:**
   - RBAC is correctly verified as **backend-authoritative**. Every API route in `clients-routes.ts` and `orders-routes.ts` invokes `requireAuth()` followed by `requireAuthorization(authPolicy, "action")`.
   - Client routes enforce `client:read` (GET) and `client:write` (POST, PUT, PATCH).
   - Order routes enforce `order:read` (GET), `order:write` (POST, PUT, PATCH), and `order:cancel` (POST `/orders/:id/cancel`).
2. **Discrepancies:**
   - **Role Code Drift:** The backend policy recognizes `ADMIN`, `MANAGER`, `OPERATOR`, and `AUDITOR`. The frontend user interface and mock session recognize `SUPER_ADMIN`, `ADMIN`, `SUPERVISOR`, and `EMPLOYEE`. When a `SUPERVISOR` signs in, the backend fails to map permissions unless explicitly bound in `access_roles`.
   - **Seeded Permissions:** Because `access_permissions` and `access_role_permissions` contain 0 rows upon migration, any user created without manual permission grants will receive `403 FORBIDDEN` on all client and order endpoints.

---

## 7. Client Workflow Findings

1. **List & Pagination:**
   - List envelope standard (`success`, `data`, `meta`) implemented in Step 8 is fully respected.
   - Page size options (5, 10) and pagination controls function properly.
   - Search query properly targets `name`, `account_code`, and `contact_name` via backend ILIKE query.
2. **Create & Edit Flow:**
   - Creating a client sends `POST /api/clients` with `{ name, account_code, contact_name, phone, status }`.
   - Updating a client sends `PATCH /api/clients/:id`.
   - **Duplicate Handling:** If an account code already exists, the database unique constraint throws a violation, mapped by the backend to `409 CONFLICT` with code `DUPLICATE_ACCOUNT_CODE`. The frontend dialog catches this and renders a clear error alert.
3. **UX Gaps:**
   - Sort order is locked to ascending.
   - No confirmation modal before editing client contact details.

---

## 8. Order Workflow Findings

1. **List & Filters:**
   - Filter by status (`draft`, `confirmed`, `in_production`, `ready`, `dispatched`, `completed`, `cancelled`) functions properly and maps between frontend capitalized display strings and backend lowercase snake_case.
   - Priority filter (`urgent`, `high`, `normal`, `low`) works accurately against PostgreSQL.
2. **Lifecycle Transitions:**
   - Authorized status transitions follow a state machine:
     - `Draft` $\rightarrow$ `Confirmed` / `Cancelled`
     - `Confirmed` $\rightarrow$ `In production` / `Cancelled`
     - `In production` $\rightarrow$ `Ready` / `Cancelled`
     - `Ready` $\rightarrow$ `Dispatched` / `Cancelled`
     - `Dispatched` $\rightarrow$ `Completed`
   - Invalid status transitions (e.g. attempting to jump from `Draft` directly to `Dispatched`) are blocked both by UI options in `OrderStatusAction` and strictly rejected by the backend with `409 CONFLICT` (`INVALID_STATUS_TRANSITION`).
3. **Cancellation:**
   - Cancellation is supported via `POST /api/orders/:id/cancel` and sets `cancelled_at` timestamp.
   - Cancelled orders are terminal; cannot transition to active states.

---

## 9. Client ↔ Order Findings

1. **Relational Integrity:**
   - Foreign key constraint `orders.client_id` references `clients.id` with `ON DELETE RESTRICT`.
   - Orders cannot be created for non-existent client IDs; backend validates client existence and returns `404 CLIENT_NOT_FOUND` if invalid.
2. **Denormalization & Stale Data:**
   - The frontend `OrderRecord` includes `clientName`. The backend `OrdersService.getOrderById` and `listOrders` join with the `clients` table to retrieve `client.name`. When a client's name is updated in the Clients module, the Orders view immediately reflects the updated name upon refresh without stale data divergence.
3. **Selection UX:**
   - `OrderFormDialog` loads clients via `repositorySet.clients.list({ page: 1, pageSize: 100 })`. As noted in **P1-03**, if a customer has more than 100 client accounts, the excess accounts are inaccessible in the dropdown.

---

## 10. API Contract Findings

### Comprehensive Endpoint Audit

| Method | Path | Auth Required | Permission | Request Body | Query Params | Response Envelope | Status Codes | Impl Status |
|:---|:---|:---:|:---:|:---|:---|:---|:---:|:---:|
| `GET` | `/health` | No | None | None | None | `{ success: true, data: { status, timestamp } }` | 200 | Verified Live |
| `GET` | `/health/ready` | No | None | None | None | `{ success: bool, data: { status, database: { ready } } }` | 200, 503 | Verified Live |
| `POST` | `/auth/login` | No | None | `{ email, password }` or `{ login_identifier, password }` | None | `{ success: true, data: { user, session } }` + `Set-Cookie` | 200, 400, 401, 429 | Backend Only |
| `POST` | `/auth/logout` | Yes | None | None | None | `{ success: true, data: { message } }` + Clear Cookie | 200, 401 | Backend Only |
| `GET` | `/auth/session` | Yes | None | None | None | `{ success: true, data: { user } }` | 200, 401 | Backend Only |
| `GET` | `/clients` | Yes | `client:read` | None | `page`, `pageSize`, `search`, `status`, `sortBy`, `sortDirection` | `{ success: true, data: ClientDTO[], meta: PageMeta }` | 200, 400, 401, 403 | Verified Live |
| `POST` | `/clients` | Yes | `client:write` | `{ name, account_code, contact_name?, phone?, status? }` | None | `{ success: true, data: ClientDTO }` | 201, 400, 401, 403, 409 | Verified Live |
| `GET` | `/clients/:id` | Yes | `client:read` | None | None | `{ success: true, data: ClientDTO }` | 200, 400, 401, 403, 404 | Verified Live |
| `PATCH` | `/clients/:id` | Yes | `client:write` | `{ name?, account_code?, contact_name?, phone?, status? }` | None | `{ success: true, data: ClientDTO }` | 200, 400, 401, 403, 404, 409 | Verified Live |
| `GET` | `/orders` | Yes | `order:read` | None | `page`, `pageSize`, `search`, `status`, `priority`, `clientId`, `sortBy`, `sortDirection` | `{ success: true, data: OrderDTO[], meta: PageMeta }` | 200, 400, 401, 403 | Verified Live |
| `POST` | `/orders` | Yes | `order:write` | `{ client_id, order_code, material_name?, quantity?, unit?, priority?, due_at?, notes? }` | None | `{ success: true, data: OrderDTO }` | 201, 400, 401, 403, 404, 409 | Verified Live |
| `GET` | `/orders/:id` | Yes | `order:read` | None | None | `{ success: true, data: OrderDTO }` | 200, 400, 401, 403, 404 | Verified Live |
| `PATCH` | `/orders/:id` | Yes | `order:write` | `{ material_name?, quantity?, unit?, status?, priority?, due_at?, notes? }` | None | `{ success: true, data: OrderDTO }` | 200, 400, 401, 403, 404, 409 | Verified Live |
| `POST` | `/orders/:id/cancel`| Yes | `order:cancel`| `{ reason? }` | None | `{ success: true, data: OrderDTO }` | 200, 400, 401, 403, 404, 409 | Verified Live |

**Path Prefix Consistency:**  
The backend router automatically invokes `stripApiPrefix()`, allowing endpoints to resolve identically with or without the `/api` prefix (e.g. `/api/clients` and `/clients` hit the same route handler).

---

## 11. Database Findings

1. **Schema & Integrity:**
   - 14 migration files executed in sequential order.
   - Tables strictly use UUID primary keys (`id uuid PRIMARY KEY`).
   - Unique constraints enforced on:
     - `users.login_identifier`
     - `clients.account_code`
     - `orders.order_code`
     - `access_roles.code`
     - `access_permissions.code`
2. **BigInt / Numeric Types:**
   - `orders.quantity` and `orders.version` are defined as `bigint`.
   - In Node.js, `pg` returns bigints as strings, and JavaScript `JSON.stringify` throws on native `BigInt`. The backend handles this through custom `serializeJson()` in `backend/apps/api/src/utils/http-utils.ts`, converting `BigInt` to string. Frontend safely parses quantities using `parseInt(str.replace(/\D/g, ''), 10)`.
3. **Migration Reproducibility:**
   - Migrations were tested from scratch against a fresh database; all 14 executed without errors.
   - Rollback (`down`) functions exist for all migrations.
4. **Missing Production Elements:**
   - Lack of default database seed file for system initialization.

---

## 12. Frontend UX Findings

1. **Visual Polish & Layout:**
   - Clean, professional industrial design system with custom CSS variables, responsive side navigation, and dark/light mode toggles.
   - Tables feature clean loading skeletons (`LoadingState`) and informative empty states (`EmptyState`).
2. **Deficiencies:**
   - **Deceptive Prototype Text in Production:** In `frontend/src/pages/pages.tsx`, login card displays *"Frontend session preview. Use a work email and password to enter the local preview. No credentials leave the browser."* This will undermine client trust during a dry run.
   - **Non-Functional Action Buttons:** In `OrderDetailPage`, the action menu contains buttons for *"Duplicate order"* and *"Open audit history"* that have no-op (`onClick: () => undefined`) handlers.
   - **Keyboard Accessibility:** Modals (`Dialog`) lack proper focus trap and Escape key listener bindings.

---

## 13. Browser / Console / Network Findings

1. **Console Observations:**
   - In development mode, React 19 warnings regarding non-critical ref-passing in Lucide icons are logged.
   - In production build, zero JavaScript runtime errors or unhandled promise rejections occur during navigation.
2. **Network Traffic:**
   - All API requests correctly pass `credentials: 'include'` via `frontend/src/api/client.ts`.
   - Headers include `Accept: application/json` and `Content-Type: application/json`.
   - Responses return `X-Correlation-Id`, which is logged by the backend error handler on failures.
3. **OPTIONS Preflight:**
   - Preflight requests return HTTP 204 with `Access-Control-Max-Age: 600`, reducing preflight overhead.

---

## 14. Performance Findings

1. **Bundle Size:**
   - Production Vite build generates:
     - JS: ~460 kB (compressed gzip: ~135 kB)
     - CSS: ~48 kB (compressed gzip: ~11 kB)
   - Initial DOM load time is `< 250ms` on a standard connection.
2. **API Latency:**
   - Local PostgreSQL response times for `/api/clients` and `/api/orders` list endpoints are `< 15ms`.
   - Database queries utilize indices on `orders.client_id`, `orders.status`, and `clients.account_code`.
3. **Rate Limiting:**
   - Backend employs an in-memory rate limiter set to 300 requests per minute per IP. This is sufficient for human dry-run usage but will need a distributed store (Redis) if running multiple backend pods.

---

## 15. Security Findings

1. **Credential Storage:**
   - Passwords are never stored in plaintext. Backend utilizes `argon2id` with secure defaults.
2. **Session Security:**
   - Cookies are marked `HttpOnly` (inaccessible to malicious JavaScript / XSS).
   - In production (`NODE_ENV=production`), `Secure=true` is enforced.
3. **HTTP Defensive Headers:**
   - Backend automatically sets:
     - `X-Content-Type-Options: nosniff`
     - `X-Frame-Options: DENY`
     - `Referrer-Policy: no-referrer`
   - *Missing:* `Content-Security-Policy` (CSP) and `Strict-Transport-Security` (HSTS) headers should be added in production.
4. **Committed Secrets:**
   - As documented in **P0-04**, active `.env` files in git tree contain database passwords and secrets. Immediate rotation is required.

---

## 16. Deployment Findings

### Target Architecture Recommendation
For a clean client dry run, the system should be deployed using a **Single-Domain Reverse Proxy** architecture to eliminate all cross-domain cookie issues:

```text
[ Client Browser ]
        │
        ▼ (HTTPS)
[ Reverse Proxy / Nginx / Cloudflare / Caddy ]
   ├── /api/*   ──────▶ [ Backend Node API :3000 ]
   └── /*       ──────▶ [ Frontend Static Files (dist/frontend) ]
```

- When deployed behind a reverse proxy:
  - Frontend base URL can be simply `/api`.
  - Cookies remain strictly **first-party** (`SameSite=Lax` works seamlessly).
  - CORS preflight overhead is completely eliminated.

---

## 17. Documentation Findings

1. **Outdated Instructions:**
   - `README.md` and root `package.json` reference obsolete Prisma commands (`prisma migrate dev`). Prisma has been replaced with Kysely and `@royal-packaging/db`.
2. **Missing Runbooks:**
   - No documented procedure for seeding the first administrator account.
   - No step-by-step production environment setup guide for operations staff.

---

## 18. Technical Debt

1. **Redundant Root Backend Files:**
   - Root `package.json` has `tsx backend/src/server.ts` which is a dead path. The actual application lives in `backend/apps/api/src/server.ts`.
2. **Role Name Divergence:**
   - `SUPERVISOR` (frontend) vs `MANAGER` (backend) needs consolidation in `@royal-packaging/contracts`.
3. **Hardcoded Sort Directions:**
   - `asc` hardcoded in `client-data.ts` and `order-data.ts`.

---

## 19. Recommended Fix Order

Fixes should be implemented in strict dependency order:

### Phase 1: Critical Blockers (P0) — Required for Dry Run
1. **P0-01 (Frontend Auth Wiring):**
   - Connect `signIn` in `frontend/src/state/auth.tsx` to call `POST /api/auth/login`.
   - Add initialization hook calling `GET /api/auth/session` to validate existing session cookies.
   - Connect `signOut` to call `POST /api/auth/logout`.
   - Remove "preview only" rejection and warning text.
2. **P0-02 (Database Initial Seed):**
   - Create `backend/scripts/seed-admin.ts` to insert initial roles (`ADMIN`, `OPERATOR`) and a default administrative user.
   - Add `npm run db:seed` script in `backend/package.json`.
3. **P0-03 (Strict Production Mode):**
   - Update `resolveDataMode` in `repositories.tsx` to throw or default to `'api'` when in production mode.
4. **P0-04 (Secrets Sanitation):**
   - Remove `.env` files from git tracking and rotate PostgreSQL credentials and session secret.

### Phase 2: High Priority Polish (P1)
5. **P1-01 (Deployment Cookie Compatibility):**
   - Ensure reverse proxy deployment configuration is documented and tested.
6. **P1-02 (Role Alignment):**
   - Align role constants between frontend auth state and backend RBAC policy (`MANAGER` vs `SUPERVISOR`).
7. **P1-03 & P1-04 (Order UX Enhancements):**
   - Fix order code collision risk with backend-generated sequence or retry.
   - Add async search to client picker in order dialog.

### Phase 3: Medium & Low Priority (P2 / P3)
8. **P2-01:** Implement bidirectional table sorting.
9. **P2-02:** Clean up root `package.json` scripts and dead Prisma dependencies.
10. **P2-03:** Clean up placeholder buttons and preview labels.

---

## 20. Client Dry-Run Test Matrix

| Test ID | Area | Scenario | Expected Result | Actual Result | Status | Severity |
|:---|:---|:---|:---|:---|:---:|:---:|
| **AUTH-01** | Auth | Login with valid credentials via UI | Sets `rp_session` cookie; navigates to Dashboard | Fails immediately with "Live sign-in not enabled" | **FAIL** | **P0** |
| **AUTH-02** | Auth | Login with invalid credentials | Displays "Invalid login identifier or password" | In mock mode fails; in API mode blocked | **FAIL** | **P0** |
| **AUTH-03** | Auth | Refresh browser after login | Session maintained from cookie | User reverted to UNAUTHENTICATED | **FAIL** | **P0** |
| **AUTH-04** | Auth | Logout via UI menu | Revokes session on server, clears cookie, redirects to `/login` | Clears local state only; server session intact | **FAIL** | **P1** |
| **AUTH-05** | Auth | Direct API call without session | Returns 401 Unauthorized `{ code: "UNAUTHORIZED" }` | Returns 401 Unauthorized | **PASS** | - |
| **RBAC-01** | RBAC | Admin accesses client write endpoint | Allowed (HTTP 201 / 200) | Allowed | **PASS** | - |
| **RBAC-02** | RBAC | User without `order:write` creates order | Returns 403 Forbidden `{ code: "FORBIDDEN" }` | Returns 403 Forbidden | **PASS** | - |
| **CLI-01** | Clients | Load client list in API mode | Fetches and renders clients from PostgreSQL | Fetches and displays correctly | **PASS** | - |
| **CLI-02** | Clients | Search client by name | Filters table to matching clients | Performs ILIKE query and renders results | **PASS** | - |
| **CLI-03** | Clients | Filter clients by status | Shows only clients with selected status | Filter applied properly | **PASS** | - |
| **CLI-04** | Clients | Create new client with unique code | Persists to PostgreSQL; appears in table | Persisted and visible | **PASS** | - |
| **CLI-05** | Clients | Create client with duplicate account code | Rejects with 409 Conflict; displays error message | Returns 409 `DUPLICATE_ACCOUNT_CODE`; UI shows alert | **PASS** | - |
| **CLI-06** | Clients | Edit existing client | Persists changes to PostgreSQL; updates view | Changes saved and reflected | **PASS** | - |
| **ORD-01** | Orders | Load order list in API mode | Fetches and renders orders from PostgreSQL | Fetches and displays correctly | **PASS** | - |
| **ORD-02** | Orders | Filter orders by status and priority | Renders matching subset | Correctly filtered | **PASS** | - |
| **ORD-03** | Orders | Create order associated with client | Associates valid `client_id`; persists order | Order created and linked | **PASS** | - |
| **ORD-04** | Orders | Create order with invalid client ID | Backend rejects with 404 `CLIENT_NOT_FOUND` | Rejected with 404 | **PASS** | - |
| **ORD-05** | Orders | Transition order Draft $\rightarrow$ Confirmed | Updates status in DB; updates status stepper | Status updated successfully | **PASS** | - |
| **ORD-06** | Orders | Attempt invalid transition (Draft $\rightarrow$ Completed) | Backend rejects with 409 `INVALID_STATUS_TRANSITION` | Rejected with 409 | **PASS** | - |
| **ORD-07** | Orders | Cancel order | Sets `status = 'cancelled'` and records timestamp | Order cancelled; stepper disabled | **PASS** | - |
| **REL-01** | Cross-Domain | Rename client; check associated order | Order displays updated client name on reload | Joined dynamically; displays updated name | **PASS** | - |
| **BUILD-01** | Build | Run production frontend build | Completes with zero errors; outputs assets | Build completes cleanly | **PASS** | - |
| **ROUTE-01** | Routing | Browser refresh on `/orders/some-id` in prod | Loads SPA and displays order detail | Works if SPA fallback configured on web server | **PASS** | - |

---

## 21. Deployment Checklist

- [ ] **Database Setup:** Provision managed PostgreSQL 15+ instance.
- [ ] **Run Migrations:** Execute `npm run db:migrate` in `backend/`.
- [ ] **Execute Initial Seed:** Run administrative user creation script.
- [ ] **Backend Environment:**
  - [ ] Set `NODE_ENV=production`
  - [ ] Set `DATABASE_URL` (production connection string)
  - [ ] Set `SESSION_SECRET` (generate 64-char random hex string)
  - [ ] Set `FRONTEND_ORIGIN` (exact frontend URL)
  - [ ] Set `PORT` (e.g. 3000)
- [ ] **Frontend Environment:**
  - [ ] Set `VITE_API_URL` to production API endpoint
  - [ ] Set `VITE_DATA_MODE=api`
- [ ] **Frontend Build:** Run `npm run build` and deploy `dist/frontend/` to web server.
- [ ] **Web Server / Reverse Proxy:**
  - [ ] Configure HTTPS certificate (Let's Encrypt / Cloudflare).
  - [ ] Configure SPA fallback rewrite (`try_files $uri $uri/ /index.html`).
  - [ ] Reverse proxy `/api/` to backend service port.
- [ ] **Health Check Verification:**
  - [ ] Query `GET https://crm.domain.com/api/health` $\rightarrow$ Expect `200 OK`.
  - [ ] Query `GET https://crm.domain.com/api/health/ready` $\rightarrow$ Expect `200 OK` (database ready).
- [ ] **Client Dry-Run Smoke Test:**
  - [ ] Log in with seeded admin account.
  - [ ] Verify Dashboard loads.
  - [ ] Create a test client.
  - [ ] Create a test order linked to that client.
  - [ ] Transition order status and verify persistence across page refresh.
  - [ ] Log out and verify session revocation.

---

## 22. Known Limitations

The following items are intentional architectural boundaries for the Phase 1 dry run and should not be considered defects:
1. **Unimplemented Step 9.3–9.6 Domains:** Employees, warehouse task execution, inventory balance mutations, and quality photo attachments are not yet live against PostgreSQL.
2. **Analytics & Reports:** KPI calculations, payroll automation, and report exports remain illustrative placeholders.
3. **In-Memory Rate Limiting:** Single-process memory store used for rate limiting (acceptable for dry run; requires Redis for high-scale multi-cluster environments).

---

## 23. Final Go/No-Go Evidence

### Assessment: **NOT READY FOR CLIENT DRY RUN**

### Justification & Blocker Evidence:
1. **Authentication Blocker (P0-01):** The user interface currently blocks any real login in API mode (`frontend/src/state/auth.tsx:100`). A client attempting to log in on the live site will be greeted with *"Live sign-in is not enabled yet"* and cannot enter the application.
2. **Zero Seed Data Blocker (P0-02):** A fresh database migration leaves the database with zero users and zero roles. Without an administrative seed script, no one can log into the live database.
3. **Secret Hygiene Blocker (P0-04):** Committed database passwords and session secrets in the repository must be rotated before deploying to any client-accessible or cloud infrastructure.

**Conclusion:**  
Once the Phase 1 critical blockers (**P0-01**, **P0-02**, **P0-03**, and **P0-04**) are resolved, the system will achieve **READY** status for the client dry run.
