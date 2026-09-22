# Final Event Specification

## Authority and envelope

PostgreSQL is authoritative; Floot is an at-most-once freshness signal (**CONFIRMED**). Events are emitted only after successful PostgreSQL commit. Publication failure is observed and never rolls back the committed transaction (**CONFIRMED**). No Kafka, RabbitMQ, Redis, durable Floot stream, or replay service is introduced (**DEFERRED**).

Every realtime event uses this **TECHNICAL REQUIREMENT** envelope: `eventName`, `eventVersion`, `entityType`, `entityId`, `occurredAt`, `correlationId`, optional `causationId`, `actor` (authorised actor summary, never trusted client value), `freshness` (resource version/updated time), and bounded `payload`. Exact serialization, actor fields, payload schema, causation policy, and subscription authorization are **CLIENT DECISION REQUIRED (CDR)**.

## Confirmed event families

| Event | Channel | Source transaction | Payload / actor / freshness | Client handling and resynchronization |
|---|---|---|---|---|
| `task.status.changed` | `warehouse:ops` | Approved task state transition. | Task ID, resulting status/version, occurred time, authorized actor summary; transition details **CDR**. | Treat as freshness; refetch task if unknown/stale/conflicting. |
| `task.assignment.changed` | `warehouse:ops` | Assignment/reassignment transaction. | Task ID/version, assignment freshness; employee details only if authorized; membership semantics **CDR**. | Refetch task assignments from authoritative API. |
| `inventory.movement.recorded` | `inventory` | Committed movement/balance update. | Movement ID, affected batch/location/version; quantities/payload policy **CDR**. | Refetch scoped balance/movements. |
| `payroll.status.changed` | `payroll` | Committed approved payroll ledger/status change. | Payroll entry ID/status/version; actor only if authorized; exact status **CDR**. | Refetch payroll entry/list. |
| `kpi.freshness.changed` | approved channel **CDR** | KPI snapshot/calculation update. | KPI definition/snapshot ID/version; exact channel/payload **CDR**. | Refetch KPI snapshot/drill-down. |

Photo registration, quality result/correction, incentive calculation/approval, cancellation, reopening, report execution, and security/role changes have no confirmed realtime requirement. Whether they publish a freshness signal is **CDR**. Durable task/incentive/audit records are PostgreSQL records, not Floot messages.

## Client recovery contract

| Situation | Required handling |
|---|---|
| Reconnect or refresh | Fetch authoritative scoped state from PostgreSQL-backed resync/read endpoints (**CONFIRMED**). |
| Missed event | No business recovery from Floot; refetch current state (**CONFIRMED**). |
| Stale event | Compare technical resource version/updated timestamp, then refetch if stale/unknown (**TECHNICAL REQUIREMENT**). |
| Duplicate event | Treat as idempotent freshness notification; do not repeat business mutation (**TECHNICAL REQUIREMENT**). |
| Out-of-order event | Do not apply as authority; refetch/retain newest known resource version (**TECHNICAL REQUIREMENT**). |
| Event publication failure | Record/monitor attempt/failure; committed PostgreSQL state remains valid (**CONFIRMED**). |

## Event controls

- Channels: `warehouse:ops`, `inventory`, `payroll` (**CONFIRMED**).
- Monitor publication attempts/failures, reconnects, stale clients, and resynchronization requests (**CONFIRMED**).
- Durable event-type catalogue, metadata schemas, post-commit publisher persistence/outbox decision, retry policy, client subscription authorization, and retention are **CDR**.

