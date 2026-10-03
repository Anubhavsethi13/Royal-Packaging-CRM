# Royal Packaging Warehouse KPI CRM: V1 requirements freeze

**Purpose:** a decision sheet for the business owner. It states what V1 does today, what can be adjusted without development, what is waiting for a business decision, and what is outside V1.

**Status date:** 2026-10-02.

**Sources:**
- the repository's current implementation and automated tests;
- `Docs/product/warehouse-kpi-transformation.md`;
- `Docs/api/kpi-results.md`.

> Nothing in this sheet invents a business rule. Where the system needs a rule the business has not given, it shows **"Not configured"** or refuses the action, rather than guessing.

**How to read this sheet:**

| Section | Meaning |
|---|---|
| 1. Implemented and verified | Built and covered by automated tests. No decision needed. |
| 2. Implemented, business-configurable | Built. The business can adjust values (data or settings) without a new rule. |
| 3. Not implemented: business decision required | Development waits on an answer from the business owner. |
| 4. Out of V1 scope | Deliberately not part of V1. |

---

## 1. Implemented and verified

### 1.1 Roles and access

| # | Behaviour | Status | Evidence (tests) |
|---|---|---|---|
| 1 | Role hierarchy **Super Admin → Admin → Accountant → Supervisor → Others** (Others = existing `EMPLOYEE` code; legacy `MAIN_ADMIN` acts as Admin, `MANAGER` acts as Supervisor). | Verified | `rbac-authority.test.ts`, `incentive-rbac-integration.test.ts`, `frontend/src/app/incentive-rbac.test.ts` |
| 2 | Super Admin has organisation-wide access to every module, depot and record, including incentives and payroll. **Two existing exceptions apply** (see the note below this table). | Verified, with exceptions | `rbac-authority.test.ts`, `depot-isolation-integration.test.ts` |
| 3 | **Incentives are strictly Super Admin only.** This covers configuration, calculation, history, records, approval, KOT and penalties. Every other role gets 403, and anonymous callers get 401. | Verified | `incentive-rbac-integration.test.ts` IR-1 to IR-8, `incentive-surfaces.test.tsx` |
| 4 | **Payroll is currently Super Admin only**, because each payroll entry is a copy of an approved incentive amount (see decision D11). | Verified | same as above |
| 5 | **KPI configuration is Admin and Super Admin only.** Supervisor, Accountant and Others are refused. | Verified | `kpi-configuration-integration.test.ts`, `supervisor-integration-audit.test.ts` |
| 6 | The Accountant is read-only and organisation-wide: dashboard, reports, KPI results, warehouse, tasks, employees, daily reports and audit. The Accountant cannot write, configure KPIs or see incentives. | Verified | `incentive-rbac-integration.test.ts` (Accountant matrix), `depot-isolation-integration.test.ts` |
| 7 | Others see their own assigned tasks, own profile, own shifts and own KPI results only. | Verified | `depot-isolation-integration.test.ts` |

**Exceptions to "unrestricted" Super Admin access.** Both are pre-existing, tested rules and are reported, not changed:
- **Pause and resume of a task:** Super Admin (like Admin) may pause or resume only a task they are personally assigned to. Only a Supervisor has override authority on any task (`postgres-integration.test.ts`, `rbac-authority.test.ts`). See decision D13.
- **Layer photos:** a photo is always recorded against the uploader's own employee profile. A Super Admin account with no employee profile cannot upload one (403 `EMPLOYEE_PROFILE_REQUIRED`). This follows from 1.3 #13.

### 1.2 Depot isolation (server-side)

