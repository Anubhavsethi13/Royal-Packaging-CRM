# Transaction Boundaries

## Purpose and dependencies

Defines atomicity invariants for PostgreSQL operations. Depends on [04](04-database-schema.md) and [05](05-task-state-machine.md); constrains [07](07-incentive-engine.md), [08](08-realtime-event-contract.md), and [12](12-api-contracts.md).

## CONFIRMED

| Operation | Required atomic result |
|---|---|
| Assignment/reassignment | Authorize, update assignment history, transition if applicable, event, and required audit. |
| Task transition | Authorize, validate current state, update state/version, record event and required audit. |
| Inventory movement | Authorize/validate, record movement, update authoritative inventory state, and record related task/audit data. |
| Completion baseline | Validate task/state/actor/evidence and completed boxes; record completion, inventory movement, task event, quality/incentive/payroll effects when approved. |
| Incentive/payroll approval | Validate approved source result and actor; write ledger/status/audit records without duplicates. |

If a critical completion step fails, task completion, inventory, incentive, and payroll must not be left partially changed. Realtime is published only after commit and publication failure does not invalidate a committed operation.

## RECOMMENDATIONS

- Use database constraints, version/state checks, idempotency controls, and appropriate concurrency protection for duplicate completion requests.
- Register photo metadata transactionally after an approved storage-finalization protocol; handle external-object cleanup separately.
- Add an audit event to business-critical mutations where required.

## TBD / approval decisions

- Whether quality evaluation, incentive calculation, and payroll posting are one completion transaction or later authorised transactions.
- Inventory reservation/partial move/reversal rules and lock/concurrency strategy.
- External photo upload compensation, idempotency-key lifecycle, and correction policies.

## Risks

- Split transactions can create paid-but-uncompleted or moved-but-untraced work.
- Cross-system photo storage cannot share a normal PostgreSQL transaction.
- Retrying completion without idempotency may duplicate financial records.

## Approval gate before coding

Approve completion-to-quality-to-payroll sequencing, inventory partial-movement/reversal semantics, and photo finalization before implementing mutations.
