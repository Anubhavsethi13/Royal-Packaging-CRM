# Approved Business Rules Specification

## Scope and classification

This document is the implementation contract derived solely from `AGENTS.md`, the supplied reference documents, and architecture documents 01–16. No client clarification, historical incentive-calculation Markdown, or Royal Packaging report template is present in the repository beyond those sources.

Every requirement below has exactly one classification:

| Classification | Meaning |
|---|---|
| **CONFIRMED** | Explicitly supported by supplied requirements. |
| **CLIENT DECISION REQUIRED** | A business rule is missing, ambiguous, or materially affects implementation. No default may be assumed. |
| **RECOMMENDATION** | A technical/design direction, not a business rule. |
| **DEFERRED** | Explicitly postponed until justified by future evidence or requirements. |

## Core operating rules

| Requirement | Classification |
|---|---|
| The operational flow is client/order -> inventory truth -> scan/trace -> assign -> move -> complete -> quality -> incentive -> payroll -> KPI/report feedback. | **CONFIRMED** |
| PostgreSQL is the authoritative source of business state. | **CONFIRMED** |
| Floot Realtime is a post-commit freshness/synchronization signal, not a transaction mechanism or source of truth. | **CONFIRMED** |
| The client must recover authoritative state after refresh/reconnect from PostgreSQL-backed backend reads. | **CONFIRMED** |
| Box is the only operational quantity unit. | **CONFIRMED** |
| The system has nine depots and depot-specific location hierarchy. | **CONFIRMED** |
| Use a TypeScript modular monolith; do not introduce Kafka, RabbitMQ, Redis, microservices, or graph routing without a documented justification. | **RECOMMENDATION** |
| Object-storage provider, upload lifecycle, data volumes, and production sizing. | **CLIENT DECISION REQUIRED** |

## Task lifecycle

The only confirmed task-state path is `CREATED -> ASSIGNED -> IN_PROGRESS -> PAUSED -> IN_PROGRESS -> COMPLETED`. Quality, incentive generation, and payroll processing are required workflow stages, but are not confirmed task-state values. Reassignment, cancellation, and reopening are required operations; their source/target states are not yet approved.