| # | Behaviour | Status | Evidence |
|---|---|---|---|
| 8 | A Supervisor is restricted **on the server** to the depot of their own employee profile. The browser cannot widen this: depot IDs, employee IDs, location IDs and warehouse codes for another depot in the body, query or URL are refused with 403 `DEPOT_FORBIDDEN`, and nothing is changed. | Verified | `depot-isolation-integration.test.ts` (14 tests, Supervisor A ↔ B both ways) |
| 9 | Supervisor access to **tasks** (read, create, assign, lifecycle, movements, quality, photos), **daily reports**, **KPI** (results, summary, snapshots, depot dashboard), employees, warehouse operations, locations, dashboard and audit cannot cross the depot boundary. | Verified | same, plus `depot-dashboard-integration.test.ts`, `daily-report-integration.test.ts` |
| 10 | Admin, Super Admin and Accountant keep organisation-wide reach. | Verified | same |
| 11 | A Supervisor with no depot assigned is refused on every depot route (403 `DEPOT_ASSIGNMENT_REQUIRED`). See decision D5. | Verified | same |

### 1.3 Evidence and photo identity

| # | Behaviour | Status | Evidence |
|---|---|---|---|
| 12 | **Photo capturer identity comes from the logged-in user's own employee profile** (session → user → active employee). | Verified | `photo-identity-integration.test.ts` PH-1 to PH-5, `api-application.test.ts` test 10 |
| 13 | A client-supplied `captured_by_employee_id` **cannot impersonate another employee**: any value other than the caller's own is refused (403) and nothing is written. This applies to Supervisors too. | Verified | same |
| 14 | The existing task lifecycle (create → assign → start → pause/resume → complete → cancel/reopen, with task events) and the evidence architecture (`quality_records`, `task_photos`) are **preserved unchanged**. | Verified | full existing suites still pass (§6) |
| 15 | **No duplicate task or inventory architecture.** The only new storage since the existing design is the daily depot report (migration 016: report, vehicle counts, report audit events). It reuses depots, employees and truck types. | Verified | migration list `001`–`016`; code review |

### 1.4 KPI source data and calculations

| # | Behaviour | Status | Evidence |
|---|---|---|---|
| 16 | **Registered operational tasks are the source records for KPI.** A KPI exists only from completed LOADING/UNLOADING tasks and their recorded events; no KPI figure is typed in by hand. | Verified | `kpi-results-integration.test.ts`, `depot-dashboard-integration.test.ts` DD-7 |
| 17 | **BOX is the operational quantity unit for V1** (`completed_box_quantity`; KPI unit `BOX`). | Verified | `kpi-results-contracts.test.ts`, DD-7 |
| 18 | **Daily depot reports are structured data, not free text**: loading and unloading counts, vehicles per truck type, labour required and present, start and end time, Draft → Submitted. | Verified | `daily-report-integration.test.ts`, `daily-report-contracts.test.ts` |
| 19 | **Derived values are always calculated from stored fields, never accepted from the client**: total operations = loading + unloading; duration = end − start; attendance = present ÷ required; task time = recorded active time (pauses excluded); a BOX share is equal between the people assigned at completion. | Verified | same, plus DD-7 |
| 20 | **Every KPI dashboard value traces back to source records.** An independent test re-derives every dashboard figure from raw database rows over two days and matches it. In the app, a figure leads to the employee row, then the source tasks, then the task record; a daily report leads to its registered tasks. | Verified | DD-7, `frontend/src/kpi/depot-dashboard.test.tsx` |
| 21 | **SLA and Quality show "Not configured"** in every API response and screen. No number and no placeholder formula is shown. | Verified | `depot-dashboard-integration.test.ts`, `depot-dashboard.test.tsx` |

### 1.5 Incentive and payroll containment

| # | Behaviour | Status | Evidence |
|---|---|---|---|
| 22 | **Incentive and payroll information does not leak** through ordinary read endpoints. Every role other than Super Admin was scanned on employees (including search), tasks, KPI results, summary and snapshots, the depot dashboard, warehouse, daily reports, reports, resync, the dashboard and audit: no incentive or payroll field and no ledger ID was found. | Verified | IR-5, IR-6, IR-8; `analytics-integration.test.ts` AN6 |
| 23 | In the app, the Incentives and Payroll menu items, routes, direct URLs and the employee page incentive and payroll cards appear only for Super Admin. | Verified | `incentive-rbac.test.ts`, `incentive-surfaces.test.tsx` |

