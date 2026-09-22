# Final Testing Specification

## Test rule

Tests verify confirmed rules and approved decisions; they must not invent expected business outcomes for CDR items. Use unit tests for deterministic domain logic, PostgreSQL integration tests for transactions/constraints, concurrency tests for race conditions, and realtime/security/performance tests described below.

| Category | Required coverage | Status where rule is unresolved |
|---|---|---|
| Unit | Zod validation; confirmed state-path checks; equal incentive allocation; approved overtime/quality/incentive formulas; permission checks; KPI calculations. | Formula/permission/KPI expectations are **CDR**. |
| Integration | PostgreSQL transactions for account/role changes, task assignment, completion, inventory movement/balance, incentive/payroll source linking, RBAC, audit logging. | Quality/payroll/partial-move boundaries **CDR**. |
| Concurrency | Two workers complete one task; simultaneous movement; reassignment; duplicate completion/incentive/payroll request. Assert no duplicate committed movement/incentive/payroll/completion. | Idempotency key and exact conflict outcome **CDR**; no-duplicate invariant **CONFIRMED**. |
| Realtime | Successful publish, publish failure, reconnect, missed/stale/duplicate/out-of-order event, authoritative resync. | Envelope/subscription/retry contract **CDR**. |
| Security | Role escalation, IDOR, forged employee/approval actor/incentive amount/depot scope, rate-limit bypass, cross-depot reads/subscriptions. | Matrix/scope expected allow cases **CDR**; forged values must not authorize (**CONFIRMED**). |
| Performance | Concurrent warehouse users, task-completion throughput, inventory/KPI query performance, reports/realtime activity; measure p50/p95/p99. | No numerical targets are supplied; targets/load are **CDR**. |

Required failure invariant: a critical failed completion leaves task incomplete and inventory, incentive, and payroll unchanged (**CONFIRMED**). Realtime publication failure must not undo a successful database transaction (**CONFIRMED**). Equal allocation tests include 1/2/3 employees and approved rounding cases.