| Current State | Action | Next State | Allowed Role | Preconditions | Side Effects | Event |
|---|---|---|---|---|---|---|
| N/A | Create task (**CONFIRMED** state `CREATED`; creation rule otherwise **CLIENT DECISION REQUIRED**) | CREATED | **CLIENT DECISION REQUIRED** | Client/order, task type, inventory links, and creation authority are **CLIENT DECISION REQUIRED**. | Create task record; required audit/event details are **CLIENT DECISION REQUIRED**. | Task-created event taxonomy is **CLIENT DECISION REQUIRED**. |
| CREATED | Assign one or more employees (**CONFIRMED**) | ASSIGNED | **CLIENT DECISION REQUIRED** | Valid task; server-side authorization; employee eligibility and assignment guards are **CLIENT DECISION REQUIRED**. | Preserve assignment history (**CONFIRMED**); task event/audit details **CLIENT DECISION REQUIRED**. | Assignment-changed freshness is **CONFIRMED**; durable event type is **CLIENT DECISION REQUIRED**. |
| ASSIGNED | Start work (**CONFIRMED**) | IN_PROGRESS | **CLIENT DECISION REQUIRED** | Whether at least one current assignment is mandatory is **CLIENT DECISION REQUIRED**. | Record transition; further side effects **CLIENT DECISION REQUIRED**. | Status-changed freshness is **CONFIRMED**; durable event type **CLIENT DECISION REQUIRED**. |
| IN_PROGRESS | Pause (**CONFIRMED**) | PAUSED | **CLIENT DECISION REQUIRED** | Pause guards/reason are **CLIENT DECISION REQUIRED**. | Record transition; KPI/time effect is **CLIENT DECISION REQUIRED**. | Status-changed freshness **CONFIRMED**; durable event type **CLIENT DECISION REQUIRED**. |
| PAUSED | Resume (**CONFIRMED**) | IN_PROGRESS | **CLIENT DECISION REQUIRED** | Resume guards/reason are **CLIENT DECISION REQUIRED**. | Record transition; overtime/KPI effect is **CLIENT DECISION REQUIRED**. | Status-changed freshness **CONFIRMED**; durable event type **CLIENT DECISION REQUIRED**. |
| Unapproved source state | Reassign (**CONFIRMED operation**) | **CLIENT DECISION REQUIRED** | **CLIENT DECISION REQUIRED** | Eligible source states, employee join/leave rules, and reason are **CLIENT DECISION REQUIRED**. | Preserve assignment history (**CONFIRMED**); incentive-group effect **CLIENT DECISION REQUIRED**. | Assignment-changed freshness **CONFIRMED**; durable event type **CLIENT DECISION REQUIRED**. |
| Unapproved source state | Cancel (**CONFIRMED operation**) | **CLIENT DECISION REQUIRED** | **CLIENT DECISION REQUIRED** | Eligible source states, reason, inventory/financial reversal, and approval are **CLIENT DECISION REQUIRED**. | Cancellation effects are **CLIENT DECISION REQUIRED**. | Event and realtime impact are **CLIENT DECISION REQUIRED**. |
| Unapproved source state | Reopen (**CONFIRMED operation**) | **CLIENT DECISION REQUIRED** | **CLIENT DECISION REQUIRED** | Eligible source states, reason, quality/financial treatment, and approval are **CLIENT DECISION REQUIRED**. | Reopen effects are **CLIENT DECISION REQUIRED**. | Event and realtime impact are **CLIENT DECISION REQUIRED**. |
| IN_PROGRESS | Complete (**CONFIRMED**) | COMPLETED | **CLIENT DECISION REQUIRED** | Valid state; server-side authorization; required photo evidence, completed box quantity, inventory rule, and quality sequencing are **CLIENT DECISION REQUIRED**. | Prevent duplicate completion/inventory/incentive/payroll (**CONFIRMED**); final quality/financial side effects **CLIENT DECISION REQUIRED**. | Status-changed freshness **CONFIRMED**; durable completion event **CLIENT DECISION REQUIRED**. |
| COMPLETED or approved quality state | Review quality (**CONFIRMED workflow stage**) | **CLIENT DECISION REQUIRED** | **CLIENT DECISION REQUIRED** | Inspection criteria, evidence, damage/quantity accuracy criteria are **CLIENT DECISION REQUIRED**. | Pass/fail/adjust outcome exists (**CONFIRMED**); task/incentive/payroll consequence **CLIENT DECISION REQUIRED**. | Quality event/freshness is **CLIENT DECISION REQUIRED**. |
| Approved eligible result | Generate incentive (**CONFIRMED workflow stage**) | Not a confirmed task state | **CLIENT DECISION REQUIRED** | Formula, quality gate, overtime, participants, rounding, and approval rules are **CLIENT DECISION REQUIRED**. | Create canonical incentive result/ledger (**CONFIRMED**); exact status/audit **CLIENT DECISION REQUIRED**. | Incentive event/freshness is **CLIENT DECISION REQUIRED**. |
| Approved incentive result | Process payroll (**CONFIRMED workflow stage**) | Not a confirmed task state | **CLIENT DECISION REQUIRED** | Payroll approval/timing/correction rules are **CLIENT DECISION REQUIRED**. | Payroll consumes approved incentive result without recalculation (**CONFIRMED**). | Payroll status freshness is **CONFIRMED**; durable event type **CLIENT DECISION REQUIRED**. |

The full transition matrix—allowed actor, guards, audit requirement, durable event, and KPI impact—is **CLIENT DECISION REQUIRED**. A generic status-update endpoint is prohibited (**CONFIRMED**).

## Scan, photo, and trace workflow

### Confirmed rules

