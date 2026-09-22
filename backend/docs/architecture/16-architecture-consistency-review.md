# Architecture Consistency Review

## Review basis

Reviewed `AGENTS.md`, every file in `docs/references/`, and architecture documents 01–15. This is a consistency review, not a database design or implementation. “Missing” means the documents do not yet specify a coding-safe rule; it does not mean a new rule is proposed.

# Confirmed Consistent

| Verified concern | Consistent evidence |
|---|---|
| Authoritative state | 01 §§1,7–8; 02 CONFIRMED; 04 CONFIRMED; 06 CONFIRMED; 08 CONFIRMED; 12 CONFIRMED all place operational/financial state and recovery reads in PostgreSQL. |
| Realtime limitation and recovery | 01 §8, 02, 06, 08, 12–14 consistently make Floot post-commit, at-most-once freshness only and require PostgreSQL-backed reconnect/resynchronization. |
| Workflow coverage | 01 §6, 03, 06–7, 09, 11–12, and 15 represent client/order -> inventory -> scan/trace -> assign -> move -> complete -> quality -> incentive -> payroll -> KPI/report feedback. |
| Core entities | 01 §§2–4, 03, and 04 consistently include identity/RBAC, employees/shifts, depot/location, clients/orders, product/batch/inventory, tasks/assignments/events/photos, quality, incentives/payroll, KPI, reports, and audit. Each has a stated operational purpose. |
| Multi-employee work | 01 §§3–4, 03, 04, 05, 07, 09, 12, 14, and 15 consistently require `task_assignments`, preserved assignment history, several employees on a task, and multiple active tasks per employee. |
| Equal allocation | 01 §6, 03, 07, 12, 14, and 15 consistently require one task incentive divided equally among collaborating employees and prohibit payroll-side recalculation. |
| Photo and box trace | 01 §§3,6; 03; 04; 06; 12; and 15 consistently preserve layer photo metadata and box-only operational quantities. |
| Security baseline | 01 §10; 02; 06; 10; 12; and 14 consistently require server-side authorization, session-derived identity, RBAC, login lockout, and rejection of client-supplied actor/scope data. |
| KPI dimensions | 01 §9 and 09 explicitly include depot, employee, task type, client, material/product, date, and shift. |
| Reports | 01 §11, 11, and 15 preserve supplied-template authority and exclude MB51/MB52. |

No document introduces Kafka, RabbitMQ, Redis, microservices, or another authoritative realtime store. No direct contradiction with the source-of-truth rule was found.

# Contradictions

| Document | Section | Problem | Why it matters | Proposed correction | Client approval required |
|---|---|---|---|---|---|
| 07, 15 | TBD / approval decisions | “Overtime/SLA formula” is used, but the reference documents confirm overtime only; they contain no SLA definition or calculation. | Calling an undefined SLA a formula can cause a fabricated field, KPI, or payment rule. | Replace “SLA formula” with “overtime formula”; list SLA separately as an unprovided requirement if the client intends one. | Yes, if SLA is required. |
| 10 | CONFIRMED | The document classifies client-supplied “points” as prohibited, but `AGENTS.md` and references do not define a points domain. The current review request also prohibits it, but no data model exists. | A security restriction without a defined resource is harmless but ambiguous and can suggest an invented points feature. | State that no points entity/API exists; if points are introduced later, derive and authorize them server-side. | No for the prohibition; yes to introduce points. |
| 06 vs. 01/05/07 | CONFIRMED / Completion baseline | 06 describes completion effects including quality/incentive/payroll “when approved,” while 01 and 07 correctly say sequencing/payability is unresolved. This is not a direct contradiction, but the completion boundary is still ambiguous. | Implementation could choose synchronous posting despite a later approval gate. | Make the completion transaction explicitly stop at the approved boundary; define separate transactions only after quality/payroll approval rules are approved. | Yes. |

# Missing Requirements

## Task transitions

