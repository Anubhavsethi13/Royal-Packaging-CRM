# Domain Modularity, Testing, Deployment and Production Readiness

## Domain Modules

Recommended structure:

``` text
src/modules/
├── auth/
├── rbac/
├── users/
├── employees/
├── depots/
├── locations/
├── clients/
├── orders/
├── inventory/
├── tasks/
├── task-events/
├── task-photos/
├── quality/
├── incentives/
├── payroll/
├── kpis/
├── reports/
└── audit/
```

Keep domain logic in services/domain modules, not route handlers.

## Canonical Services

At minimum, clearly separate responsibilities for:

-   Auth
-   WarehouseTask
-   Inventory
-   Incentive
-   Payroll
-   KPI
-   Reports

Do not duplicate incentive calculation logic.

## Migration Phase

After schema approval, ask Codex:

> Implement the approved PostgreSQL schema using Kysely migrations.
>
> Requirements: - create migrations in dependency-safe order - primary
> keys - foreign keys - unique constraints - check constraints - indexes
> based on documented query patterns - no speculative columns - do not
> change approved architecture - make migrations reversible where
> practical
>
> After implementation: - run migration checks - run TypeScript checks -
> run tests - report failures
>
> Do not implement API endpoints yet.

## Seed Data

Create development seed data for:

-   9 depots
-   sample locations
-   roles
-   permissions
-   sample users
-   sample employees
-   sample shifts
-   sample clients
-   sample products
-   sample batches

Clearly mark seed data as development data.

Never treat seed data as production business data.

## Development Order

``` text
1. Repository + Codex rules
2. Requirements + architecture
3. Database design
4. Database migrations
5. Authentication
6. RBAC
7. Depot / Location
8. Employee / Shift
9. Client / Order
10. Inventory
11. Task engine
12. Task events
13. Photo evidence
14. Quality
15. IncentiveService
16. Payroll
17. KPI engine
18. Realtime
19. Reports
20. Dashboard/API aggregation
21. Testing
22. Performance
23. Security hardening
24. Deployment
25. Production readiness
```

Do not reverse this sequence casually.

## Codex Development Loop

For every feature:

1.  Define the bounded requirement.
2.  Ask Codex to inspect existing code.
3.  Ask Codex for an implementation plan.
4.  Review the plan.
5.  Ask Codex to implement.
6.  Run tests.
7.  Give failures back to Codex.
8.  Fix.
9.  Review the Git diff.
10. Commit.

## Example Codex Feature Prompt

> Implement Task Assignment for the Royal Packaging backend.
>
> Before changing code: 1. Inspect AGENTS.md. 2. Inspect the task
> schema. 3. Inspect RBAC. 4. Inspect existing task services. 5. Inspect
> existing task events.
>
> Requirements: - a task can have multiple employees - an employee can
> have multiple active tasks - assignment must be authorized
> server-side - assignment must create a task event - assignment must be
> transactional - do not modify unrelated domains - do not create a
> second task model - use Zod for request validation - use Kysely for
> database access
>
> First provide the implementation plan and affected files. Do not
> modify files until the plan is reviewed.

## What Not to Ask Codex

Avoid:

-   "Build the whole backend."
-   "Make everything production ready."
-   "Fix all errors."
-   "Optimize the entire application."
-   "Create all APIs."

Prefer bounded prompts such as:

-   Implement task assignment.
-   Implement task completion transaction.
-   Implement equal incentive distribution.
-   Implement daily performance report.
-   Implement reconnect resynchronization.
-   Implement a specific KPI.

## Testing Strategy

### Task Completion

Successful case:

``` text
Task completed
+
Inventory updated
+
Task event recorded
+
Incentive created
+
Payroll ledger created
```

Failure case:

If a critical operation fails:

-   task remains incomplete
-   inventory remains unchanged
-   no partial incentive
-   no partial payroll

Use database transactions.

### Realtime

Test:

-   at-most-once delivery behavior
-   reconnect
-   resynchronization
-   stale client recovery
-   realtime publication failure

### Security

Test authorization boundaries and identity spoofing.

### Load

Test concurrent warehouse activity and measure p50/p95/p99.

## Observability

Add structured logs and correlation/request IDs.

A request should be traceable through:

``` text
SCAN / TRACE
   ↓
TASK
   ↓
INVENTORY
   ↓
QUALITY
   ↓
INCENTIVE
   ↓
PAYROLL
```

Monitor:

-   API latency
-   database latency
-   failed transactions
-   task completion failures
-   realtime publish failures
-   realtime reconnects
-   photo upload failures
-   incentive calculation failures
-   report generation failures

## Deployment

Use:

``` text
Development
     ↓
Staging
     ↓
Production
```

Do not develop directly against production.

Initial architecture:

``` text
Internet
   ↓
Load Balancer / Reverse Proxy
   ↓
Backend Application
   ↓
PostgreSQL

Backend → Object Storage
Backend → Floot Realtime
```

## CI/CD

Recommended pipeline:

``` text
git push
   ↓
lint
   ↓
typecheck
   ↓
unit tests
   ↓
integration tests
   ↓
build
   ↓
security checks
   ↓
deploy staging
   ↓
smoke tests
   ↓
production approval
   ↓
production deployment
```

Keep production deployment behind explicit human approval while the
system is stabilizing.

## Production Readiness Checklist

### Architecture

-   source-of-truth principle verified
-   transaction boundaries reviewed
-   task state machine reviewed
-   incentive engine consolidated

### Security

-   RBAC tested
-   session security tested
-   rate limiting tested
-   authorization tests passed
-   secrets managed outside source code

### Database

-   migrations tested
-   indexes reviewed
-   backups configured
-   restore tested
-   financial precision verified

### Warehouse

-   multi-employee tasks tested
-   photo evidence tested
-   box quantities verified
-   inventory movement verified
-   overtime tested

### Incentive

-   equal distribution tested
-   quality guardrails tested
-   penalties tested
-   rounding tested
-   approval flow tested

### Payroll

-   ledger integrity tested
-   duplicate prevention tested
-   approval authorization tested

### Realtime

-   event publication tested
-   failure/reconnect tested
-   state resynchronization tested

### Reports

-   supplied templates matched
-   PDF verified
-   Excel verified
-   daily reporting verified
-   MB51/MB52 excluded

### Observability

-   structured logging
-   correlation IDs
-   metrics
-   error monitoring
-   database monitoring

## Immediate Next Step

Do not start by coding the entire backend.

First:

1.  Create the repository.
2.  Add `docs/reference`.
3.  Add all authoritative project files.
4.  Create `AGENTS.md`.
5.  Run the Phase 1 requirements-analysis prompt.
6.  Review the generated architecture analysis.
7.  Create and review ADRs.
8.  Design the database.
9.  Only then begin implementation.

This staged approach keeps Codex aligned with Royal Packaging's actual
business process and prevents the backend from becoming a collection of
disconnected CRUD APIs.