| Rule | Classification |
|---|---|
| Mobile phone camera is used for photo-based layer tracing. | **CONFIRMED** |
| Trace evidence relates to a task and records layer number, box quantity, employee/capturer, capture timestamp, and photo reference/storage key. | **CONFIRMED** |
| Photos represent loading/unloading layers and may include product/material and batch information where applicable. | **CONFIRMED** |
| Multiple layers are represented as separate layer-photo records for a task. | **CONFIRMED** |
| Completed box total is calculated from layer quantities only according to an approved validation rule; the source illustrates summing layers but does not define acceptance rules. | **CLIENT DECISION REQUIRED** |
| Photo binary is stored in object storage and metadata in PostgreSQL. | **CONFIRMED** |

### Decisions not supplied

| Topic | Classification | Business rule needed |
|---|---|---|
| When a photo is mandatory | **CLIENT DECISION REQUIRED** | Which task/move/layer conditions require evidence before completion. |
| Scan identifier and validation | **CLIENT DECISION REQUIRED** | Barcode/other identifier, product/batch matching, and scan-to-task relation. |
| Quantity entry | **CLIENT DECISION REQUIRED** | Whether a capturer manually enters box quantity, scans it, or both; validation/tolerance. |
| Layer numbering | **CLIENT DECISION REQUIRED** | Uniqueness, ordering, missing layers, duplicate layers, and final total validation. |
| Evidence correction | **CLIENT DECISION REQUIRED** | Who may correct evidence, reason/audit requirement, and whether corrected evidence replaces or supersedes prior evidence. |
| Upload failure | **CLIENT DECISION REQUIRED** | Whether the task/move is blocked, retried, or escalated and how orphan objects/metadata are reconciled. |
| Deletion/replacement | **CLIENT DECISION REQUIRED** | Whether evidence can be deleted, retained, or only superseded. |
| Completion dependency | **CLIENT DECISION REQUIRED** | Required evidence threshold and validation before completion. |
| Photo retention period | **CLIENT DECISION REQUIRED** | Lifetime retention is confirmed for warehouse, payroll, and audit records, but not explicitly for photo binaries. |

## Inventory movement

| Rule | Classification |
|---|---|
| Inventory is authoritative in PostgreSQL. | **CONFIRMED** |
| Inventory is identified using product code plus batch where relevant. | **CONFIRMED** |
| All movement/current inventory quantities are boxes. | **CONFIRMED** |
| Inventory movement is recorded and current inventory state is updated in the business operation’s database transaction. | **CONFIRMED** |
| Source location, destination location, movement type, task/order linkage, and validation are required to define movement semantics. | **CLIENT DECISION REQUIRED** |
| Partial movement behaviour, residual work/stock, completion treatment, reservation, correction/reversal, negative inventory, and reconciliation are not supplied. | **CLIENT DECISION REQUIRED** |
| Movement audit trail and duplicate prevention are required for business-critical operations; exact retained fields and audit matrix are not supplied. | **CLIENT DECISION REQUIRED** |
| No ERP integration, MB51, or MB52 is part of this specification. | **CONFIRMED** |

No partial-movement behaviour may be implemented until it is approved. Inventory movement must never rely on realtime delivery (**CONFIRMED**).

## Multi-employee tasks

| Rule | Classification |
|---|---|
| A task may have multiple employees. | **CONFIRMED** |
| An employee may have multiple active tasks. | **CONFIRMED** |
| Assignment history must be retained through a task-assignment relationship; a single task employee field is insufficient. | **CONFIRMED** |
| Employees working together on a task receive equal shares of that task’s incentive. | **CONFIRMED** |
| Assignment authority, employee eligibility, depot scope, and effective assignment timing. | **CLIENT DECISION REQUIRED** |
| When an assigned employee becomes part of the incentive group. | **CLIENT DECISION REQUIRED** |
| Incentive treatment for joining after start, removal/reassignment, or leaving before completion. | **CLIENT DECISION REQUIRED** |
| Assignment correction/reversal audit and KPI/productivity attribution. | **CLIENT DECISION REQUIRED** |

## Incentive engine

### Canonical architecture

