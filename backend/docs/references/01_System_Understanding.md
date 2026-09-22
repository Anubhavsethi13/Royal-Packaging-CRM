# Royal Packaging CRM --- System Understanding

## Purpose

Royal Packaging CRM is an enterprise warehouse operations control system
with CRM, inventory, workforce, incentive, payroll, KPI, reporting, and
realtime capabilities.

## Central Business Flow

``` text
CLIENT / ORDER
      ↓
INVENTORY TRUTH
      ↓
SCAN / TRACE
      ↓
ASSIGN
      ↓
MOVE
      ↓
COMPLETE
      ↓
QUALITY GATE
      ↓
INCENTIVE
      ↓
PAYROLL
      ↓
KPI FEEDBACK
```

The backend must enforce this flow.

## Technology Baseline

-   Backend: TypeScript
-   Database: PostgreSQL
-   Database access: Kysely
-   Validation: Zod
-   Password hashing: bcryptjs
-   Authentication / cryptographic operations: jose
-   Realtime: Floot Realtime
-   Photo storage: Object storage, with photo metadata in PostgreSQL

## Source-of-Truth Principle

**PostgreSQL is the authoritative business source of truth.**

**Floot Realtime is a freshness signal only.**

Realtime must never become the authoritative transaction mechanism.

A lost realtime event must not result in permanent loss of business
state. The client must be able to recover authoritative state from
PostgreSQL after refresh or reconnect.

## Key Confirmed Business Constraints

-   9 depots
-   2 shifts
-   Exact shift timings are currently TBD
-   Box is the only operational unit
-   Product code + batch are relevant inventory identifiers
-   Mobile phone camera is used for photo-based layer tracing
-   Each photo/layer must record the quantity of boxes in that layer
-   A task may involve multiple employees
-   An employee may have multiple active tasks
-   Employees working together on a task receive equal shares of that
    task's incentive
-   Overtime affects incentives
-   Roles include Super Admin, Main Admin, Admin, and Manager
-   Reports are generated daily
-   MB51 and MB52 must not be implemented
-   Supplied report templates are authoritative for required reporting
-   Warehouse, payroll, and audit records are retained for the lifetime
    of the system

## Important TBD Items

Do not let Codex invent answers for:

-   Exact timing of the two shifts
-   Exact overtime incentive formula where it has not been confirmed
-   Final reconciliation between the historical incentive model and the
    new equal-sharing rule
-   Exact report columns where templates do not define them
-   Whether lifetime retention explicitly includes photos
-   Final object-storage provider
-   Expected peak concurrent warehouse users
-   Final production infrastructure sizing
