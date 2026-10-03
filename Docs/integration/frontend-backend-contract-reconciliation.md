# Frontend ↔ backend contract reconciliation (Payroll, Reports, Incentives, Audit)

**Status date:** 2026-10-02.

**Phase:** documentation and reconciliation only.
- No backend, schema, RBAC, depot isolation, KPI or business-rule changes were made.
- No frontend code was changed in this phase.

**Updated 2026-10-02 after the API-mode truthfulness cleanup** (frontend only): §4.6, §5, §8.1 status, §8.3 D9 and §9. Contract gaps and backend security findings are unchanged and still open.

**Evidence base:**
- **Code:** current repository code, plus the populated-data browser audit of 2026-10-02 (local scratch database, never Neon).
- **Docs and contracts:** backend route definitions and DTOs (`backend/packages/contracts`), frontend domain types and repositories, `Docs/api/*`, `Docs/frontend/*`, `Docs/integration/*`, `backend/docs/architecture/*` (especially 17, 19, 23, 25, 26), `backend/docs/integration/*`, and `Docs/product/*`.

## Legend

**Field status:**

| Code | Meaning |
|---|---|
| **EXACT** | Same meaning and type; usable as is. |
| **MAP** | Rename or simple mapping only (e.g. `created_at` → `createdAt`, enum relabel). |
| **CONV** | Type or format conversion (e.g. ISO timestamp → display text, decimal string → currency text). |
| **BE-MISSING** | The frontend expects it; the backend does not provide it. |
| **FE-MISSING** | The backend provides it; the frontend model has no slot for it. |
| **UNCLEAR** | The business meaning is not defined anywhere, so no mapping can be chosen. |
| **UNAVAILABLE** | Intentionally not recorded by the system (documented). |

**Ownership of the fix:**

| Code | Owner |
|---|---|
| **A** | Frontend mapper problem |
| **B** | Backend contract problem |
| **C** | Missing backend field explicitly required by an existing requirement |
| **D** | Business decision required |
| **E** | Preview or mock functionality that should stay clearly labelled |
| **F** | Out of V1 scope |

---

## 1. Contract matrix

