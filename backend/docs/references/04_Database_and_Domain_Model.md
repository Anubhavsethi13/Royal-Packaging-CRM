# Database and Domain Model

## Phase 3 --- Database Design

Do not start with API development.

Design PostgreSQL first.

Codex prompt:

> Design the PostgreSQL schema for Royal Packaging based strictly on the
> approved requirements.
>
> Before migrations:
>
> 1.  Identify every entity.
> 2.  Define relationships.
> 3.  Define primary keys.
> 4.  Define foreign keys.
> 5.  Define unique constraints.
> 6.  Define check constraints.
> 7.  Define indexes.
> 8.  Define enums/state values.
> 9.  Identify immutable historical data.
> 10. Identify tables requiring audit history.
> 11. Identify transaction boundaries.
>
> Pay special attention to: - 9 depots - depot-specific location
> hierarchy - product code + batch - box-only quantities -
> multi-employee tasks - task events - layer photo evidence - shifts -
> overtime - incentive calculation - equal incentive distribution -
> payroll ledger - KPI snapshots - RBAC - audit records
>
> Do not implement migrations yet.
>
> Create: `docs/architecture/02-database-design.md`
>
> Also create an ERD representation.

## Expected Domain Areas

### Identity / RBAC

-   users
-   roles
-   permissions
-   role_permissions
-   user_roles
-   sessions

### Organization

-   depots
-   locations

### Employees

-   employees
-   shifts
-   employee shift assignments

### Clients / Orders

-   clients
-   orders
-   order_items

### Inventory

-   inventory items
-   inventory batches
-   inventory movements

### Tasks

-   tasks
-   task_assignments
-   task_events
-   task_photos

### Quality

-   quality records / quality outcomes

### Incentives

-   incentive rules
-   incentive calculations / ledger
-   incentive events

### Payroll

-   payroll ledger
-   payroll approval records

### KPI

-   kpiDefinitions
-   kpiTargets
-   kpiSnapshots

### Audit

-   audit events

### Reports

-   report definitions
-   report execution metadata, if required

Codex must reconcile this list with the actual reference documents
before finalizing the schema.

## Multi-Employee Task Model

Do not rely on a single `employee_id` column in tasks.

Use a relationship such as:

``` text
tasks
  |
  └── task_assignments
        ├── employee A
        ├── employee B
        └── employee C
```

and:

``` text
tasks
  |
  └── task_events
```

A task can have multiple employees.

An employee can have multiple active tasks.

Assignment history must be preserved.

## Financial Precision

Do not use JavaScript floating-point arithmetic for monetary values.

Use PostgreSQL `NUMERIC` for money/rates where appropriate.

Document:

-   precision
-   scale
-   rounding policy
-   minimum payable amount, if applicable
