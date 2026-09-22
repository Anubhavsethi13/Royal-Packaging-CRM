# Domain Model

## Purpose and dependencies

Defines the business entities and ownership boundaries for the later schema. Depends on [01](01-requirements-analysis.md) and [02](02-system-architecture.md); is refined by [04](04-database-schema.md).

## CONFIRMED

| Domain | Core entities / relationship |
|---|---|
| Identity/RBAC | Users, sessions, roles, permissions, and role mappings. |
| Workforce | Employees, two configurable shifts, effective-dated employee shift assignments. |
| Organisation | Nine depots and depot-specific hierarchical locations. |
| Commercial | Clients, orders, order items. |
| Inventory | Product/item, batch, current inventory state, inventory movements; all operational quantities are boxes. |
| Task execution | Tasks, task assignments, task events, layer-photo evidence. A task has multiple employees; an employee may have multiple active tasks. |
| Quality | Quality records/outcomes for pass, fail, or adjust. |
| Financial | One IncentiveService, incentive result/ledger/events, payroll ledger and approval records. Collaborators receive equal task-incentive shares. |
| Analytics/audit | KPI definitions, targets, snapshots, report data/executions if approved, and audit events. |

```text
Task 1--* TaskAssignment *--1 Employee
Task 1--* TaskEvent; Task 1--* LayerPhoto; Task 1--* InventoryMovement
Task 1--0..* QualityRecord; Task 1--0..* IncentiveResult
IncentiveResult 1--* Employee allocation; approved result -> payroll ledger
Depot 1--* Location; Client 1--* Order 1--* OrderItem
Product 1--* Batch; batch/location -> inventory state
```

Layer evidence records task, layer number, box quantity, capturer, capture time, and photo reference. Assignment history must be preserved rather than overwritten.

## RECOMMENDATIONS

- Make movements, task events, incentive/payroll ledger entries, and audit records append-oriented historical records.
- Model current inventory as a balance/state derived or maintained from movement records in the same transaction.
- Use explicit bounded metadata for events rather than an uncontrolled JSON payload.

## TBD / approval decisions

- User-to-employee cardinality; employee/depot assignment model; product/batch/location identity constraints.
- Which order/order-item/product/batch/location links are mandatory for each task and move.
- Quality defect taxonomy and whether multiple records per task are required.
- Exact payroll/incentive entry cardinalities and correction/reversal model.

## Risks

- A single `employee_id` on tasks violates collaboration and active-task requirements.
- Mutable financial/inventory history impairs auditability and reconciliation.
- Unapproved entity links could hard-code false warehouse assumptions.

## Approval gate before coding

Approve mandatory links, cardinalities, financial correction policy, and quality model before finalising the schema.
