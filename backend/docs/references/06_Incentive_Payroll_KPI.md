# Incentive, Payroll and KPI Architecture

## IncentiveService

Use one canonical:

`IncentiveService`

Responsibilities may include:

-   `calculateTaskIncentive()`
-   `validateQuality()`
-   `applyPenalty()`
-   `allocateEmployeeShares()`
-   `createIncentiveLedger()`

Do not create duplicate incentive engines.

## Equal Distribution Rule

Confirmed rule:

**Employees working together on a task receive equal shares of that
task's incentive.**

Example:

``` text
Task incentive = ₹1,200
Employees = A, B, C

A = ₹400
B = ₹400
C = ₹400
```

Another example:

``` text
Task incentive = ₹900
Employees = A, B

A = ₹450
B = ₹450
```

Historical employee allocation percentages should not be used as the new
equal-sharing rule.

## Historical Incentive Model

The historical incentive calculation document remains reference/legacy
data.

It includes a historical 6% total incentive pool and penalties.

The backend must clearly distinguish:

1.  Historical incentive calculation model
2.  New task-level equal-distribution rule

Do not silently merge these models.

## Payroll

Payroll should consume the approved incentive result instead of
independently recalculating it.

``` text
Task
  ↓
IncentiveService
  ↓
Incentive Ledger
  ↓
Approval
  ↓
Payroll Ledger
```

This prevents conflicting financial results.

## KPI Infrastructure

Use:

-   `kpiDefinitions`
-   `kpiTargets`
-   `kpiSnapshots`

Important drill-down dimensions:

-   depot
-   employee
-   task type
-   client
-   material/product
-   date
-   shift

KPIs must be derived from operational data, not manually entered
dashboard values.

## KPI Pipeline

``` text
Operational Event / State
          ↓
      PostgreSQL
          ↓
    KPI Calculation
          ↓
     KPI Snapshot
          ↓
 Dashboard / Report
```

Examples:

-   Task Completion Rate → tasks + task_events
-   Employee Productivity → completed boxes + task duration + employee
    attribution
-   Damage Rate → quality records

## Equal Incentive Distribution Tests

Test:

``` text
₹900 / 3 employees
= ₹300 each
```

Test:

``` text
₹900 / 2 employees
= ₹450 each
```

Test:

``` text
₹900 / 1 employee
= ₹900
```

Also test rounding cases.

## Overtime Tests

Test:

-   task starts and completes before shift end
-   task starts before shift end and completes after shift end
-   task completes exactly at shift boundary
-   task is paused/resumed across shift boundaries

Verify overtime affects incentive exactly according to the approved
rule.
