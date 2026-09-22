# KPI Data Model

## Purpose and dependencies

Defines data provenance for KPI calculation. Depends on [03](03-domain-model.md), [04](04-database-schema.md), [07](07-incentive-engine.md), and [11](11-reporting-model.md).

## CONFIRMED

- Required structures are KPI definitions, KPI targets, and KPI snapshots.
- KPIs derive from normalized operational records, never manually entered dashboard values.
- Drill-down dimensions are depot, employee, task type, client, material/product, date, and shift.
- Confirmed examples: completion rate derives from tasks/task events; employee productivity from completed boxes, task duration, and employee attribution; damage rate from quality records.
- Source data must preserve timestamps, multi-employee attribution, box quantities, depot/location, product/batch, client/order where relevant, quality outcome, and shift context.

## RECOMMENDATIONS

- Store snapshots with calculation time, definition/version, dimensional context, and source period so output can be reproduced.
- Centralize calculation/query logic so dashboard and reporting measures do not diverge.
- Use measured query plans and indexes for expensive KPI calculations.

## TBD / approval decisions

- Metric formula catalogue, target values, periods, snapshot cadence, late-data corrections/backfill, access scope, and retention.
- Employee productivity attribution for collaborators and handling of pauses, reassignments, quality adjustments, and reopened tasks.

## Risks

- Undefined formulas create misleading performance or pay-adjacent results.
- Snapshot design without source/version context cannot be audited after corrections.

## Approval gate before coding

Approve each KPI definition, denominator/numerator, target, dimensions, cadence, and correction policy before building calculation jobs or UI queries.

## Final client-resolution addendum

Daily KPI/reporting cadence applies where applicable (**CONFIRMED**). KPI data remains derived from operational records and supports depot, employee, task type, client, material/product, date, and shift. Targets and formulas are still **CLIENT DECISION REQUIRED**; daily cadence does not authorize inventing them.