---

## 2. Implemented, business-configurable

These work today. The business can change the **values** without a new business rule. Where V1 has no editing screen, the value is set by the administrator or development team as data (database or seed), and this is stated.

| Item | What can be configured | How in V1 |
|---|---|---|
| User roles | Which user holds which role. | Administration (Super Admin / Admin). |
| Supervisor ↔ depot | A supervisor's depot is their employee profile's depot. | Employee record (`depot` field). |
| Depots, employees, truck types | Master data used by tasks and daily reports. | Existing master data. |
| KPI definitions | Which of the seeded KPIs are active: BOXES_HANDLED, LOADING_BOXES, UNLOADING_BOXES, TASKS_COMPLETED, TASK_TIME, LOADING_TIME, UNLOADING_TIME, AVERAGE_BOXES_PER_TASK. | Viewable by Admin and Super Admin (read-only screen); activation is set as data. |
| KPI targets and thresholds | Target, warning and critical values per KPI, per depot or organisation-wide, with effective dates. Shown next to KPI results. | `kpi_targets` data. **No editing screen in V1** (the KPI configuration API is read-only). |
| Operational day | The timezone that decides which day a task "belongs to" (`OPERATIONS_TIMEZONE`, e.g. Asia/Kolkata). | Server setting. |
| Incentive rules | Existing incentive rules, KOT and penalties. | Super Admin only; unchanged in V1. |

**Assumptions in force (confirm or change).** V1 runs on these. Changing one changes KPI numbers but needs no new design:

| Assumption | Current V1 behaviour | Reference |
|---|---|---|
| Rounding | 2 decimals, half-up, exact arithmetic. | `Docs/api/kpi-results.md` |
| Loading/unloading classification | A task's type is mapped to Loading or Unloading by a list of synonyms. | `TASK_TYPE_OPERATION_SYNONYMS` |
| Shared task credit | BOX is split **equally** between the people assigned. This is a confirmed business rule, carried over from incentives. | `17-approved-business-rules.md` |

---

## 3. Not implemented: business decision required

Each decision lists what the system does **today** (a safe default) and exactly what the business owner must tell us. "Changes" columns show what the answer would affect in development.

### D1. SLA formula and target rules

| | |
|---|---|
| **Why it matters** | SLA is a headline KPI on the depot dashboard. Without a rule, every SLA figure is "Not configured". |
| **Current behaviour** | Always **Not configured**; no number is shown. The calculation slots (`LOADING_SLA_COMPLIANCE`, `UNLOADING_SLA_COMPLIANCE`) exist but are inactive. |
| **Possible business choices** | (a) Fixed target time per operation (Loading / Unloading). (b) Target per operation **and** vehicle type (32FT, Crossing, Other). (c) Target that scales with BOX quantity. (d) Different targets per depot. Clock: from task registration, from start, or active working time only (pauses excluded). |
| **Exact information required** | 1. Target time for Loading and for Unloading (and per vehicle type or BOX band, if different). 2. Which clock is measured. 3. Which tasks count (e.g. are cancelled or reopened tasks excluded?). 4. Compliance formula, e.g. "tasks within target ÷ eligible completed tasks × 100", and the pass threshold (e.g. 95%). 5. Same targets for all depots or per depot? 6. Credited to the depot only, or to each employee too? |
| **Database schema change** | **Yes**: a small table for target times (per operation / vehicle type / depot). Compliance targets can reuse `kpi_targets`. |
| **API contract change** | Additive only: the existing `sla` fields change from `NOT_CONFIGURED` to a value. No breaking change. |
| **Frontend change** | Small: the dashboard already has SLA slots; target-time configuration needs a screen if the business wants to edit it. |
| **KPI calculation change** | **Yes**: a new SLA calculation, using the existing engine. |

### D2. Quality formula and target rules

