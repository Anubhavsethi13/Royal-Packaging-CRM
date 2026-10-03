# Supervisor API Integration Diagnostic

**Date:** 2026-09-30
**Scope:** Why five Supervisor pages show "API integration unavailable" in API mode.
**Method:** Read-only trace of frontend and backend source. No code was changed for this diagnosis.
**Authority:** Executable code takes precedence over documentation.

Pages covered: Warehouse operations, Locations, Loading & unloading, KPI configuration, KPI results.

---

## 1. Root cause

The five pages never call the backend. Each one checks the frontend's data mode and returns the "unavailable" screen when `VITE_DATA_MODE=api`, before making any request. A browser network trace would show zero requests from these pages. The frontend `.env` sets `VITE_DATA_MODE=api`, which is correct and not the problem.

- **Warehouse operations, Locations, Loading & unloading:** `PreviewBoundary` in `frontend/src/pages/operational-pages.tsx` (lines 13-16) calls `operationalSurfaceState(mode)` in `frontend/src/pages/operational-data.ts`. That returns `'unavailable'` whenever the mode is not `mock`, and the page then renders the "API integration unavailable" message.
- **KPI configuration:** `frontend/src/kpi/configuration-pages.tsx` (line 112) returns "KPI configuration API unavailable" when the mode is `api`.
- **KPI results:** `frontend/src/kpi/result-pages.tsx` skips loading in API mode (line 133) and renders "KPI results API unavailable" (line 210).
- **Test that locks this in:** `frontend/src/pages/operational-data.test.ts` (line 9) asserts `operationalSurfaceState('api') === 'unavailable'`.

Removing the check alone would not make the pages work. The chain would then break at points that are currently hidden:

| Checklist item | Applies? | Evidence |
|---|---|---|
| A. Backend API does not exist | Yes, for Locations and KPI configuration | No location route or service. No KPI definition or rule API. |
| B. Frontend endpoint is wrong | Yes | The `kpis` repository points at `/kpi/definitions`, which does not exist (404). |
| C. Backend endpoint name differs | Partly | See B. |
| D. Response shape differs | Yes, the biggest one | The backend task record is raw ids and backend statuses; the frontend expects display strings (section 5). |
| E. Validation rejects the response | Yes, in effect | The tasks repository passes the raw response through unmapped, so `toWarehouseOperation` would crash on `task.source.split(...)`. |
| F. Session missing | No | The route guard passes. |
| G. Supervisor permission missing | No | Seeded Supervisor permissions include `task:read`, `warehouse:read_tasks`, `kpi:read` and `task:execute_movement`. The frontend mapping lets them through, and the backend policy counts SUPERVISOR as management tier. |
| H. Scope rejects the request | No, the opposite | `GET /tasks` has no scoping at all (section 6). |
| I. API base URL is wrong | No | Correct. |
| J. `VITE_DATA_MODE` is wrong | No | Correct. |
| K. CORS or API configuration | No | Correct. |
| L. Backend returns an error | Yes, if called | `/kpi/definitions` would return 404. |
| M. Database or read model missing | Yes, for KPI results and the loading/unloading filter | `kpi_snapshots` is never written, and there are no canonical loading/unloading task types. |

So the answer is **N, multiple issues**. The first and only visible one is the frontend mode check. Behind it are shape mismatches (D and E) and missing backend pieces (A, B and M).

### Request flow: where the chain stops

```
Page ──✘ stops here (mode check, before any request)
  ↓ (if the check is removed)
Repository (tasks: decodePassthrough, no decodeItem) ──✘ unmapped shape
  ↓
HTTP GET /tasks ── ✔ route exists
  ↓
requireAuth ── ✔
requireAuthorization("task:read") ── ✔ Supervisor allowed
  ↓
TaskService.listTasks ── ✔
  ↓
tasks table ── ✔ (no task code, SLA target, or loading/unloading type)
  ↓
Response {success, data: TaskRecord[], meta} ── ✔
  ↓
Frontend mapper ──✘ expects the mock TaskRecord shape
  ↓
Page
```

---

## 2. Page-by-page diagnosis

### Warehouse operations