| Rule | Classification |
|---|---|
| There is exactly one canonical `IncentiveService`. | **CONFIRMED** |
| `IncentiveService` owns calculation, quality validation, approved penalties, equal allocation, and incentive-ledger creation. | **CONFIRMED** |
| Payroll consumes the approved incentive result and must not independently recalculate it. | **CONFIRMED** |
| Monetary values/rates use PostgreSQL `NUMERIC`, not JavaScript floating-point arithmetic. | **CONFIRMED** |
| Calculation inputs, task eligibility, quality gate, penalty rule, formula, rule version, rounding/remainder, minimum payment, approval, correction/reversal, and audit details. | **CLIENT DECISION REQUIRED** |

### Historical versus current rules

| Rule set | Classification | Treatment |
|---|---|---|
| Historical material is described as a 6% total incentive pool with penalties. | **CONFIRMED** as legacy reference only. |
| Historical formula Markdown is not present in the repository. | **CLIENT DECISION REQUIRED** to supply if it must be preserved. |
| New rule: collaborators receive equal shares of a task’s incentive. | **CONFIRMED** current allocation rule. |
| Relationship of the historical 6%/penalty model to the new rule. | **CLIENT DECISION REQUIRED**; do not merge models. |

### Allocation rule

For an approved task incentive total, every employee in the **approved participating-employee group** receives an equal share (**CONFIRMED**). Defining that group when assignments change, and defining rounding/remainder handling, are **CLIENT DECISION REQUIRED**.

## Overtime

| Rule | Classification |
|---|---|
| There are two shifts. | **CONFIRMED** |
| Shift timings must be configuration data and must not be hard-coded. | **CONFIRMED** |
| Employee shift assignments use effective dates. | **CONFIRMED** |
| Overtime affects incentives. | **CONFIRMED** |
| If completion occurs after the applicable shift boundary, the approved overtime rule applies. | **CONFIRMED** |
| Shift start/end times, formula, boundary handling, paused/resumed behaviour, and reporting interpretation. | **CLIENT DECISION REQUIRED** |
| SLA formula. | **DEFERRED**; no SLA requirement/formula is supplied. |

## Quality and damage

| Rule | Classification |
|---|---|
| Quality gate follows completion and precedes incentive/payroll in the workflow. | **CONFIRMED** |
| Quality outcomes include pass, fail, and adjust. | **CONFIRMED** |
| Quality data must be captured before an incentive becomes payable when required by the approved business rule. | **CONFIRMED** |
| Inspection actor, damage taxonomy, task/box accuracy criteria, evidence, correction process, reopening effect, and financial consequence of fail/adjust. | **CLIENT DECISION REQUIRED** |
| Whether quality is a task state or a separate lifecycle. | **CLIENT DECISION REQUIRED** |
| Whether fail/adjust blocks, reverses, changes, or permits incentive/payroll. | **CLIENT DECISION REQUIRED** |

## Payroll

```text
Task -> IncentiveService -> Incentive Ledger -> Approval -> Payroll Ledger
```

| Rule | Classification |
|---|---|
| Payroll consumes the approved incentive result; it does not recalculate incentive. | **CONFIRMED** |
| Incentive ledger, payroll ledger, and payroll approval records are required domain records. | **CONFIRMED** |
| Payroll status change is a realtime freshness category. | **CONFIRMED** |
| Payability timing, mandatory approval, approver, payroll period, correction/reversal, and duplicate-prevention mechanism. | **CLIENT DECISION REQUIRED** |
| Payroll and audit records are retained for the lifetime of the system. | **CONFIRMED** |

## RBAC

The identified roles are Super Admin, Main Admin, Admin, and Manager (**CONFIRMED**). Permissions must be enforced server-side rather than scattered role checks (**CONFIRMED**). The role-to-capability mapping is not supplied, so every matrix cell is **CLIENT DECISION REQUIRED**.

