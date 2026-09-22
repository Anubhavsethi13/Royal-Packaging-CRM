# Royal Packaging CRM — Requirements Analysis

## Scope and evidence

This analysis is based on every file currently in the repository, including all files in `docs/references/` and the root `AGENTS.md`. The repository is presently a documentation-only scaffold: `apps/`, `packages/`, `scripts/`, and `tests/` contain no files; `README.md`, `package.json`, and `.env.example` are empty. No application code, database schema, migrations, API contracts, report templates, historical incentive document, or supplied client report file is currently present.

Requirements below are classified as **confirmed**, **recommended direction**, or **TBD**. Recommendations from the reference documents are not treated as approved business rules where they go beyond confirmed requirements.

## 1. Current system architecture

### Current repository state

There is no running system yet. The only implemented architecture is the intended repository shape and engineering policy documented in the references.

### Required architectural direction

The documented direction is a TypeScript modular monolith. PostgreSQL is the authoritative source for business state. Kysely provides database access, Zod validates external inputs, `bcryptjs` hashes passwords, `jose` is used for session/JWT-related cryptography where applicable, object storage holds photo binaries, and Floot Realtime distributes non-authoritative freshness notifications.

```text
Mobile / Web clients
        |
        v
TypeScript backend (routes -> domain services -> Kysely)
        |                         |
        |                         +--> Object storage (photo binary upload/access)
        v
PostgreSQL (authoritative operational and financial record)
        |
        +--> Floot Realtime (post-commit freshness signals only)
        |
        +--> KPI / report queries and snapshots
```

The backend must be organised by domain rather than as generic CRUD endpoints. Route handlers validate and invoke domain services; they must not contain core business logic. No event broker (Kafka/RabbitMQ) is justified by the current requirements.

### Source-of-truth and recovery model

Every business mutation is committed to PostgreSQL before a related realtime notification is published. Floot delivery may be at most once. A client that misses, duplicates, or receives no notification must refetch authoritative PostgreSQL-backed state after reconnect, refresh, or detected staleness. Realtime failure must not roll back an otherwise successful warehouse operation.

The required initial deployment topology is a backend behind a load balancer/reverse proxy with PostgreSQL, plus backend integrations to object storage and Floot. Development, staging, and production are separate environments; deployment to production requires explicit human approval while the system stabilizes.

## 2. Required backend domains

| Domain | Confirmed responsibility |
|---|---|
| Authentication | Login, logout, session validation, secure HTTP-only sessions, password hashing, and login-rate limiting. |
| RBAC | Server-side authorization through roles and permissions; scope-sensitive authorization such as depot access. |
| Users and employees | User identity, employee identity, employee-to-shift assignment, and employee attribution to work. The exact user/employee cardinality is TBD. |
| Depot and location | Nine depots and each depot's location hierarchy. |
| Client and order | Client/order records and order items that begin the operational flow. Required fields and order-to-task rules are TBD. |
| Inventory | Authoritative inventory by product code and batch, current inventory state, and immutable/reviewable inventory movement records. Boxes are the only operational unit. |
| Warehouse task | Explicit task lifecycle, assignment of several employees, work progression, cancellation/reopening, and orchestration of operational completion. |
| Task events and photo trace | Assignment/state history and photo-based layer tracing. Each layer captures task, layer number, box count, capturer, capture time, and photo reference. |
| Quality | Quality gate and recorded pass/fail/adjust outcome before incentive becomes payable when the approved rule requires it. |
| Incentives | One canonical `IncentiveService`; task incentive calculation, quality validation, penalties where approved, equal allocation among collaborating employees, and incentive ledger/events. |
| Payroll | Consume the approved incentive result, approval records, payroll ledger, and payroll-status lifecycle. It must not independently recalculate incentive. |
| KPI | Definitions, targets, snapshots, and derivation from operational data with mandated drill-down dimensions. |
| Reporting | Daily report generation plus defined report families, shared normalized report queries, Excel/PDF rendering once templates are supplied. MB51 and MB52 are excluded. |
| Realtime | Post-commit channel publication, reconnect resynchronization support, drift observability, and no authoritative state ownership. |
| Audit | Lifetime-retained audit trail for business-critical mutations where required, including actor, time, action, and relevant context. |

