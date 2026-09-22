# Testing Strategy

## Purpose and dependencies

Defines required verification categories. Depends on [05](05-task-state-machine.md), [06](06-transaction-boundaries.md), [07](07-incentive-engine.md), [08](08-realtime-event-contract.md), and [10](10-rbac-security-model.md).

## CONFIRMED

- Test completion success: completion, inventory update, task event, incentive, and payroll ledger side effects as applicable.
- Test completion failure: no partial task, inventory, incentive, or payroll state.
- Test equal allocation for one, two, and three employees and approved rounding cases.
- Test overtime around shift boundary, including paused/resumed tasks, against the approved formula.
- Test realtime at-most-once behaviour, failure, reconnect, stale-client recovery, and authoritative resynchronization.
- Test unauthorized employee/admin, manager/super-admin, incentive correction, spoofed user/employee IDs, and cross-depot access.
- Eventually load-test concurrent task creation/updates, photo metadata, inventory/KPI/dashboard/report queries, and realtime; measure p50/p95/p99.

## RECOMMENDATIONS

- Use unit tests for domain rules, integration tests for PostgreSQL transactions/constraints, contract tests for APIs/realtime, and end-to-end tests for critical warehouse workflows.
- Include duplicate/concurrent completion and inventory partial-movement scenarios once approved.
- Run lint, typecheck, unit/integration tests, build, security checks, staging deploy, smoke tests, then production approval in CI/CD.

## TBD / approval decisions

- Acceptance fixtures, test-data retention, target concurrency/latency, coverage thresholds, staging integration availability, and report-template golden files.
- Exact expected outcomes for unsettled quality, payroll, incentives, scan/trace, and routing rules.

## Risks

- Tests cannot legitimately encode unresolved business decisions.
- Lack of realistic concurrency/recovery testing risks duplicate money/inventory records and realtime drift.

## Approval gate before coding

Approve business-rule acceptance cases and operational performance targets before declaring implementation production-ready.