| Capability | Super Admin | Main Admin | Admin | Manager |
|---|---|---|---|---|
| Users | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Employees | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Clients | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Orders | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Inventory | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Tasks | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Task assignment | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Task completion | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Quality | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Incentives | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Incentive rules | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Payroll | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Reports | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Exports | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Audit history | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Role/permission management | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |

Server rules: never trust client-supplied user ID, employee ID, role/role ID, depot ID/scope, approval actor, incentive approver, or points (**CONFIRMED** security constraint). The server derives identity from the verified session, resolves roles/permissions and authorised depot/domain scope, then authorizes the operation (**CONFIRMED**). User-to-employee mapping and scoped-authority policy are **CLIENT DECISION REQUIRED**.

## KPI rules

KPIs are derived from operational data and not manually entered dashboard values (**CONFIRMED**). KPI definitions, targets, and snapshots are required (**CONFIRMED**). Required drill-down dimensions are depot, employee, task type, client, material/product, date, and shift (**CONFIRMED**).

| KPI | Definition | Formula | Source Data | Dimensions | Target | Frequency | Owner |
|---|---|---|---|---|---|---|---|
| Task Completion Rate | Tasks completed relative to an approved task population. | CLIENT DECISION REQUIRED | Tasks and task events (**CONFIRMED**). | All required dimensions where applicable (**CONFIRMED**). | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Employee Productivity | Completed boxes, task duration, and employee attribution. | CLIENT DECISION REQUIRED | Completed boxes, task timing, employee/task assignments (**CONFIRMED**). | All required dimensions where applicable (**CONFIRMED**). | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |
| Damage Rate | Quality/damage result rate. | CLIENT DECISION REQUIRED | Quality records (**CONFIRMED**). | All required dimensions where applicable (**CONFIRMED**). | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED | CLIENT DECISION REQUIRED |

KPI calculation inclusion for pauses, reassignment, cancellation, reopening, quality adjustment, partial moves, and multi-employee attribution is **CLIENT DECISION REQUIRED**. Snapshot cadence, correction/backfill, access scope, and retention are **CLIENT DECISION REQUIRED**.

## Reporting

Supplied templates are authoritative for report columns, ordering, totals, filters, formatting, and Excel/PDF requirements (**CONFIRMED**). No templates are present in the repository; no detailed report field, calculation, output layout, or access mapping can therefore be confirmed.

| Report name / group | Purpose, source data, filters, calculations, columns, format, access roles | Frequency |
|---|---|---|
| Daily Report / Daily Performance | CLIENT DECISION REQUIRED: template and source mapping unavailable. | Reports are generated daily (**CONFIRMED**); detailed schedule **CLIENT DECISION REQUIRED**. |
| Daily Present, Absent, Short Performance, In/Out | CLIENT DECISION REQUIRED: template and attendance source unavailable. | As above. |
| Daily Late IN, Early IN, Early OUT, Over Time | CLIENT DECISION REQUIRED: template, attendance/shift/overtime rules unavailable. | As above. |
| Daily GPS Approved, Rejected, Pending | CLIENT DECISION REQUIRED: template and GPS source/workflow unavailable. | As above. |
| Daily Mis Punch, Half Day | CLIENT DECISION REQUIRED: template and attendance workflow unavailable. | As above. |
| Monthly, Periodic, Location, Leave, Salary, Yearly, Other Report | CLIENT DECISION REQUIRED: specifications, source mappings, filters, calculations, columns, format, and access unavailable. | Reports generated daily is confirmed; each report’s schedule is CLIENT DECISION REQUIRED. |

MB51 and MB52 must not be implemented (**CONFIRMED**). A shared normalized report-query layer with Excel/PDF renderers is a **RECOMMENDATION**, not a report business rule.

## Realtime