## 3. Domain entities

The following is an entity inventory for later database design, not an approved schema or a claim that every field is final.

| Area | Entities / records required or strongly indicated |
|---|---|
| Identity and access | `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `sessions`, and a server-side login-attempt/lockout record. |
| Workforce | `employees`, `shifts`, `employee_shift_assignments`. Shift assignments need effective dates. |
| Organisation | `depots`, `locations` (hierarchical and depot-specific). |
| Commercial | `clients`, `orders`, `order_items`. |
| Inventory | Inventory item/product, inventory batch, current inventory state/balance, and `inventory_movements`. Product code plus batch identify relevant inventory. |
| Work execution | `tasks`, `task_assignments`, `task_events`, `task_photos` / layer-photo evidence. Assignments and events preserve history. |
| Quality | Quality record/outcome for the completed task, with a pass/fail/adjust result. Quality checks, defect taxonomy, and adjustment semantics are TBD. |
| Financial | `incentive_rules`, incentive calculation/result, `incentive_ledger`, `incentive_events`, `payroll_ledger`, and payroll approval records. The exact approved incentive-rule model remains TBD. |
| Analytics | `kpi_definitions`, `kpi_targets`, `kpi_snapshots`. |
| Reporting | Report definitions and report execution metadata if persisted output/history is required. |
| Cross-cutting | `audit_events`; operational version or `updated_at` fields to support stale-client detection. |

Financial quantities/rates must use PostgreSQL `NUMERIC`, not JavaScript floating point. Precision, scale, rounding approach, and any minimum payable amount are not yet specified and must be approved before financial implementation.

## 4. Entity relationships

```text
Depot 1 --- * Location (each location belongs to one depot; hierarchy is within locations)
Depot 1 --- * Employee / authorised operational scope (exact assignment model TBD)

User * --- * Role * --- * Permission
User 1 --- * Session
User ? --- ? Employee (relationship is required for attribution/access but cardinality is TBD)

Employee * --- * Shift (through effective-dated employee_shift_assignments)
Client 1 --- * Order 1 --- * OrderItem

Inventory Product 1 --- * Inventory Batch
Inventory Batch / location --- * Current inventory state
Task --- relevant product/batch, depot/location, and possibly order/order item (exact mandatory links TBD)
Task 1 --- * InventoryMovement

Task 1 --- * TaskAssignment * --- 1 Employee
Task 1 --- * TaskEvent
Task 1 --- * TaskPhoto / LayerEvidence
Task 1 --- 0..* QualityRecord
Task 1 --- 0..* Incentive calculation/ledger event
Incentive calculation 1 --- * IncentiveLedger allocation * --- 1 Employee
Approved incentive outcome --- payroll ledger entry/entries (cardinality and timing TBD)

KPI definition 1 --- * KPI target
KPI definition 1 --- * KPI snapshot
KPI snapshots and reports derive from task, inventory, quality, employee/shift,
client/order, and financial operational records; they are not manually entered dashboard values.

Business-critical mutations --- * AuditEvent
```

`task_assignments` is essential: a single employee ID on `tasks` would violate the multi-employee requirement. It must retain assignment history rather than overwrite it. An employee may have several active task assignments, so no exclusivity constraint should be assumed.

## 5. Task state machine

### Confirmed states and operations

The confirmed conceptual state path is `CREATED -> ASSIGNED -> IN_PROGRESS -> PAUSED -> IN_PROGRESS -> COMPLETED`. The system must also support reassignment, cancellation, and reopening through controlled operations, never a generic unrestricted status update.

```text
CREATED --assignTask--> ASSIGNED --startTask--> IN_PROGRESS
                                  ^                 |
                                  |                 +--pauseTask--> PAUSED
                                  |                                      |
                                  +-------------------resumeTask---------+

