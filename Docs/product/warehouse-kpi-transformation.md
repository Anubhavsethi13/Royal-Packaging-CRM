# Warehouse KPI transformation: roles, incentives, and the supervisor workflow

This document records what changed to align the CRM with the **Royal Packaging Warehouse KPI Management CRM** definition: what is enforced, where, and which business rules are still open.

## 1. Role hierarchy

`SUPER ADMIN → ADMIN → ACCOUNTANT → SUPERVISOR → OTHERS`

| Role | Code | Notes |
|---|---|---|
| Super Admin | `SUPER_ADMIN` | Full authority. The only role with incentives and payroll. |
| Admin | `ADMIN` (`MAIN_ADMIN` is treated as Admin) | Operations, employees, KPI (including configuration), reports, audit, administration. No incentives. |
| Accountant | `ACCOUNTANT` (**new**) | Read-only reporting: dashboard, reports (read/execute), KPI results (all employees), warehouse, task and employee reads, daily reports (read, all depots), audit. No writes, no KPI configuration, no incentives. |
| Supervisor | `SUPERVISOR` (`MANAGER` is treated as Supervisor) | Depot operations: registers loading and unloading tasks and daily depot reports for **their own depot** (`employees.depot_id`). No KPI configuration, no incentives. |
| Others | `EMPLOYEE` (existing code, displayed as "Others") | Assigned tasks, own shifts, own KPI results. |

- **Single source of truth:** the backend policy `DatabaseRBACAuthorizationPolicy` (`backend/apps/api/src/middleware/auth-middleware.ts`).
- **Frontend checks are UX only:** the centralized `state/authorization.ts` and `app/navigation.ts` (`visibleNavigation`, `routePermissions`, `ProtectedRoute`) mirror the backend; they do not replace it.
- **Display role:** the frontend maps any unrecognised backend role to the least-privileged display role, never to an administrator.

## 2. Incentives are Super Admin only

| Layer | Enforcement |
|---|---|
| API | `incentive:read`, `incentive:calculate`, `incentive:approve`, `incentive:record_kot`, `incentive:record_penalty`, `payroll:read`, `payroll:write`, `payroll:approve`, `financial:approve` → Super Admin only. Others get `403 FORBIDDEN`; anonymous callers get `401`. |
| Dashboard | `GET /dashboard` omits `incentiveTotalsByStatus` entirely unless the policy grants `incentive:read`; the totals are not even queried otherwise. |
| Audit | `GET /audit-logs` and `/audit-logs/:id` exclude `incentive_events` unless the policy grants `incentive:read`; for other roles an incentive event id resolves to 404. |
| Frontend | `INCENTIVES` and `PAYROLL` are Super-Admin-only modules in `hasPermission`: no permission string (including `*` or stale `incentive:*`) grants them to another role. This covers the navigation, the route guard (direct `/incentives` URL), the employee-page incentive cards and the Settings "Incentive configuration" tab. |
| Seed | Incentive and payroll permissions are bound to `SUPER_ADMIN` only. Every run of `npm run db:seed` **revokes** them from other roles, so databases seeded under the old rules are corrected (verified on a scratch database). |

**Payroll is included** because every payroll entry is a snapshot of an approved incentive amount (`payroll_entries.incentive_ledger_id`, `amount`). Exposing payroll would expose incentive data. This overrides the earlier Admin and Accountant payroll access. **Client confirmation recommended.**

Tests:
- `backend/tests/incentive-rbac-integration.test.ts`: every incentive and payroll endpoint × every role, forged headers and body roles, dashboard, audit, Accountant matrix.
- `frontend/src/app/incentive-rbac.test.ts`: navigation, route guard and actions for all five roles, including forged permissions.

## 3. Other access-matrix changes

- **KPI configuration:** Super Admin and Admin only (`kpi:read_config`). This reverses the earlier supervisor read access, as the new matrix requires. The seed revokes the binding from other roles. The affected tests (`kpi-configuration-integration`, `kpi-results-integration`, `supervisor-integration-audit`) now assert 403 for Supervisor.
- **Administration** (users, roles, permissions, scopes, settings): its own `settings:read` permission (Super Admin and Admin). Previously the frontend let anyone with `audit:read` (including supervisors) see these items.

## 4. Supervisor workflow