| Rule | Classification |
|---|---|
| Channels are `warehouse:ops`, `inventory`, and `payroll`. | **CONFIRMED** |
| Relevant freshness categories are task status, assignment, inventory movement, payroll status, and relevant KPI updates. | **CONFIRMED** |
| Business state changes commit in PostgreSQL before any realtime publication. | **CONFIRMED** |
| At-most-once delivery is acceptable; missing delivery must not affect business correctness. | **CONFIRMED** |
| Reconnect/refresh fetches current PostgreSQL-backed authoritative state. | **CONFIRMED** |
| Monitor publication attempts/failures, reconnects, stale clients, and resynchronization requests. | **CONFIRMED** |
| Event payload/envelope/version, exact event taxonomy, subscription authorization, retry/replay approach, channel ownership, stale-version fields, and resynchronization endpoint/filter contract. | **CLIENT DECISION REQUIRED** |
| Adding a broker or making Floot durable/authoritative. | **DEFERRED**; not justified by current requirements. |

## Transaction boundaries

All transactions use PostgreSQL as the system of record. Realtime notification happens after a successful commit and failure to publish does not roll back a committed business operation (**CONFIRMED**).

| Critical operation | Inputs / validations | Database transaction and changes | Events / realtime | Rollback and duplicate rule |
|---|---|---|---|---|
| Employee/account creation | Server-derived actor; authorization; exact account/employee rules **CLIENT DECISION REQUIRED**. | Identity/employee records and required audit must be atomic (**CONFIRMED**); fields/links **CLIENT DECISION REQUIRED**. | Event/audit taxonomy **CLIENT DECISION REQUIRED**. | Security failure leaves no partial state (**CONFIRMED**). |
| Role/permission change | Verified session, server-side authority; role matrix **CLIENT DECISION REQUIRED**. | Role/permission mapping and applicable audit atomic (**CONFIRMED**). | Event/realtime requirements **CLIENT DECISION REQUIRED**. | No partial mapping on failure (**CONFIRMED**). |
| Task assignment/reassignment | Valid task, server-side actor, approved assignment guards. | Assignment history, state transition if applicable, event/audit in one transaction (**CONFIRMED** boundary); exact guards **CLIENT DECISION REQUIRED**. | Assignment freshness after commit (**CONFIRMED**). | No partial assignment/history; idempotency rules **CLIENT DECISION REQUIRED**. |
| Inventory movement | Authorised actor, inventory validation, approved movement semantics. | Movement record and current inventory state update atomic (**CONFIRMED**). | Inventory freshness after commit (**CONFIRMED**). | No partial movement/state update; partial/reversal/negative-stock and duplicate identity **CLIENT DECISION REQUIRED**. |
| Task completion | Valid task state, server-side actor, approved evidence/quantity/inventory rules. | Completion, inventory movement, task event, quality/incentive/payroll effects must not be partially applied (**CONFIRMED**). Exact quality/payroll boundary **CLIENT DECISION REQUIRED**. | Status freshness after commit (**CONFIRMED**). | Prevent duplicate completion, inventory movement, incentive, and payroll (**CONFIRMED**); precise control design **CLIENT DECISION REQUIRED**. |
| Incentive creation | Approved eligibility/quality/policy/participants; all detailed rules **CLIENT DECISION REQUIRED**. | Canonical calculation/result/ledger allocation; exact transaction point **CLIENT DECISION REQUIRED**. | Incentive event/freshness **CLIENT DECISION REQUIRED**. | No duplicate incentive; correction/reversal **CLIENT DECISION REQUIRED**. |
| Payroll ledger creation | Approved incentive result; authorized approver/timing **CLIENT DECISION REQUIRED**. | Payroll consumes source result without recalculation (**CONFIRMED**); entry/approval details **CLIENT DECISION REQUIRED**. | Payroll freshness after commit (**CONFIRMED**). | No duplicate payroll; correction/reversal **CLIENT DECISION REQUIRED**. |
| Quality correction | Approved actor, reason, outcome/correction rules **CLIENT DECISION REQUIRED**. | Quality, related financial/task changes, and audit boundary **CLIENT DECISION REQUIRED**. | Quality/relevant freshness **CLIENT DECISION REQUIRED**. | No partial correction; reopening/reversal rules **CLIENT DECISION REQUIRED**. |

