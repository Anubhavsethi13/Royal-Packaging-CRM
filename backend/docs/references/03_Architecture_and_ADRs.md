# Architecture, Design and ADR Plan

## Phase 1 --- Requirements Analysis

First Codex prompt:

> Read the entire repository and all files under `docs/reference`.
>
> Do not write or modify application code yet.
>
> Analyze the Royal Packaging requirements and produce:
>
> 1.  Current system architecture
> 2.  Required backend domains
> 3.  Domain entities
> 4.  Entity relationships
> 5.  Task state machine
> 6.  SCAN/TRACE → ASSIGN → MOVE → COMPLETE → QUALITY → INCENTIVE →
>     PAYROLL flow
> 7.  Transaction boundaries
> 8.  Realtime events
> 9.  KPI data requirements
> 10. RBAC requirements
> 11. Reporting requirements
> 12. Unknown/TBD requirements
> 13. Conflicting requirements
> 14. Technical risks
> 15. Proposed implementation order
>
> Do not invent missing business rules.
>
> Create: `docs/architecture/01-requirements-analysis.md`
>
> Do not implement code.

Review the generated analysis manually before continuing.

## Phase 2 --- Architecture Decision Records

Create:

``` text
docs/architecture/decisions/
```

Recommended ADRs:

-   ADR-001-source-of-truth.md
-   ADR-002-realtime-strategy.md
-   ADR-003-task-state-machine.md
-   ADR-004-incentive-engine.md
-   ADR-005-photo-storage.md
-   ADR-006-authentication.md
-   ADR-007-rbac.md
-   ADR-008-database-transactions.md
-   ADR-009-reporting.md
-   ADR-010-service-boundaries.md

## ADR Format

Each ADR should contain:

-   Context
-   Decision
-   Alternatives considered
-   Tradeoffs
-   Consequences
-   Deferred decisions

Do not make decisions that contradict `AGENTS.md`.

## Recommended Architectural Direction

Start as a **modular monolith**, not a collection of microservices.

Logical domains:

-   Auth
-   RBAC
-   Warehouse Task
-   Inventory
-   Quality
-   Incentive
-   Payroll
-   KPI
-   Reports
-   Audit

This provides simpler transactions, fewer network failure modes, lower
infrastructure complexity, and easier debugging.

Split services later only if actual scale or organizational requirements
justify it.

## Source of Truth Architecture

``` text
                    ┌─────────────────────┐
                    │    PostgreSQL       │
                    │ Authoritative State │
                    └──────────┬──────────┘
                               │
                         business result
                               │
                    ┌──────────▼──────────┐
                    │   Backend Domain    │
                    │      Services       │
                    └──────────┬──────────┘
                               │
                       freshness signals
                               │
                    ┌──────────▼──────────┐
                    │   Floot Realtime    │
                    └──────────┬──────────┘
                               │
                              UI
```

Realtime delivery must not replace transactional state.