| Document | Section | Problem | Why it matters | Proposed correction | Client approval required |
|---|---|---|---|---|---|
| 05 | CONFIRMED / TBD | The conceptual states are `CREATED`, `ASSIGNED`, `IN_PROGRESS`, `PAUSED`, `COMPLETED`, but reassign, cancel, and reopen have no final transition definition. It is unknown whether `REASSIGNED`, `CANCELLED`, and `REOPENED` are states or event types. | Database enum, API validation, event taxonomy, and reporting cannot agree. | Approve one transition matrix defining state vs. event type and target state for each operation. | Yes. |
| 05, 10, 12 | TBD | None of assign, start, pause, resume, reassign, cancel, reopen, or complete has an allowed actor/permission matrix. | Server-side RBAC cannot be implemented or tested. | Approve actor permissions and depot/assignment scope per operation. | Yes. |
| 05, 06, 09 | TBD | Preconditions for all controlled operations are incomplete: current state, active assignments, evidence, inventory, quality, and financial eligibility are not specified per operation. | A state machine without guards is only a diagram and enables invalid work/pay paths. | Approve a transition matrix with preconditions, side effects, event, audit, and KPI effect. | Yes. |
| 05, 08, 09 | RECOMMENDATIONS / CONFIRMED | Events are recommended for each transition, but no complete event taxonomy maps every transition to a durable task event and realtime freshness event. KPI effects are only examples. | Audits, reports, and KPI snapshots may omit cancel/reopen/pause/reassign effects. | Define a durable event and KPI-impact matrix for every approved transition. | Yes for business effects; no for recording a durable event. |

## Workflow semantics

| Document | Section | Problem | Why it matters | Proposed correction | Client approval required |
|---|---|---|---|---|---|
| 01 §6, 04, 06, 12, 15 | TBD | Scan identifiers, scan validation, scan-to-task relationship, and the exact meaning of “move” are not defined. | The scan/trace -> assign -> move flow cannot become a safe API/schema/transaction. | Supply warehouse scan and movement business rules. | Yes. |
| 04, 06, 12, 15 | TBD | Partial inventory movement is named, but no domain invariant defines partial completion, residual quantity, movement type, reservation, negative stock, reversal, or reconciliation. | Stock integrity and duplicate protection cannot be proven. | Approve partial-movement lifecycle and reconciliation rules. | Yes. |
| 01, 03, 05–7 | TBD | Quality pass/fail/adjust exists but quality criteria, damage handling, actor, evidence, and effect on completion/reopen/payability are absent. | Quality may be bypassed or applied inconsistently to incentive/payroll. | Approve the quality/damage state/process and financial consequences. | Yes. |
| 01, 03–4, 06–7 | TBD | The set of employees entitled to an equal share is undefined when assignments change during work. | Equal distribution is confirmed but allocation membership cannot be calculated fairly or reproducibly. | Define participating-employee snapshot/cutoff and reassignment treatment. | Yes. |
| 01, 07, 14–15 | TBD | Shift configuration exists, but exact times and overtime rule are absent. SLA is not a reference requirement. | Overtime cannot safely affect incentives or overtime reports. | Approve shift timings and an overtime-only formula; define SLA separately if desired. | Yes. |
| 01, 03, 06, 12 | TBD | Layer evidence has required metadata but no rule for mandatory layers/photos, duplicate layer numbers, correction/replacement, total validation, or failed upload. | Completed box count and trace reliability are unprovable. | Approve evidence acceptance/correction and object-storage finalization policy. | Yes. |

# Missing Database Fields

The architecture intentionally avoids final field lists. The following are fields/invariants required to support stated workflow, but they are not yet committed in 04 or exposed consistently in 12.