Photo object upload cannot share a normal PostgreSQL transaction (**CONFIRMED technical constraint**). The two-step finalization, failed-upload, and cleanup process is **CLIENT DECISION REQUIRED**.

## Data retention

| Data | Rule | Classification |
|---|---|---|
| Warehouse/operational records | Retain for the lifetime of the system. | **CONFIRMED** |
| Payroll records | Retain for the lifetime of the system. | **CONFIRMED** |
| Audit records | Retain for the lifetime of the system. | **CONFIRMED** |
| Photo binaries and photo lifecycle | No explicit retention period supplied. | **CLIENT DECISION REQUIRED** |
| Backups, restoration testing, legal/privacy retention, export retention, and logging retention | Not supplied. | **CLIENT DECISION REQUIRED** |

## Security

| Rule | Classification |
|---|---|
| All authorization is server-side. | **CONFIRMED** |
| Secure HTTP-only session cookies use `Secure` and `SameSite=Lax`. | **CONFIRMED** |
| Passwords use `bcryptjs`; `jose` is used where session/JWT cryptography applies. | **CONFIRMED** |
| Five failed logins within fifteen minutes cause a fifteen-minute server-enforced lockout. | **CONFIRMED** |
| Server derives the actor from verified session/persisted authorization and validates employee, depot, incentive, quality, payroll, and approval authority. | **CONFIRMED** |
| Client-supplied user/employee identifiers, role IDs, depot IDs/scope, points, approval actors, and incentive approvers cannot bypass authorization. | **CONFIRMED** |
| Permission catalogue, depot-scope model, user-to-employee resolution, approval authority, session expiry/rotation/revocation, password policy, MFA, and recovery. | **CLIENT DECISION REQUIRED** |

# Client Decisions Still Required

## Blocking Decisions

| ID | Decision | Why It Matters | Blocks Which Module | Priority |
|---|---|---|---|---|
| B-01 | Complete task transition/actor/precondition/side-effect/event/audit/KPI matrix. | Defines valid lifecycle and authorization. | Tasks, API, DB, audit, KPI, realtime. | Critical |
| B-02 | Scan/trace, layer-evidence acceptance/correction/upload-failure and completion-evidence rules. | Determines trace validity and completion. | Photo/Trace, Tasks, Inventory, API. | Critical |
| B-03 | Inventory move/partial move/reservation/reversal/negative-stock/reconciliation rules. | Determines inventory truth and atomic operations. | Inventory, Tasks, DB, KPI. | Critical |
| B-04 | Quality/damage workflow and pass/fail/adjust consequences. | Determines completion, payability, corrections, and reopening. | Quality, Tasks, Incentives, Payroll. | Critical |
| B-05 | Incentive formula/policy, legacy 6% reconciliation, overtime, participants, rounding, corrections, and approval. | Required to calculate/pay incentives correctly. | Incentives, Payroll, KPI, Reports. | Critical |
| B-06 | Payroll approval, timing, posting, correction, and duplicate-prevention policy. | Required for legally/operationally valid payroll ledger. | Payroll, Incentives, Audit. | Critical |
| B-07 | RBAC matrix, depot scope, user-employee mapping, and approval authority. | Required for every protected action. | Auth, RBAC, all domains. | Critical |
| B-08 | Report templates and source mappings, including attendance/GPS/leave/salary data. | Templates are authoritative and source data is missing. | Reports, data model, KPI. | Critical for reports |

## Important but Non-Blocking Decisions

| ID | Decision | Why It Matters | Blocks Which Module | Priority |
|---|---|---|---|---|
| I-01 | Exact shift times and overtime boundary interpretation. | Required before overtime calculation/reporting. | Employees/Shifts, Incentives, Reports. | High |
| I-02 | KPI formulas, targets, owner, cadence, corrections, and collaborator attribution. | Required for valid KPIs, not core transaction recording. | KPI, Dashboard, Reports. | High |
| I-03 | API DTO/error/idempotency/read-resync contract. | Required before public API implementation. | API, Realtime. | High |
| I-04 | Floot event payload/version/subscription/retry contract. | Required before realtime implementation. | Realtime, UI sync. | High |
| I-05 | Photo retention and object-storage lifecycle. | Required for compliance/cost/recovery. | Photo/Trace, Operations. | High |

