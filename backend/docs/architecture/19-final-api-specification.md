# Final API Specification

## Contract rules

This specifies backend contracts, not handlers. TypeScript, Zod, and SuperJSON are the required contract stack. PostgreSQL-backed API reads are authoritative; realtime is never an authority. All requests require Zod validation; protected operations derive user, employee scope, depot scope, roles, and approval authority server-side.

**Error model (CONFIRMED):** `400` validation/business error; `401` authentication failure; `403` authorization failure; `404` resource not found; `409` conflicting state; `429` rate limited; `500` unexpected error. Exact error body is a **TECHNICAL REQUIREMENT** to version consistently; its fields are not yet selected.

**Idempotency:** an `Idempotency-Key` request header for externally retried task completion, inventory movement, incentive creation, and payroll posting is a **TECHNICAL REQUIREMENT**; persistence/scope/expiry are **CLIENT DECISION REQUIRED (CDR)**. Client-supplied actor, employee, role, depot scope, points, approval actor, incentive approver, or payout amount never authorizes a result (**CONFIRMED**).

### Endpoint notation

Paths below are **TECHNICAL REQUIREMENTS** for consistent implementation, subject to API-versioning decision. `Auth` means a verified session. `Permission` values are **CDR** until the RBAC matrix is approved. `Req`/`Res` list only confirmed or technical contract fields; all business fields marked CDR must not be assumed.

## Authentication and users

| Method / path | Auth / permission | Req -> Res | Validation, transaction, audit, realtime |
|---|---|---|---|
| `POST /auth/login` | Public | Req: login identifier, password. Res: authenticated session summary. | Zod required; server checks five failed attempts/15 minutes then lockout 15 minutes (**CONFIRMED**). Session/login-attempt transaction; security audit **CDR**; no realtime. |
| `POST /auth/logout` | Auth | Req: none. Res: success. | Revoke server session atomically; audit **CDR**; no realtime. |
| `GET /auth/session` | Auth | Res: session-derived user/roles/scope summary. | Never accepts asserted identity; read only; exact scope DTO **CDR**. |
| `POST /users` | Auth / CDR | Req/Res user fields **CDR**. | Server authorization; account creation transaction/audit; `400/403/409`; no realtime requirement. |
| `GET /users/{id}`, `PATCH /users/{id}` | Auth / CDR | DTO fields **CDR**. | Server scope; sensitive mutation audit; changes that affect sessions **CDR**. |

## Employees, RBAC, and organisation

| Method / path | Auth / permission | Req -> Res | Validation, transaction, audit, realtime |
|---|---|---|---|
| `GET,POST /employees`; `GET,PATCH /employees/{id}` | Auth / CDR | Employee DTO **CDR**. | Do not accept caller-selected employee authority; creation/update transaction and audit; no realtime requirement. |
| `POST /employees/{id}/shift-assignments` | Auth / CDR | Shift ID/effective dates; result assignment. | Validate server scope and approved effective-date rules; overlap policy **CDR**. |
| `GET,POST /rbac/roles`; `PATCH /rbac/roles/{id}` | Auth / CDR | Role fields **CDR**. | Role mutations atomic/audited; no client role authority. |
| `GET,POST /rbac/permissions`; `PUT /rbac/roles/{id}/permissions`; `PUT /users/{id}/roles` | Auth / CDR | IDs are subject references only; server authorizes actor. | Atomic mapping/audit; permission matrix **CDR**; no realtime requirement. |
| `GET /depots`; `GET,POST /depots/{id}/locations`; `PATCH /locations/{id}` | Auth / CDR | Depot/location DTO **CDR**. | Validate hierarchy/depot scope; changes audit; location cycle prevention technical. |

## Clients and orders

| Method / path | Auth / permission | Req -> Res | Validation, transaction, audit, realtime |
|---|---|---|---|
| `GET,POST /clients`; `GET,PATCH /clients/{id}` | Auth / CDR | Client fields **CDR**. | Scope/field validation **CDR**; audit for mutation as required. |
| `GET,POST /orders`; `GET,PATCH /orders/{id}`; `POST /orders/{id}/items` | Auth / CDR | Order/item fields and status **CDR**. | Task linkage/inventory semantics **CDR**; mutation audit as required. |

## Inventory and warehouse operations

| Method / path | Auth / permission | Req -> Res | Validation, transaction, audit, realtime |
|---|---|---|---|
| `GET /inventory/balances` | Auth / CDR depot scope | Query: approved product/batch/location filters. Res: authoritative box balances/version. | Reject unapproved scope; PostgreSQL read; no mutation. |
| `POST /inventory/movements` | Auth / CDR | Req: product/batch/location/box movement fields **CDR** plus Idempotency-Key. Res: movement/balance summary. | Box quantity; source/destination/type/partial/negative stock rules **CDR**. Atomic movement + current balance + task/audit linkage; `409` state/conflict; emit `inventory` freshness post-commit. |
| `POST /warehouse/scan` | Auth / CDR | Scan identifier/payload **CDR**. | No scan semantics are supplied; contract blocked pending client decision. |
| `GET /warehouse/tasks` | Auth / CDR | Query/filter/pagination **CDR**. Res: authoritative scoped task summaries/version. | Read-only resync-capable endpoint; data scope server-side. |

## Tasks and assignment lifecycle

