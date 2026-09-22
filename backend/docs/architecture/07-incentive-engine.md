# Canonical Incentive Engine

## Purpose and dependencies

Defines the single IncentiveService boundary. Depends on [03](03-domain-model.md), [05](05-task-state-machine.md), and [06](06-transaction-boundaries.md); informs [09](09-kpi-data-model.md), [11](11-reporting-model.md), and [12](12-api-contracts.md).

## CONFIRMED

- There must be exactly one canonical `IncentiveService`; no duplicate incentive engine or payroll-side recalculation is permitted.
- Its documented responsibilities include task incentive calculation, quality validation, approved penalty application, equal employee-share allocation, and incentive-ledger creation.
- Employees working together on a task receive equal shares of that task's incentive. The allocation is per task, not historical per-employee percentage.
- Overtime affects incentives. Shift timings must be configurable; completion after the applicable shift boundary invokes the approved overtime rule.
- Payroll consumes the approved incentive result through ledger/approval flow.

```text
approved task/quality input -> IncentiveService -> incentive ledger/events
                                -> equal allocations by participating employees
approved incentive result -> payroll approval/ledger (no recalculation)
```

## RECOMMENDATIONS

- Preserve calculation inputs, rule/version reference, result, allocations, approvals, and audit context to make financial results explainable.
- Use PostgreSQL `NUMERIC` and test equal allocation, including rounding cases, only after rounding is approved.
- Keep historical incentive data isolated from the new task-level allocation rule.

## TBD / approval decisions

- Reconciliation of the historical 6% pool and penalties with the new rule.
- Incentive formula, overtime/SLA formula, quality/penalty conditions, payability threshold, rounding/remainder/minimum payment, correction/reversal, and approval actor/workflow.
- What counts as participating employee when assignments change during the task.

## Risks

- Combining historical and new models silently creates incorrect pay.
- Undefined rounding makes equal shares financially unreproducible.
- Independent payroll calculation creates conflicting financial truth.

## Approval gate before coding

Obtain a versioned approved incentive policy covering formula, overtime/SLA, quality, penalties, allocation membership, rounding, corrections, and approvals.

## Final client-resolution addendum

### Historical incentive model — reference only

`Incentive_Calculation_Observations.md` is authoritative for historical workbook logic:

```text
Super Incentive = Total Kot × 3%
Staff Incentive = Total Kot × 3%
Total Incentive = Total Kot × 6%
Final Incentive Pool = Total Incentive − Penalties/Payouts
```

The workbook hardcodes the 3%, 3%, and 6% rates, deducts manual penalty/recovery entries, and distributes the resulting period pool using manual employee allocation percentages. It also contains manual sheets, manually copied/rounded period values, incomplete allocations (99.72% in March 2024 and 99.5% in June 2025), inconsistent employee names, and penalty rows mixed into some allocation tables. Historical allocation percentages are **not** the new task-level allocation mechanism.

The supplied legacy points formula is also reference-only:

```text
volumePoints = floor(weightKg / 50)
quality >= 98 -> 1.25
quality >= 95 -> 1.10
quality >= 90 -> 0.90
otherwise -> 0.50
speed: duration <= 30 -> 25 points; otherwise 0
finalPoints = max(0, floor((volumePoints + speedPoints) × qualityMultiplier))
cash = points × 5
```

It must not become the canonical warehouse engine unless expressly approved.

### Current warehouse task rule

The confirmed current rule is equal sharing of a task incentive among participating employees, using employee IDs rather than names. The historical 6% period pool enters task-level calculation only if the client later approves that relationship as a versioned/configurable rule; until then it remains **CLIENT DECISION REQUIRED**. Participant-cutoff policy, overtime formula, SLA formula, additional quality penalties, rounding, and corrections remain **CLIENT DECISION REQUIRED**. There remains one canonical `IncentiveService`.
