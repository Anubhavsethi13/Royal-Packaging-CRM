# Observability Model

## Purpose and dependencies

Defines evidence needed to operate and investigate the system. Depends on [02](02-system-architecture.md), [06](06-transaction-boundaries.md), [08](08-realtime-event-contract.md), and [14](14-testing-strategy.md).

## CONFIRMED

- Use structured logs and correlation/request IDs.
- A request must be traceable through scan/trace, task, inventory, quality, incentive, and payroll.
- Monitor API latency, database latency, failed transactions, task-completion failures, realtime publication failures/reconnects, photo-upload failures, incentive failures, and report-generation failures.
- Monitor realtime publication attempts, stale clients, and resynchronization requests.

## RECOMMENDATIONS

- Record non-sensitive identifiers such as request/correlation ID, operation, resource IDs, outcome, actor/user context permitted by policy, and error classification.
- Provide operational dashboards and alerts around failure rates and lag while preserving PostgreSQL as the diagnostic authority.
- Use audit records for business facts; do not treat logs as the audit trail.

## TBD / approval decisions

- Logging/metrics/tracing platform, retention, access controls, alert thresholds/on-call ownership, PII masking, audit-log event detail, and SLOs.

## Risks

- Missing correlation destroys root-cause analysis across inventory and payroll.
- Sensitive data in logs creates privacy/security exposure; logs cannot replace immutable audit history.

## Approval gate before coding

Approve observability platform, data-redaction policy, retention, alert ownership, and measurable service objectives before production deployment.
