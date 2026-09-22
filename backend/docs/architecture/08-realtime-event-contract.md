# Realtime Event Contract

## Purpose and dependencies

Defines Floot's non-authoritative role. Depends on [02](02-system-architecture.md) and [06](06-transaction-boundaries.md); aligns with [12](12-api-contracts.md) and [13](13-observability.md).

## CONFIRMED

- Channels are `warehouse:ops`, `inventory`, and `payroll`.
- Relevant messages include task-status change, assignment change, inventory movement, payroll-status change, and KPI freshness update.
- Durable task events include at least task ID, event type, time, actor ID, and deliberately designed metadata. Incentive events and KPI snapshots are related durable records.
- Publish after PostgreSQL commit only. Floot delivery may be at most once; it cannot be used to execute or recover business transactions.
- On reconnect/refresh, clients request current authoritative state from PostgreSQL-backed backend APIs.
- Monitor publish attempts/failures, reconnects, stale clients, and resynchronization requests.

## RECOMMENDATIONS

- Make each message a compact freshness hint identifying resource/domain and version or `updated_at`, not a substitute full ledger/event stream.
- Authorize subscriptions and expose only data within the user's server-authorised scope.
- Test PostgreSQL success with Floot failure, duplicate/missed messages, stale client recovery, and reconnect fetch.

## TBD / approval decisions

- Message envelope/version, exact event types/payload fields, topic ownership, subscription authorization mechanism, retry policy, and resynchronization endpoints/filters.
- Whether any durable outbox/publication-record pattern is needed; no broker is implied.

## Risks

- Depending on delivery creates permanent drift; large payloads expose data or become a second state model.
- Unbounded metadata lacks a stable contract and audit/query value.

## Approval gate before coding

Approve message schemas, client resynchronization contract, event retention/publication expectations, and channel authorization before implementing realtime adapters.

## Final client-resolution addendum

The channels remain `warehouse:ops`, `inventory`, and `payroll`. Events are freshness notifications created only after their PostgreSQL transaction commits. A failed publication must not alter task, inventory, incentive, payroll, or audit truth.

The payload design must represent the committed entity/resource ID, event timestamp, authorized actor reference, resource version, correlation information, and bounded data as **TECHNICAL REQUIREMENTS**. Exact payload fields, event names for quality/incentive/photo states, retry policy, and subscription authorization remain **CLIENT DECISION REQUIRED**. Reconnect, refresh, missed, stale, duplicate, and out-of-order messages are resolved by an authoritative scoped PostgreSQL refetch; never by replaying a financial mutation.