IN_PROGRESS --completeTask--> COMPLETED

Controlled operations declared by requirements:
  reassignTask(), cancelTask(), reopenTask()
```

### Deliberately unresolved transitions

The documents name `REASSIGNED`, `CANCELLED`, and `REOPENED` as controlled additional transitions but do not unambiguously say whether they are persisted states, transition/event types, or both. They do not define:

- which source states may be reassigned, cancelled, or reopened;
- whether a task can be started with no current assignments;
- whether work may be paused before it begins;
- which actor can reopen/cancel and whether approval is needed;
- whether a reopened task returns to `CREATED`, `ASSIGNED`, or another state;
- whether quality is a task status, a separate quality lifecycle, or both;
- whether a quality failure blocks, reverses, adjusts, or reopens completed work.

The later state-machine ADR must define these without breaking the confirmed path. Quality should not be silently modeled as a task-status transition until its workflow is approved.

## 6. End-to-end operational flow

```text
Client / Order
  -> inventory truth (product code + batch; box quantities; depot/location)
  -> scan / trace (mobile layer photo evidence)
  -> assign (one or more employees, retained assignment history)
  -> move / work execution (inventory movement semantics and task progression)
  -> complete (validated task transition and completed box total)
  -> quality gate (pass / fail / adjust)
  -> approved incentive calculation and equal employee allocation
  -> payroll approval / ledger consumption
  -> KPI snapshot / dashboard / report feedback
