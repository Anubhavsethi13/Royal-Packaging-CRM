# API Contract Boundary

## Purpose and dependencies

Defines API design constraints, not endpoint implementations. Depends on [05](05-task-state-machine.md), [06](06-transaction-boundaries.md), [08](08-realtime-event-contract.md), and [10](10-rbac-security-model.md).

## CONFIRMED

- Backend APIs are the authoritative read/resynchronization path; clients must recover current state from PostgreSQL-backed responses.
- Validate all external input with Zod and use server-derived session identity/authorization.
- Do not accept client authority over employee ID, role, depot, points, approval actor, or incentive approver.
- State-changing task actions must use controlled operations (assign/start/pause/resume/reassign/complete/reopen/cancel), not arbitrary generic status updates.
- API operations must preserve multi-employee assignments, multiple active tasks per employee, box-only quantities, layer-photo evidence, inventory movement, quality, one canonical incentive result, and payroll consumption.

## RECOMMENDATIONS

- Group contracts by domain and expose command-style mutations for controlled transitions rather than generic CRUD updates.
- Return a stable resource version/`updated_at` for stale-client detection and use an approved idempotency approach for high-risk mutations.
- Keep request/response DTOs distinct from persistence representations and document error categories without leaking authorization details.

## TBD / approval decisions

- Endpoint routes, versions, exact request/response/error schemas, pagination/filter conventions, photo-upload protocol, idempotency-key contract, and resync query shapes.
- Scan identifiers/validation, partial-movement payload, inventory reservation, quality, incentive, payroll approval, report export, and employee/mobile access contracts.

## Risks

- A generic update API can bypass task transition and financial controls.
- Client-supplied identity/scope enables authorization bypass; missing idempotency duplicates completion effects.

## Approval gate before coding

Approve the state-transition, scan/trace, inventory, quality, approval, photo, and resync API contracts after the related business decisions are approved.

## Final client-resolution addendum

API contracts must represent photo evidence with photo ID, task/movement reference, layer reference/number, box quantity, timestamp, actor/employee reference derived or validated server-side, storage reference, upload status, and audit metadata. No file-size limit, mandatory before/after photo policy, deletion/replacement policy, completion-waits-for-upload policy, or provider may be inferred.

Inventory move contracts must use source quantity, moved quantity, source/destination location, task, employee, timestamp, movement type, and audit context. For a partial move: `ratio = movedQuantity / sourceQuantity`; `movedWeight = sourceWeight × ratio`; `movedVolume = sourceVolume × ratio`; `remainingQuantity = sourceQuantity − movedQuantity`. A partial move retains remaining source inventory and creates destination inventory for moved quantity; a full move relocates the existing item. Negative stock is prohibited. Completed movements are immutable; corrections require reversal/adjustment transactions.

Payroll states are `pending`, `approved`, and `paid`; the default payroll period is Monday–Sunday. Approved payroll is not silently edited; corrections use adjustment/correction records. External salary-payment integration is not assumed.