| | |
|---|---|
| **Why it matters** | Quality is a headline KPI. Inspection data already exists (pass/fail outcome, damage rate, quality score), but no rule says how it becomes a KPI. |
| **Current behaviour** | Always **Not configured**. Inspections are still recorded and listed. |
| **Possible business choices** | (a) Pass rate = passed inspections ÷ inspections. (b) Average damage rate. (c) Average quality score. (d) A combination. Attribution: depot only; every assigned employee equally; or the inspected task's assignees only. |
| **Exact information required** | 1. Which measure (pass rate, damage rate, score). 2. Which inspections count (all, or final only). 3. Whether tasks without an inspection are excluded or counted as passed or failed. 4. How quality is credited to employees on a shared task. 5. Target and pass threshold, per depot or organisation-wide. |
| **Database schema change** | Likely **no**: targets can reuse `kpi_targets`, and source data exists. |
| **API contract change** | Additive only (`quality` fields gain values). |
| **Frontend change** | Minimal; the slots exist. |
| **KPI calculation change** | **Yes**: a new Quality calculation, using the existing engine. |

### D3. Daily report approval authority

| | |
|---|---|
| **Why it matters** | Decides whether a submitted report is final, or needs sign-off before it is trusted for KPI and attendance. |
| **Current behaviour** | Draft → **Submitted → read-only**. No one approves. The approval columns (`approved_at`, `approved_by_user_id`) exist but are unused. |
| **Possible business choices** | (a) No approval: submitted is final (today). (b) Admin approves. (c) Accountant approves. (d) Super Admin approves. Scope: all depots, or only assigned depots. |
| **Exact information required** | 1. Which role(s) approve. 2. For which depots. 3. May the person who submitted also approve (self-approval)? 4. Is there a deadline (e.g. by next day)? 5. Should KPI and attendance figures use only approved reports, or submitted ones too? |
| **Database schema change** | **Yes**: the report status rule must allow new states (e.g. APPROVED). The columns already exist. |
| **API contract change** | **Yes**: a new approve action and new status values. |
| **Frontend change** | **Yes**: approve button and status display. |
| **KPI calculation change** | Only if the answer to Q5 is "approved only" (labour and attendance figures would then exclude unapproved reports). |

### D4. Rejection, reopen and correction workflow

| | |
|---|---|
| **Why it matters** | Mistakes in a submitted report currently cannot be fixed in the app. |
| **Current behaviour** | A submitted report cannot be edited, rejected or reopened. |
| **Possible business choices** | (a) Reject back to Draft with a mandatory reason. (b) Reopen by an authorised role. (c) Corrections as a new version that keeps the original. (d) Direct edit with an audit record of before and after values. |
| **Exact information required** | 1. Who may reject, and whether a reason is mandatory. 2. Who may reopen a submitted or an approved report, and until when. 3. Correction method: edit in place (with audit) or new version. 4. Must the supervisor be notified? 5. What the KPI shows while a report is reopened. |
| **Database schema change** | **Yes**: new statuses and possibly a reason or version field. |
| **API contract change** | **Yes**: reject, reopen and correct actions. |
| **Frontend change** | **Yes**. |
| **KPI calculation change** | Possibly, depending on Q5. |

### D5. Supervisor without a depot

| | |
|---|---|
| **Why it matters** | A supervisor account without a depot cannot do any depot work. |
| **Current behaviour** | Refused on every depot screen and action (403 `DEPOT_ASSIGNMENT_REQUIRED`). This is the safe default. |
| **Possible business choices** | (a) Keep refusing: every supervisor must have a depot (recommended to confirm). (b) Allow read-only access to all depots. (c) Prevent saving a supervisor without a depot. |
| **Exact information required** | 1. Confirm a supervisor must always be assigned to a depot. 2. If not, what such a supervisor may see or do. |
| **Database schema change** | No. |
| **API contract change** | No for (a). Small for (b) or (c) (validation on user and employee setup). |
| **Frontend change** | Possibly a clearer "no depot assigned" message, or setup validation. |
| **KPI calculation change** | No. |

