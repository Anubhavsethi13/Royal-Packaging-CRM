# Database Schema Design Boundary

## Purpose and dependencies

Sets schema-design constraints only; it is not a migration. Depends on [03](03-domain-model.md), [05](05-task-state-machine.md), [06](06-transaction-boundaries.md), and [07](07-incentive-engine.md).

## CONFIRMED

- PostgreSQL stores authoritative operational, financial, audit, and metadata records.
- Required table families are users/roles/permissions/sessions; employees/shifts; depots/locations; clients/orders; products/batches/inventory movements/current state; tasks/assignments/events/photos; quality; incentives/payroll; KPIs; reports as approved; and audit.
- `task_assignments` must support many employees per task and several active assignments per employee, with preserved history.
- Financial amounts/rates use PostgreSQL `NUMERIC`, never JavaScript floating point.
- Product code plus batch is relevant inventory identity; all operational quantities use boxes.
- Warehouse, payroll, and audit records are retained for the system lifetime.
- Schema constraints and transactional database access must prevent duplicate completion side effects.

## RECOMMENDATIONS

- Design primary/foreign keys, uniqueness, check constraints, indexes, state enums, immutable-history fields, version/`updated_at` fields, and audit linkage before migrations.
- Index actual task, inventory, KPI, productivity, daily-report, and authorization query patterns after they are approved and measured.
- Use an auditable movement ledger and a deliberate current-balance strategy in the same transaction.

## TBD / approval decisions

- IDs, exact field lists, names, nullability, money precision/scale/rounding, and data-retention treatment for photos.
- Inventory reservation, negative balance, adjustment, reversal, reconciliation, and partial-movement semantics.
- Final state values and guards for task, quality, incentive, payroll, and approval records.
- Exact report persistence/export history and attendance/GPS/leave/salary data sources.

## Risks

- A premature schema may encode unresolved quality, incentives, or reporting rules and require destructive migration later.
- Missing uniqueness/idempotency controls can duplicate movements and financial records.
- Poorly selected indexes risk slow daily reports and warehouse queries.

## Approval gate before coding

Approve an ERD, constraints, state values, immutable-history rules, financial precision, and all schema TBDs before creating migrations.
