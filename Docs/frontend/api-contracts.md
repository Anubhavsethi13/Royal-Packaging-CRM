# API Contracts

Phase 6 freezes the frontend/API boundary without implementing backend business engines. The current domain records are in `frontend/src/types/domain.ts`; transport envelopes and runtime validators are in `frontend/src/api/contracts.ts`; the mock repository boundary is in `frontend/src/mock/repositories.ts`; the transport error boundary is in `frontend/src/api/client.ts`.

Future adapters should preserve stable identifiers and explicit status fields for clients, orders, inventory, tasks, employees, KPIs, incentives, payroll periods, reports, and audit events. Mutating operations should return a typed result with validation errors and a request identifier suitable for audit display.

List requests accept page, page size, search, sort direction, and filter slots. Future transport responses use `data` plus `meta` pagination fields and are mapped to the existing repository `ListResponse`. Future mutation responses should return a typed record or mutation result with validation errors and a request identifier suitable for audit display. The current client rejects unsafe non-relative paths, parses only the safe error fields defined by the contract, handles `204 No Content`, and avoids exposing response bodies or stack traces directly to users.

Recommended future request concerns include permission failures, not-found responses, generic server errors, and offline retry semantics. No screen assumes that a local mock mutation is a successful server mutation. See `Docs/api/` for the frozen transport, domain, authentication, authorization, pagination, assumptions, and open-decision documents.
