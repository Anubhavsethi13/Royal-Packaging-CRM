# Implementation Plan

## Purpose and dependencies

Sequences work without authorizing implementation yet. Depends on all architecture documents [02](02-system-architecture.md) through [14](14-testing-strategy.md).

## CONFIRMED sequence

1. Approve requirements analysis and supply missing templates, historical incentive material, and client decisions.
2. Approve architecture/state/transaction/incentive/RBAC/report decisions and database ERD/schema design.
3. Create migrations and development-only seeds only after schema approval.
4. Implement authentication, sessions, rate limit, RBAC, depot scope.
5. Implement depot/location, employee/shift, client/order, product/batch foundations.
6. Implement authoritative inventory and movement ledger, including approved partial movement rules.
7. Implement task engine, multi-employee assignments, events, trace evidence, explicit transitions, audit, and duplicate protection.
8. Implement quality/damage handling, then the one IncentiveService and payroll ledger/approval handoff.
9. Implement KPI definitions/targets/snapshots, post-commit realtime/resync, and authorised reporting once templates exist.
10. Add API/dashboard aggregation, comprehensive tests, measured performance work, security hardening, deployment, backups/restore, and production readiness.

The workflow order remains client/order -> inventory truth -> scan/trace -> assign -> move -> complete -> quality -> incentive -> payroll -> KPI/report feedback. MB51/MB52 remain excluded.

## RECOMMENDATIONS

- Require review/approval at each design gate; implement bounded features in dependency order rather than the whole backend at once.
- Validate each feature with tests and a reviewed diff before proceeding. Use real query measurements before indexing or changing routing architecture.

## TBD / approval decisions

- Every unresolved business decision in [01](01-requirements-analysis.md), especially task transitions, scan/movement, quality, incentives/overtime/SLA, payroll approval, report templates, KPI formulas, RBAC matrix, photo retention, and performance sizing.

## Risks

- Starting database/API work before approval locks in incorrect financial and operational rules.
- Implementing reports/KPIs before template/formula decisions creates conflicting operational views.

## Approval gate before coding

Human/client approval is required for the decisions below before implementation begins.

1. Shift times and complete overtime/SLA rule.
2. Full incentive policy: historical 6% relationship, formula, penalties, quality effect, allocation membership, rounding, correction, approval.
3. Quality/damage workflow and its impact on task completion, payability, reversal/reopen.
4. Task transition matrix and authorizations for cancel/reassign/reopen.
5. Scan/trace identifiers, layer evidence rules, task/order/inventory links, partial inventory movement, reservation/negative-stock/reversal/reconciliation rules.
6. Photo storage provider, upload/finalization, retention, and object cleanup.
7. RBAC permission matrix, depot scope, user/employee mapping, account/session policy, and financial approval authority.
8. Report templates and all attendance/GPS/leave/salary source data/calculation definitions; MB51/MB52 exclusion confirmation.
9. KPI catalogue, formulas, targets, cadence, corrections, and collaborator attribution.
10. Realtime message/resynchronization/subscription contract and publication expectations.
11. Financial precision, retention/legal/privacy, backup/restore, peak load/SLOs, monitoring/alert policy, and production sizing.