| Area | Backend endpoint | Actual response shape | Frontend expected shape | Field mismatches | Pagination mismatch | Missing fields | Security requirements | Decision needed |
|---|---|---|---|---|---|---|---|---|
| **Payroll** | `GET /payroll` (`payroll:read`); `GET /payroll/:id` | `{ success, data: PayrollEntryDTO[] }`, one row **per employee per incentive-ledger entry**: `id, incentive_ledger_id, employee_id, amount, status (PENDING\|APPROVED\|REJECTED), created_at, updated_at, version, approvals[]` (+ camelCase mirror) | `PayrollRecord` is a **pay-period aggregate**: `period, employees (count), baseAmount, incentiveAmount, status (Draft preview\|Pending approval\|Approved), updatedAt` | Different grain (entry vs period); the status vocabulary differs; `amount` is an incentive amount, not a period total | **Yes**: plain array, no `meta`. The repository's `toListResponse` reads `meta.page`, so the page shows *"Cannot read properties of undefined (reading 'page')"* (error state, no crash). | **BE:** period, base amount, employee count. **FE:** `incentive_ledger_id`, `employee_id`, `approvals`, REJECTED status. | Super Admin only (`payroll:read`); entries carry approved incentive amounts. **Do not widen.** | Is "payroll" in V1 a per-entry approval ledger (what exists) or a pay-period summary (what the UI assumes)? Is base pay in scope at all? |
| **Reports** | `GET /reports` (`report:read`); `POST /reports/:code/executions` (`report:execute`); `GET /report-executions/:id` (`report:read`) | `{ success, data: ReportDefinitionDTO[] }`: `id, code, name, description, created_at, updated_at, version` | `ReportRecord`: `id, name, category, cadence, lastRun, owner, status (Ready\|Scheduled\|Preview)` | Only `id`/`name` overlap | **Yes**: plain array, no `meta` (same error state as Payroll) | **BE:** category, cadence, owner, lastRun, status. **FE:** `code`, `description`. | Preserve role rules. Definitions are metadata only, but executions (`filters`, `requested_by_user_id`) are **not owner- or depot-scoped** (§4.3). | Which reports exist, and their category, owner and schedule. Requirement docs say report content is "supplied report specifications"; none have been supplied (`backend-frontend-reconciliation.md` #12). |
| **Incentives** | `GET /incentives/ledger` (`incentive:read`); also `/incentives/kot/:month`, `/incentives/penalties` | `{ success, data: IncentiveLedgerRecord[] }`: `id, task_id, employee_id, incentive_rule_id, amount, status (PENDING\|APPROVED), idempotency_key, created_at, updated_at, version` | `IncentiveRecord`: `employee, task, event, points, amount, status (Preview\|Pending review\|Approved), createdAt` | Frontend repository path is **`/incentives`, which does not exist** (404), so the page shows *"Cannot GET /api/incentives"*. IDs where the UI expects names. | **Yes**: plain array, no `meta` | **BE:** employee name, task code, event type, points. **FE:** `incentive_rule_id`; `idempotency_key` must stay hidden. | **Super Admin only.** No amount, ledger ID, calculation, configuration or history for any other role. | "Points": no points concept exists anywhere in the schema or requirements. Event type per ledger row? "Preview" status has no backend meaning. |
| **Audit** | `GET /audit-logs` (`audit:read`); `GET /audit-logs/:id` | `{ success, data: AuditLogEntryDTO[] }`: `id, source (task\|incentive\|daily_report), eventType, eventAt, actorUserId, actorEmployeeId, taskId, correlationId, metadata, before: null, reason: null, requestId: null` (camelCase only) | `AuditRecord`: `id, actor, action, entity, entityId, timestamp, result (Success\|Blocked\|Preview), before, after` | Frontend repository path is **`/audits`, which does not exist** (404). IDs where the UI expects names. | **Yes**: plain array, no `meta`, and **unbounded** (the whole feed, no limit) | **BE:** actor name, result, before/after (documented as never recorded). **FE:** `actorEmployeeId`, `taskId`, `correlationId`, `metadata`. | Supervisor: own-depot task and daily-report events only. Accountant and Admin: all. Others: no access. Incentive events: Super Admin only (enforced server-side; keep). | Is a "Blocked" result (denied attempts) required? Should before/after be recorded (`17-approved-business-rules.md`: audit history = CLIENT DECISION REQUIRED)? |

### 1.1 Current runtime behaviour (API mode, populated data)

| Page | Today | Risk |
|---|---|---|
| Payroll | Error state (missing `meta`) | No crash |
| Reports | Error state (missing `meta`) | No crash |
| Incentives | Error state (404) | No crash |
| Audit logs | Error state (404) | No crash (the request loop was fixed in the previous phase) |

**Sequencing hazard (important).** If the backend adds the pagination envelope, or the frontend paths are corrected, **before** frontend mappers exist, the raw DTOs will reach the pages and crash or mis-render:

| Page | Expression that would fail | Result |
|---|---|---|
| Reports | `StatusBadge status={report.status}` | crash (undefined) |
| Audit | `StatusBadge status={event.result}`; `initials(event.actor)` | crash (undefined) |
| Payroll | `period.employees` sum | `NaN` |
| Incentives | `event.employee` | undefined |

**The frontend mappers (§8.1) must land first.**

---

## 2. Field-level reconciliation

### 2.1 Payroll (`PayrollEntryDTO` → `PayrollRecord`)

| Frontend field | Backend source | Status | Owner | Note |
|---|---|---|---|---|
| `id` | `id` | EXACT | — | |
| `period` | — | BE-MISSING / UNCLEAR | D | Entries have no period. `monthly_kot.effective_month` exists for KOT, but entries are not linked to a month. |
| `employees` (count) | — | UNCLEAR | D | Only meaningful for a period aggregate. Each entry is one employee. |
| `baseAmount` | — | UNAVAILABLE | D / F | The system holds no base pay. Payroll = approved incentive snapshot (`warehouse-kpi-transformation.md` §2). |
| `incentiveAmount` | `amount` | CONV | A | Decimal string → currency display. Super Admin only. |
| `status` | `status` | MAP (partial) | A + D | PENDING→"Pending approval", APPROVED→"Approved". **REJECTED has no frontend value** (FE-MISSING). "Draft preview" has no backend meaning. |
| `updatedAt` | `updated_at` | CONV | A | ISO → display. |
| — | `incentive_ledger_id` | FE-MISSING | A | Super Admin only. Never show to other roles. |
| — | `employee_id` | FE-MISSING (ID, not name) | B / A | Needs an employee name lookup (§6). |
| — | `approvals[]` (decision, actor_user_id, notes, decided_at) | FE-MISSING | A | Approval history. The actor is a `users.id`, not a name. |

**Documentation vs implementation:**
- `19-final-api-specification.md` specifies `GET /payroll/entries/{id}`; the implementation is `GET /payroll/:id`.
- `Docs/api/domains.md` describes payroll as "periods/detail … earnings/deductions/incentives"; the implementation is per-entry incentive snapshots, with no earnings or deductions.
- `backend-frontend-reconciliation.md` #11: no "paid" state exists.

### 2.2 Reports (`ReportDefinitionDTO` → `ReportRecord`)

| Frontend field | Backend source | Status | Owner | Note |
|---|---|---|---|---|
| `id` | `id` | EXACT | — | |
| `name` | `name` | EXACT | — | |
| `category` | — | BE-MISSING / UNCLEAR | D | No category concept in the schema. |
| `cadence` | — | BE-MISSING / UNCLEAR | D / F | Scheduling is an open decision (`Docs/api/open-decisions.md`: "Which reports, formats, recipients, schedules"). |
| `lastRun` | latest `report_executions.requested_at`/`completed_at` | BE-MISSING (derivable) | B | Not in the list DTO. It would need a join or a separate call. |
| `owner` | — | UNCLEAR | D | |
| `status` | — | BE-MISSING / UNCLEAR | D | Definitions have no status; executions do (PENDING/COMPLETED…). |
| — | `code` | FE-MISSING | A | Needed to call `POST /reports/:code/executions`. |
| — | `description` | FE-MISSING | A | Nullable. |

**Documentation vs implementation:**
- `19-final-api-specification.md`: "only supplied template mappings allowed; MB51/MB52 rejected/not exposed".
- `report_definitions` has no seed rows and no generation logic (`backend-frontend-final-compatibility-report.md`). The page's category/cadence/owner model comes from the mock catalogue, not from any contract.

### 2.3 Incentives (`IncentiveLedgerRecord` → `IncentiveRecord`)

| Frontend field | Backend source | Status | Owner | Note |
|---|---|---|---|---|
| `id` | `id` | EXACT | — | Ledger ID: Super Admin only. |
| `employee` (name) | `employee_id` | BE-MISSING (name) | B / A | ID only (§6). |
| `task` (code) | `task_id` | BE-MISSING (code) | B | Task display code is computed server-side (`taskDisplayCode`). The frontend must not re-derive it. |
| `event` | — | BE-MISSING | B / D | Event types live in `incentive_events` (a separate table, also exposed via audit for Super Admin); the ledger row has none. |
| `points` | — | UNCLEAR | D | No points concept in the schema, contracts or approved rules. |
| `amount` | `amount` | CONV | A | Decimal string. |
| `status` | `status` | MAP (partial) | A + D | PENDING→"Pending review", APPROVED→"Approved". "Preview" has no backend meaning. |
| `createdAt` | `created_at` | CONV | A | |
| — | `incentive_rule_id` | FE-MISSING | A | Rule versioning UI is an open decision. |
| — | `idempotency_key` | FE-MISSING (intended) | — | Internal; must never be displayed. |

**Documentation vs implementation:**
- Frontend path `/incentives`; implemented `/incentives/ledger`.
- The spec (`19-final-api-specification.md`) lists `GET /incentives/{id}`, which is not implemented.

### 2.4 Audit (`AuditLogEntryDTO` → `AuditRecord`)

| Frontend field | Backend source | Status | Owner | Note |
|---|---|---|---|---|
| `id` | `id` | EXACT | — | |
| `actor` (name) | `actorUserId` / `actorEmployeeId` | BE-MISSING (name) | B / A | IDs only (§6). Showing raw IDs as names is not acceptable. |
| `action` | `eventType` | MAP | A | e.g. `TASK_STARTED`, `DAILY_REPORT_SUBMITTED`. |
| `entity` | `source` | MAP | A | `task` / `incentive` / `daily_report`. |
| `entityId` | `taskId` or `metadata.report_id` | MAP | A | For daily reports the ID is in `metadata` (documented on the DTO). |
| `timestamp` | `eventAt` | CONV | A | |
| `result` | — | UNAVAILABLE / UNCLEAR | D | Only successful, recorded events exist; denied attempts are not logged. Frontend values Blocked/Preview have no source. |
| `before` | `before` (always `null`) | UNAVAILABLE | D | Documented on the DTO: never recorded. |
| `after` | `metadata` (free-form, often null) | UNCLEAR | D | |
| — | `correlationId`, `reason` (null), `requestId` (null) | FE-MISSING | A | `reason`/`requestId` are always null by design. |

**Documentation vs implementation:**
- Frontend path `/audits`; implemented `/audit-logs`.
- `Docs/frontend/product-workflows.md` promises "filter by result or entity … before/after values". The backend supports only `task_id`, `actor_user_id` and `event_type` filters and records no result or before/after.
- `Docs/api/pagination.md` declares the `{data, meta}` envelope for every list. `list-pagination-reconciliation.md` standardised only clients, orders, employees, tasks, inventory and warehouse. **Payroll, Reports, Incentive ledger and Audit were never brought onto the documented standard.**

---

## 3. Ownership summary per mismatch

| Mismatch | A | B | C | D | E | F |
|---|---|---|---|---|---|---|
| Frontend repository paths `/incentives`, `/audits` | ✔ | | | | | |
| No `{data, meta}` envelope on payroll/reports/ledger/audit (documented standard) | | ✔ | | | | |
| Audit feed unbounded (no paging/limit) | | ✔ | | | | |
| Payroll grain (entry vs period), base pay | | | | ✔ | | (base pay ✔) |
| Payroll REJECTED status, approvals history display | ✔ | | | | | |
| Report category/cadence/owner/status | | | | ✔ | ✔ (catalogue preview) | scheduling ✔ |
| Report `lastRun` | | ✔ | | | | |
| Incentive event/points | | | | ✔ | | |
| Employee/actor/task **names** instead of IDs (payroll, incentives, audit) | | ✔ | | | | |
| Audit result/before/after | | | | ✔ | | |

No item qualifies as **C**: no existing requirement explicitly mandates these exact fields. The spec marks every DTO in these areas as **CLIENT DECISION REQUIRED** (`19-final-api-specification.md`).

---

## 4. Security requirements and findings

### 4.1 Rules to preserve (unchanged)

| Area | Rules |
|---|---|
| **Incentives** | Super Admin only (`incentive:*`). No amount, ledger ID, calculation, configuration or history for Admin, Accountant, Supervisor, Others or anonymous callers. Verified by `incentive-rbac-integration.test.ts` (IR-1 to IR-8). |
| **Payroll** | Super Admin only (`payroll:*`), because entries are incentive snapshots. Not to be widened. |
| **Audit** | Supervisor depot-scoped (task and daily-report events of own depot). Incentive events only with `incentive:read`. Others: no access. |
| **Reports** | `report:read` and `report:execute` as today; do not add fields that expose data. |

### 4.2 Finding: inventory detail exposes cross-depot stock (security; backend owner, B)

- **What is exposed:** `GET /inventory/:id` (`inventory:read_catalog`, which includes Supervisors and Others) returns `balances[]`: per-batch, **per-location** box quantities for **all depots**, plus an organisation-wide `total_box_quantity`.
- **Why it matters:** `warehouse-kpi-transformation.md` §7 states the catalogue is organisation-wide and that "per-depot stock is reached through balances and movements, which are scoped". The embedded `balances` bypass that scoping.
- **Mitigation today:** the frontend does not display these balances.
- **Fix:** the backend team should scope or omit `balances` for depot-confined callers, or confirm D9 (inventory catalogue scope) in `Docs/product/v1-requirements-freeze.md`.

### 4.3 Finding: report executions are not owner- or depot-scoped (backend owner, B / D)

- `GET /report-executions/:id` requires only `report:read`, so any caller with that permission can read any execution: its `filters` (which may name a depot) and `requested_by_user_id`.
- No report content exists yet, so the exposure is currently metadata only. Scoping must be decided before report content is added.

### 4.4 Observation: report read permission vs frontend route

- The backend grants `report:read` to every approved role, including Others (`isApprovedRole`).
- The frontend blocks `/reports` for Others.
- Data is definition metadata only. Confirm the intended audience (D).

### 4.5 Observation: unbounded audit feed

`GET /audit-logs` returns every visible event with no limit. This is a performance and availability risk as events accumulate (B).

### 4.6 Finding: Others and the dashboard summary (business/product decision required, D)

**Current situation:**
- **Backend:** `GET /dashboard` (`dashboard:read`, including Others) returns **depot-wide** task counts and BOX totals for an Others caller. The depot comes from their employee profile, as documented in `Docs/product/warehouse-kpi-transformation.md` §7.
- **V1 access rule:** Others see **only their own records** (assigned tasks, own profile, own KPI, own shifts).
- **Frontend:** to stay within that rule, it does **not call `/dashboard` for Others** and shows no depot-wide summary. Others get a pointer to their own tasks ("Your assigned tasks are listed on the Tasks page"). All other roles see the API-backed summary (§5.1).

**This contradiction is not resolved here.** One of two policies must be chosen:

| Policy | Meaning | Consequence |
|---|---|---|
| **A. Others remain own-record-only** | Depot-wide aggregates are not for Others | The backend `/dashboard` permission or response should eventually be restricted for Others (B). No frontend change needed. |
| **B. Others may see a depot-wide operational summary** | Depot task/BOX totals are acceptable for Others | The frontend can enable the existing dashboard summary for Others (a one-line change). No backend change needed. |

Neither backend policy has been implemented. Tracked as **D9** in §8.3.

---

## 5. Preview data in API mode (updated after the API-mode truthfulness cleanup)

**Status (2026-10-02):** every hard-coded preview value that the original audit found on a routed surface in API mode has been **removed or replaced**.

- **Real data where available:** values come from an existing, contract-validated API wherever that API provides them.
- **No contract, no value:** where the backend contract does not provide the data, the UI shows **"Not available"**, **"—"** or another truthful empty state.
- **SLA and Quality** remain **"Not configured"** everywhere.
- **No value was invented** to make a screen look complete.
- **Mock mode** (`VITE_DATA_MODE=mock`) still shows its labelled preview content. That is its purpose, and production builds refuse mock mode (`resolveDataMode`).

### 5.1 Fixed: current truthful behaviour

| Surface | Previously in API mode | Now (API mode) | Source |
|---|---|---|---|
| Dashboard counts, date, KPI values | Fixed "Today · 10 Sep 2026"; Orders in motion 24, Inventory 42.8k, Tasks today 18 / 31, throughput 84.2% | Recorded tasks, completed tasks, BOX handled, and tasks by backend status, in the caller's server-side scope. Header shows "Workspace", not a fixed date. | **API-backed**: `GET /dashboard`, reading only `tasksByStatus` and `boxesHandled`, validated by `pages/dashboard-api.ts` (zod). Incentive, payroll, quality, inventory-status and SLA fields of the response are ignored. Not shown to Others (§4.6). |
| Dashboard SLA / Quality | "Quality pass rate 98.2% (target 97.0%)", "On-time dispatch 91.6%" | **"Not configured"** ("No SLA or Quality rule has been approved") | V1 freeze rule |
| Dashboard orders, exceptions, activity | Mock orders (RP-10482 …), "4 open" exceptions, "Meera Nair · 18 min ago" … | Orders and exceptions removed. Activity shows **"Not available"**. | Unavailable: no activity contract (audit contract unresolved, §2.4) |
| Inventory summary cards | 491 / 252 / 144 / 3 | **Catalogue items** = real `meta.total`. Available, Reserved and Exceptions show **"Not available"** ("Not recorded by the inventory API"). | API-backed count; the rest unavailable (no such concept in the catalogue) |
| Employee incentive/payroll cards (Super Admin only) | "₹ 450", "3 events this period", payroll "Pending" | **"Not available"** ("Incentive ledger not connected" / "Payroll not connected"). Still rendered only for Super Admin. | Unavailable: incentive and payroll contracts unresolved (§2.1, §2.3) |
| Employee "Current signal" | "On track" badge | **"Not available"** badge | Unavailable (no definition of "on track") |
| Employees list and detail banners | Called API records "mock data" | Accurately state that records come from the API, and which fields are not recorded | — |
| Task detail activity timeline | "Task created · Today · 10:42", "Assigned … · Today · 10:48", "Work started · Today · 11:18" | **Recorded task events only** (`task.activity` from `GET /warehouse/operations/:id`), with recorded actor and time. Empty state "No activity recorded" when none. | API-backed |
| Task workflow panel empty state | "Mock task actions will appear here" | "No task events have been recorded for this task." | — |
| Tasks page banner | "consumes a typed mock repository interface" | "Tasks are loaded from the API task read model. Task lifecycle actions are not available on this screen." | — |
| Global search (command palette) | Mock clients, orders, inventory, employees and tasks for every role (links 404) | **Screens only**, already filtered by the user's role. "Record search is not available in API mode." No mock records. | Unavailable: no global record-search API |
| Notifications | "Phase 2 boundary … authentication … mock-only", plus an unread dot | **"No notifications — Notifications are not connected in this version."** No unread dot. | Unavailable (notification backend out of V1 scope, §8.4) |
| Client detail "Latest signals" | "Order RP-10482 moved to ready · Today · 12 min ago" … | **"Not available"** ("Client activity is not connected in this version.") | Unavailable |
| Client detail "Orders" tab | Mock orders filtered by client ID (always empty for real clients) | **"Not available"**, pointing to the Orders list | Unavailable (no per-client order query in use) |
| Client counts / segment / last activity | Defaults: open/total orders **0**, segment **"General"**, last activity **"Recently"** | Order counts **"—"**, segment **"—"**. Last activity = the record's `updated_at` date, or **"—"**. | Counts and segment unavailable (not in the client DTO) |
| Orders: SLA and fulfilment | Invented (§5.2) | SLA **"Not configured"**; fulfilment **"—"** ("fulfilment not recorded") | §5.2 |
| Users and User access | Four made-up people with "Today · 09:12" logins; `/users/:id` always showed the same person | **"Not available"** ("A user directory is not available from the API in this version.") | Unavailable: no user-directory API |
| Settings → Profile | "Admin preview", "admin.preview@royalpackaging.local", role "Admin" for every user | The **signed-in session's** real name, email and role, read-only ("Profile changes are not connected in this version.") | API-backed (authenticated session) |

### 5.2 Order mapper correction (truthfulness / contract correction)

The previous frontend order mapper (`pages/order-data.ts`) **fabricated two values** that do not exist in the backend order response:

| Field | Old behaviour | New behaviour |
|---|---|---|
| SLA status | Derived from priority: Urgent → "At risk", otherwise "On track" | **"Not configured"** (no order SLA rule exists; V1 freeze) |
| Fulfilment % | Derived from status: Completed/Dispatched → 100, Ready → 80, In production → 40, else 0 | **`null`, displayed "—"** |

- If a future backend contract supplies either field, the mapper passes it through unchanged.
- `frontend/src/pages/order-data.test.ts` previously **asserted the fabricated SLA** (`expect(record.sla).toBe('At risk')`). It now asserts `'Not configured'` and a `null` fulfilment.
- This is a **truthfulness/contract correction, not a new business rule**. No order SLA or fulfilment rule has been defined or implemented.

### 5.3 Remaining preview / mock behaviour

| Surface | Behaviour | Classification |
|---|---|---|
| Payroll, Reports, Incentives, Audit pages | "could not be loaded" error state (no data shown) | **Unavailable: backend contract unresolved** (§1, §2) |
| Incentives page cards "Preview points" / "Active rules" | Placeholder "—". Only rendered when a list loads, which does not happen in API mode today. | Unavailable (D3) |
| Inventory location, employee depot name | "—" / raw `depot_id` | **Unavailable: backend contract** (§6) |
| Employee productivity / KPI on the employee page | "—" (KPI results are available on the KPI pages) | Unavailable on this page |
| Roles, Permissions, Scopes, Access control | Static reference rendered from the frontend role policy (`rolePermissions`), labelled preview | Labelled reference; no fabricated records. RBAC administration API **out of V1 scope** (§8.4). |
| Settings tabs other than Profile | "… is reserved" empty states, labelled preview | **Out of V1 scope** |
| Operations command view | API mode shows the "API integration unavailable" boundary | Unavailable |
| Recommendations | API mode shows "unavailable" | **Out of V1 scope** |
| "Preview action" buttons (e.g. Create task, Add item) | Open a dialog stating the action is a preview; no data shown or changed | Labelled preview |
| `pages.tsx` `LocationsPage` / `OperationsPage` | Preview components rendered **only in mock mode** by the routed wrappers in `operational-pages.tsx` (API mode shows the real Locations page or the boundary) | **Mock-mode only** |
| Dashboard mock metrics, inventory 491/252/144/3, "₹ 450", client signals, mock users, mock search, preview notifications | Still present in **mock mode** | **Mock-mode only** |

**Dead code removed.** The unrouted duplicates in `pages.tsx` were confirmed unreachable (no import, namespace import, dynamic import or test reference) and deleted:
- WarehousePage, LoadingUnloadingPage, EmployeesPage, EmployeeFormDialog, EmployeeDetailPage;
- KpisPage, KpiDetailPage;
- IncentivesPage, PayrollPage, ReportsPage, AuditPage;
- the unrouted `KpisPage`/`KpiDetailPage` in `management-pages.tsx`.

`LocationsPage` and `OperationsPage` were **kept**: they are reachable in mock mode (see above).

---

## 6. IDs shown instead of names

| Case | Current display | Safe lookup already available? | Proposal |
|---|---|---|---|
| Employee → depot (Employees list/detail) | `depot_id` UUID or "No depot assigned" | **No general endpoint.** Partial sources only: `/locations` (warehouse `{id, code, name}` per location, depot-scoped for Supervisors, so depots without locations are missing); `/kpi/depot-dashboard` `available_depots` (not for Others); `/daily-reports/options` (management write only). | **Contract gap (B):** add `depot: {id, code, name}` to `EmployeeDTO` (preferred), or implement the specified `GET /depots` (`19-final-api-specification.md`, CDR). No frontend master-data copy. |
| Inventory → location (Inventory list/detail) | "—" | `/locations` returns code and name (depot-scoped for Supervisors) | Do **not** resolve until §4.2 is decided: the balances themselves leak cross-depot stock. Afterwards, map `location_id` via `/locations` (A), or have the backend embed `{code, name}` (B). |
| Payroll / incentive ledger → employee | `employee_id` | `GET /employees/:id` (Super Admin can read all) | Backend should embed `employee {code, name}` (B). N+1 lookups are a fallback only (A). |
| Incentive ledger → task | `task_id` | `/warehouse/operations/:id` gives `task_code` | Backend should embed `task_code` (B); the frontend must not re-implement `taskDisplayCode`. |
| Audit → actor | `actorUserId` / `actorEmployeeId` | No user lookup for non-admins; `/employees/:id` is depot-scoped | Backend should embed the actor display name, respecting scope (B). |

---

## 7. Task contract issues (`/tasks` vs `/warehouse/operations`)

| Topic | Finding | Classification |
|---|---|---|
| Source | The Tasks list and detail read `/warehouse/operations` (task read model) since the populated-data audit. The raw `GET /tasks` DTO has no task code, assignee names or location names. `/tasks` stays the lifecycle/write surface. | Safe (same permission and depot scoping) |
| STARTED / RESUMED vs `IN_PROGRESS` | Documented one-way mapping (`Docs/api/warehouse-operations.md`): IN_PROGRESS → STARTED, or RESUMED when the latest start/resume event is a resume. There is no exact reverse mapping for filtering. | Terminology mismatch: **filter cannot safely map**. Today STARTED/RESUMED filters return an empty page (no request). Should be disabled in API mode, or the backend could add a timing-aware filter (B). |
| ASSIGNED, PAUSED, COMPLETED, CANCELLED | Exact one-to-one equivalents in the documented mapping | UI filter **can safely map** (implemented) |
| ACCEPTED, VERIFIED, REJECTED, REASSIGNED, REOPENED, FAILED | V1 frontend lifecycle states with **no backend state**. REOPENED exists only as a `TASK_REOPENED` event, not a status. | **Business confirmation required** (D: are these V1 states?). Until then the filter must be disabled in API mode (A). |
| Legacy display statuses (Queued, In progress, Completed, Exception) | UI-only groupings; Queued = PENDING+ASSIGNED, In progress = IN_PROGRESS+PAUSED | Filter must be disabled in API mode (A) |
| PENDING | Backend state with no lifecycle equivalent (shown as UNASSIGNED) | No filter option exists for it (A: optional addition) |
| Priority filter | Tasks have **no priority**. The display priority is the linked order's priority (or Normal). The read model has no priority filter, and the adapter drops it. | **Backend capability missing** (B), or disable the filter in API mode (A). Business: is task priority a V1 concept? (D) |
| Sort | `/warehouse/operations` ignores `sortBy`/`sortDirection` (fixed ordering) | **Backend capability missing** (B); disable sort controls in API mode (A) |
| Search | Supported (`search`) | OK |

---

## 8. Implementation changes required later (not implemented in this phase)

### 8.1 Frontend-only (owner A)

These must land **before** any backend envelope or path change (§1.1).

1. **Mappers** for `PayrollEntryDTO`, `ReportDefinitionDTO`, `IncentiveLedgerRecord` and `AuditLogEntryDTO`, using only the fields marked EXACT/MAP/CONV above. Every BE-MISSING, UNCLEAR or UNAVAILABLE field shows "—" or "Not recorded", never an invented value.
2. **Correct repository paths:** incentives → `/incentives/ledger`; audits → `/audit-logs`.
3. **Tolerate plain-array list responses** in these four repositories, or wait for §8.2 #1. Choose one; do not do both.
4. **Payroll:** add the REJECTED status. Show entry-level rows instead of the period model **only after D1 below**.
5. **Task detail:** replace the hard-coded activity timeline with the decoded `task.activity`. **Done** (§5.1).
6. **API-mode preview cleanup.** **Done** (§5.1), together with the client, order, users and settings-profile placeholders:
   - Dashboard: real `GET /dashboard` fields; remove mock KPIs (including the Quality 98.2% and On-time 91.6% figures), the mock orders, exceptions and activity, and the fixed "Today" date.
   - Inventory summary cards.
   - The Super Admin "₹ 450" card.
   - The "On track" badge.
   - The command-palette mock search.
   - The notification text.
   - The Tasks banner text.
7. **Tasks page in API mode:** disable status options with no exact backend status, plus the priority filter and sort controls (§7).
8. **Delete** the unrouted duplicate pages in `pages.tsx` and the unrouted `KpisPage`/`KpiDetailPage`. **Done** (§5.3). `LocationsPage`/`OperationsPage` kept (mock-mode previews).

### 8.2 Backend-required (owner B; handled by the backend team)

1. Adopt the documented `{success, data, meta}` envelope with paging on `GET /payroll`, `/reports`, `/incentives/ledger` and `/audit-logs`. Paging is mandatory for the audit feed.
2. Scope or omit `GET /inventory/:id` `balances` for depot-confined callers (§4.2) — or obtain the D9 business confirmation that cross-depot stock is visible.
3. Scope `GET /report-executions/:id` to the requester, management, or the depot (§4.3).
4. Embed display names where IDs are returned: `EmployeeDTO.depot {code, name}`, ledger/payroll `employee {code, name}` and `task_code`, audit actor display name. Respect existing scoping. Alternatively, implement the specified `GET /depots`.
5. Optional capabilities: `sortBy` and a timing-aware IN_PROGRESS filter on `/warehouse/operations`; `lastRun` on report definitions.

### 8.3 Business decisions (owner D)

| Ref | Decision |
|---|---|
| D1 | Payroll model for V1: per-entry incentive approval ledger (what exists) or pay-period summary (what the UI assumes); base pay in or out of scope. |
| D2 | Report catalogue: which reports, and their category, owner, schedule and status. |
| D3 | Incentive "points" and per-ledger "event": do they exist? |
| D4 | Audit: record denied attempts ("Blocked")? Record before/after values? |
| D5 | V1 task lifecycle states with no backend status (ACCEPTED, VERIFIED, REJECTED, REASSIGNED, REOPENED, FAILED). |
| D6 | Task priority as a V1 concept. |
| D7 | Report audience: backend `report:read` includes Others; the frontend blocks them. |
| D8 | Inventory stock visibility across depots (V1 freeze D9). |
| D9 | Others and the dashboard summary: own-record-only (policy A) or depot-wide summary allowed (policy B). See §4.6. |

These extend the open items in `Docs/product/v1-requirements-freeze.md`.

### 8.4 Out of V1 scope (owner F)

- Payroll disbursement / "paid" state and payout files.
- Base salary.
- Report generation content, export and scheduling.
- Notification backend.
- Incentive rule versioning UI.
- RBAC administration screens backed by an API.

---

## 9. Verification status

- **Reconciliation phase:** documentation only; no source or test file was modified.
- **API-mode truthfulness cleanup (afterwards):** frontend only.
  - No backend, schema, KPI formula, RBAC, depot isolation, incentive/payroll authorization or business-rule change.
  - One existing assertion was corrected because it asserted a fabricated value (§5.2).
- **Current test baseline** (last full run, 2026-10-02):

| Check | Result |
|---|---|
| Backend unit tests | 201/201 |
| Backend integration tests | 250/250 |
| Frontend tests | 391/391 |
| Typecheck | Clean |
| Lint | 0 errors (6 existing warnings) |
| Frontend production build | Passing |

- **Production:** no Neon/production data was accessed.
- **No crash-fix was required:** none of the four areas currently crashes. They all fail safely to an error state; the sequencing hazard in §1.1 is the condition under which they would crash.
- **Still open:** the four contract gaps (Payroll, Reports, Incentives, Audit), and the backend security findings §4.2 (`GET /inventory/:id` cross-depot stock exposure) and §4.3 (`GET /report-executions/:id` missing ownership/depot scoping). **Neither security finding is fixed.**
