# Domain Contracts and Repository Mapping

The first column records the actual current repository interface. The future operations are contract targets, not implemented endpoints.

| Domain | Current repository | Future read operations | Future mutation/read concerns |
|---|---|---|---|
| Clients | `list`, `getById` | list/search/detail | create/update; account and contact validation |
| Orders | `list`, `getById` | list/search/detail | create/update/cancel; item collection and lifecycle rules |
| Inventory | `list`, `getById` | list/search/detail/movements | location/status/reservation; concurrency is open |
| Warehouse | alias only over inventory; no warehouse repository | depots/zones/rows/aisles/locations/occupancy | hierarchy and blocking rules are open |
| Tasks | `list`, `getById` | list/detail | assign/reassign/status; transitions are open |
| Employees | `list`, `getById` | list/detail/workload/productivity | role and attribution rules are open |
| KPI | `list`, `getById` | list/detail/trend | target/actual/variance/period; ownership and recalculation are open |
| Incentives | `list`, `getById` | rules/eligibility/progress/detail | achievement/estimate/status; formula and overrides are open |
| Payroll | `list`, `getById` | periods/detail | earnings/deductions/incentives/status; authority and disputes are open |
| Reports | `list`, `getById` | catalog/preview/saved reports | filters/export/scheduling require product decisions |
| Audit | `list`, `getById` | list/filter/detail | actor/action/entity/timestamps/before-after; retention is open |

## Mapping Shape

`CustomerRepository.list(query)` maps to a future `GET /clients` request and an `ApiListEnvelope<ClientRecord>`, which the adapter maps to `ListResponse<ClientRecord>`. `getById(id)` maps to `GET /clients/{id}` and returns a record or a mapped not-found result.

The same mapping applies to the other read repositories. Future writes should use typed request bodies from `frontend/src/api/contracts.ts`, return `ApiMutationEnvelope<T>` where a record is returned, and surface standardized errors. Order cancellation is a named action rather than an implicit delete, but the final transition and authorization remain open.

## Domain Vocabulary

- Client: account code, contact, status, segment, and order summary.
- Order: client, one or more item records, quantity/unit display, priority, due date, fulfillment, SLA, status, and activity.
- Inventory: barcode/SKU, quantity/unit, weight/volume display, location, status, client relationship, reservation, and movement history.
- Warehouse: future hierarchical location resources; current screens are preview surfaces.
- Task: type, source/destination, material/barcode, quantity/weight/volume, employee, priority, status, timer, and SLA.
- Employee: role, depot, shift, task load, productivity, and KPI display.
- KPI: owner, actual, target, variance, trend, period, and tone/display state.
- Incentive and payroll: preview records only; calculations and approvals are not frozen as business policy.
- Report and audit: catalog/preview metadata and immutable-history display expectations respectively.

## Status Inventory

Current UI status values are `Active`, `On hold`, `Prospect`; `Draft`, `Confirmed`, `In production`, `Partially fulfilled`, `Ready`, `Dispatched`, `Completed`, `Cancelled`; `Available`, `Reserved`, `Staged`, `Damaged`; `Queued`, `In progress`, `Exception`; `On track`, `At risk`, `Breach risk`; `On leave`, `Inactive`; `Up`, `Flat`, `Down`; `Preview`, `Pending review`, `Approved`; `Draft preview`, `Pending approval`; and report/audit values such as `Scheduled`, `Blocked`, and `Success`.

These are display vocabulary and provisional domain values. The backend must confirm valid transitions and whether any value is historical, derived, or merely a UI tone before implementation.