| Document | Section | Problem | Why it matters | Proposed correction | Client approval required |
|---|---|---|---|---|---|
| 04 | TBD / required table families | No approved task schema fields for task type, depot, source/destination location, order/order item, product/batch, planned/completed box quantity, state/version, and relevant lifecycle timestamps. | Required KPI dimensions and inventory/task linkage have no guaranteed persistence model. | Define fields only after client approves task/order/move relationships and quantity semantics. | Yes. |
| 04, 05 | TBD | No approved persisted representation for all task statuses/transition type, transition actor, transition time, reason, and reopen/cancel/reassign context. | The state machine, audit, reporting, and duplicate guard lack durable evidence. | Define task and task-event fields with approved transition matrix. | Yes for reasons/guards; no for basic event identifiers. |
| 04, 06 | TBD | Inventory movement has no approved fields for movement type, from/to location, batch/product, box quantity, task link, idempotency/operation identity, and resulting balance/version. | Cannot verify partial movements or prevent duplicate movement. | Define movement record and current-state invariants after inventory rules approval. | Yes. |
| 03–4, 07 | TBD | Incentive result/ledger lacks approved fields for rule/version, qualifying task/quality input, total amount, allocation membership/count, allocation amount, rounding/remainder, status, approval actor/time, and correction/reversal linkage. | Cannot prove canonical equal allocation or payroll source integrity. | Define only after incentive policy approval. | Yes. |
| 03–4, 06 | TBD | Payroll ledger/approval fields for source incentive allocation, status, authorized approver, approval time, payroll period, duplicate/reversal linkage are unspecified. | Payroll could independently recompute or post duplicates. | Define payroll source-link and approval ledger fields after workflow approval. | Yes. |
| 03–4, 09 | TBD | KPI snapshot field model does not explicitly persist definition/version, period, calculation time, all required dimensions, value, and source/correction context. | KPI drill-down and reproducibility are not assured. | Approve formula/cadence/correction then define snapshot fields. | Yes. |
| 03–4, 11 | TBD | Attendance, GPS, leave, salary, mis-punch, half-day, and overtime report data have no defined entities/fields/source integration. | Named reports cannot be produced from the documented schema. | Obtain templates and source-of-truth/data-mapping requirements before adding entities. | Yes. |
| 03–4, 10 | TBD | Login failures/lockout fields, user-to-employee/depot scope, permission assignment/audit fields, and session lifecycle fields are only table-family level. | The confirmed five-failure/15-minute lockout and server-side scope cannot be enforced. | Define security persistence requirements and retention. | Yes for policy; no for recording failures. |

# Missing API Contracts

| Document | Section | Problem | Why it matters | Proposed correction | Client approval required |
|---|---|---|---|---|---|
| 12 | TBD | No concrete command contracts exist for assign/start/pause/resume/reassign/cancel/reopen/complete. | Required actors, preconditions, errors, and idempotency cannot be validated at the boundary. | Define per-operation request/response/error contracts after transition approval. | Yes. |
| 12 | TBD | No scan/trace, layer-evidence registration/finalization, inventory move/partial move, quality outcome, incentive approval, payroll approval, or report-export contracts exist. | Every workflow stage lacks a safe validated external boundary. | Add contracts only after business semantics/template approval. | Yes. |
| 12, 08 | TBD | No authoritative read/resynchronization endpoint/filter/version contract exists. | Reconnect requirement cannot be implemented consistently with Floot freshness events. | Approve resource reads, scope/filter rules, and versioning. | Yes. |
| 12, 10 | CONFIRMED / TBD | It correctly rejects client-controlled actor/scope fields, but does not define how employee attribution/capturer data is derived versus allowed as an asserted subject requiring server validation. | A mobile trace API could accidentally accept another employee's ID. | Define a server-derived identity/employee-attribution policy per command. | Yes. |
| 12 vs. 04 | TBD | API has no declared field set, while 04 has no approved final schema. Therefore no exact “API-only” field contradiction exists; the gap is mutual incompleteness, not a mismatch. | Prevents contract/schema verification. | Finalise approved domain/schema first, then map DTOs deliberately. | Yes. |

# Missing Events

| Document | Section | Problem | Why it matters | Proposed correction | Client approval required |
|---|---|---|---|---|---|
| 08 | CONFIRMED | Realtime names task status, assignment, inventory, payroll, and KPI freshness only. It omits named freshness handling for layer-photo registration, quality outcome, incentive calculation/approval, cancellation, reopen, and report completion. | Clients may remain stale for operational/financial changes. | Decide which approved mutations require realtime freshness and map each to a channel. | Yes for client UX/event scope. |
| 05, 08 | RECOMMENDATIONS / TBD | Durable task-event types are unspecified for each transition and event metadata schema is not defined. | Audit/KPI/report consumers cannot distinguish a pause from a completion or reassignment. | Define event type catalogue and bounded metadata. | Yes for business taxonomy. |
| 06, 08 | CONFIRMED / TBD | Publication lifecycle has no defined record/outbox/retry decision; publication failure is monitored but not correlated to a durable business operation. | Operations can be committed yet observability cannot reliably identify unannounced state changes. | Decide whether to persist publication attempts; do not introduce a broker. | No for a technical publication record; yes if business replay guarantees are wanted. |

# Security Gaps

