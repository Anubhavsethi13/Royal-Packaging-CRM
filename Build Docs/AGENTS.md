# Royal Packaging CRM — Global Codex Instructions

## Mission

Build and evolve the Royal Packaging CRM incrementally from the repository's existing implementation and the requirements in `Docs/Architecture Development Questions.docx`.

## Non-negotiable rules

1. Inspect the repository before changing anything.
2. Preserve working functionality.
3. Never replace the application wholesale merely to implement a phase.
4. Read the current phase prompt plus relevant previous phase artifacts before coding.
5. Treat the architecture questions document as a requirements-discovery source. Do not invent unanswered business decisions.
6. Label assumptions explicitly as `ASSUMPTION`.
7. If an unanswered question can materially affect schema, transaction boundaries, state machines, financial logic, retention, hardware, realtime or offline behavior, document it before making the implementation decision.
8. Prefer configurable/versioned business rules over hard-coded assumptions.
9. Never silently rewrite historical operational facts.
10. All critical mutations must be transactionally safe and idempotent where retries are possible.
11. Authorization must be enforced server-side.
12. Every schema change must have a reproducible migration.
13. Add or update tests for critical behavior.
14. Run the repository's typecheck/lint/test/build checks after meaningful changes.
15. Do not claim a feature is production-ready merely because its UI renders.

## Phase sequencing

The project is executed in this order:

1. Existing Phase-1 foundation
2. Phase-2 requirements and domain architecture
3. Phase-3 authentication and RBAC
4. Phase-4 CRM, orders and inventory
5. Phase-5 warehouse and task lifecycle
6. Phase-6 units, measurements and hardware
7. Phase-7 SLA and KPI
8. Phase-8 incentives and payroll
9. Phase-9 events, realtime and offline
10. Phase-10 corrections and audit
11. Phase-11 reporting
12. Phase-12 concurrency and scale
13. Phase-13 infrastructure and recovery
14. Phase-14 testing/security acceptance
15. Phase-15 final integration review

## Database evolution

The existing Phase-1 Prisma/database design is the starting point. Later phases must extend it through safe migrations.

Before changing an existing entity:

- inspect its current schema and usages
- identify dependent API/services/UI
- write a migration plan
- preserve existing data
- avoid duplicate entities
- document renamed/removed fields
- run migration validation

## Business facts vs notifications

Durable business events are records of what happened.

Realtime/UI notifications are delivery mechanisms.

Never make a websocket message the authoritative source of truth.

## Financial integrity

Incentive and payroll records must retain:

- inputs
- calculation/rule version
- actor
- timestamps
- overrides
- corrections

Never mutate a historical rule version after it has been used.

## Definition of done

A phase is complete only when implementation, migrations, tests, documentation, and verification are all complete and the repository remains buildable.