```
Supervisor registers task in the CRM (POST /tasks: LOADING/UNLOADING, depot, planned BOX)
  → assigns labour (POST /tasks/:id/assignments)
  → start (time recording begins) → complete with BOX quantity
  → completed task = source record for KPI results (BOX shared equally, time, tasks completed)
  → daily depot report (counts, vehicles, labour, hours) → submitted
```

- **UI:** *Warehouse → Daily depot report* (`/daily-reports`). It contains the report form, a "Loading and unloading tasks" registration panel for the supervisor's depot, and the history. The supervisor dashboard shows "Today's operations" with the actions.
- **Depot scope:**
  - The panel uses the depot the server resolves for the user (`/daily-reports/options`).
  - **Gap:** `POST /tasks` itself still accepts any `depot_id` from management roles; task-level depot scoping is not enforced by the API (pre-existing behaviour).

## 5. Daily depot report

**Migration 016** adds:
- `depot_daily_reports`: one per depot per date, with status `DRAFT` / `SUBMITTED`;
- `depot_daily_report_vehicles`: counts per existing `truck_types`;
- `depot_daily_report_events`: the audit trail.

It reuses `depots`, `employees` and `truck_types`. `shift_entries` was not reused: it is a per-employee entry whose loading and unloading totals are BOX quantities, with no status or depot ownership.

| Field | Source |
|---|---|
| loading, unloading | Entered (operation counts) |
| vehicles per type | Entered (`32FT`, `CROSSING`, `OTHER`) |
| labour required / present | Entered |
| start / end time | Entered (end must be later than start; no overnight, same rule as shift entries) |
| **total operations** | **Derived:** loading + unloading (never accepted from clients) |
| **duration** | **Derived:** end − start (e.g. 10:00 → 22:30 = 12h 30m) |
| registered tasks | **Derived:** completed LOADING/UNLOADING tasks for the depot on the same operational date (`OPERATIONS_TIMEZONE`), with BOX totals, for traceability against the source task records |

API (`backend/apps/api/src/routes/daily-report-routes.ts`):
- `GET /daily-reports/options`
- `GET /daily-reports?depot_id&from&to&status`
- `GET /daily-reports/:id`
- `POST /daily-reports`
- `PATCH /daily-reports/:id` (draft only; requires `version`)
- `POST /daily-reports/:id/submit` (requires times and labour; afterwards the report is read-only)

| Action | Super Admin / Admin | Accountant | Supervisor | Others |
|---|---|---|---|---|
| Read | All depots | All depots | Own depot | — |
| Create / update / submit | Any depot (must name one) | — | Own depot only | — |

Errors:

| Code | Status |
|---|---|
| `DEPOT_FORBIDDEN`, `DEPOT_ASSIGNMENT_REQUIRED` | 403 |
| `DAILY_REPORT_DUPLICATE`, `DAILY_REPORT_LOCKED`, `DAILY_REPORT_VERSION_CONFLICT` | 409 |
| `DAILY_REPORT_INCOMPLETE` | 422 |
| `VALIDATION_FAILED`, `INVALID_DEPOT`, `INVALID_TRUCK_TYPE` | 400 |

Every create, update and submit writes a `depot_daily_report_events` row (who, what, when, depot, report). These appear in `GET /audit-logs` as `source: "daily_report"`.

## 6. Navigation

The navigation is grouped Workspace → **Warehouse** (Overview, Loading/unloading, Daily depot report, Tasks, Locations, Inventory) → **Employees & KPI** → **Incentives** (Super Admin only) → Reports & audit → **Administration** → CRM (Clients, Orders). No page was removed.

## 7. Phase 2: supervisor depot isolation

> **Superseded for Supervisors (2026-10-03).** V1 business decision D5/D6: Supervisors are not assigned to a fixed depot and have organization-wide task scope; each task carries its own depot. `resolveDepotScope` now returns all depots for Supervisors. The rules below still apply to Others. See `Docs/product/v1-deployment-readiness.md`.

### Model

`employees.depot_id` is the existing, authoritative employee → depot mapping (one depot per employee). No new organisational structure or migration was needed.

The authorization policy decides each caller's depot reach from the session (`AuthorizationPolicy.resolveDepotScope`, in `backend/apps/api/src/middleware/depot-scope.ts`):

| Reach | Roles | Meaning |
|---|---|---|
| `all` | Super Admin, Main Admin, Admin, Accountant | Every depot (the Accountant stays read-only by action). |
| `depot` | Supervisor, Manager | Only the depot of their own active employee profile. Without one: **403 `DEPOT_ASSIGNMENT_REQUIRED`** on every depot route. |
| `self` | Others (Employee) | No depot authority. Own records only: assigned tasks, own employee profile, own KPI, own snapshots. |