```

The source documents establish the ordering and accountability of this flow. They do **not** yet define the precise scan operation, required scan identifiers, the relationship between scanning and task creation, move types, stock reservation rules, completion evidence threshold, quality acceptance criteria, penalty formula, or payroll-cycle timing. Those are TBD rather than implementation assumptions.

### Trace evidence

For every layer photo, persist metadata for the task, layer number, box quantity, employee/capturer, capture timestamp, and object-storage key/reference. The service must calculate the completed box total from evidence according to an approved rule; the documents illustrate summing layers but do not establish validation rules such as uniqueness of a layer number, permitted corrections, mandatory photo count, or image retention.

### Incentive and payroll handoff

The canonical `IncentiveService` owns calculation, quality validation, approved penalties, equal allocation, and incentive-ledger creation. When a task has multiple participating employees, the confirmed allocation rule is equal shares of the task incentive. Payroll consumes that approved result via the incentive ledger and its approval flow; it must never recompute a competing incentive amount.

## 7. Transaction boundaries

### Required atomic operations

| Operation | Atomic work that must not be partially committed |
|---|---|
| Account/role management | Identity, role/permission mapping, and any relevant audit record. |
| Task assignment/reassignment | Authorization, assignment history change, task transition if applicable, task event, and audit trail where required. |
| Task state transition | Server-side authorization, valid current-state check, state/version change, task event, and audit trail where required. |
| Trace evidence registration | Authorization, validated task relationship, photo metadata persistence, and event/audit where applicable. The binary upload strategy and compensation path are TBD. |
| Inventory move | Validate stock and operation authority, record movement, update current inventory state, record associated task/event/audit data. |
| Completion / quality / financial result | See below; exact split awaits approval of the quality workflow and payroll timing. |
| Incentive approval / payroll posting | Valid approved incentive result, authorized approval actor, ledger creation/status update, duplicate prevention, and audit record. |

### Completion transaction baseline

The reference flow proposes one high-risk transaction that validates task and authorization/state, checks required evidence, calculates completed boxes, records inventory movement, records completion and task event, evaluates quality, calculates incentive, writes incentive ledger/event, and creates payroll ledger when appropriate. The desired invariant is explicit: if a critical step fails, task completion, inventory, incentive, and payroll must all remain unchanged.

However, the documents also state that quality must be captured before incentive becomes payable **when required by the approved business rule**, and show payroll approval between incentive ledger and payroll ledger. Therefore, the final boundary cannot be approved yet as a single unconditional transaction. The database design/ADR must decide, from approved rules, whether quality evaluation and payroll posting are synchronous completion side effects or separate authorized transactions. It must retain the no-partial-state invariant for whichever boundary is chosen.

### Idempotency and concurrency

Duplicate completion requests must be rejected or return the prior successful result without producing duplicate inventory movements, incentives, or payroll entries. State validation, unique/idempotency controls, row-level concurrency strategy, and database constraints should protect this invariant. Their exact implementation is technical design, not a new business rule.

Realtime publication occurs only after commit and is outside the business transaction. Publication failures are observed and do not invalidate committed state.

## 8. Realtime events

### Channels and event categories

Existing required channels are:

- `warehouse:ops` — task status and assignment changes;
- `inventory` — inventory movements/state freshness;
- `payroll` — payroll status changes.

Relevant KPI freshness updates may also be published. The durable task-event record should include at least `taskId`, `eventType`, `eventAt`, `actorId`, and deliberately designed metadata. Incentive events and KPI snapshots are related durable records; event metadata must not become an ungoverned JSON dump.

### Behavioural requirements

- Publish only after the authoritative PostgreSQL mutation commits.
- Treat delivery as at most once; consumers cannot depend on every message.
- On reconnect, clients request current relevant state from backend APIs backed by PostgreSQL and replace/resync stale UI state.
- Track publication attempts/failures, reconnects, stale clients, and resynchronization requests.
- Use state versions or `updated_at` values if useful for stale-state detection.
- Test the case where PostgreSQL succeeds but Floot fails; the operation must still succeed and later resynchronization must restore the UI.

The exact message envelope, event versioning, subscription authorization, payload fields, retry policy, and replay/recovery protocol are TBD.

## 9. KPI data requirements

KPIs are derived from normalized operational data, not entered directly into a dashboard. The required infrastructure is `kpiDefinitions`, `kpiTargets`, and `kpiSnapshots`. Every KPI/reporting data design needs to support drill-down by depot, employee, task type, client, material/product, date, and shift.

Confirmed example source relationships are:

| KPI example | Required source data indicated |
|---|---|
| Task completion rate | Tasks and task events. |
| Employee productivity | Completed boxes, task duration, and employee attribution. |
| Damage rate | Quality records. |

To make these reproducible, operational records must preserve event/completion times, task/employee attribution including multi-employee participation, quantities in boxes, depot/location context, product/batch context where relevant, client/order context where relevant, quality outcome, and shift/effective-assignment context. KPI formulas, target values, snapshot cadence, correction/backfill policy, and the exact definition of each metric are TBD.

## 10. RBAC requirements

Known roles are Super Admin, Main Admin, Admin, and Manager. Permissions, not scattered role-name checks, must control backend operations. The authorization chain is:

```text
Request -> verified session -> authenticated user -> roles -> permissions
        -> domain/depot-scope authorization -> operation