## Deferred Decisions

| ID | Decision | Why It Matters | Blocks Which Module | Priority |
|---|---|---|---|---|
| D-01 | SLA definition/formula. | No SLA requirement exists; do not invent one. | None until requested. | Deferred |
| D-02 | Broker, cache, microservice, or graph-routing adoption. | No current requirement justifies additional infrastructure. | None. | Deferred |
| D-03 | Final production sizing, performance SLOs, and routing-engine replacement. | Requires measured workload and location complexity. | Production readiness. | Deferred |

# Implementation Readiness

| Domain | Readiness | Basis |
|---|---|---|
| Auth | READY WITH CONFIGURATION | Core security/lockout technology is confirmed; session lifecycle policy remains required. |
| RBAC | BLOCKED BY CLIENT DECISION | Role/permission/depot/approval matrix is absent. |
| Users | BLOCKED BY CLIENT DECISION | Account lifecycle and user-to-employee mapping are absent. |
| Employees | READY WITH CONFIGURATION | Employee and configurable shifts are confirmed; shift times/assignment authority remain decisions. |
| Depots | READY WITH CONFIGURATION | Nine depots are confirmed; scope model remains decision-required. |
| Locations | READY WITH CONFIGURATION | Depot-specific hierarchy is confirmed; detailed hierarchy/movement semantics remain decisions. |
| Clients | READY WITH CONFIGURATION | Client entity is confirmed; required fields/access rules await design/approval. |
| Orders | BLOCKED BY CLIENT DECISION | Order-task/inventory linkage and required fields are not confirmed. |
| Inventory | BLOCKED BY CLIENT DECISION | Identification/box rule is confirmed, but move/partial/reversal/negative-stock rules are absent. |
| Tasks | BLOCKED BY CLIENT DECISION | Core path exists; full transition, actors, and guards are absent. |
| Photo/Trace | BLOCKED BY CLIENT DECISION | Required metadata is confirmed; evidence acceptance/correction/failure policy is absent. |
| Quality | BLOCKED BY CLIENT DECISION | Outcomes exist; inspection and financial consequences are absent. |
| Incentives | BLOCKED BY CLIENT DECISION | One service/equal allocation are confirmed; formula and policy are absent. |
| Payroll | BLOCKED BY CLIENT DECISION | Source relationship is confirmed; approval/posting/correction rules are absent. |
| KPI | BLOCKED BY CLIENT DECISION | Dimensions/source examples are confirmed; formulas/targets/cadence are absent. |
| Realtime | READY WITH CONFIGURATION | Authority, channels, post-commit and resync rules are confirmed; message/read contract remains needed. |
| Reports | BLOCKED BY CLIENT DECISION | Scope/exclusions are confirmed; templates/source mappings are absent. |
| Audit | READY WITH CONFIGURATION | Lifetime retention and business-critical need are confirmed; per-operation audit matrix remains required. |

## Final client-resolution addendum

This addendum supersedes earlier text only where the client has now answered it. Inventory now confirms partial movement proportional fields, no negative stock, immutable completed movements, and reversal/adjustment corrections. Quality now confirms score, damage rate, task accuracy, final inventory status, and `damage rate >= 5% -> damaged`, otherwise `available`. Payroll now confirms `pending -> approved -> paid`, Monday–Sunday default period, and adjustment/correction rather than silent editing after approval. Daily KPI/reporting cadence applies where applicable.

The financial chain is now `Task -> IncentiveService -> Incentive Ledger -> Payroll Ledger -> Approval -> Payroll processing`. This does not make payroll approval actor, incentive formula, quality financial consequence, or participant cutoff confirmed. Historical 6%/percentage allocation and the legacy points formula remain historical reference only; equal task-level sharing among participating employee IDs is the confirmed new rule.