- **Nothing in the request can widen the reach:** depot IDs in the body, query or URL are refused with **403 `DEPOT_FORBIDDEN`**, never silently ignored. The same applies to warehouse codes, employee IDs and location IDs that point to another depot.
- **Depotless records:** a record with no depot (for example a task created without `depot_id`) is outside every depot and is denied to depot-confined callers.

### Enforcement points (server-side)

| Area | Rule for a Supervisor |
|---|---|
| `GET /tasks`, `/resync/tasks` | Own depot only (Others: own assigned tasks only). |
| Every `/tasks/:id…` route (detail, summary, assignments, events, assign, reassign, unassign, start, pause, resume, complete, cancel, reopen, movement, quality inspections, photos) | The task must be in the own depot. Others reading task data must be or have been assigned to the task. |
| `POST /tasks`, `/tasks/initialize-from-order` | The depot comes from the session; source and destination locations must be in the own depot. |
| Assign and reassign | Every assignee must belong to the own depot. A mixed list is refused before anything is assigned. |
| Movements (task and inventory) | Locations (and the linked task) must be in the own depot. Batch balances are limited to the own depot's locations. |
| `/employees` | List, detail, create, update and shift assignment are limited to own-depot employees; an employee cannot be moved to another depot. Others see only their own profile. |
| `/warehouse/operations`, `/locations` | Own depot's tasks and locations. |
| `/kpi/results`, `/kpi/results/:id` | Computed in SQL for own-depot employees on own-depot tasks. |
| `/kpi/summary` | Shift KPIs aggregated over own-depot employees only. |
| `/kpis`, `/kpis/:id`, drill-down | Own depot's snapshots (Others: own only). |
| `/kpi/depot-dashboard` | Own depot. |
| `/daily-reports` | Own depot (unchanged from phase 1). |
| `/dashboard` | Own depot (Others: their profile's depot). |
| `/audit-logs` | Events of own-depot tasks and daily reports only. |
| `/shift-entries/:id` | Entries of own-depot employees only. |

- **Scope decision, inventory catalogue:** `/inventory` and `/inventory/:id` are organisation master data and are not depot-scoped. Per-depot stock is reached through balances and movements, which are scoped.
- **Scope decision, orders and clients:** these carry no depot and stay organisation-wide CRM data.
- **Tests:** `backend/tests/depot-isolation-integration.test.ts` checks Supervisor A ↔ B symmetrically: own depot readable and writable, the other depot refused, nothing changed by refused calls. It also covers the no-depot supervisor, organisation-wide roles and Others.

## 8. Depot KPI dashboard

The page is *Employees & KPI → Depot KPI dashboard* (`/depot-kpi`), backed by `GET /kpi/depot-dashboard?from&to|date&depot_id`.

- **Access:** Supervisor (own depot), Admin, Super Admin, Accountant. Others are denied.
- **Engine:** no second KPI engine. Per-employee figures come from `KpiResultCalculator`, with the same attribution, timing and rounding as KPI results.

| Figure | Formula / source |
|---|---|
| Loading / unloading / total tasks | Tasks **registered** (created) in the range, classified by `task_type`. |
| Completed tasks | Tasks with status COMPLETED whose completion falls in the range (`OPERATIONS_TIMEZONE`). |
| BOX quantity | Σ `completed_box_quantity` of those tasks (also split into loading and unloading). |
| Total operational time | Σ recorded active minutes (start/resume → pause/complete events) of completed tasks. |
| Average task time | Total operational time ÷ timed completed tasks. Untimed tasks are excluded, never counted as 0. |
| Required / present labour | Σ over daily depot reports in the range that record both values. |
| Attendance | present ÷ required × 100 (2 dp). Shown as "Not recorded" when absent or when required is 0. |
| Employee BOX | Each completed task's BOX shared equally between its assignees at completion (sums to the depot BOX when every task has assignees). |
| Employee tasks / average time | Completed tasks credited; recorded active minutes ÷ timed tasks. |
| SLA, Quality | `NOT_CONFIGURED`. Never a number (see §9). |

**Traceability:** the response lists the daily reports and the completed tasks behind the figures. The page goes from KPI number → employee row → *View source tasks* → task record (`/warehouse/:taskId`), and from daily report → registered tasks → BOX → employee KPI. The dashboard and `/kpi/results` agree; this is tested.

**Supervisor dashboard:** "My depot" shows today's operations from the daily report, and the depot KPI strip shows BOX handled, tasks completed, average task time, and SLA/Quality as "Not configured".

Tests: `backend/tests/depot-dashboard-integration.test.ts` and `frontend/src/kpi/depot-dashboard.test.tsx`.

## 9. SLA and Quality: configuration required later

Both stay **Not configured** in every API and UI until a business rule is approved. To enable them, the business must define:

- **SLA:**
  - the target time per operation (loading, unloading; per vehicle type if it differs) and whether the target depends on BOX quantity;
  - the clock (registered → completed, or active time only, excluding pauses);
  - which tasks are eligible (for example cancelled or reopened tasks);
  - the compliance formula (proposed: tasks within SLA ÷ eligible completed tasks × 100);
  - per-depot targets.
- **Quality:**
  - which quality inspection outcome counts (for example `quality_records` pass/fail or damage rate);
  - the per-employee attribution for shared tasks;
  - the formula and target.

The contract already carries `sla` and `quality` as `NotConfiguredMetricDTO`, so adding them later is an additive change.

## 10. Open business decisions and gaps (not invented)

| Topic | Status |
|---|---|
| SLA rule and targets | Client decision required (§9). |
| Quality KPI | Client decision required (§9). |
| Daily report approval | **Unresolved; not implemented by design** (§11.6). |
| Supervisor with no depot | Denied all depot data (403 `DEPOT_ASSIGNMENT_REQUIRED`). Confirm whether a supervisor may cover several depots; that would need a many-to-many mapping, which does not exist today. |
| Depotless tasks | Denied to supervisors. Confirm that every operational task must have a depot (the API still allows admins to create one without). |
| KPI semantics for a depot | Employees of the depot credited for tasks of the depot. Work by a depot's employee in another depot is not in that depot's KPI. |
| Inventory catalogue | Organisation-wide (§7). |
| Others: "own actions" audit | Not implemented (Others have no audit access). |
| Incentives UI | Still a Super Admin preview surface; incentive access is unchanged (Super Admin only). |
| Payroll visibility | Super Admin only (§2). Confirm with the client. |
| Participant cutoff (KPI vs incentive) | See `Docs/api/kpi-results.md` (client decision). |

## 11. Phase 3: hardening and verification

### 11.1 Photo capturer identity

`POST /tasks/:id/photos` now takes the capturer from the session, never from the request: authenticated session → user → active employee profile (`employees.user_id`) → `captured_by_employee_id`. It reuses the existing session and `DepotDirectory.activeEmployeeOfUser`; there is no new authentication mechanism.

The requirements define the capturer as the person who took the layer photo, and no contract allows capturing on behalf of another employee. So:

- **No body field:** the photo is recorded against the caller's own employee.
- **Body field naming the caller's own employee:** accepted, for compatibility.
- **Body field naming any other employee:** **403 `FORBIDDEN`**, and nothing is written. This applies to supervisors too.
- **Account without an active employee profile:** **403 `EMPLOYEE_PROFILE_REQUIRED`** (a capturer must be recorded).
- **Existing rules still apply:** depot isolation (403 `DEPOT_FORBIDDEN` for another depot's task) and, for Others, assignment to the task.

Tests:
- `backend/tests/photo-identity-integration.test.ts` covers own photo, forged employee, unauthorized callers, the supervisor workflow, and cross-depot manipulation.
- `api-application.test.ts` test 10 now links the session user to the capturer and asserts a forged capturer gets 403.

### 11.2 Depot isolation verification

No changes to the security model. The complete cross-depot suite (`depot-isolation-integration.test.ts`, 14 tests, Supervisor A ↔ B symmetric) passes. It covers:

- tasks: read, update, lifecycle actions, creation with another depot or location, and other-depot assignees;
- employees, KPI results and summary, daily reports, warehouse operations and locations;
- dashboard, audit and inventory movements;
- organisation-wide Admin, Super Admin and Accountant reach, and Others limited to their own records.

### 11.3 Depot KPI calculation verification

No new formulas and no second engine. `depot-dashboard-integration.test.ts` DD-7 re-derives every dashboard figure **independently from raw rows** (tasks, task_events, task_assignments, depot_daily_reports) over a two-day range, then compares:

- loading, unloading, total and completed tasks;
- total, loading and unloading BOX;
- total and average task time (pauses excluded, untimed tasks excluded);
- required and present labour, and attendance = present ÷ required (41/43 → 95.35%);
- per employee: equal BOX share, tasks, minutes, average and source tasks;
- per employee: the sums of the existing `/kpi/results` BOXES_HANDLED, TASKS_COMPLETED and TASK_TIME, which match the dashboard.

### 11.4 SLA: Not configured

There is no target and no formula; the API returns `{ status: "NOT_CONFIGURED", value: null, reason }` and the UI shows "Not configured". The contract is configuration-ready, and these are the extension points:

- **Calculation entry points:** `KPI_RESULT_CALCULATIONS` already registers `LOADING_SLA_COMPLIANCE` / `UNLOADING_SLA_COMPLIANCE` (kind `SLA`, currently NOT_AVAILABLE). The dashboard's `performance.sla` and per-employee `sla` fields are the slots.
- **Compliance targets:** compliance-percentage targets can use the existing `kpi_targets` table (per depot or organisation-wide).
- **Missing data:** a per-operation **SLA time target** (and any vehicle-type variation) does not exist in the schema. It needs a small configuration table once the rule is approved. The warehouse operations read model already exposes `sla: { target_seconds: null, status: "NOT_DEFINED" }`.
- **Frontend:** the mapping (`kpi/depot-dashboard-data.ts`, `notConfigured`) is the single place to accept configured values; the dashboard layout needs no redesign.

### 11.5 Quality: Not configured

Same treatment as SLA. `quality_records` (outcome, damage rate, quality score per inspection) exist as source data. The business must define which outcome counts, how it is attributed to employees on shared tasks, and the formula and target. The dashboard `quality` slots are ready.

### 11.6 Daily report approval: unresolved business decision

The lifecycle stays **DRAFT → SUBMITTED → read-only**. Nothing is approved, rejected or reopened. Before any approval workflow is built, the business owner must define:

- **who approves** (role), and their **approval authority** (own depot or all depots, and whether self-approval is allowed);
- **rejection behaviour** (back to draft? with a reason?);
- **reopening behaviour** (who may reopen a submitted or approved report);
- the **correction workflow** after approval (amendment vs new version; audit expectations).

The `approved_at` / `approved_by_user_id` columns exist and remain unused.

### 11.7 Incentives: Super Admin only (re-verified)

| Surface | Verification |
|---|---|
| API (every incentive and payroll endpoint) | Super Admin is allowed; Admin, Accountant, Supervisor, Manager, Others and no-role get 403; anonymous gets 401. Forged headers and body roles don't help (`incentive-rbac-integration.test.ts` IR-1 to IR-4). |
| Dashboard response | Incentive totals **and the payroll placeholder** are omitted unless the caller may read incentives (IR-5; `analytics-integration.test.ts` AN6). |
| Audit response | Incentive events are hidden and resolve to 404 for non-Super Admins (IR-6). |
| Every other read endpoint | IR-8 scans employees (including search), tasks, KPI results and summary, the depot dashboard, snapshots, daily reports, warehouse, reports and resync for every non-Super Admin role: no incentive or payroll data, and no ledger ID. |
| Navigation, frontend route, direct URL | `incentive-rbac.test.ts` and `incentive-surfaces.test.tsx` (all five roles, including forged permissions). |
| Employee page | The incentive and payroll cards (`EmployeeIncentiveCards`) render only for Super Admin (`incentive-surfaces.test.tsx`). |

### 11.8 Final test counts (this phase)

| Suite | Result |
|---|---|
| Backend unit (`npm test`) | 201 / 201 |
| Backend integration (`npm run test:integration`) | 250 / 250 |
| Frontend (`npm test`, vitest) | 363 / 363 |
| Typecheck (backend and frontend) | clean |
| Lint | 0 errors; the same 6 existing fast-refresh warnings |
| Frontend production build | passing |

### 11.9 Remaining business decisions

See §10. Open items:
- SLA rule and targets;
- Quality rule and target;
- daily report approval (§11.6);
- supervisor with no depot, or with several depots;
- depotless tasks;
- depot KPI semantics for cross-depot work;
- inventory catalogue scope;
- "own actions" audit for Others;
- payroll visibility;
- KPI vs incentive participant cutoff.