```

The server must derive identity and authority from the session and persisted data. It must never trust client-supplied user ID, employee ID, role ID, depot ID, approval actor, or incentive approver. This applies to assignment, completion, quality/incentive/payroll actions, and report/data access as much as to administrative endpoints.

Authentication requirements are secure HTTP-only cookies with `Secure` and `SameSite=Lax`, `bcryptjs` password hashing, `jose` where session/JWT cryptographic operations apply, and server-enforced lockout after five failed login attempts within fifteen minutes, for fifteen minutes. Requirements do not define the permission catalogue, role-to-permission matrix, depot access model, employee/mobile role, account provisioning workflow, session expiry/rotation, MFA, password policy, or recovery process; all remain TBD.

## 11. Reporting requirements

Reports are generated daily. The reported scope includes Daily, Monthly, Periodic, Location, Leave, Salary, Yearly, and Other Report. Daily options named by the supplied interface are:

- Daily Performance, Present, Absent, Short Performance, In/Out, Late IN, Early IN, Early OUT, Over Time;
- GPS Approved, GPS Rejected, GPS Pending;
- Mis Punch Report and Half Day Report.

MB51 and MB52 must not be implemented. Actual Royal Packaging templates are authoritative for report columns, order, totals, filters, formatting, and Excel/PDF requirements. They are not currently present in this repository, so no output layout or calculation may be inferred.

The documented direction is a shared report query layer that produces normalized report data for Excel and PDF renderers. It avoids duplicating business calculations across reports. Persisted report executions/exports are only needed if the approved design requires history or retrieval.

## 12. Unknown / TBD requirements

The following decisions are explicitly unknown or absent and require business/product approval before implementation:

- Exact start/end timings for the two shifts; the required configurable shift model must not hard-code them.
- Approved overtime incentive formula, including effect of start/end at a shift boundary and paused/resumed work across boundaries.
- Reconciliation of the historical 6% incentive pool/penalty model with the new equal-sharing task rule; these must remain distinct until reconciled.
- All incentive inputs/rules, penalty conditions, quality dependence, rounding policy, minimum payable amount, corrections, and approval semantics.
- Quality acceptance criteria, failure/adjustment effects, actor authority, evidence requirements, and whether quality is synchronous at completion.
- Task transition guards for cancellation, reassignment, reopening, and the post-reopen state.
- Order/task/inventory linkage rules, reservation/allocation policy, scan identifiers and validation, movement types, negative-stock policy, and inventory reconciliation rules.
- Required layer-photo rules: correction/replacement, duplicate layer handling, mandatory quantity/evidence validation, storage upload protocol, and retention period. Lifetime retention explicitly covers warehouse, payroll, and audit records but does not expressly confirm photo lifetime retention.
- Object-storage provider and final production infrastructure sizing.
- Report templates, exact columns/calculations, filters, exports, and interpretation of each named report.
- KPI formula catalogue, targets, snapshot schedule, late-data correction and retention rules.
- Permission catalogue, role matrix, depot-scoping model, and roles for warehouse employees/quality/payroll if any.
- User-to-employee model; time/attendance, GPS, leave, mis-punch, and salary source-of-truth integrations/data model required for named reports.
- Expected peak concurrent warehouse users, performance SLOs, data volumes, route complexity/location count, routing accuracy needs, and a measured justification for graph routing.
- Realtime payload/retry/versioning and resynchronization-query design.
- Retention, backup, restore, legal/privacy, object-storage lifecycle, audit-event detail, and production observability requirements beyond the stated lifetime records.

## 13. Conflicting requirements

No direct contradiction is resolved in this analysis. The references do identify two areas that must not be silently merged:

1. **Historical incentive model versus new rule.** Historical data describes a 6% total incentive pool and penalties; the new confirmed rule says task collaborators receive equal shares. The allocation rule is clear, but its relationship to the 6% pool, penalties, and overtime formula is not. Keep separate versions/models until approval reconciles them.
2. **Completion transaction versus approval gates.** One reference shows quality evaluation, incentive calculation, and possible payroll entry in the completion transaction. Another says quality must precede payability when required by the approved rule and shows approval before payroll. This is an unresolved sequencing/boundary issue, not permission to choose either behaviour.

There is also a terminology ambiguity: `REASSIGNED` and `REOPENED` are presented as possible additional transitions while operations of the same names are required. Later design must decide whether they are task states, events, or transition labels.

## 14. Technical risks

| Risk | Why it matters | Required mitigation direction |
|---|---|---|
| Premature business-rule implementation | Incentive, overtime, quality, payroll, report, and inventory rules are incomplete. Wrong financial/operational logic is costly to reverse. | Record TBDs; obtain approvals; version approved rules; do not infer formulas. |
| Duplicate/concurrent completion | Can create double inventory movements, incentive allocations, and payroll entries. | Explicit state machine, transactions, database constraints, idempotency, and concurrency testing. |
| Realtime drift | Floot may lose delivery; treating it as authoritative would create stale/incorrect UI. | Post-commit signals only, server state versions, reconnect refetch/resync, failure testing/monitoring. |
| Inventory integrity | Multi-step moves and scan/trace work can create quantity drift, especially with concurrent actions. | PostgreSQL transactions, box-only quantity validation, movement ledger, authoritative balance, and reconciliation design. |
| Photo/object-storage split | A database record and binary object cannot be atomically committed across systems by default. | Define upload/finalization/cleanup and orphan-object handling before implementation; retain metadata in PostgreSQL. |
| Financial precision/allocation | Equal shares can produce fractional currency results; JavaScript floats are unsafe. | PostgreSQL `NUMERIC`; approved scale/rounding/remainder policy; allocation tests. |
| Unbounded event metadata | Arbitrary JSON loses queryability, audit consistency, and contract control. | Define event types and bounded metadata schemas/versioning. |
| Authorization bypass | Client-controlled identities or unsafely scoped queries could expose cross-depot or approval actions. | Session-derived identity, permission/domain checks server-side, negative authorization tests. |
| Report/KPI mismatch | Templates and formula definitions are missing; ad-hoc calculations may disagree across dashboards, exports, and payroll. | Obtain authoritative templates and definitions; centralize normalized query/calculation logic. |
| Scale/performance uncertainty | Peak users, workload volume, report cost, and routing complexity are unknown. | Measure with realistic load data, `EXPLAIN ANALYZE`, indexes from real query patterns, p50/p95/p99 tests; avoid speculative graph/event infrastructure. |
| Retention and recovery | Lifetime records require backup/restore and immutable-history planning; photos are unclear. | Define retention and storage lifecycle, test restore, and protect audit/financial history from destructive updates. |

## 15. Proposed implementation order

This order follows the documented development sequence, with decision gates before any business logic that depends on unknown rules.

1. Review and approve this requirements analysis; supply missing report templates, historical incentive material, and confirmed client answers.
2. Create and approve ADRs for source of truth, realtime, task state machine, incentive engine, photo storage, authentication, RBAC, transactions, reporting, and service boundaries.
3. Produce and approve database design and ERD: entities, identifiers, foreign keys, constraints, indexes, immutable records, audit needs, and transaction boundaries.
4. Implement dependency-safe PostgreSQL/Kysely migrations and development-only seeds; validate migrations before APIs.
5. Implement authentication, sessions, login lockout, and foundational RBAC/permission/depot-scoping checks.
6. Implement depot/location, employee/shift/effective assignment, client/order, and product/batch foundations.
7. Implement authoritative inventory state and movement ledger before task completion work.
8. Implement the warehouse task engine, multi-employee assignments, explicit state transitions, task events, idempotency/concurrency protections, and audit trail.
9. Implement trace/layer-photo metadata and the approved object-storage workflow.
10. Implement the approved quality workflow and only then the single canonical `IncentiveService`, using approved overtime/penalty/rounding rules and equal allocations.
11. Implement incentive approval and payroll ledger consumption without payroll-side recalculation.
12. Implement KPI definitions/targets/snapshots from normalized operational records.
13. Implement post-commit realtime publication and reconnect resynchronization.
14. Implement report query layer and Excel/PDF outputs only after templates and data-source rules are available; exclude MB51/MB52.
15. Add API/dashboard aggregation, then complete unit, integration, authorization, duplicate-completion, realtime-failure, financial, report, load, performance, security-hardening, deployment, backup/restore, and production-readiness work.

At each gate, unresolved business requirements must be approved or retained as explicit TBDs. No implementation should create a second task model or incentive engine, or replace PostgreSQL authority with realtime state.