- **Route and component:** `/warehouse`, `WarehousePage` wrapping `WarehouseDashboardPage`.
- **Where it stops:** at the mode check. With the check removed, the page would call `GET /tasks?page=1&pageSize=9007199254740991`; the backend clamps pageSize to 200, so it would load at most 200 tasks.
- **What the backend has:** `GET /tasks` exists, uses `task:read` (Supervisor allowed), is served by `TaskService.listTasks` and reads the `tasks` table. It returns `{success, data: TaskRecord[], meta}`.
- **The mismatch:** the backend record has no task code, employee name, warehouse name, `v1Status`, timer events or SLA target. The frontend repository config (`{ resourcePath: '/tasks', decodeDetail: decodePassthrough }`) has no `decodeItem` mapper.
- **Data that does exist:**
  - task events: `TASK_CREATED`, `ASSIGNED`, `STARTED`, `PAUSED`, `RESUMED`, `COMPLETED`, `CANCELLED`, `REOPENED`, `UNASSIGNED`;
  - assignments linking tasks to employees;
  - depots;
  - planned and completed box quantities.
- **Detail page:** would use `GET /tasks/:id`, plus `/events`, `/assignments` and `/summary`, which all exist.
- **Status:** the backend is partial, and the frontend mapping is mismatched.

### Locations

- **Route and component:** `/locations`, the static `PreviewPages.LocationsPage` in `frontend/src/pages/pages.tsx`.
- **What the page is:** hard-coded markup; it has no repository and makes no API call.
- **What the backend has:** a `locations` table (migration 003: `depot_id`, `parent_location_id`, `code`, `name`, `active`), used only internally by `InventoryService`. There is no route or service for it.
- **Beyond the table:** occupancy, blocked and restricted flags do not exist anywhere.
- **Status:** missing; the table exists, but there is no API and no frontend client.

### Loading & unloading

- **Routes:** `/loading-unloading` and `/loading-unloading/:taskId`.
- **Where it stops:** at the mode check, then the same `GET /tasks` path and mapping gap as Warehouse operations.
- **Type classification:** the page keeps tasks where the frontend `type` is `'Loading'` or `'Unloading'`. Backend `task_type` is free text with no fixed values, and tests use `PICKING`, `PACKING`, `UNPACKING`, `MOVE` and so on. No loading or unloading value is defined, so the page would show nothing even once connected.
- **SLA:** the page needs a per-task SLA target, but no such column exists (the dashboard also returns SLA as `null`).
- **BOX updates:** mutations are blocked in API mode by design.
- **Status:** partial; the lifecycle routes exist, but the type classification and SLA data are missing.

### KPI configuration

- **Route and component:** `/kpis`, `KpiConfigurationPage`.
- **Where it stops:** at the mode check.
- **Where the data comes from:** `frontend/src/kpi/kpi-config-store.ts`, an in-memory frontend store seeded from `kpi-data.ts`. It never uses the API.
- **Frontend model:** definitions with rules, versions, governance status, roles, operations, scope and thresholds.
- **Backend tables:** `kpi_definitions` (`code`, `name`, `pillar`, `unit`, `formula_reference`, `active`, effective dates) and `kpi_targets` (target, warning and critical values per depot).
- **What's missing:** no service or route reads or writes definitions or targets, there is no `kpi:write` permission in the backend, and nothing is seeded. The rule and version history concepts have no tables.
- **Status:** missing; the tables exist but there is no API, and the models don't match.

### KPI results

- **Routes:** `/kpis/results` and `/kpis/results/:resultId`.
- **Where it stops:** at the mode check. `repositories.kpiResults` is not configured in API mode, so it is an "unavailable" repository that throws.
- **What the backend has:** `GET /kpis` and `GET /kpis/:id` (`kpi:read`), which read `kpi_snapshots`. Nothing ever writes that table, so it is always empty.
- **Shape mismatch:** the backend returns `{kpi_code, value, target_value, period…}`. The frontend expects `ruleVersionId`, `metric`, `category`, `operation`, `scope`, target and actual values with units, direction, `status` and source references.
- **Real KPI data that does exist:** the shift-entry summaries (`/kpi/me/summary`, `/kpi/summary`).
- **Status:** mismatched; the route exists but has no data and a different shape.

---

## 3. Compatibility matrix

