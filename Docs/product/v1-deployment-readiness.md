# V1 deployment readiness (5-hour deployment mode)

**Date:** 2026-10-03.

**Scope:** what is deployed, what was changed for deployment, and what is deferred.

**Related documents:**
- `Docs/product/v1-business-decision-freeze.md`: the decision register.
- `Docs/integration/frontend-backend-contract-reconciliation.md`: contract details.

## 1. Business decisions applied in this release

| Decision | Status in code |
|---|---|
| Hierarchy: Super Admin → Admin → {Supervisor, Accountant, Others}; Supervisor does not manage Others | Documentation only. Permissions still come from the RBAC policy. |
| **Supervisor: organization-wide operational task scope, no fixed depot** | **Implemented (P0).** `resolveDepotScope` returns all depots for Supervisor/Manager. A Supervisor without an employee depot is no longer refused. Supervisors name the depot of each task and daily report (`daily_report:read_all` / `write_all` now include Supervisors). |
| Accountant: read-only, organization-wide; no incentives, no payroll | Already implemented. Verified. |
| **Others: own records plus their own depot's dashboard summary; no organization-wide dashboard** | **Implemented.** The frontend now shows the `/dashboard` summary to Others. The server limits it to the depot of their employee profile; another depot gets 403 `DEPOT_FORBIDDEN`, and no depot gets 403 `DEPOT_ASSIGNMENT_REQUIRED`. |
| Incentives and payroll: Super Admin only | Already implemented. Verified. |
| Pause/resume: Supervisor any task; Admin/Super Admin only tasks assigned to them | Already implemented (existing rule kept). |
| Depotless tasks allowed; counted in organization totals | Already implemented (`tasks.depot_id` nullable; organization-wide views include them). **"Unassigned" bucket in depot views: P1, not implemented.** |
| Cross-depot work allowed; contribution in neither depot's employee table; counts in the employee's own KPI | Already implemented. Now covered by test ISO-10. |
| KPI from operational source records; participants frozen at completion; assigned employees only; 2 dp half-up | Already implemented (`KpiResultCalculator`). |
| BOX entered separately by the Supervisor, never inferred from Loading/Unloading/Crossing/vehicle size | Already implemented: BOX = `completed_box_quantity` entered at task completion. No inference exists. |
| SLA and Quality | `NOT_CONFIGURED` (unchanged). |

## 2. Frontend ↔ backend contract matrix

| Frontend surface | Backend endpoint(s) | Auth / RBAC / scope | Status |
|---|---|---|---|
| Sign-in / session | `POST /auth/login`, `POST /auth/logout`, `GET /auth/session` | Session cookie | IMPLEMENTED |
| Clients | `GET/POST /clients`, `GET/PATCH /clients/:id` | `client:*` | IMPLEMENTED (mapped) |
| Orders | `GET/POST /orders`, `GET/PATCH /orders/:id` | `order:*` | IMPLEMENTED (mapped; SLA/fulfilment not recorded) |
| Inventory | `GET /inventory`, `GET /inventory/:id` | `inventory:read_catalog` | PARTIAL: catalogue only (no status, location name or reservations) |
| Employees | `GET /employees`, `GET /employees/:id` | `employee:read`; Others own profile only | PARTIAL: no role/task count/depot name in the DTO |
| Tasks, Warehouse, Loading & unloading (read) | `GET /warehouse/operations`, `GET /warehouse/operations/:id`, `GET /locations` | `warehouse:read_operations`; Others own tasks only | IMPLEMENTED |
| Task registration (Daily report page) | `POST /tasks`, `POST /tasks/:id/assignments`, `/start`, `/complete` | `task:*`; depot named per task | IMPLEMENTED |
| Task pause/resume/cancel/reopen in the UI | `POST /tasks/:id/pause|resume|cancel|reopen` | `task:*` | PARTIAL: backend implemented; the frontend disables lifecycle actions in API mode (P1) |
| Layer photos | `POST /tasks/:id/photos` | capturer from session | PARTIAL: backend implemented; no API-mode upload UI (P1) |
| Daily reports | `GET/POST /daily-reports`, `GET/PATCH /daily-reports/:id`, `POST /:id/submit`, `GET /daily-reports/options` | `daily_report:*`; Supervisors and admins any depot (named); Accountant read | IMPLEMENTED (aggregate report; see §4) |
| Shift entries | `POST /shift-entries`, `GET /shift-entries/me`, `/options`, `/:id` | own entries | IMPLEMENTED |
| KPI configuration | `GET /kpi/definitions`, `/:id` | Admin, Super Admin | IMPLEMENTED (read-only) |
| KPI results | `GET /kpi/results`, `/:id` | Others own results; reporting roles all | IMPLEMENTED |
| Shift KPI summary | `GET /kpi/summary`, `GET /kpi/me/summary` | management/Accountant; own | IMPLEMENTED |
| Depot KPI dashboard | `GET /kpi/depot-dashboard` | `kpi:read_depot` (not Others) | IMPLEMENTED |
| Main dashboard | `GET /dashboard` | everyone; Others own depot | IMPLEMENTED (task counts and BOX only) |
| Incentives | Frontend `/incentives`; backend `/incentives/ledger` | Super Admin | BLOCKED: path and shape mismatch (error state, no data) |
| Payroll | `GET /payroll` | Super Admin | BLOCKED: no list envelope; model mismatch |
| Reports | `GET /reports` | `report:read` | BLOCKED: no list envelope; model mismatch |
| Audit logs | Frontend `/audits`; backend `/audit-logs` | reporting roles | BLOCKED: path and shape mismatch |
| Users / access control | none | — | MISSING (shows "Not available") |

The BLOCKED rows fail safely to an error state, with no crash and no fabricated data. They are not deployment blockers (§3).

