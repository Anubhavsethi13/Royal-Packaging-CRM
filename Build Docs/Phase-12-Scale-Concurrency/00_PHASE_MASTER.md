# Phase 12 Master — PostgreSQL Concurrency & Scale

Read prior phases and current schema.

Treat PostgreSQL as the transactional source of truth unless a confirmed repository requirement says otherwise.

Document and implement:
- transaction boundaries
- row locking or optimistic concurrency
- version fields where useful
- unique/idempotency constraints
- indexes based on access patterns

Test simultaneous:
- inventory movement
- reservation
- task completion
- payout creation
- offline command replay

Do not invent scale numbers. Record tasks/day, concurrent users, depots, inventory count, event retention and KPI query volume as unknown/assumption until confirmed.

Use partitioning/archival only when justified by scale.

Produce ERD, index strategy and concurrency ADRs.