| Page | Frontend API call | Expected endpoint | Backend endpoint | Service | DB/read model | RBAC (Supervisor) | Status |
|---|---|---|---|---|---|---|---|
| Warehouse operations | none (mode check); would be `tasks.list` | `GET /tasks` | `GET /tasks` ✔ | `TaskService.listTasks` ✔ | `tasks`, `task_assignments`, `task_events`, `depots` ✔; no task code or SLA | `task:read` ✔ | **PARTIAL / MISMATCHED** |
| Warehouse detail | none; would be `tasks.getById` | `GET /tasks/:id` | ✔ plus `/events`, `/assignments`, `/summary` | ✔ | ✔ | ✔ | **MISMATCHED** |
| Locations | none (static page) | none defined | ✘ | ✘ | `locations` table ✔; no occupancy or restriction data | `LOCATIONS:VIEW` → `warehouse:read_tasks` ✔ | **MISSING** |
| Loading & unloading | none; would be `tasks.list` | `GET /tasks` | ✔ | ✔ | no loading/unloading task type, no SLA target | ✔ | **PARTIAL / BLOCKED** |
| KPI configuration | none (local store) | `/kpi/definitions` (repository path) | ✘ (404) | ✘ | `kpi_definitions`, `kpi_targets` ✔ unused; no rules or versions | `kpi:read` ✔; no `kpi:write` | **MISSING** |
| KPI results | none (unavailable repository) | not configured | `GET /kpis` ✔ | `KpiService.list` ✔ | `kpi_snapshots` never written; shift-entry KPIs are live | `kpi:read` ✔ | **MISMATCHED** |

---

## 4. Backend gaps

1. **No task read model for display.** `GET /tasks` returns raw rows. A supervisor directory needs, per task:
   - the assigned employee's name (join `task_assignments` to `employees`);
   - the depot code and name, and source and destination location codes;
   - timing derived from `task_events`.

   This should be a read-only projection built from `TaskService` and the existing tables, not a new model.
2. **No canonical loading/unloading classification.** Either confirm the `task_type` values with the client, or map an agreed set. Nothing currently defines them.
3. **No task code.** There is no human-readable code column. The existing pattern (orders use `ORD-`+id) suggests a derived display code rather than a migration.
4. **No SLA target.** Timing can be shown; SLA must stay "not applicable" until the business defines targets.
5. **No locations API.** A read-only `GET /locations` (optionally filtered by depot) over the existing table is needed. Occupancy and restriction policy do not exist and must not be invented.
6. **No KPI definition or target API.** A read-only `GET /kpi/definitions` over `kpi_definitions` joined with `kpi_targets` is possible. Create and edit need a decision on who may configure KPIs and on the rule and version model, which the database lacks.
7. **Nothing produces KPI results.** Either expose shift-entry KPIs as results, or build the snapshot calculation job, whose formulas are still marked "client decision required" in `backend/docs/architecture/09-kpi-data-model.md`.

---

## 5. Frontend gaps

1. **The mode check hides everything.** `operationalSurfaceState`, `PreviewBoundary` and the three `mode === 'api'` early returns in the KPI pages each need to become "API connected" per page once that page's contract exists. Pages without a contract must keep the unavailable state.
2. **No task mapper.** The `tasks` API config has no `decodeItem`. The backend fields need converting to the frontend's shape:
   - `task_type` → `type`
   - backend status → `status` and `v1Status`
   - `planned_box_quantity`/`completed_box_quantity` → `boxesPlanned`/`boxesCompleted`
   - task events → `timerEvents`
   - depot and location → `source` and `destination`
   - assignment → `employee`

   The mappers also parse the depot out of `task.source.split(' · ')`, which only works for the mock string format.
3. **Unbounded page size.** The hooks request `pageSize: Number.MAX_SAFE_INTEGER`; the backend clamps it to 200, so warehouses with more tasks are silently truncated. Server-side paging is needed.
4. **Status vocabulary mismatch.** The frontend lifecycle (`ACCEPTED`, `RESUMED`, `VERIFIED`, `REJECTED`…) is richer than the backend (`PENDING`, `ASSIGNED`, `IN_PROGRESS`, `PAUSED`, `COMPLETED`, `CANCELLED`). The mapping must be one-way and must not invent states such as `VERIFIED`.
5. **Wrong KPI path.** The `kpis` repository points at `/kpi/definitions`, which does not exist. `kpiResults` has no API config.
6. **Local-only configuration store.** `kpi-config-store.ts` holds frontend-only data, and its `createdBy: 'frontend-demo'` versions have no backend equivalent.
7. **Static Locations page.** It needs a repository and a real page.
8. **Stale docs.** `Docs/integration/client-dry-run-final-verification.md` still says Warehouse, KPI and Tasks are "cleanly deferred", while the code has since gained real task, KPI and shift APIs.

---

## 6. RBAC gaps