| Document | Section | Problem | Why it matters | Proposed correction | Client approval required |
|---|---|---|---|---|---|
| 10 | TBD | Role names exist but the permission catalogue, role matrix, depot scope, employee/mobile/quality/payroll roles, and approval authority are absent. | No operation has an implementable “allowed actor.” | Approve permissions and scoped authority by domain operation. | Yes. |
| 10, 12 | CONFIRMED / TBD | Client-supplied employee ID, role, depot scope, points, and approval actor are prohibited, but per-command server-derived identity rules are not specified. | Attribution and approvals may be implemented inconsistently. | Define authenticated user -> employee/depot/approval entitlement resolution. | Yes. |
| 08, 10, 12 | TBD | Realtime subscription authorization and resynchronization read scope are not defined. | Cross-depot data may leak even if write authorization is correct. | Apply the approved permission/depot scope to subscriptions and all reads. | Yes. |
| 10 | TBD | Session expiry, rotation, revocation, provisioning, password policy, recovery, and MFA are unspecified. | Security lifecycle cannot be assessed or tested. | Approve account/session policy. | Yes. |

# Transaction Gaps

| Document | Section | Problem | Why it matters | Proposed correction | Client approval required |
|---|---|---|---|---|---|
| 06 | Completion baseline / TBD | Completion quality, incentive, and payroll boundaries are unresolved. | Cannot prove that completion never makes quality/payroll partial or premature. | Approve sequencing and define atomic operations and compensation/reversal rules. | Yes. |
| 06, 04 | RECOMMENDATIONS / TBD | Duplicate completion protection is required but final unique/idempotency keys and concurrency behaviour are not designed. | Duplicate inventory movement, incentive, payroll, or completion remains a design risk. | Specify idempotency identity and database uniqueness/state-version invariants. | No for the invariant; yes for external request-key policy. |
| 06, 08 | CONFIRMED / TBD | Realtime publishes after commit, but no operation-to-event map links committed transactions to freshness signals. | Reconnect works, but normal UI freshness is incomplete/unverifiable. | Map each transaction to optional post-commit event(s). | Yes for scope. |
| 06, 13 | RECOMMENDATIONS / TBD | Audit is required where applicable, yet no business-critical mutation audit matrix exists. | It is unclear whether photo correction, quality adjustment, incentive correction, or payroll approval are auditable. | Define audit requirement, actor/context, immutability, and retention per transaction. | Yes. |
| 06 | TBD | External photo upload cannot be atomic with PostgreSQL and cleanup/finalization rules are absent. | Orphan objects or metadata pointing to unavailable proof can result. | Approve two-step upload/finalization and failure reconciliation. | Yes. |

# KPI Gaps

| Document | Section | Problem | Why it matters | Proposed correction | Client approval required |
|---|---|---|---|---|---|
| 09 | TBD | KPI formulas, targets, periods, snapshot cadence, correction/backfill, and retention are unspecified. | KPI values cannot be calculated or audited. | Approve definition catalogue before any KPI job/query. | Yes. |
| 09, 05 | TBD | No KPI impact is specified for state transitions, including pause, reassign, cancel, reopen, quality fail/adjust, and partial moves. | Completion rate/productivity/damage metrics may be inconsistent. | Define event-to-KPI inclusion/exclusion and correction rules. | Yes. |
| 09, 07 | TBD | Multi-employee productivity attribution is not defined although equal incentive allocation is. | Incentive equality must not be incorrectly assumed to define productivity calculation. | Approve KPI attribution independently from incentive allocation. | Yes. |
| 09, 04 | CONFIRMED / TBD | Required drill-down dimensions are listed, but 04 has no approved fields guaranteeing every dimension on task/event/snapshot records. | Drill-down reports may require unapproved joins or lack historical correctness. | Define dimensional persistence/snapshot policy after source-link decisions. | Yes. |

# Reporting Gaps

| Document | Section | Problem | Why it matters | Proposed correction | Client approval required |
|---|---|---|---|---|---|
| 11 | TBD | The authoritative Royal Packaging templates are absent. Columns, totals, filters, formatting, Excel/PDF outputs, and meanings are unknown. | Report implementation would invent requirements. | Supply templates and approve a source-data mapping for each report. | Yes. |
| 03–4, 11 | TBD | Named attendance/GPS/leave/salary/mis-punch/half-day/overtime reports have no underlying entities or integrations. | The current domain model cannot source required reports. | Identify source of truth and required retention/calculations before schema/API design. | Yes. |
| 11 | CONFIRMED | MB51 and MB52 are excluded consistently; no document reintroduces them. | No correction required. | None. | No. |

