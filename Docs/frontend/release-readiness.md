# Frontend Release Readiness

Date: 2026-09-14

Scope: frontend, frontend/API integration, production configuration, QA, deployment readiness, and AI recommendation UI only. Backend, Prisma, database, authentication implementation, RBAC enforcement, and AI service implementation were not changed.

## Final Recommendation

**READY PENDING BACKEND INTEGRATION**

The frontend mock/preview experience is runtime-verified and the production build is reproducible. Production release is not yet safe because the confirmed backend resource mappings, authentication transport, CORS/deployment configuration, and AI service contract are still external dependencies.

## Validation Baseline

| Check | Result |
| --- | --- |
| `npm test` | PASS: 18 files, 57 tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| Mock browser smoke audit | PASS after KPI effect fix |

The build emits non-fatal warnings for Zod Rollup annotations, the configured output directory being outside Vite's root, and a minified JavaScript chunk above 500 kB (526.41 kB, 152.92 kB gzip). These are follow-up performance/configuration items, not build failures.

## Runtime Smoke Audit

The declared routes in `frontend/src/app/routes.ts` were checked against the running Vite app. Representative list/detail routes for clients, orders, inventory, employees, tasks, KPIs, recommendations, and audit logs rendered successfully in mock mode. Auth UX routes (`/login`, `/register`, `/forgot-password`, `/reset-password`, `/unauthorized`, `/session-expired`) and SPA deep links also resolved.

The KPI route initially exposed a real React maximum-update-depth console error. The shared management list hook was narrowly corrected in `frontend/src/pages/management-pages.tsx` by stabilizing equivalent request objects. A fresh browser run then rendered KPI data with no console errors. No runtime errors remained in the representative smoke pass.

## Route Inventory

| Area | Routes |
| --- | --- |
| Workspace | `/`, `/clients`, `/clients/:clientId`, `/orders`, `/orders/:orderId` |
| Warehouse | `/warehouse`, `/locations`, `/loading-unloading`, `/tasks`, `/tasks/:taskId`, `/operations`, `/inventory`, `/inventory/:itemId` |
| People and performance | `/employees`, `/employees/:employeeId`, `/kpis`, `/kpis/:kpiId`, `/incentives`, `/payroll` |
| Governance | `/recommendations`, `/reports`, `/audit-logs`, `/settings`, `/access-control` |
| Auth and safety | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/unauthorized`, `/session-expired` |

## Mock Mode

- `VITE_DATA_MODE=mock` or an unset data mode selects the existing mock repository collection.
- Mock repositories retain synchronous `peek()` behavior for preview-only pages and command-palette preview search.
- Clients, orders, inventory, tasks, employees, management surfaces, operational surfaces, and recommendations rendered in the smoke audit without API calls.
- Mock authentication creates the documented preview admin session; no credentials leave the browser.

## API Mode Safety Audit

- API repository infrastructure calls `apiRequest()` and preserves the repository/list response abstractions.
- API mode does not silently fall back to mock data.
- Missing API repository configuration fails explicitly through `AppErrorBoundary`; it does not fabricate data.
- API errors remain errors in repository/page state rather than becoming empty results.
- Production page components do not call `apiRequest()` directly.
- API repository code does not use `peek()`.
- A live API-mode browser run was not claimed because the backend resource paths, decoders, and deployed API are not confirmed. The current `App` does not provide the required explicit `ApiRepositoryConfiguration`, so API mode is intentionally blocked pending backend integration.

## Authentication and Authorization Audit

The existing documentation confirms these backend paths and semantics:

- `POST /auth/login` with `{ email, password }`, success `SessionResponse`, and `401 INVALID_CREDENTIALS`.
- `GET /auth/session` returning `SessionResponse` or `401 UNAUTHENTICATED`.
- `POST /auth/logout` returning `204` or a safe acknowledgement.
- `401` should clear session/redirect; `403` should render the unauthorized state without retry.
- Existing role/permission vocabulary is preserved (`view:*` and `action:*` permissions).

Still unresolved and must be confirmed before production:

- Secure cookie versus bearer/token transport.
- Whether requests require `credentials: 'include'`.
- Token storage policy, refresh behavior, and session expiry handling.
- Backend-enforced RBAC responses and CORS configuration.

The frontend API-mode sign-in path currently reports that API authentication is unavailable rather than pretending a login succeeded.

## AI Recommendation Audit

The AI page is a mock-safe, read-only UI. Mock mode displays deterministic preview recommendations. API mode explicitly reports that the AI recommendation contract is not confirmed. No AI endpoint, mutation, approval/apply/dismiss workflow, confidence field, or model metadata was invented.

## Environment and Security Audit

- Public frontend configuration is limited to `VITE_DATA_MODE` and the public `VITE_API_URL` in `.env.example` and `Docs/frontend/deployment.md`.
- No database password, JWT secret, private API key, or service credential is placed in a `VITE_*` variable.
- The API client still has a development-only `http://localhost:4000/api` fallback when `VITE_API_URL` is absent; a production deployment must provide an explicit HTTPS API URL.
- No production hosting config was found: no Dockerfile, reverse-proxy config, Vercel/Netlify config, or equivalent. The host must provide SPA fallback to `dist/frontend/index.html`, HTTPS, and appropriate API CORS.
- No Playwright/Cypress dependency is present, so browser checks were manual smoke checks through the available local browser tooling rather than a committed E2E suite.

## Release Blockers

### P0 / release-blocking integration dependencies

- **API repository wiring:** backend team must confirm every resource path, version prefix, list/detail envelope, and decoder required to construct `ApiRepositoryConfiguration` before enabling API mode.
- **Authentication transport:** backend team must confirm cookie/token behavior, request credentials, session bootstrap, refresh/expiry, and 401/403 handling.
- **Production hosting/API connection:** deployment must provide HTTPS, explicit `VITE_API_URL`, SPA rewrites, backend CORS, and a reachable API.

### P1 / must resolve before production sign-off

- Confirm endpoint contracts for management, warehouse, task relationships, report metadata, and inventory read/mutation boundaries.
- Confirm the AI service endpoint, response schema, timeout/error behavior, and permission boundary before switching recommendations from unavailable to API-backed.
- Decide whether the initial 526 kB JavaScript bundle is acceptable; code splitting is recommended for the production performance budget.

### P2 / follow-up

- Add automated browser E2E coverage when the project’s chosen browser test tool is approved and available.
- Remove or quarantine legacy preview component implementations in `frontend/src/pages/pages.tsx` after all routing consumers are confirmed; they are not used by the current App routes but still contain preview-only `peek()` code.
- Add hosting-specific deployment configuration once the target platform is selected.

## Exact Handoff Checklist

1. Backend supplies the confirmed API base/version and resource mappings for clients, orders, inventory, employees, tasks, KPIs, incentives, payroll, audits, and reports.
2. Frontend supplies the explicit `ApiRepositoryConfiguration` from deployment configuration without changing repository interfaces.
3. Backend supplies auth transport/CORS/session behavior; frontend then wires the documented session calls.
4. AI team supplies the recommendation endpoint and response contract; frontend replaces the explicit API-unavailable state only after that contract is verified.
5. Deployment supplies HTTPS, SPA fallback, environment injection, and a production smoke run.

## Git Safety

No commit was created. Existing intentional worktree changes were preserved. Only the focused KPI runtime fix and this readiness report were added during the release gate.