1. **`GET /tasks` is not scoped.** `task:read` is granted to every approved role, including EMPLOYEE, and returns all tasks in all depots. Once a supervisor directory is wired to it, employees could see everyone's tasks through the API. This is an existing exposure, not a supervisor block. Decide whether employee task reads should be own-only (they already have the scoped `GET /warehouse/tasks`).
2. **Supervisor scope is undefined.** No team or depot model exists, and the policy says "all approved roles can access all depots". Supervisors would see everything, and the frontend's `TEAM` scope is display-only.
3. **Locations permission reuses a task permission.** `LOCATIONS:VIEW` maps to `warehouse:read_tasks`; a dedicated `location:read` would be cleaner once the API exists.
4. **No permission for KPI editing.** `KPI:EDIT` maps to `kpi:write`, which doesn't exist in the backend policy or the seed data. The frontend's `KPI:VERIFY` has no backend meaning either.
5. **`/warehouse/tasks` returns only the caller's own tasks.** It is unsuitable as a supervisor directory.

---

## 7. Database gaps

- **Missing entirely:** a task code column, an SLA target, canonical loading/unloading task types, location occupancy and restriction flags, KPI rules and versions and their governance status, and any writer of `kpi_snapshots`.
- **Present but unused by any API:**
  - `locations`
  - `kpi_definitions`
  - `kpi_targets`
  - `task_events`, which is enough to derive timing
- **No migration is needed** for a read-only first version of Warehouse operations, Loading & unloading or Locations. KPI configuration editing and SLA would need client decisions first, and possibly migrations after that.

---

## 8. Recommended fix architecture

```
Page (existing UI)
 → frontend repository with decodeItem mapper (the "compatibility mapper")
 → GET /tasks, /tasks/:id (+ events, assignments) | GET /locations | GET /kpi/definitions | /kpi/summary
 → existing routes plus thin new read routes, behind requireAuth and requireAuthorization
 → TaskService (+ a read-only operational projection), a small LocationService, KpiService
 → existing tables: tasks, task_assignments, task_events, depots, locations, employees, kpi_definitions, kpi_targets, shift_entries
```

The mode check stays. It changes from all-or-nothing to per page: a page in API mode renders only if it has a real, tested contract. Otherwise it keeps the unavailable state. No mock fallback is introduced in API mode.

---

## 9. Implementation plan

1. **Decisions (product owner or client):**
   - which `task_type` values mean loading and unloading;
   - whether employee task reads should be scoped to their own tasks;
   - supervisor scope;
   - whether KPI configuration is read-only for V1;
   - what "KPI results" should show in V1 (shift-entry KPIs, or the snapshot job).
2. **Backend, task read model:** add an additive `operational` view to the task list and detail (employee, depot, locations, derived timing), with pagination in SQL. Add integration tests. No migration.
3. **Frontend, Warehouse operations:** add a task `decodeItem` mapper with unit tests against real backend fixtures, add server paging, and enable Warehouse operations in API mode (read-only; the existing lifecycle endpoints could drive actions later). Keep the unavailable state for anything not yet mapped.
4. **Loading & unloading:** enable it once the type decision is made, with SLA shown as "not applicable".
5. **Locations:** add a read-only `GET /locations` with depot filter and permission, then a new repository and page. Occupancy and restrictions stay out.
6. **KPI configuration:** add read-only `GET /kpi/definitions` (definitions plus targets), fix the repository path, and make the page read-only in API mode. Create and edit wait for a backend write model and `kpi:write`.
7. **KPI results:** decide the source. The shortest honest path is to show shift-entry KPIs; otherwise build the snapshot job once formulas are approved.
8. **Close-out:** update the boundary tests and the reconciliation and dry-run docs, then run the full verification suite (typecheck, lint, unit, integration, frontend tests, build).

---

## 10. Risk assessment

- **Authentication:** low risk; no change is needed.
- **RBAC:**
  - Scoping `GET /tasks` for employees would change existing behaviour; existing tests assume open reads.
  - A new `location:read` or `kpi:write` must be added to both the policy and the seed script, followed by a re-seed.
- **Warehouse and tasks:**
  - Changing the existing `/tasks` response could break current callers and tests, so any addition must be additive (new fields, or a new `view=operational` parameter).
  - The frontend status mapping must not imply lifecycle states the backend lacks.
- **Inventory:** unaffected unless location reads are shared; keep the location service read-only.
- **KPI:**
  - Presenting `kpi_snapshots`, or shift KPIs as "results", risks mixing sources, so keep the source label.
  - No scoring or ranking should be invented.
- **Employee dashboard (My shifts):** unaffected; it uses its own gateway.
- **Frontend tests:** `operational-data.test.ts` and the KPI page tests currently assert "unavailable in API mode". These change only per page as each contract is proven; the mock-mode tests stay unchanged.

---

## Status update (2026-09-30)

