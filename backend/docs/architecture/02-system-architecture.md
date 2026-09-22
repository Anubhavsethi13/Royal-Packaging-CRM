# System Architecture

## Purpose and dependencies

Defines the initial system shape. Depends on [requirements analysis](01-requirements-analysis.md); constrains all other architecture documents.

## CONFIRMED

- Use a TypeScript modular monolith with PostgreSQL as the authoritative business database.
- Use Kysely for database access and Zod for external-input validation. Domain logic belongs in domain services, not route handlers.
- Photo binaries use object storage; PostgreSQL stores their metadata/reference.
- Floot Realtime is a post-commit freshness/synchronization mechanism. It is not a transaction system or source of truth.
- Clients recover from missed realtime messages by reading current state from backend APIs backed by PostgreSQL.
- The initial deployment direction is load balancer/reverse proxy -> backend -> PostgreSQL, with backend integrations to object storage and Floot. Development, staging, and production are separate.
- Kafka, RabbitMQ, Redis, microservices, and a graph-routing engine have no documented justification and are out of scope.

```text
Clients -> HTTP backend -> domain modules -> PostgreSQL
             |                 |              |
             |                 +-> object storage (photos)
             +-> Floot Realtime <--- post-commit freshness only
PostgreSQL -> KPI/report queries and snapshots
```

## RECOMMENDATIONS

- Separate modules for auth, RBAC, users/employees, depots/locations, clients/orders, inventory, tasks/events/photos, quality, incentives, payroll, KPIs, reports, audit, and realtime adapters.
- Keep cross-domain operations in explicit application/domain services and use database transactions for their atomic work.
- Emit structured logs with correlation/request IDs across scan/trace through payroll.

## TBD / approval decisions

- Object-storage provider, upload/finalization strategy, retention, and orphan-object cleanup.
- Peak load, sizing, performance SLOs, backup/restore targets, and final production topology.
- Whether any later measured scale or organisational need justifies splitting the monolith.

## Risks

- Treating Floot data as authoritative causes permanent UI/business drift after lost messages.
- A photo binary and its database metadata cannot be atomically committed without an approved compensation workflow.
- Premature infrastructure additions add failure modes without requirements support.

## Approval gate before coding

Approve the modular-monolith boundary and photo-storage lifecycle. No broker, cache, microservice, or graph engine may be introduced without a documented requirement and evidence.