## 3. Priorities

### P0 (deployment blockers), fixed

1. **Supervisor depot confinement contradicted the business decision.** A Supervisor without an employee depot was refused everywhere (403). Fixed in `auth-middleware.ts`; tests rewritten to assert the new rules (§6).
2. **Others had no dashboard summary.** Enabled; the server-side depot limit is verified (ISO-8b).

### P1 (important V1, deferred; does not block deployment)

1. **Per-task daily operational values** (Loading/Unloading vehicle counts, vehicle description, crossing, times, labour, extra labour per task) and an explicit report ↔ task link. See §4.
2. **Free-form vehicle type/size** (today: the fixed `truck_types` 32FT / CROSSING / OTHER), and an extra-labour field.
3. **"Unassigned" depot bucket** for depotless tasks in depot-specific views.
4. **Task lifecycle actions in the API-mode UI** (pause/resume/cancel/reopen) and layer-photo upload UI.
5. **Others' own-actions audit view** (D10).
6. **Contract fixes for Incentives, Payroll, Reports and Audit** (frontend mappers plus the backend list envelope; reconciliation §8).
7. **Backend security follow-ups:**
   - `GET /inventory/:id` returns cross-depot stock to Others (Supervisors are allowed by decision RC-D8);
   - `GET /report-executions/:id` has no ownership or depot scoping.

### P2 (deferred)

AI recommendations; realtime; incentive redesign; payroll redesign; advanced exports and scheduling; depot comparison; nonessential analytics; user-administration API; notification backend.

## 4. Daily report status

**Current model:**
- One structured report per depot per date: loading/unloading counts, vehicles per truck type, start/end time, labour planned/present. The total and the duration are derived.
- The report's "registered tasks" are derived from completed tasks of that depot and date.
- Tasks themselves carry the BOX quantity (entered at completion), their assignments and their events.

**Requested model:** Daily Report → Supervisor selects existing Task 1..N → updates each task's operational values. **Not represented today:**
- there is no explicit report ↔ task link;
- there are no per-task vehicle, crossing, labour or extra-labour fields.

**Smallest change (P1, not implemented):**
1. Add one table, `depot_daily_report_tasks (report_id → depot_daily_reports, task_id → tasks, loading_vehicles, unloading_vehicles, vehicle_description text, crossing_description text, start_time, end_time, labour_planned, labour_present, extra_labour, extra_labour_context text)`, with a primary key on `(report_id, task_id)`.
2. Add `POST/PATCH/DELETE /daily-reports/:id/tasks/:taskId`.
3. Keep BOX on the task (`completed_box_quantity`).

There is **no second task entity**, and the existing task/event model is unchanged. Not implemented now: it needs a production migration, API and UI, which is not safe inside the deployment window.

## 5. Task lifecycle (one canonical mapping)

The backend statuses are authoritative: `PENDING → ASSIGNED → IN_PROGRESS ⇄ PAUSED → COMPLETED`, plus `CANCELLED`; reopen is an event.

The frontend lifecycle is derived from them (`Docs/api/warehouse-operations.md`):

| Backend status | Frontend lifecycle state |
|---|---|
| ASSIGNED | ASSIGNED |
| IN_PROGRESS | STARTED, or RESUMED if the last timing event is a resume |
| PAUSED | PAUSED |
| COMPLETED | COMPLETED |
| CANCELLED | CANCELLED |
| PENDING | UNASSIGNED (display) |

- **Status filters:** only exact equivalents are sent to the backend; other frontend-only states (ACCEPTED, VERIFIED, REJECTED, REASSIGNED, REOPENED, FAILED) return an empty list.
- **No second state machine** was introduced.

## 6. Verification (2026-10-03, local; PostgreSQL available)

| Check | Result |
|---|---|
| Backend typecheck | Clean |
| Backend lint | 0 errors |
| Backend unit tests | 201/201 |
| Backend integration tests | **249/249** |
| Frontend typecheck | Clean |
| Frontend lint | 0 errors (6 existing warnings) |
| Frontend tests | 391/391 |
| Frontend production build | Passing |

**Integration count:** 250 → 249. The depot-scope suite's 14 old Supervisor-isolation tests were replaced by 13 tests of the new rules:
- SCOPE-1/2 ×3 Supervisors;
- SCOPE-3 (no-depot Supervisor works);
- SCOPE-4 (depotless tasks);
- ISO-7, ISO-8, ISO-8b (Others depot dashboard), ISO-9, ISO-10 (cross-depot attribution).

**Other tests updated for the new rule:**
- daily reports DR-1–DR-7 and DR-9: Supervisors name the depot; DR-3 rewritten;
- depot dashboard DD-1–DD-7;
- photo identity PH-4/PH-5 (cross-depot task allowed, capturer still from the session; forging still 403);
- KR-I11, KS-I18, WO-I2.

No assertion about Others, Accountant, incentives, payroll or identity was relaxed.

## 7. Production steps (operator, after push)

The code does not run migrations on start. Against the **production** database, through the Render shell, never from a developer machine:
1. `npm run db:migrate`: additive; applies migration 016 (`depot_daily_reports`) if it is not yet applied.
2. `npm run db:seed` with `SEED_ADMIN_*` set (idempotent): creates the `ACCOUNTANT` role and the 8 KPI definitions, and revokes incentive/payroll permissions from non–Super Admin roles. Remove the `SEED_ADMIN_*` values afterwards.
3. Smoke test: `Docs/deployment/production-configuration.md` §"Smoke test".

## 8. Remaining blockers

**None for code deployment.**

Operational prerequisites:
- the migration and seed (§7) must be run on the production database;
- production verification has **not** been performed from this environment.