### D6. Supervisor responsible for several depots

| | |
|---|---|
| **Why it matters** | V1 links each employee, and so each supervisor, to exactly one depot. |
| **Current behaviour** | One depot per supervisor. Covering a second depot requires changing their depot or using an Admin account. |
| **Possible business choices** | (a) Keep one depot per supervisor. (b) Allow a list of depots per supervisor. (c) Temporary cover (e.g. leave) with start and end dates. |
| **Exact information required** | 1. Does any supervisor manage more than one depot, permanently or temporarily? 2. If so, can they act in all of them, or read some and write one? 3. For the dashboard: one combined view or one depot at a time? |
| **Database schema change** | **Yes** for (b) or (c): a supervisor ↔ depot mapping table. |
| **API contract change** | **Yes**: depot selection for supervisors; the access rules widen to a list. |
| **Frontend change** | **Yes**: depot picker for supervisors. |
| **KPI calculation change** | No (per-depot figures stay the same). |

### D7. Tasks without a depot

| | |
|---|---|
| **Why it matters** | A task with no depot appears in no depot's KPI and no supervisor's list. |
| **Current behaviour** | Supervisors always create tasks in their own depot. Admins can still create a task without a depot. Such tasks are hidden from supervisors and are not counted in any depot's dashboard, though they still count in organisation-wide figures. |
| **Possible business choices** | (a) Depot is mandatory for every operational task. (b) Allowed, but shown in an "Unassigned depot" bucket for Admin. (c) Allowed only for non-operational task types. |
| **Exact information required** | 1. Must every Loading or Unloading task belong to a depot? 2. What should happen to existing depotless tasks (if any): assign a depot or leave them as they are? |
| **Database schema change** | Optional: for (a), the column can be made mandatory once existing data is cleaned. Validation alone needs no schema change. |
| **API contract change** | Yes for (a): depot becomes required on task creation for Admin too. |
| **Frontend change** | Small (required field). |
| **KPI calculation change** | No formula change; depotless tasks would start appearing in depot figures once they are assigned a depot. |

### D8. Employee working across depots

