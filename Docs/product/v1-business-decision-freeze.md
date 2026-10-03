# V1 Business Decision Freeze

**Status date:** 2026-10-02. **Updated 2026-10-03:** Group 1 decisions and the organizational clarification recorded (§3.4). **Corrected 2026-10-03:** D7, D8 and D10 now record the business meaning (§3.4.4). **Added 2026-10-03:** Supervisor daily report model, OR-1 to OR-9 (§3.5), and the organizational summary (§3.6).

**Scope:** documentation only. No code, test, API, schema, RBAC, KPI formula, incentive/payroll logic or production data was changed to produce this document.

## 1. Purpose

This document consolidates every **unresolved product/business decision** currently identified in the project documentation. It is meant to be read **before** the V1 API contract freeze and the backend reconciliation work.

Apart from the **Group 1 decisions** recorded by the business/product owner on 2026-10-03 (§3.4), it does **not** decide anything and does **not** introduce new rules. Each entry restates what the existing documents say, the options they already list, and the answer needed from the business/product owner. Where the documents are silent, this document says **"Not specified in the current documentation."**

### Two decision-numbering series exist (read this first)

The project documents use **two independent "D" numbering series that collide**:

| Series | Source | Range | Example of the collision |
|---|---|---|---|
| **Requirements series** | `Docs/product/v1-requirements-freeze.md` §3 | **D1–D16** | D9 = *Inventory catalogue scope* |
| **Reconciliation series** | `Docs/integration/frontend-backend-contract-reconciliation.md` §8.3 (and §4.6) | **D1–D9** | D9 = *Others and the dashboard summary* |