| Method / path | Auth / permission | Req -> Res | Validation, transaction, audit, realtime |
|---|---|---|---|
| `POST /tasks` | Auth / CDR | Task creation fields **CDR**. Res: CREATED task/version. | Creation authority, task/order/inventory links **CDR**; create/event/audit rules **CDR**. |
| `GET /tasks/{id}` | Auth / CDR scope | Res: authoritative task, assignments, permitted evidence/quality summary, version. | Read scope server-side; DTO expansion **CDR**. |
| `POST /tasks/{id}/assignments` | Auth / CDR | Req: employee subject(s), optional reason **CDR**. | Valid CREATED task/approved guard; server validates employee/depot eligibility. Atomic assignment history/task event/audit; `warehouse:ops` assignment freshness post-commit. |
| `POST /tasks/{id}/start`, `/pause`, `/resume` | Auth / CDR | Req: reason only if approved. Res: task status/version. | Enforce confirmed path and approved guards; atomic state/event/audit; `warehouse:ops` status freshness. |
| `POST /tasks/{id}/reassign`, `/cancel`, `/reopen` | Auth / CDR | DTO/state target/reason **CDR**. | These transitions and side effects are blocked pending approved matrix; `409` on invalid state. |
| `POST /tasks/{id}/complete` | Auth / CDR | Req: completion/evidence reference **CDR**, Idempotency-Key. Res: task/version and only approved side-effect summary. | Validate state/actor/evidence/box/inventory rules; atomic completion boundary; prevents duplicate completion/movement/incentive/payroll; `warehouse:ops` post-commit. Quality/payroll timing **CDR**. |

## Photo trace and quality

| Method / path | Auth / permission | Req -> Res | Validation, transaction, audit, realtime |
|---|---|---|---|
| `POST /tasks/{id}/photos` | Auth / CDR | Req: layer number, box quantity, photo storage/finalization reference; capturer derived server-side. | Layer validation/upload lifecycle/correction/deletion **CDR**. PostgreSQL metadata transaction after approved storage protocol; event/audit/realtime scope **CDR**. |
| `POST /tasks/{id}/photos/{photoId}/corrections` | Auth / CDR | Correction fields/reason **CDR**. | Entire endpoint blocked pending correction policy; preserve/replace rule **CDR**. |
| `POST /tasks/{id}/quality-reviews` | Auth / CDR | Outcome pass/fail/adjust; details **CDR**. | Inspector authority, criteria, financial task effect **CDR**; quality transaction/audit/events **CDR**. |
| `POST /quality/{id}/corrections` | Auth / CDR | Corrected outcome/reason **CDR**. | Blocked until correction/reopen/incentive/payroll rules approved. |

## Incentives and payroll

| Method / path | Auth / permission | Req -> Res | Validation, transaction, audit, realtime |
|---|---|---|---|
| `POST /tasks/{id}/incentives` | Auth / CDR | No client-provided payout/points; optional technical idempotency. Res: canonical result/allocation summary. | Only IncentiveService may calculate; formula, eligibility, participants, rounding, approval and timing **CDR**. Prevent duplicate ledger results. |
| `GET /incentives/{id}` | Auth / CDR scope | Res: authorised canonical ledger/result. | No recalculation; data scope server-side. |
| `POST /incentives/{id}/approvals` | Auth / CDR | Decision/reason **CDR**; actor derived. | Approval policy **CDR**; audit; event scope **CDR**. |
| `POST /payroll/entries` | Auth / CDR | Req references approved incentive result, not payout amount; Idempotency-Key. | Payroll consumes incentive result; posting/period/approval **CDR**; atomic ledger/audit; payroll freshness post-commit. |
| `POST /payroll/entries/{id}/approvals`; `GET /payroll/entries/{id}` | Auth / CDR | Approval/read DTO **CDR**. | Actor derived; no independent incentive calculation; audit and payroll freshness. |

## KPI, reports, dashboard, realtime/resynchronization

| Method / path | Auth / permission | Req -> Res | Validation, transaction, audit, realtime |
|---|---|---|---|
| `GET /kpis` | Auth / CDR scope | Query dimensions: depot/employee/task type/client/material/date/shift; res snapshot/value metadata. | KPI formula/target/cadence **CDR**; read only; scope server-side. |
| `GET /kpis/{code}/drill-down` | Auth / CDR | Approved dimensions/date range **CDR**. | Valid dimension filter/scope; returns authoritative derived data. |
| `GET /reports`; `POST /reports/{code}/executions`; `GET /report-executions/{id}` | Auth / CDR | Report filters/output selection **CDR**. | Only supplied template mappings allowed; MB51/MB52 rejected/not exposed; export audit **CDR**. |
| `GET /dashboard` | Auth / CDR scope | Date/dimension filters **CDR**; authoritative aggregate summary. | Dashboard definitions **CDR**; no manually entered KPI values. |
| `GET /resync/tasks`, `/resync/inventory`, `/resync/payroll`, `/resync/kpis` | Auth / CDR scope | Last known version/time/filter **CDR**. Res: authoritative current state/version. | Required for reconnect, refresh, missed/stale/duplicate/out-of-order realtime; scope server-side. |

## API-wide transaction and audit rule

All state-changing endpoints execute their approved database operation before post-commit realtime publication. A failed realtime publish yields no business rollback (**CONFIRMED**). Every business-critical mutation requires audit treatment where required; the complete audit matrix is **CDR**. No endpoint may turn a client-controlled identifier into authority.