| | |
|---|---|
| **Why it matters** | It decides whose dashboard shows the work when an employee of Depot A helps on a Depot B task. |
| **Current behaviour** | Supervisors can assign only their own depot's employees. Admins can assign anyone. On a depot's dashboard: **depot totals** (tasks, BOX, time) include every task of that depot; **per-employee rows** include only that depot's own employees. A Depot A employee's share of a Depot B task therefore appears in **neither** depot's employee table, although it is in Depot B's totals. It **does** appear in that employee's personal KPI results. |
| **Possible business choices** | (a) Keep: the employee table shows home-depot staff only. (b) Credit the work to the depot where the task happened (show visiting staff in Depot B's table). (c) Credit to the employee's home depot. (d) Forbid cross-depot assignment entirely. |
| **Exact information required** | 1. Does cross-depot work happen in practice? 2. If yes, in which depot's employee table should the employee's share appear? 3. Should Supervisor B be allowed to assign Depot A staff (borrowing)? |
| **Database schema change** | No (unless D6-style borrowing records are wanted). |
| **API contract change** | No breaking change; dashboard rows may include visiting staff. |
| **Frontend change** | Possibly a "visiting" label. |
| **KPI calculation change** | **Yes** for (b) or (c): the depot filter on employee rows changes. |

### D9. Inventory catalogue scope

| | |
|---|---|
| **Why it matters** | It decides whether supervisors see the whole organisation's product list or only their depot's. |
| **Current behaviour** | The **catalogue** (item list) is organisation-wide for all roles. **Stock balances and movements** are depot-restricted for supervisors. |
| **Possible business choices** | (a) Keep: shared catalogue, per-depot stock. (b) Supervisors see only items stocked in their depot. (c) Separate catalogue per depot. |
| **Exact information required** | 1. Is the product list the same across depots? 2. Is the product list itself confidential between depots? |
| **Database schema change** | No for (a) or (b). **Yes** for (c). |
| **API contract change** | Only for (b) or (c) (filtered catalogue). |
| **Frontend change** | Only for (b) or (c). |
| **KPI calculation change** | No. |

### D10. "Own actions" audit view for Others

| | |
|---|---|
| **Why it matters** | Staff may want to see their own activity history (tasks started, completed, photos). |
| **Current behaviour** | Others have **no** audit access. Their task history is visible to their supervisor, Admin and Accountant. |
| **Possible business choices** | (a) Keep: no audit view for Others. (b) A read-only "My activity" view of their own actions only. |
| **Exact information required** | 1. Should Others see their own history? 2. Which events (task actions, photos, shift entries)? 3. How far back? |
| **Database schema change** | No. |
| **API contract change** | Yes for (b): a new "own events" filter or endpoint. |
| **Frontend change** | Yes for (b): a new page or tab. |
| **KPI calculation change** | No. |

### D11. Payroll visibility

| | |
|---|---|
| **Why it matters** | Payroll entries are copies of approved incentive amounts, so showing payroll reveals incentives. |
| **Current behaviour** | **Super Admin only**, consistent with the Super Admin-only incentive rule. Earlier, Admin and Accountant had payroll access; this was removed. |
| **Possible business choices** | (a) Keep Super Admin only. (b) Allow the Accountant to see payroll **including** incentive amounts (this would break the "incentives Super Admin only" rule, so it needs explicit approval). (c) Allow the Accountant a payroll view **without** incentive amounts (needs a payroll redesign, which is out of V1). |
| **Exact information required** | 1. Confirm payroll stays Super Admin only for V1. 2. If not, which role, and whether it may see incentive amounts. |
| **Database schema change** | No for (a) or (b). Likely for (c). |
| **API contract change** | No for (a). Access-rule change for (b). New contract for (c). |
| **Frontend change** | No for (a). Menu access for (b). New screen for (c). |
| **KPI calculation change** | No. |

### D12. KPI result → incentive participant cutoff

| | |
|---|---|
| **Why it matters** | KPI and incentives must credit the same people for the same task; today they can disagree in one rare case. |
| **Current behaviour** | **KPI** credits employees assigned **at the moment the task was completed**. The existing **incentive** calculation credits employees still assigned **when the incentive is calculated**. They differ only if someone is unassigned **after** completion (the system currently allows this). |
| **Possible business choices** | (a) The "assigned at completion" rule is authoritative for both. (b) The "assigned at calculation" rule is authoritative for both. (c) Block unassigning after completion, so the two always agree. |
| **Exact information required** | 1. Which moment decides who gets credit for a task. 2. May anyone be removed from a task after it is completed? |
| **Database schema change** | No. |
| **API contract change** | No for (a) or (b). For (c), unassigning a completed task returns an error. |
| **Frontend change** | Minor (error message for (c)). |
| **KPI calculation change** | Only for (b). (An incentive calculation change is out of V1 scope; see §4.) |

### Additional decisions found during this audit

| Ref | Decision | Current behaviour | Information required | Schema / API / Frontend / KPI change |
|---|---|---|---|---|
| D13 | Super Admin and Admin pause or resume on any task | Only a Supervisor may pause or resume any task. Super Admin and Admin may do so only on a task they are assigned to. This is a pre-existing, tested rule and conflicts with "Super Admin unrestricted". | Should Super Admin (and Admin) have override authority to pause and resume any task? | No / No (rule only) / No / No |
| D14 | Rounding of KPI values | 2 decimals, half-up. | Confirm, or give the rule (e.g. whole BOX). | No / No / No / Yes (values only) |
| D15 | Collaborator attribution | Only assigned employees are credited. Helpers who were not assigned get no KPI credit. | Should unassigned helpers ever be credited, and how would they be recorded? | Likely yes / Yes / Yes / Yes |
| D16 | Editing KPI targets in the app | Targets are viewable, but are set as data (no editing screen). | Is an editing screen needed for V1, and who may use it (Admin / Super Admin)? | No / Yes / Yes / No |

---

## 4. Out of V1 scope

These are deliberately **not** part of V1 and have not been started:

- New incentive implementation or changes to incentive calculation.
- Payroll redesign (including a payroll view without incentive amounts).
- AI recommendation system.
- Real-time (live push) architecture.
- Depot-to-depot comparison views.
- Export system (Excel/PDF exports beyond existing reports).
- Daily report approval, SLA and Quality **until** D1–D4 are answered. After that they move into V1 work, as listed in §5.

---

## 5. Recommended order for obtaining answers

| Order | Decisions | Reason |
|---|---|---|
| 1 | D11 payroll visibility; D13 Super Admin pause and resume | Yes/no confirmations of access rules; quick to answer. |
| 2 | D5, D6, D7, D8 (depots and people) | They define who is counted where. They must be settled before SLA and Quality, which are reported per depot and employee. |
| 3 | D12 participant cutoff; D14 rounding | They fix the base numbers that SLA, Quality and incentives build on. |
| 4 | D1 SLA, D2 Quality | Largest KPI decisions; they need the targets. |
| 5 | D3 approval, D4 rejection and correction | Answer together, as one workflow. Also says whether KPIs use approved reports only. |
| 6 | D9 catalogue, D10 own-actions audit, D15 collaborators, D16 target editing | Lower impact; can follow V1 if needed. |

## 6. Next implementation phases (after the freeze)

1. **Access-rule confirmations** (D5, D7, D11, D12(c), D13): small rule and validation changes plus tests. No new tables, except a data clean-up if depotless tasks exist.
2. **Depot model** (D6, D8): supervisor ↔ depot mapping if required; depot attribution of employee rows.
3. **SLA** (D1): target-time configuration table, SLA calculation in the existing KPI engine, dashboard values, tests against source records.
4. **Quality** (D2): Quality calculation from existing inspection records, targets via `kpi_targets`, dashboard values, tests.
5. **Daily report approval and correction** (D3, D4): new statuses, actions, audit events, screens and tests.
6. **Optional** (D9, D10, D15, D16), as approved.

Each phase keeps the existing rules: server-side depot isolation, Super Admin-only incentives, no client-supplied identity, KPI from source records, and full regression tests.

## 7. Verification status (2026-10-02)

| Check | Result |
|---|---|
| Backend unit tests | 201 / 201 passing |
| Backend integration tests (local scratch PostgreSQL) | 250 / 250 passing |
| Frontend tests | 363 / 363 passing |
| Typecheck (backend and frontend) | Clean |
| Lint | 0 errors (6 existing non-blocking warnings) |
| Frontend production build | Passing |

**Note on the previous 4 failures (ISO-4 supA and supB, ISO-7, ISO-9 in `depot-isolation-integration.test.ts`), found during this audit and since fixed:**
- **Cause:** the test used the **UTC** date as "today" (`new Date().toISOString().slice(0, 10)`) instead of the operational date in `OPERATIONS_TIMEZONE` (Asia/Kolkata). The application, correctly, assigns tasks to the operational date.
- **When it failed:** between 18:30 and 24:00 UTC (00:00–05:30 IST) the two dates differ. The audit run took place at 22:31 UTC, which is 04:01 IST on 2 October. The test then asked for the wrong day and found no KPI rows. This was a test-only defect, not an application defect.
- **Fix applied:** the test now derives "today" with the application's own `localDate` helper and the operational timezone. No assertion was weakened or removed.
- **Fix verified:**
  - **Corrected test:** with the clock simulated at 22:31 UTC (the mismatch window), all 14 depot-isolation tests pass.
  - **Old UTC version:** reproduced separately under the same simulated clock, it fails the same 4 tests (10 / 14 pass), which confirms the diagnosis.
  - **Full suite:** the complete backend integration suite now passes 250 / 250.

These results are from local automated tests. They are **not** a verification of the production deployment or production data.