**Handling in this document:**
- **D1–D16 below are the requirements series**, unchanged. It is the only series that runs D1 to D16.
- The reconciliation series is reproduced in full in §4.2, **labelled RC-D1 to RC-D9**. The `RC-` prefix is added here only to keep the two series apart; the source document numbers them D1–D9.
- No item was renumbered, merged or dropped.
- The business/product owner should agree on a single numbering before the decisions are recorded as answered (see §8.2). The Group 1 decisions (§3.4) are recorded against the IDs used in this document (D# = requirements series, RC-D# = reconciliation series).

## 2. Decision status legend

| Status | Meaning |
|---|---|
| **OPEN** | No decision recorded. The system runs on the documented current behaviour (a safe default or an assumption). |
| **DECIDED** | A decision is recorded in the project documentation, including the business/product owner decisions recorded in this document (§3.4). |
| **DECIDED WITH OPEN SUB-DECISION** | The main decision is recorded; a named sub-decision is still open and is listed with the decision. |
| **DEFERRED** | Explicitly postponed by the documentation to after V1, with the current behaviour kept. |
| **OUT OF V1** | Explicitly excluded from V1 by the documentation. |

---

## 3. Decision register

### 3.1 Requirements series (`v1-requirements-freeze.md`)

| ID | Area | Decision | Status | Decision required |
|---|---|---|---|---|
| D1 | KPI: SLA | SLA formula and target rules | OPEN | Target times, clock, eligible tasks, compliance formula and threshold, depot scope, attribution |
| D2 | KPI: Quality | Quality formula and target rules | OPEN | Measure, eligible inspections, tasks without inspection, shared-task attribution, target |
| D3 | Daily reports | Daily report approval authority | OPEN | Approver role(s), depot scope, self-approval, deadline, whether KPIs use approved reports only |
| D4 | Daily reports | Rejection, reopen and correction workflow | OPEN | Who rejects/reopens and until when, correction method, notification, KPI while reopened |
| D5 | Supervisor scope | Supervisor depot assignment (source title: "Supervisor without a depot") | **DECIDED** | — Supervisors are not assigned to any one specific depot; organization-wide task scope (§3.4) |
| D6 | Supervisor scope | Supervisor depot model (source title: "Supervisor responsible for several depots") | **DECIDED** | — No fixed Supervisor → Depot assignment (§3.4) |
| D7 | Tasks / depots | Tasks without a depot | **DECIDED WITH OPEN SUB-DECISION** | Decided: depotless tasks are allowed. **Open:** how depotless tasks are represented and counted in depot-specific KPI, dashboard and reporting views |
| D8 | KPI attribution | Employee working across depots | **DECIDED WITH OPEN SUB-DECISION** | Decided: cross-depot employee/task work is allowed. **Open:** which depot's employee table shows a cross-depot contribution |
| D9 | Inventory | Inventory catalogue scope | OPEN | Same product list across depots? Is it confidential between depots? |
| D10 | Audit / Others | "Own actions" audit view for Others | **DECIDED** | — Others may view their own recorded actions only (§3.4). Event types and history period: open details |
| D11 | Payroll access | Payroll visibility | **DECIDED** | — Super Admin only; Admin, Accountant, Supervisor and Others: no (§3.4) |
| D12 | KPI / incentives | KPI result → incentive participant cutoff | OPEN | Which moment decides task credit; whether removal after completion is allowed |
| D13 | Task authority | Super Admin and Admin pause or resume on any task | **DECIDED** | — Keep the current rule; no global Admin/Super Admin override (§3.4) |
| D14 | KPI calculation | Rounding of KPI values | OPEN | Confirm 2 decimals half-up, or give the rule |
| D15 | KPI attribution | Collaborator attribution | OPEN | Whether unassigned helpers are ever credited, and how they are recorded |
| D16 | KPI configuration | Editing KPI targets in the app | OPEN | Whether an editing screen is needed in V1, and for which role |

### 3.2 Reconciliation series (`frontend-backend-contract-reconciliation.md`)

| ID (source ID) | Area | Decision | Status | Decision required |
|---|---|---|---|---|
| RC-D1 (D1) | Payroll | Payroll model for V1 | OPEN | Per-entry incentive approval ledger or pay-period summary; base pay in or out |
| RC-D2 (D2) | Reports | Report catalogue | OPEN | Which reports, and their category, owner, schedule and status |
| RC-D3 (D3) | Incentives | Incentive "points" and per-ledger "event" | OPEN | Whether these exist |
| RC-D4 (D4) | Audit | Denied attempts and before/after values | OPEN | Record denied attempts ("Blocked")? Record before/after values? |
| RC-D5 (D5) | Tasks | V1 task lifecycle states with no backend status | OPEN | Whether ACCEPTED, VERIFIED, REJECTED, REASSIGNED, REOPENED, FAILED are V1 states |
| RC-D6 (D6) | Tasks | Task priority as a V1 concept | OPEN | Whether tasks have a priority |
| RC-D7 (D7) | Reports access | Report audience | OPEN | Whether Others may read reports |
| RC-D8 (D8) | Inventory access | Inventory stock visibility across depots | **DECIDED** | — Supervisors may view organization-wide/cross-depot stock; not extended to Others (§3.4) |
| RC-D9 (D9) | Dashboard / Others | Others and the dashboard summary | **DECIDED** | — Others may see depot-level dashboard summary information; not organization-wide (§3.4) |

### 3.3 Where the requested areas are recorded

| Area named in the request | Where it is recorded |
|---|---|
| Payroll model | RC-D1 |
| Reports catalogue | RC-D2 |
| Incentive points/events | RC-D3 |
| Audit before/after values and denied attempts | RC-D4 |
| Task states | RC-D5 |
| Task priority | RC-D6 |
| Report audience | RC-D7 |
| Supervisor stock visibility | RC-D8, **DECIDED** (overlaps D9, still OPEN; see §8.2) |
| KPI/incentive participant cutoff | D12 |
| Task credit / collaborator behaviour | D15 |
| BOX split and rounding | **BOX split: DECIDED** (equal split, confirmed business rule; see note under D14). **Rounding: D14, OPEN.** |
| Super Admin/Admin task pause/resume override | D13, **DECIDED** (keep the current rule) |
| KPI target editing | D16 |
| Others Dashboard | RC-D9, **DECIDED** |

### 3.4 Group 1: recorded decisions (business/product owner, 2026-10-03)

#### 3.4.1 Organizational hierarchy (canonical organizational/reporting hierarchy)

```
                     SUPER ADMIN
                          │
                        ADMIN
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
     SUPERVISOR       ACCOUNTANT        OTHERS
```

- **Admin is the operational manager for Supervisors, Accountants, and Others.**
- Supervisor, Accountant and Others are **parallel** under Admin. None of them is subordinate to another.
- Supervisor is **not** the operational manager of Others, and Others do **not** report to a Supervisor.

#### 3.4.2 Operational task scope (not organizational hierarchy)

```
SUPERVISOR
│
├── Task → Depot A
├── Task → Depot B
└── Task → Depot C
```

- Supervisors are **not** assigned to any one specific depot.
- A Supervisor has **organization-wide operational task scope**: they may handle and report tasks belonging to any of the organization's depots.
- **The depot is a property of the task** (the task's context), not of the Supervisor.

#### 3.4.3 Separation of concepts

> **Organizational hierarchy, RBAC hierarchy, and operational task scope are separate concepts. A role's operational access must not be inferred solely from organizational reporting lines.**

The hierarchy above creates **no new permission**. In particular, it must **not** be read as meaning that:
- Supervisor can manage Others;
- Accountant can manage Others;
- Others can manage tasks;
- Admin automatically receives every possible permission.

Permissions continue to come only from the documented RBAC rules (`v1-requirements-freeze.md` §1.1; `warehouse-kpi-transformation.md` §1–§3).

#### 3.4.4 Decisions recorded (business meaning)

> **About letter labels.** The conversational A/B labels used during decision collection were temporary labels and must not be confused with the lettered options in the original requirements document. The decisions below are recorded by their **business meaning**. Where a source-document option letter is mentioned in §4, it refers only to `v1-requirements-freeze.md`.

| ID | Status | Decision (business meaning) |
|---|---|---|
| D5 | **DECIDED** | Supervisors are not assigned to any one specific depot. They operate across organization-wide operational tasks, and each task carries its own depot context. Admin is the operational manager for Supervisors, Accountants and Others. Supervisor is **not** the manager of Others. |
| D6 | **DECIDED** | There is no fixed Supervisor → Depot assignment. Supervisor operational scope is organization-wide task scope. This is **not** a Supervisor managing a list of assigned depots. |
| D7 | **DECIDED WITH OPEN SUB-DECISION** | **Decided:** depotless tasks are allowed. A depot is **not** mandatory. **Open sub-decision:** how should depotless tasks be represented and counted in depot-specific KPI, dashboard and reporting views? No "Unassigned depot" bucket has been decided. |
| D8 | **DECIDED WITH OPEN SUB-DECISION** | **Decided:** cross-depot employee/task work is allowed. Example: an employee associated with Depot A may work on a task belonging to Depot B. Cross-depot assignment is **not** forbidden. **Open sub-decision:** when an employee from Depot A works on a Depot B task, which depot's employee table should display that employee's KPI/task contribution? Neither home-depot nor task-depot attribution has been chosen. |
| D10 | **DECIDED** | Others may view their own recorded actions/audit history, but may **not** view other employees' audit records. **Open details:** the exact event types and the retention/history period are not specified. |
| D11 | **DECIDED** | Payroll visibility: SUPER_ADMIN **yes**; ADMIN **no**; ACCOUNTANT **no**; SUPERVISOR **no**; OTHERS **no**. |
| D13 | **DECIDED** | Keep the current rule. Supervisor may pause/resume any task within existing Supervisor authority. Admin: only tasks assigned to them. Super Admin: only tasks assigned to them. No global Admin/Super Admin override authority. |
| RC-D8 | **DECIDED** | Supervisors may view organization-wide/cross-depot inventory stock. This is **not** extended to Others. |
| RC-D9 | **DECIDED** | Others may see depot-level dashboard summary information. This is **not** unrestricted organization-wide dashboard access. How an Other employee's depot context is determined is **not specified in the decision**. |

Every other decision keeps its previous status (**OPEN**).

#### 3.4.5 Conflicts with the current implementation (not changed; follow-up required)

These decisions are recorded here only. **No code, RBAC, schema or data was changed.** Current behaviour is taken from `v1-requirements-freeze.md` §1–§3, `warehouse-kpi-transformation.md` §7 and `frontend-backend-contract-reconciliation.md` §4–§5.

| Decision | Current implemented behaviour | Follow-up needed (future implementation phase) |
|---|---|---|
| D5, D6 | The server confines each Supervisor to the depot on their employee profile (`employees.depot_id` via `resolveDepotScope`). A Supervisor without a depot is refused everywhere (403 `DEPOT_ASSIGNMENT_REQUIRED`). Other depots' tasks, reports and KPIs are refused (403 `DEPOT_FORBIDDEN`). | Replace the Supervisor depot confinement with organization-wide task scope, with the task carrying the depot context. This is an RBAC/depot-scope change and must be specified and tested in its own phase. |
| D7 | Depotless tasks are allowed in the data model (`tasks.depot_id` is nullable); Admins can create them. Supervisors cannot create or see them (depot confinement). Depotless tasks are not counted in any depot's dashboard, but are counted in organisation-wide figures. | The "allowed" part needs no data-model change. Supervisor access follows the D5/D6 change. How depotless tasks appear in depot-specific views is the **open sub-decision**; the current behaviour is not a decision. |
| D8 | Admins can assign any employee to any task; Supervisors can assign only employees of their own depot (depot confinement). On a depot's dashboard, per-employee rows show only that depot's own employees, so a cross-depot share appears in neither depot's employee table (it is in the task depot's totals and the employee's personal KPI results). | Supervisor assignment follows the D5/D6 change. The employee-table attribution is the **open sub-decision**; the current behaviour is not a decision. |
| D10 | Others have no audit access (`audit:read` excludes Others; `GET /audit-logs` refused; the Audit route is denied). | A read-only own-actions view restricted to the caller's own recorded actions (backend filter or endpoint plus a frontend view). It must never return other employees' records. Event types and history period to be specified. |
| RC-D8 | `GET /inventory/:id` returns per-location balances for all depots to every role with catalogue access, **including Others**. The reconciliation document lists this as an open security finding (§4.2). | Supervisors: accepted behaviour. **Others are not covered by the decision:** their access to cross-depot stock remains an open finding, and the backend must not be assumed to be correct for Others. |
| RC-D9 | The frontend does not call `/dashboard` for Others. The backend returns depot-wide totals to Others for the depot on their employee profile (current implementation, not a decision). | Expose a depot-level summary to Others in the frontend. How the Other employee's depot context is determined still has to be specified; the current backend behaviour must not be assumed to be the decided rule. |

D11 and D13 match the current implementation; no follow-up is needed.

### 3.5 Supervisor daily report model (OR-1 to OR-9; business/product owner, 2026-10-03)

These are **confirmed business requirements** for the Supervisor Daily Report. They describe **operational report inputs**.

- **They are not KPI definitions** and must not be turned into KPIs automatically.
- **KPI calculations remain a separate layer**, derived from authoritative operational records (OR-9).
- **No second task model:** the existing task/event model remains the source operational record.

#### 3.5.1 Status

| ID | Requirement | Status |
|---|---|---|
| OR-1 | A Daily Report may contain multiple operational tasks | **DECIDED** |
| OR-2 | "Loading" = number of vehicles involved in loading | **DECIDED** |
| OR-3 | "Unloading" = number of vehicles involved in unloading | **DECIDED** |
| OR-4 | Total = Loading + Unloading (derived) | **DECIDED** |
| OR-5 | Crossing = unloading boxes from one vehicle and transferring them into another vehicle | **DECIDED** |
| OR-6 | Labour = planned workers / actually present workers | **DECIDED** |
| OR-7 | Ex. Labour = extra labour, identifying the vehicle/task it was used for | **DECIDED** |
| OR-8 | Vehicle type/size is entered manually; no fixed enum in V1 | **DECIDED** |
| OR-9 | Authoritative BOX quantity source for KPI | **OPEN** |

#### 3.5.2 Requirements

**OR-1 — Daily Report contains multiple tasks.** **DECIDED.**
- A Supervisor Daily Report may contain multiple operational tasks:

```
Daily Report
├── Task 1
├── Task 2
├── Task 3
└── Task N
```

- No second task model is created. The existing task/event model remains the source operational record.
- How a report is linked to its tasks is **not specified** by the requirement.

**OR-2 — Loading.** **DECIDED.**
- "Loading" is the number of **vehicles** involved in loading. Example: `Loading: 15` means 15 vehicles were involved in loading.
- It is **not** a BOX quantity.

**OR-3 — Unloading.** **DECIDED.**
- "Unloading" is the number of **vehicles** involved in unloading. Example: `Unloading: 08` means 8 vehicles were involved in unloading.
- It is **not** a BOX quantity.

**OR-4 — Total.** **DECIDED.**
- `Total = Loading + Unloading`. Example: 15 + 8 = 23.
- Total is **derived**; it is not an independently entered value and not a KPI value.

**OR-5 — Crossing.** **DECIDED.**
- Crossing means unloading boxes from one vehicle and transferring/interconnecting them into another vehicle. Example: `Crossing: 1 full (32ft)`.
- **No BOX quantity** may be inferred from "full" or from the vehicle size (see OR-9).

**OR-6 — Labour.** **DECIDED.**
- Labour is `planned workers / actually present workers`. Example: `Labour: 18/17` means 18 workers planned and 17 actually present.
- No additional labour calculation is defined by this requirement.

**OR-7 — Extra Labour.** **DECIDED.**
- "Ex. Labour" is extra/additional labour, and identifies the vehicle/task it was used for. Example: `Ex. Labour: 5 (1 32ft)`.
- **No productivity formula** is defined from this field.

**OR-8 — Vehicle metadata.** **DECIDED.**
- Vehicle type and vehicle size are **not fixed enums in V1**. The Supervisor enters them manually.
- No fixed list (e.g. 32ft, 24ft, 20ft) is defined; the system should support a flexible, manual vehicle description.

**OR-9 — BOX KPI source.** **OPEN.**
- The Daily Report format does **not** define an authoritative BOX quantity. None of the following may be assumed:
  - the Loading count is BOX;
  - the Unloading count is BOX;
  - a Crossing "full" is a fixed BOX quantity;
  - the vehicle size is BOX capacity.
- The authoritative BOX quantity for KPI calculation must be established **separately**: from the existing operational/task/movement source records, or from another explicitly decided source.
- **Current implementation (not a decision):** KPI BOX figures use `tasks.completed_box_quantity` of completed tasks (`Docs/api/kpi-results.md`). Whether this is the authoritative source is part of OR-9.
- No new BOX source is defined or implemented here.

#### 3.5.3 Illustrative daily report (example only, not a fixed schema)

```
Loading       : 15
Unloading     : 08
Vehicle       : 32ft : 5
Crossing      : 1 full (32ft)
Total         : 23
Starting time : 10:00 AM
Ending time   : 11:10 PM
Labour        : 18/17
Ex. Labour    : 5 (1 32ft)
```

- The vehicle type/size (e.g. "32ft") is **entered manually and remains flexible** (OR-8). It is not a fixed list.
- `Total` is derived (OR-4).
- None of these lines defines a BOX quantity (OR-9).

#### 3.5.4 Conflicts with the current implementation (not changed; follow-up required)

Current behaviour is from `warehouse-kpi-transformation.md` §5, migrations 015/016 and `Docs/requirements/KPI_DAILY_SHIFT_TRACKING.md`. **Nothing was changed.**

| Requirement | Current implemented behaviour | Follow-up needed |
|---|---|---|
| OR-1 | One report per depot per date (`depot_daily_reports` unique on depot and date). "Registered tasks" are **derived** from completed Loading/Unloading tasks of the same depot and operational date; there is no explicit report ↔ task link. Supervisors file reports for their own depot only (depot confinement). | Specify how a Supervisor's report is linked to its tasks under organization-wide Supervisor scope (D5/D6). **Not specified** in the requirement. |
| OR-2, OR-3 | `loading_count` / `unloading_count` are documented as "operation counts". | Align the field meaning and labels with "number of vehicles". Separately, **shift entries** (`KPI_DAILY_SHIFT_TRACKING.md`) use loading/unloading totals as **BOX** quantities. That is a different record and is not changed by OR-2/OR-3, but the shared terms must not be confused. |
| OR-4 | `total_operations` = loading + unloading, derived and never accepted from clients. | None. Already matches. |
| OR-5 | `CROSSING` is a **fixed truck type** (`truck_types`: 32FT, CROSSING, OTHER) with a vehicle count. | Crossing is an operational activity, not a vehicle type. Its representation must be specified. |
| OR-6 | `labour_required` / `labour_present`. | None for the fields; display as planned / present. |
| OR-7 | No extra-labour field exists. | Add an extra-labour input with its vehicle/task reference (schema/API/frontend). Not implemented. |
| OR-8 | Vehicles are recorded per fixed `truck_types` row (`depot_daily_report_vehicles` references `truck_types`). | Support a manual, flexible vehicle type/size description. Not implemented. |
| OR-9 | KPI BOX = `tasks.completed_box_quantity`. | Decide the authoritative BOX source (OPEN). |

### 3.6 Organizational hierarchy and operational scope (summary)

```
SUPER ADMIN
↓
ADMIN
├── SUPERVISOR
├── ACCOUNTANT
└── OTHERS
```

- **Supervisor is not the organizational manager of Others.** Admin is the operational manager for Supervisors, Accountants and Others (§3.4.1).
- **Supervisor scope:** organization-wide operational task scope, with no fixed depot assignment (D5, D6).
- **Depot context:** each task carries its own depot context **where one exists**. Depotless tasks are allowed (D7); how they are represented in depot-specific views is the open sub-decision **D7-S1**.
- **Open sub-decisions:**
  - **D7-S1:** representation and counting of depotless tasks in depot-specific views.
  - **D8-S1:** which depot's employee table shows cross-depot work.
- **Separation of concepts:** organizational hierarchy, RBAC hierarchy and operational task scope are separate concepts (§3.4.3). No permission is derived from this summary.

---

## 4. Detailed decisions

### 4.1 Requirements series

#### D1 — SLA formula and target rules

- **Area:** KPI (SLA).
- **Current documented state:** "Always **Not configured**; no number is shown. The calculation slots (`LOADING_SLA_COMPLIANCE`, `UNLOADING_SLA_COMPLIANCE`) exist but are inactive." (`v1-requirements-freeze.md` D1). SLA KPIs are not seeded (`Docs/api/kpi-results.md`).
- **Why it matters:** "SLA is a headline KPI on the depot dashboard. Without a rule, every SLA figure is 'Not configured'."
- **Unresolved question:**
  1. The target time for Loading and for Unloading (and per vehicle type or BOX band).
  2. Which clock is measured.
  3. Which tasks count.
  4. The compliance formula and pass threshold.
  5. The same targets for all depots or per depot.
  6. Credit to the depot only, or to each employee too.
- **Existing implementation:** the SLA calculation slots exist but are inactive. The dashboard and KPI APIs return SLA as `NOT_CONFIGURED`.
- **Existing frontend behaviour:** "Not configured" on the depot KPI dashboard, the KPI results and the main Dashboard (reconciliation §5.1).
- **Existing backend behaviour:** `sla` fields are `NOT_CONFIGURED`; `slaCompliance` on `GET /dashboard` is always null; the warehouse read model returns `sla: { target_seconds: null, status: "NOT_DEFINED" }`.
- **Documented options:**
  - (a) A fixed target time per operation.
  - (b) A target per operation and vehicle type (32FT, Crossing, Other).
  - (c) A target that scales with BOX quantity. (Depends on the authoritative BOX source, OR-9.)
  - (d) Different targets per depot.
  - Clock: from registration, from start, or active time only.
- **What would change:** a schema change (a small target-time table; compliance targets can reuse `kpi_targets`); an additive API change; a small frontend change; a new SLA calculation in the existing engine.
- **Status:** **OPEN.** `v1-requirements-freeze.md` §4 lists SLA as out of V1 "until D1–D4 are answered".
- **Decision required:** all six items listed under the unresolved question.

#### D2 — Quality formula and target rules

- **Area:** KPI (Quality).
- **Current documented state:** "Always **Not configured**. Inspections are still recorded and listed."
- **Why it matters:** "Quality is a headline KPI. Inspection data already exists (pass/fail outcome, damage rate, quality score), but no rule says how it becomes a KPI."
- **Unresolved question:**
  1. Which measure.
  2. Which inspections count.
  3. Whether tasks without an inspection are excluded, or counted as passed or failed.
  4. How quality is credited on a shared task.
  5. The target and pass threshold, per depot or organisation-wide.
- **Existing implementation:** `quality_records` (outcome, damage rate, quality score) are recorded; no Quality KPI calculation exists.
- **Existing frontend behaviour:** "Not configured" on the KPI surfaces and the main Dashboard.
- **Existing backend behaviour:** `quality` fields return `NOT_CONFIGURED`. `GET /dashboard` returns raw inspection counts (`qualitySummary`), which the frontend deliberately does not present as a KPI.
- **Documented options:**
  - (a) Pass rate.
  - (b) Average damage rate.
  - (c) Average quality score.
  - (d) A combination.
  - Attribution: depot only, every assigned employee equally, or the inspected task's assignees only.
- **What would change:** likely no schema change; an additive API change; a minimal frontend change; a new Quality calculation.
- **Status:** **OPEN.** Out of V1 "until D1–D4 are answered" (freeze §4).
- **Decision required:** all five items listed under the unresolved question.

#### D3 — Daily report approval authority

- **Area:** Daily depot reports.
- **Current documented state:** "Draft → **Submitted → read-only**. No one approves. The approval columns (`approved_at`, `approved_by_user_id`) exist but are unused."
- **Why it matters:** it decides whether a submitted report is final or needs sign-off before it is trusted for KPI and attendance.
- **Unresolved question:**
  1. Which role(s) approve.
  2. For which depots.
  3. Whether self-approval is allowed.
  4. Any deadline.
  5. Whether KPI and attendance use only approved reports.
- **Existing implementation:** the DRAFT/SUBMITTED status constraint; no approval action.
- **Existing frontend behaviour:** submitted reports are shown read-only.
- **Existing backend behaviour:** `POST /daily-reports/:id/submit` makes a report read-only; there is no approve endpoint.
- **Documented options:**
  - (a) No approval; submitted is final.
  - (b) Admin approves.
  - (c) Accountant approves.
  - (d) Super Admin approves.
  - Scope: all depots or assigned depots only.
- **What would change:** a schema change (new status values); an API change (an approve action and status values); a frontend change; a KPI change only if "approved only".
- **Status:** **OPEN.** Out of V1 "until D1–D4 are answered" (freeze §4).
- **Decision required:** the five items listed under the unresolved question.

#### D4 — Rejection, reopen and correction workflow

- **Area:** Daily depot reports.
- **Current documented state:** "A submitted report cannot be edited, rejected or reopened."
- **Why it matters:** "Mistakes in a submitted report currently cannot be fixed in the app."
- **Unresolved question:**
  1. Who may reject, and whether a reason is mandatory.
  2. Who may reopen a submitted or approved report, and until when.
  3. Edit in place (with audit) or a new version.
  4. Whether the supervisor is notified.
  5. What the KPI shows while a report is reopened.
- **Existing implementation:** the lifecycle ends at SUBMITTED; `depot_daily_report_events` records create, update and submit.
- **Existing frontend behaviour:** not specified in the current documentation beyond the read-only display of submitted reports.
- **Existing backend behaviour:** a submitted report rejects updates (`DAILY_REPORT_LOCKED`, `warehouse-kpi-transformation.md` §5).
- **Documented options:**
  - (a) Reject back to Draft with a reason.
  - (b) Reopen by an authorised role.
  - (c) Corrections as a new version.
  - (d) Direct edit with before/after audit.
- **What would change:** a schema change (statuses, possibly a reason or version field); an API change (reject, reopen and correct actions); a frontend change; possibly a KPI change.
- **Status:** **OPEN.** Out of V1 "until D1–D4 are answered" (freeze §4).
- **Decision required:** the five items listed under the unresolved question.

#### D5 — Supervisor depot assignment (source title: "Supervisor without a depot")

- **Area:** Supervisor operational scope.
- **Decision (2026-10-03):** Supervisors are not assigned to any one specific depot. They operate across organization-wide operational tasks, and each task carries its own depot context. Admin is the operational manager for Supervisors, Accountants and Others. Supervisor is **not** the manager of Others. (§3.4)
- **Implemented behaviour (unchanged; conflicts with the decision, see §3.4.5):** the source records "Refused on every depot screen and action (403 `DEPOT_ASSIGNMENT_REQUIRED`)". `resolveDepotScope` currently derives a Supervisor's reach from `employees.depot_id`.
- **Why it matters:** with the current implementation, a Supervisor account without an employee depot cannot do any operational work, which contradicts the decided organization-wide task scope.
- **Question answered:** whether a Supervisor must be assigned to a depot. **Answer: no.**
- **Existing frontend behaviour:** error states on depot pages for a Supervisor without an employee depot (populated-data audit, reconciliation §5).
- **Existing backend behaviour:** 403 `DEPOT_ASSIGNMENT_REQUIRED` on every depot route.
- **Options documented before the decision (not chosen):** (a) keep refusing; (b) read-only access to all depots; (c) prevent saving a Supervisor without a depot. The decision supersedes all three.
- **What changes:** the Supervisor depot confinement is replaced by organization-wide task scope (§3.4.5). This is an RBAC/depot-scope implementation change; it is **not** made by this document.
- **Status:** **DECIDED.**

#### D6 — Supervisor depot model (source title: "Supervisor responsible for several depots")

- **Area:** Supervisor operational scope.
- **Decision (2026-10-03):** There is no fixed Supervisor → Depot assignment. Supervisor operational scope is **organization-wide task scope**; the depot belongs to each task (§3.4.2). This decision does **not** mean that a Supervisor manages a list of assigned depots.
- **Implemented behaviour (unchanged; conflicts with the decision, see §3.4.5):** the source records "One depot per supervisor". The depot scope of a Supervisor is currently the single `employees.depot_id` of their employee profile.
- **Why it matters:** the current implementation ties each Supervisor to the depot on their employee record, which the decision removes.
- **Question answered:** how a Supervisor relates to depots. **Answer: no fixed assignment; organization-wide task scope.**
- **Existing frontend behaviour:** not specified in the current documentation (no depot picker exists).
- **Existing backend behaviour:** the depot scope is a single depot.
- **Options documented before the decision (not chosen):** (a) keep one depot; (b) a list of depots per Supervisor; (c) temporary cover with dates. All three assume a Supervisor-to-Depot assignment, which the decision removes. No Supervisor ↔ depot mapping table is needed.
- **What changes:** see D5 (§3.4.5).
- **Status:** **DECIDED.**

#### D7 — Tasks without a depot

- **Area:** Tasks / depots.
- **Decision (2026-10-03):** **depotless tasks are allowed.** A depot is **not** mandatory for an operational task (§3.4.4).
- **Open sub-decision (D7-S1):** how should depotless tasks be represented and counted in depot-specific KPI, dashboard and reporting views? **Not decided.** No "Unassigned depot" bucket has been decided.
- **Implemented behaviour (current; not a decision):** the source records "Admins can still create a task without a depot. Such tasks are hidden from supervisors and are not counted in any depot's dashboard, though they still count in organisation-wide figures." Hiding them from Supervisors is the current depot confinement, which conflicts with D5/D6 (§3.4.5).
- **Why it matters:** a task with no depot appears in no depot's KPI. The open sub-decision determines how such tasks are shown in depot-specific views.
- **Existing implementation:** `tasks.depot_id` is nullable.
- **Existing frontend behaviour:** a depotless task shows "No warehouse" and "Unassigned" (reconciliation §5, populated audit).
- **Existing backend behaviour:** under the current depot confinement, depotless tasks are denied to depot-confined callers, i.e. Supervisors (`warehouse-kpi-transformation.md` §7). This confinement conflicts with D5/D6 (§3.4.5).
- **Source-document options (`v1-requirements-freeze.md` letters, for reference only):** (a) depot mandatory, **not chosen**; (b) allowed, with an "Unassigned depot" bucket for Admin, the bucket **not decided**; (c) allowed only for non-operational task types, **not chosen**.
- **What changes:** the "allowed" part needs no data-model change. Any change to depot-specific views waits for the open sub-decision.
- **Status:** **DECIDED WITH OPEN SUB-DECISION.**

#### D8 — Employee working across depots

- **Area:** KPI attribution.
- **Decision (2026-10-03):** **cross-depot employee/task work is allowed.** For example, an employee associated with Depot A may work on a task belonging to Depot B. Cross-depot assignment is **not** forbidden (§3.4.4).
- **Open sub-decision (D8-S1):** when an employee from Depot A works on a Depot B task, which depot's employee table should display that employee's KPI/task contribution? **Not decided.** Neither home-depot attribution nor task-depot attribution has been chosen.
- **Implemented behaviour (current; not a decision):** depot totals include every task of the depot; per-employee rows include only that depot's own employees. "A Depot A employee's share of a Depot B task therefore appears in **neither** depot's employee table, although it is in Depot B's totals. It **does** appear in that employee's personal KPI results."
- **Why it matters:** "It decides whose dashboard shows the work when an employee of Depot A helps on a Depot B task."
- **Existing implementation:** the depot filter on `tasks.depot_id` and `employees.depot_id` in `KpiResultCalculator`.
- **Existing frontend behaviour:** not specified in the current documentation beyond the depot dashboard tables.
- **Existing backend behaviour:** Admins can assign any employee to any task. Under the current depot confinement, Supervisors can assign only employees of the depot on their own employee profile; this conflicts with D5/D6 (§3.4.5).
- **Source-document options (`v1-requirements-freeze.md` letters, for reference only):**
  - Candidates for the open sub-decision: (a) keep home-depot staff only; (b) credit the depot where the task happened; (c) credit the employee's home depot.
  - (d) Forbid cross-depot assignment: **not chosen** (cross-depot work is allowed).
- **What changes:** none until the open sub-decision is made. Options (b) or (c) would change the depot filter on employee rows.
- **Status:** **DECIDED WITH OPEN SUB-DECISION.**

#### D9 — Inventory catalogue scope

- **Area:** Inventory.
- **Current documented state:** "The **catalogue** (item list) is organisation-wide for all roles. **Stock balances and movements** are depot-restricted for supervisors." (Source wording; the restriction is the current Supervisor depot confinement, which conflicts with D5/D6, §3.4.5.)
- **Why it matters:** it decides whether the product list is shared across depots or separated per depot. The source wording ("only their depot's") assumes depot-bound Supervisors, which D5/D6 no longer apply.
- **Unresolved question:** is the product list the same across depots? Is the product list itself confidential between depots?
- **Existing implementation:** `/inventory` and `/inventory/:id` are not depot-scoped (`warehouse-kpi-transformation.md` §7, "Scope decision, inventory catalogue").
- **Existing frontend behaviour:** the catalogue list and detail; quantities are shown, with location as "—" (reconciliation §6).
- **Existing backend behaviour:** see the contradiction in §8.2. `GET /inventory/:id` also returns per-location `balances` for all depots (reconciliation §4.2).
- **Documented options:**
  - (a) Shared catalogue, per-depot stock.
  - (b) Supervisors see only items stocked in their depot. (Assumes a Supervisor depot assignment, which D5/D6 remove.)
  - (c) A separate catalogue per depot.
- **What would change:** a schema change only for (c); API and frontend changes only for (b) or (c); no KPI change.
- **Status:** **OPEN.**
- **Decision required:** the two questions above. RC-D8 (stock visibility) is DECIDED: Supervisors may view cross-depot stock.

#### D10 — "Own actions" audit view for Others

- **Area:** Audit / Others.
- **Decision (2026-10-03):** **Others may view their own recorded actions/audit history, but may not view other employees' audit records** (§3.4.4).
- **Open details (not specified):** the exact event types included, and the retention/history period.
- **Current documented state (before the decision):** Others have **no** audit access. Their task history is visible through the audit log to Supervisors, Admin and the Accountant. The source sentence says "their supervisor"; per §3.4.1, Others do not report to a Supervisor.
- **Why it matters:** "Staff may want to see their own activity history (tasks started, completed, photos)."
- **Existing implementation:** `audit:read` excludes Others. This conflicts with the decision (§3.4.5).
- **Existing frontend behaviour:** the Audit logs route is denied to Others.
- **Existing backend behaviour:** `GET /audit-logs` is refused for Others.
- **Source-document options (`v1-requirements-freeze.md` letters, for reference only):** (a) keep: no audit view for Others, **not chosen**; (b) a read-only "My activity" view of their own actions only, **matches the decision**.
- **What changes:** an API change (an own-events filter or endpoint restricted to the caller's own actions) and a frontend change (a page or tab). No schema or KPI change. Not implemented (§3.4.5).
- **Status:** **DECIDED** (event types and history period still to be specified).

#### D11 — Payroll visibility

- **Area:** Payroll access.
- **Current documented state:** "**Super Admin only**, consistent with the Super Admin-only incentive rule. Earlier, Admin and Accountant had payroll access; this was removed." `warehouse-kpi-transformation.md` §2: "**Client confirmation recommended.**"
- **Why it matters:** "Payroll entries are copies of approved incentive amounts, so showing payroll reveals incentives."
- **Decision (2026-10-03):** payroll visibility: SUPER_ADMIN **yes**; ADMIN **no**; ACCOUNTANT **no**; SUPERVISOR **no**; OTHERS **no** (§3.4.4). This matches source option (a).
- **Question answered:** payroll stays Super Admin only for V1.
- **Existing implementation:** `payroll:*` is Super Admin only; the seed revokes it from other roles.
- **Existing frontend behaviour:** the Payroll navigation and route are Super Admin only. In API mode the page currently shows "could not be loaded" (contract gap, reconciliation §1).
- **Existing backend behaviour:** `GET /payroll` returns 403 for every role other than Super Admin.
- **Documented options:**
  - (a) Keep Super Admin only.
  - (b) Accountant sees payroll including incentive amounts (breaks the incentive rule; needs explicit approval).
  - (c) Accountant sees payroll without incentive amounts (needs a payroll redesign, which is out of V1).
- **What changes:** none; the current implementation already follows the decision.
- **Status:** **DECIDED.** Related: RC-D1 (payroll model), still OPEN.

#### D12 — KPI result → incentive participant cutoff

- **Area:** KPI / incentives.
- **Current documented state:**
  - KPI credits employees assigned at the moment the task was completed; the incentive calculation credits employees still assigned when the incentive is calculated.
  - "They differ only if someone is unassigned **after** completion (the system currently allows this)."
  - `Docs/api/kpi-results.md` marks the cutoff "ASSUMPTION (CLIENT DECISION REQUIRED)".
- **Why it matters:** "KPI and incentives must credit the same people for the same task; today they can disagree in one rare case."
- **Unresolved question:** which moment decides who gets credit? May anyone be removed from a task after it is completed?
- **Existing implementation:** `kpi-result-calculator.ts` (`atCompletion`); `IncentiveService` (`unassigned_at IS NULL` at calculation); `TaskService.unassignTask` has no status guard (`Docs/api/kpi-results.md`).
- **Existing frontend behaviour:** not specified in the current documentation.
- **Existing backend behaviour:** as above.
- **Documented options:**
  - (a) Assigned at completion, for both KPI and incentives.
  - (b) Assigned at calculation, for both.
  - (c) Block unassigning after completion.
- **What would change:** no schema change; an API change only for (c) (an error on unassign); a minor frontend change for (c); a KPI change only for (b). Changing the incentive calculation is out of V1 (freeze §4).
- **Status:** **OPEN.**
- **Decision required:** the two questions above.

#### D13 — Super Admin and Admin pause or resume on any task

- **Area:** Task authority.
- **Current documented state:** "Only a Supervisor may pause or resume any task. Super Admin and Admin may do so only on a task they are assigned to. This is a pre-existing, tested rule and conflicts with 'Super Admin unrestricted'." `17-approved-business-rules.md`: pause/resume guards are CLIENT DECISION REQUIRED. `26-final-client-decisions.md`: role policy is open.
- **Why it matters:** it is an exception to "Super Admin has unrestricted access" (freeze §1.1).
- **Decision (2026-10-03):** **keep the current rule** (§3.4.4).
  - **Supervisor:** may pause/resume any task within existing Supervisor authority.
  - **Admin:** only tasks assigned to them.
  - **Super Admin:** only tasks assigned to them.
- **Question answered:** no global Admin/Super Admin override authority is granted.
- **Existing implementation:** the `task:pause`/`task:resume` policy; covered by `postgres-integration.test.ts` and `rbac-authority.test.ts`.
- **Existing frontend behaviour:** not specified in the current documentation (task lifecycle actions are not available in API mode on the Tasks screens).
- **Existing backend behaviour:** 403 for Super Admin or Admin on an unassigned task.
- **Documented options:** not specified in the current documentation beyond the yes/no question.
- **What changes:** none; the current implementation already follows the decision. The documented exception to "Super Admin has unrestricted access" (freeze §1.1) stays.
- **Status:** **DECIDED.**

#### D14 — Rounding of KPI values

- **Area:** KPI calculation.
- **Current documented state:** "2 decimals, half-up". `Docs/api/kpi-results.md` marks rounding "ASSUMPTION (CLIENT DECISION REQUIRED)".
- **Why it matters:** it fixes the base numbers that SLA, Quality and incentives build on (freeze §5).
- **Unresolved question:** confirm, or give the rule (e.g. whole BOX).
- **Existing implementation:** `ratio2` in `kpi-result-calculator.ts` (exact rational arithmetic).
- **Existing frontend behaviour:** not specified in the current documentation.
- **Existing backend behaviour:** as implemented above.
- **Documented options:** confirm the current rule, or provide another (example given: whole BOX).
- **What would change:** KPI values only (freeze: "No / No / No / Yes (values only)").
- **Status:** **OPEN.**
- **Decision required:** the rounding rule.

> **Note on BOX split:** the equal split of a task's BOX among its participants is recorded as a **confirmed business rule** (freeze §2, "Shared task credit"; `17-approved-business-rules.md`: collaborators receive equal shares of a task's incentive). It is applied to KPI BOX credit by analogy (`Docs/api/kpi-results.md`). It is therefore **DECIDED**, and is not one of D1–D16. **Which BOX quantity is authoritative for KPI is OPEN (OR-9, §3.5).**

#### D15 — Collaborator attribution

- **Area:** KPI attribution / task credit.
- **Current documented state:** "Only assigned employees are credited. Helpers who were not assigned get no KPI credit." `Docs/api/kpi-results.md` and `17-approved-business-rules.md` (I-02): "Collaborator attribution … CLIENT DECISION REQUIRED".
- **Why it matters:** it decides whether helpers who work on a task without being assigned receive any KPI credit.
- **Unresolved question:** should unassigned helpers ever be credited, and how would they be recorded?
- **Existing implementation:** credit goes to assignments only.
- **Existing frontend behaviour:** not specified in the current documentation.
- **Existing backend behaviour:** credit goes to assignments only.
- **Documented options:** not specified in the current documentation beyond the question.
- **What would change:** freeze: "Likely yes / Yes / Yes / Yes" (schema / API / frontend / KPI).
- **Status:** **OPEN.**
- **Decision required:** the question above.

#### D16 — Editing KPI targets in the app

- **Area:** KPI configuration.
- **Current documented state:** "Targets are viewable, but are set as data (no editing screen)." The KPI configuration API is read-only (freeze §2).
- **Why it matters:** targets can only be changed as data today.
- **Unresolved question:** is an editing screen needed for V1, and who may use it (Admin / Super Admin)?
- **Existing implementation:** `GET /kpi/definitions` and `/kpi/definitions/:id` are read-only; targets live in `kpi_targets`.
- **Existing frontend behaviour:** a read-only KPI configuration screen for Admin and Super Admin.
- **Existing backend behaviour:** no write endpoint for definitions or targets.
- **Documented options:** not specified in the current documentation beyond the question.
- **What would change:** freeze: "No / Yes / Yes / No" (schema / API / frontend / KPI).
- **Status:** **OPEN.**
- **Decision required:** the question above.

### 4.2 Reconciliation series (labelled RC-D1 to RC-D9 here; D1–D9 in the source)

#### RC-D1 — Payroll model for V1

- **Area:** Payroll.
- **Current documented state:** "Payroll model for V1: per-entry incentive approval ledger (what exists) or pay-period summary (what the UI assumes); base pay in or out of scope." (reconciliation §8.3)
- **Why it matters:**
  - The backend has one row per employee per incentive-ledger entry; the frontend `PayrollRecord` is a pay-period aggregate.
  - `baseAmount` is unavailable; the system holds no base pay (reconciliation §2.1).
- **Unresolved question:** which payroll model, and whether base pay is in scope.
- **Existing implementation:** `payroll_entries` and `payroll_approvals`; statuses PENDING/APPROVED/REJECTED; no "paid" state.
- **Existing frontend behaviour:** the Payroll page shows "could not be loaded" in API mode: the plain array has no `meta` envelope (reconciliation §1.1).
- **Existing backend behaviour:** `GET /payroll` returns a plain array of `PayrollEntryDTO` (Super Admin only).
- **Documented options:** a per-entry incentive approval ledger, or a pay-period summary; base pay in or out.
- **What would change:**
  - Frontend: a mapper and entry-level rows "only after D1".
  - Backend: the list envelope.
  - A period model would need fields the backend does not have (period, base amount, employee count).
- **Status:** **OPEN.** Base salary and payroll disbursement are listed as out of V1 (reconciliation §8.4).
- **Decision required:** the choice of model. Related: D11.

#### RC-D2 — Report catalogue

- **Area:** Reports.
- **Current documented state:** "Report catalogue: which reports, and their category, owner, schedule and status."
  - `report_definitions` has no seed rows and no generation logic.
  - The frontend expects category, cadence, owner, last run and status, which the backend does not provide (reconciliation §2.2).
- **Why it matters:** without a catalogue, the Reports page cannot be mapped without inventing fields.
- **Unresolved question:** which reports exist, and their category, owner, schedule and status.
- **Existing implementation:** a definition and execution tracking framework only.
- **Existing frontend behaviour:** "could not be loaded" in API mode (no `meta`).
- **Existing backend behaviour:** `GET /reports` returns a plain array of `{id, code, name, description, …}`.
- **Documented options:** not specified in the current documentation.
- **What would change:** a frontend mapper; the backend envelope; possibly `lastRun` on the backend.
- **Status:** **OPEN.** Report generation content, export and scheduling are listed as out of V1 (reconciliation §8.4; freeze §4, export system).
- **Decision required:** the catalogue.

#### RC-D3 — Incentive "points" and per-ledger "event"

- **Area:** Incentives.
- **Current documented state:** "Incentive 'points' and per-ledger 'event': do they exist?" There is no points concept in the schema, contracts or approved rules. Event types live in `incentive_events`, not on ledger rows (reconciliation §2.3).
- **Why it matters:** the frontend `IncentiveRecord` expects `points` and `event`.
- **Unresolved question:** do points exist? Is there an event per ledger row?
- **Existing implementation:** the ledger has amount, status, task, employee and rule.
- **Existing frontend behaviour:** the Incentives page requests `/incentives`, which does not exist (404), and shows "could not be loaded".
- **Existing backend behaviour:** `GET /incentives/ledger` returns a plain array (Super Admin only).
- **Documented options:** not specified in the current documentation.
- **What would change:** frontend mapper and path changes; backend envelope and name embedding (reconciliation §8.1–8.2).
- **Status:** **OPEN.** Changing the incentive calculation is out of V1 (freeze §4).
- **Decision required:** the two questions above.

#### RC-D4 — Audit: denied attempts and before/after values

- **Area:** Audit.
- **Current documented state:** "Audit: record denied attempts ('Blocked')? Record before/after values?"
  - Only successful, recorded events exist; `before` is always null (documented on the DTO).
  - `17-approved-business-rules.md`: "Audit history … CLIENT DECISION REQUIRED".
- **Why it matters:** the frontend `AuditRecord` expects `result` and `before`/`after`.
- **Unresolved question:** record denied attempts? Record before/after values?
- **Existing implementation:** a unified feed over task, incentive and daily-report events.
- **Existing frontend behaviour:** requests `/audits`, which does not exist (404), and shows "could not be loaded". The request loop was fixed earlier (reconciliation §1.1).
- **Existing backend behaviour:** `GET /audit-logs` returns a plain, unbounded array. It is depot-scoped for supervisors; incentive events are shown only to Super Admin.
- **Documented options:** not specified in the current documentation.
- **What would change:** possibly the backend audit model; a frontend mapper and path; the backend envelope and paging.
- **Status:** **OPEN.**
- **Decision required:** the two questions above.

#### RC-D5 — V1 task lifecycle states with no backend status

- **Area:** Tasks.
- **Current documented state:** "V1 task lifecycle states with no backend status (ACCEPTED, VERIFIED, REJECTED, REASSIGNED, REOPENED, FAILED)." REOPENED exists only as a `TASK_REOPENED` event (reconciliation §7).
- **Why it matters:** the frontend status filters and lifecycle views use these states; the backend has PENDING, ASSIGNED, IN_PROGRESS, PAUSED, COMPLETED and CANCELLED.
- **Unresolved question:** are these V1 states?
- **Existing implementation:**
  - A documented one-way mapping, backend → lifecycle (`Docs/api/warehouse-operations.md`).
  - Filters send only exact one-to-one equivalents (ASSIGNED, PAUSED, COMPLETED, CANCELLED); other filter values return an empty page without a request.
- **Existing frontend behaviour:** as above.
- **Existing backend behaviour:** the six backend statuses listed above.
- **Documented options:** not specified in the current documentation.
- **What would change:** not specified in the current documentation. Reconciliation §7 recommends disabling those filters in API mode until decided.
- **Status:** **OPEN.**
- **Decision required:** the question above. See also the terminology contradiction in §8.2.

#### RC-D6 — Task priority as a V1 concept

- **Area:** Tasks.
- **Current documented state:** "Tasks have **no priority**. The display priority is the linked order's priority (or Normal)." The read model has no priority filter (reconciliation §7).
- **Why it matters:** the Tasks page offers a priority filter that the backend cannot apply.
- **Unresolved question:** is task priority a V1 concept?
- **Existing implementation:** the adapter drops the priority filter.
- **Existing frontend behaviour:** priority shows the order's priority, or Normal.
- **Existing backend behaviour:** no task priority field and no priority filter.
- **Documented options:** a backend capability (B), or disable the filter in API mode (A) (reconciliation §7).
- **What would change:** a backend field and filter if yes; disabling the frontend filter if no.
- **Status:** **OPEN.**
- **Decision required:** the question above.

#### RC-D7 — Report audience

- **Area:** Reports access.
- **Current documented state:** "Report audience: backend `report:read` includes Others; the frontend blocks them." Data is definition metadata only (reconciliation §4.4).
- **Why it matters:** the backend and frontend access rules disagree.
- **Unresolved question:** is the intended audience of reports to include Others?
- **Existing implementation:** `report:read` = every approved role plus Accountant; `report:execute` = the RBAC "management tier" (Super Admin, Admin, Supervisor) plus Accountant. "Management tier" is an RBAC grouping, not a reporting line (§3.4.3).
- **Existing frontend behaviour:** the `/reports` route is denied to Others.
- **Existing backend behaviour:** `GET /reports` is allowed for Others. `GET /report-executions/:id` is not owner- or depot-scoped (reconciliation §4.3, security finding).
- **Documented options:** not specified in the current documentation.
- **What would change:** either a backend permission change or a frontend route change.
- **Status:** **OPEN.**
- **Decision required:** the audience.

#### RC-D8 — Inventory stock visibility across depots

- **Area:** Inventory access.
- **Current documented state:**
  - "Inventory stock visibility across depots (V1 freeze D9)."
  - Security finding: `GET /inventory/:id` (`inventory:read_catalog`, including Supervisors and Others) returns per-batch, per-location stock for **all depots** (reconciliation §4.2).
  - The frontend does not display these balances.
- **Why it matters:** this contradicts the documented statement that per-depot stock is only reachable through scoped endpoints (§8.2).
- **Decision (2026-10-03):** **Supervisors may view organization-wide/cross-depot inventory stock.** This is **not** extended to Others (§3.4.4).
- **Question answered:** may Supervisors see other depots' stock? **Yes.** Others' visibility of cross-depot stock is **not decided** by this decision.
- **Existing implementation:** the balances are embedded in the catalogue detail, unscoped, for every role with catalogue access, **including Others**.
- **Existing frontend behaviour:** quantity is shown; location is "—"; balances are not displayed.
- **Existing backend behaviour:** as above. For Supervisors the unscoped balances are accepted behaviour. **For Others, the exposure is not covered by the decision and remains an open finding** (reconciliation §4.2; §3.4.5 and §8.2 here).
- **Documented options:** scope or omit `balances` for depot-confined callers (backend), **or** obtain business confirmation that cross-depot stock is visible (reconciliation §8.2 #2).
- **What changes:** nothing for Supervisors. For Others, the open finding stays until it is decided or fixed separately.
- **Status:** **DECIDED** (Supervisors). D9 (catalogue scope) remains OPEN.

#### RC-D9 — Others Dashboard

- **Area:** Dashboard / Others.
- **Current documented state (preserved as given):**
  - **Backend:** `GET /dashboard` currently provides Others with depot-wide task and BOX totals.
  - **V1 product rule:** Others should see only their own records.
  - **Frontend:** the frontend currently does NOT call `/dashboard` for Others, and instead points them to their own tasks.
- **Why it matters:** the backend permission and the V1 access rule for Others contradict each other (reconciliation §4.6).
- **Decision (2026-10-03):** **Others may see depot-level dashboard summary information** (§3.4.4). This is **not** unrestricted organization-wide dashboard access.
- **Question answered:** source Policy A (own records only) or Policy B (depot summary allowed). **Answer: depot summary allowed.**
- **Not specified in the decision:** how an Other employee's depot context is determined.
- **Existing implementation:** `dashboard:read` includes Others; the dashboard scope for Others is their profile's depot (`warehouse-kpi-transformation.md` §7).
- **Existing frontend behaviour:** no `/dashboard` request for Others. They see "Your assigned tasks are listed on the Tasks page".
- **Existing backend behaviour:** returns depot-wide totals to Others.
- **Documented options:**
  - **A. Own records only:** the backend eventually restricts `/dashboard` for Others.
  - **B. Depot summary allowed:** the frontend exposes the existing depot summary to Others.
- **What changes:** a frontend change to show a depot-level summary to Others. **Not yet implemented** (§3.4.5). The backend currently derives the depot from the Other's employee profile; that is current implementation, **not** a decided rule.
- **Status:** **DECIDED.**

---

## 5. Decisions that must be resolved before API freeze

Listed **without ranking**. These are the decisions whose documented options change an API contract, authorization, database behaviour, a calculation, or frontend/backend compatibility. Entries marked **DECIDED** are resolved (§3.4); where the decision differs from the current implementation, the implementation follow-up is listed in §3.4.5.

| ID | Affects |
|---|---|
| D1 | Schema (target-time table), API (`sla` values), calculation |
| D2 | API (`quality` values), calculation |
| D3 | Schema (statuses), API (approve action), calculation (if "approved only") |
| D4 | Schema (statuses, reason/version), API (reject/reopen/correct) |
| D5 | **DECIDED.** Authorization / depot scope: Supervisor organization-wide task scope (implementation follow-up, §3.4.5) |
| D6 | **DECIDED.** Authorization / depot scope (with D5); no mapping table needed |
| D7 | **DECIDED WITH OPEN SUB-DECISION.** Depotless tasks allowed (no data-model change). Open: representation/counting in depot-specific KPI, dashboard and reporting views (calculation, API) |
| D8 | **DECIDED WITH OPEN SUB-DECISION.** Cross-depot work allowed; Supervisor assignment scope follows D5/D6. Open: employee-table attribution (calculation) |
| D9 | API and authorization (options b, c); schema (option c) |
| D10 | **DECIDED.** API (own-actions audit filter/endpoint), authorization (own records only), frontend view. Open details: event types, history period |
| D11 | **DECIDED.** No change (Super Admin only) |
| D12 | Calculation (option b); API (option c) |
| D13 | **DECIDED.** No change (current rule kept) |
| D14 | Calculation |
| D15 | Schema, API, calculation |
| D16 | API (write endpoint), authorization |
| RC-D1 | API contract (payroll shape), frontend/backend compatibility |
| RC-D2 | API contract (report shape), compatibility |
| RC-D3 | API contract (ledger shape), compatibility |
| RC-D4 | API contract and possibly the audit data model |
| RC-D5 | API contract (task statuses and filters), compatibility |
| RC-D6 | API contract (priority field/filter), compatibility |
| RC-D7 | Authorization |
| RC-D8 | **DECIDED.** Supervisors: cross-depot stock visible (no change). Others: not covered; the open finding remains (authorization) |
| RC-D9 | **DECIDED.** Frontend change (depot-level summary for Others); depot-context rule for Others not specified |
| OR-9 | **OPEN.** Calculation (authoritative BOX source for KPI), data source |

Every documented decision affects at least one of these categories. None can be omitted from this list. **Still OPEN:** D1, D2, D3, D4, D9, D12, D14, D15, D16 and RC-D1 to RC-D7.

## 6. Explicitly deferred / out of V1

Only items the existing documentation explicitly marks as out of V1 or deferred:

**From `v1-requirements-freeze.md` §4:**
- New incentive implementation or changes to incentive calculation.
- Payroll redesign, including a payroll view without incentive amounts (this is option (c) of D11).
- AI recommendation system.
- Real-time (live push) architecture.
- Depot-to-depot comparison views.
- Export system (Excel/PDF exports beyond existing reports).
- Daily report approval, SLA and Quality **until D1–D4 are answered**. The decisions themselves remain **OPEN**; only their implementation waits.

**From `frontend-backend-contract-reconciliation.md` §8.4:**
- Payroll disbursement / "paid" state and payout files.
- Base salary.
- Report generation content, export and scheduling.
- Notification backend.
- Incentive rule versioning UI.
- RBAC administration screens backed by an API.

No D1–D16 or RC-D1–RC-D9 decision is itself marked DEFERRED or OUT OF V1 by the documentation.

## 7. Freeze rule

**No backend implementation change should be made solely from this document** until each API-affecting OPEN decision in §5 is either **DECIDED** (recorded with its answer) or **explicitly DEFERRED** by the business/product owner.

This document records questions, documented options and the Group 1 decisions only. It does not by itself authorise any change to the API, schema, RBAC, depot isolation, KPI formulas, or incentive/payroll logic. The Group 1 implementation follow-ups (§3.4.5) need their own specified and tested implementation phase.

## 8. Evidence and consistency notes

### 8.1 Documents inspected

- `Docs/product/v1-requirements-freeze.md` (source of D1–D16).
- `Docs/integration/frontend-backend-contract-reconciliation.md` (source of RC-D1 to RC-D9; §4.2, §4.3, §4.6, §5, §7, §8).
- `Docs/product/warehouse-kpi-transformation.md` (§2 incentives/payroll, §5 daily reports, §7 depot isolation, §9 SLA/Quality, §10 open decisions).
- `Docs/api/kpi-results.md` (business-rule assumptions: participant cutoff, rounding, classification, collaborator attribution).
- `Docs/api/warehouse-operations.md` (backend → lifecycle status mapping).
- `backend/docs/architecture/17-approved-business-rules.md` (task states, equal-share rule, I-02, audit history, pause/resume).
- `backend/docs/architecture/26-final-client-decisions.md` (pause/resume role policy).
- `backend/docs/architecture/19-final-api-specification.md` (DTO shapes marked CLIENT DECISION REQUIRED).
- Business/product owner clarification of 2026-10-03: organizational hierarchy, Supervisor operational scope, and the Group 1 decisions (§3.4).
- Business/product owner clarification of 2026-10-03: Supervisor daily report model, OR-1 to OR-9 (§3.5).
- `Docs/requirements/KPI_DAILY_SHIFT_TRACKING.md` (shift-entry loading/unloading totals as BOX quantities).
- `backend/packages/db/migrations/015_create_shift_entries.ts`, `016_create_depot_daily_reports.ts` (truck types, daily report structure).

### 8.2 Contradictions and inconsistencies between documents

1. **Decision-numbering collision.**
   - `v1-requirements-freeze.md` D1–D16 and `frontend-backend-contract-reconciliation.md` D1–D9 reuse the same IDs for different decisions; for example, D9 is "Inventory catalogue scope" in one and "Others and the dashboard summary" in the other.
   - The reconciliation document also refers to "V1 freeze D9" inside its own D8.
   - A single numbering should be agreed before answers are recorded.
2. **Stock visibility (D9 vs RC-D8).**
   - `v1-requirements-freeze.md` D9 and `warehouse-kpi-transformation.md` §7 state that stock balances and movements are depot-restricted for supervisors.
   - Reconciliation §4.2 documents that `GET /inventory/:id` returns per-location balances for all depots, and lists this as an open security finding.
   - **RC-D8 is now DECIDED for Supervisors** (cross-depot stock visible). It is **not** extended to Others, so for Others the unscoped balances remain an open finding. The reconciliation document (§4.2, §8.2 #2, §9) and the freeze sheet have **not** been updated.
3. **Others' access (RC-D9).**
   - `v1-requirements-freeze.md` §1.1 #7 states Others see their own records only.
   - `warehouse-kpi-transformation.md` §7 documents `/dashboard` as "Own depot (Others: their profile's depot)".
   - **RC-D9 is now DECIDED:** Others may see depot-level dashboard summary information (not organization-wide). The freeze sheet's "own records only" statement does not yet reflect this exception, and how an Other employee's depot context is determined is not specified.
4. **Task state terminology (RC-D5).**
   - `17-approved-business-rules.md` describes the confirmed path as `CREATED -> ASSIGNED -> IN_PROGRESS -> PAUSED -> IN_PROGRESS -> COMPLETED`.
   - The implementation and `Docs/api/warehouse-operations.md` use `PENDING` (not CREATED) as the initial backend status.
   - The frontend V1 lifecycle adds states (ACCEPTED, VERIFIED, …) with no backend status.
5. **Report audience (RC-D7).** The backend `report:read` includes Others; the frontend route blocks them.
6. **"Super Admin unrestricted" (D13).** `v1-requirements-freeze.md` §1.1 states Super Admin has unrestricted access, with the pause/resume exception documented alongside it.
7. **Collaborator credit (D15).**
   - Equal sharing among collaborators is **confirmed** for incentives (`17-approved-business-rules.md`) and applied to KPI BOX credit by analogy.
   - Collaborator **attribution** (who counts as a collaborator, for KPI) is **CLIENT DECISION REQUIRED** (I-02).
8. **Freeze verification counts are stale.** `v1-requirements-freeze.md` §7 records frontend 363/363; the current verified baseline is 391/391 (reconciliation §9). This is not a decision, but the freeze sheet should be refreshed when decisions are recorded.
9. **Supervisor depot scope (D5/D6) vs the implemented and documented depot isolation.**
   - The decided organization-wide Supervisor task scope (§3.4) contradicts:
     - `v1-requirements-freeze.md` §1.2 #8–#11 (Supervisor restricted server-side to the depot of their employee profile; no-depot Supervisor refused);
     - §2 ("Supervisor ↔ depot: a supervisor's depot is their employee profile's depot");
     - `warehouse-kpi-transformation.md` §1, §4 and §7 (Supervisor confined to "their own depot").
   - The implementation follows those documents. None of them has been modified; the implementation change is a follow-up (§3.4.5).
10. **Organizational hierarchy vs RBAC hierarchy.**
    - `v1-requirements-freeze.md` §1.1 #1 and `warehouse-kpi-transformation.md` §1 present the **RBAC** role order `SUPER ADMIN → ADMIN → ACCOUNTANT → SUPERVISOR → OTHERS`.
    - The canonical **organizational** hierarchy (§3.4.1) places Supervisor, Accountant and Others in parallel under Admin.
    - Per §3.4.3 these are separate concepts. The RBAC order is not a reporting line, and no permission is derived from either.
11. **"Their supervisor" wording.** `v1-requirements-freeze.md` D10 says Others' task history is visible to "their supervisor". Per §3.4.1, Others do not report to a Supervisor. Restated in D10 above; the source document is unchanged.
12. **D10 vs the current audit rules.** `v1-requirements-freeze.md` D10, `warehouse-kpi-transformation.md` §10 and the implementation give Others no audit access. The decision gives Others their own recorded actions only. Implementation follow-up in §3.4.5.
13. **Correction record.** The first Group 1 recording (2026-10-03) misrecorded D7 as "depot mandatory", D8 as "home-depot staff only" and D10 as "no audit view for Others", by reading temporary conversational A/B labels as the source-document option letters. These are corrected in §3.4.4 and §4. The temporary labels have no meaning in the source documents.
14. **Daily report model (OR-1 to OR-8) vs the implemented daily report.**
    - Fixed `truck_types` (including CROSSING as a vehicle type) and the per-depot report linkage conflict with OR-1, OR-5 and OR-8.
    - `warehouse-kpi-transformation.md` §5 describes loading/unloading as "operation counts"; OR-2/OR-3 define them as vehicle counts.
    - See §3.5.4. The source documents are unchanged.

### 8.3 Documented assumption without a decision ID

- **Loading/unloading classification by `task_type` synonym:** "PROVISIONAL" (`Docs/api/kpi-results.md`; freeze §2, "confirm or change").
- It has **no D number** in either series.
- It is listed here so it is not lost. No ID has been assigned, because assigning one would create a decision the documents do not number.

### 8.4 Readiness

> **Deployment mode (2026-10-03).** The deployment decisions and their implementation status are recorded in `Docs/product/v1-deployment-readiness.md`. That includes the D5/D6 Supervisor scope (now implemented), the Others dashboard summary (implemented), and the deployment-mode rules for depotless tasks, cross-depot attribution, KPI participants and rounding.

The register is complete for every decision the documents number (D1–D16 and RC-D1 to RC-D9).

- **Group 1 is recorded (2026-10-03, corrected):** D5, D6, D10, D11, D13, RC-D8 and RC-D9 are DECIDED; D7 and D8 are DECIDED WITH OPEN SUB-DECISION.
- **Daily report model:** OR-1 to OR-8 are DECIDED; **OR-9 (authoritative BOX source for KPI) is OPEN**.
- **Open Group 1 sub-points:** D7-S1 depot-specific representation/counting of depotless tasks; D8-S1 employee-table attribution for cross-depot work; D10 event types and history period; RC-D8 Others' cross-depot stock exposure (not covered by the decision); RC-D9 how an Other's depot context is determined.
- **The remaining OPEN decisions are ready for manual business decisions:** D1, D2, D3, D4, D9, D12, D14, D15, D16 and RC-D1 to RC-D7.
- This is subject to agreeing a single numbering (§8.2 #1) and to the implementation follow-ups and documentation conflicts in §3.4.5 and §8.2.