# Realtime Gaps

| Document | Section | Problem | Why it matters | Proposed correction | Client approval required |
|---|---|---|---|---|---|
| 08 | TBD | No envelope, version, payload, topic ownership, retry, subscription scope, or stale-version contract is approved. | Clients cannot safely interpret freshness signals or constrain access. | Define compact versioned freshness contract plus authoritative refetch behaviour. | Yes. |
| 08, 12 | TBD | Resynchronization is required but no endpoint/filter/version policy is defined. | “Reconnect is possible” is architecturally true but not implementable. | Approve read/resync API contracts and authorization scope. | Yes. |
| 08, 13 | CONFIRMED / TBD | Monitoring requirements exist but no thresholds/ownership/retention policy exists. | Drift may be detectable but operational response is undefined. | Approve monitoring SLOs, alert ownership, and retention. | Yes. |

# Decisions Required Before Coding

1. Complete task state/transition/actor/precondition/event/audit/KPI matrix, including cancellation, reassignment, reopening, and quality interaction.
2. Scan/trace and partial inventory movement model: identifiers, source/destination, quantities, residuals, reservation, reversal, reconciliation, and duplicate protection.
3. Layer-photo evidence acceptance/correction/finalization/retention policy.
4. Quality and damage rules, their actors, and their exact effects on completion, incentive payability, correction, and reopening.
5. Versioned incentive policy: historical 6% relationship, formula, overtime (and whether a separate SLA exists), penalties, employee membership, rounding, correction, and approvals.
6. Payroll source-link, approval, posting, correction, and duplicate-prevention policy.
7. Schema ERD, field/constraint/index design, financial precision, state values, audit matrix, and data-retention policy.
8. RBAC permission matrix, user-to-employee and depot-scope model, approval authority, session/account lifecycle, realtime/read authorization.
9. KPI formula catalogue, state-event impacts, attribution, targets, cadence, corrections, and retention.
10. Supplied report templates and source mappings, especially attendance/GPS/leave/salary data; retain MB51/MB52 exclusion.
11. API commands, response/errors, photo workflow, idempotency, authoritative reads, and resynchronization contract.
12. Floot message/schema/version/subscription and post-commit publication observability policy.
13. Object storage, backup/restore, privacy/retention, performance SLOs, load model, observability platform, and production sizing.

# Recommended Corrections

No existing architecture document was modified. Apply these corrections only after the corresponding client approval:

| Document | Section | Problem | Why it matters | Proposed correction | Client approval required |
|---|---|---|---|---|---|
| 05 | All | Does not provide a complete implementable transition matrix. | This is the central dependency for schema, API, events, RBAC, audit, and KPIs. | Add an approved table: operation, source/target state, actor/permission, preconditions, atomic side effects, durable event, realtime freshness signal, audit, KPI effect. | Yes. |
| 04 | CONFIRMED / TBD | Schema table families lack an approved field/invariant traceability matrix. | Required workflow data and duplicate prevention cannot be verified. | Add an approved entity-to-field/constraint/index/audit mapping after decisions 1–7. | Yes. |
| 06 | Completion baseline | Completion sequencing uses conditional wording without a final boundary. | Financial/inventory atomicity remains untestable. | Split or consolidate transactions only after quality/payroll decisions; document rollback/reversal effects. | Yes. |
| 07, 15 | TBD / approval decisions | “SLA” is presented as if a formula exists. | It is unsupported by the reference documents. | Remove it from confirmed framing; request separate SLA requirements if intended. | Yes if SLA is desired. |
| 08, 12 | TBD | Realtime and resync rules have no concrete contract. | Reconnect and data scope cannot be verified. | Add approved resource/version/subscription/read contracts, while retaining PostgreSQL authority. | Yes. |
| 09 | TBD | KPI dimensions are listed but formula and state-event handling are absent. | Dimension presence alone does not produce valid KPIs. | Add approved KPI definition catalogue and source/event mapping. | Yes. |
| 10, 12 | TBD | Security principles lack an operation-level permission/identity-resolution matrix. | “Server-side RBAC” is not implementable per command. | Add approved permissions, scopes, and server-derived actor policy; state that no points domain currently exists. | Yes. |
| 11 | TBD | Report scope is named but templates/source data are missing. | Reports cannot be implemented without invention. | Attach supplied templates and create approved source mapping; retain MB51/MB52 exclusion. | Yes. |