- **Warehouse operations: connected.** `GET /warehouse/operations` and `/warehouse/operations/:id` (read-only projection, server-side scope) plus a validated frontend mapper. See `Docs/api/warehouse-operations.md`.
- **Locations: connected.** `GET /locations` over the existing table, with a real API-mode page.
- **Loading & unloading, KPI configuration, KPI results: unchanged**, still behind the API boundary. The loading/unloading classification now exists in the backend (provisional synonym list), which is the prerequisite for connecting that page.
- RBAC gap 1 (`GET /tasks` unscoped for employees) is unchanged; the new warehouse endpoints are scoped.

### Status update: Loading & unloading (2026-09-30)

- **Loading & unloading: connected (read-only).** It uses the existing projection with `operation_type=LOADING,UNLOADING`; no second workflow. SLA is shown as not applicable because no targets exist.
- The projection now rejects an unknown `warehouse_code` (`INVALID_WAREHOUSE`) or `employee_id` (`INVALID_EMPLOYEE`), and a scoped caller filtering by another employee gets `403` instead of an empty list.
- **Open:** `POST /tasks` with a non-existent `depot_id` returns HTTP 500 (foreign-key violation) instead of a 400. A fix in `TaskService.createTask` is straightforward, but the in-memory database used by `tests/api-application.test.ts` has no `depots` table, so it needs that fixture extended first.
- **Open:** the zero-quantity completion rule is a client decision.
- **Still behind the API boundary:** KPI configuration, KPI results, and the operations command view.

### Status update: KPI configuration (2026-09-30)

- **KPI configuration: connected (read-only).** `GET /kpi/definitions` and `/kpi/definitions/:id` (management tier, `kpi:read_config`) read the existing `kpi_definitions` + `kpi_targets`. The frontend path the repository already expected (`/kpi/definitions`) now exists. See `Docs/api/kpi-configuration.md`.
- Rules, rule versions, roles, operations, scopes, directions, periods and the governance lifecycle still exist only in the frontend preview store; they are not mapped or invented in API mode.
- **Open:** no configuration write API, and nothing seeds definitions, so a fresh database shows an empty configuration.
- **Still behind the API boundary:** KPI results and the operations command view.

## Final audit (2026-09-30)

| Page | Status |
|---|---|
| Warehouse operations | Connected: `GET /warehouse/operations`, `/warehouse/operations/:id` |
| Locations | Connected: `GET /locations` |
| Loading & unloading | Connected (read-only): `GET /warehouse/operations?operation_type=LOADING,UNLOADING` |
| KPI configuration | Connected (read-only): `GET /kpi/definitions`, `/kpi/definitions/:id` |
| KPI results | **Not connected.** Still shows "KPI results API unavailable" by design: no backend result contract exists (`kpi_snapshots` is never written, and its shape does not match the frontend result model). Not implemented in these phases. |

Verified with a role matrix test (`backend/tests/supervisor-integration-audit.test.ts`), the full test suites, and a browser smoke test in API mode as the seeded Supervisor (full reloads and in-app navigation on all five pages) plus API checks with an Employee account.

### Status update: KPI results (2026-09-30)

- **KPI results: connected.** `GET /kpi/results` and `/kpi/results/:id` calculate results on demand from completed tasks for active, calculable KPI definitions (no persistence, no migration, `kpi_snapshots` unused). See `Docs/api/kpi-results.md`.
- New optional backend setting `OPERATIONS_TIMEZONE` (default `UTC`) defines operational days, weeks, and months.
- All five Supervisor pages are now API-connected. Loading & unloading and KPI configuration remain read-only.

### Status update: production hardening (2026-09-30)

- **`OPERATIONS_TIMEZONE`:** required in production (`Asia/Kolkata`), validated as an IANA name; development and test default to `UTC`.
- **`FRONTEND_ORIGIN`:** required in production. It must be an exact https origin with no wildcard.
- **Session cookie:** the SameSite policy is configurable through `SESSION_COOKIE_SAMESITE`. `none` always adds `Secure`, and logout clears the cookie with the same attributes.
- **Cross-domain login root cause:** a SameSite=Lax cookie is not sent on cross-site `fetch` from `*.vercel.app` to `*.onrender.com`. This was reproduced locally. The fix is the Vercel `/api` rewrite (recommended) or `SESSION_COOKIE_SAMESITE=none`. See `Docs/deployment/production-configuration.md`.
- **KPI definition seed:** `npm run db:seed` idempotently seeds the 8 calculable V1 definitions. SLA definitions and targets are not seeded.
- **Production status:** not yet verified against the real Vercel and Render deployment.
