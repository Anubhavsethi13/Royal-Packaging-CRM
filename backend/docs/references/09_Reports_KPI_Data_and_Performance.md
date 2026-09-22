# Reporting, KPI Data and Performance

## Reporting Scope

Do not implement MB51 or MB52.

Use the actual Royal Packaging report files/templates supplied by the
client.

The reporting area includes:

-   Daily Report
-   Monthly Report
-   Periodic Report
-   Location Report
-   Leave Report
-   Salary Report
-   Yearly Report
-   Other Report

## Daily Report Options

The supplied interface shows:

-   Daily Performance
-   Daily Present Report
-   Daily Absent
-   Daily Short Performance
-   Daily In/Out
-   Daily Late IN
-   Daily Early IN
-   Daily Early OUT
-   Daily Over Time
-   Daily GPS APPROVED
-   Daily GPS REJECTED
-   Daily Mis Punch Report
-   Daily Half Day Report
-   Daily GPS PENDING

## Report Templates

Supplied templates are authoritative for:

-   columns
-   column order
-   totals
-   filters
-   formatting
-   PDF/Excel requirements

Reports are generated daily.

## Report Service

Recommended structure:

``` text
Report Query Layer
        ↓
Normalized Report Data
        ↓
Excel Renderer
        ↓
PDF Renderer
```

Do not duplicate calculation logic inside every report.

Use shared report data queries.

## KPI Drill-Down

KPIs should support analysis by:

-   depot
-   employee
-   task type
-   client
-   material/product
-   date
-   shift

## Performance

Use `EXPLAIN ANALYZE` for expensive queries.

Inspect:

-   task queries
-   inventory queries
-   KPI queries
-   employee productivity queries
-   daily reports

Add indexes based on real query patterns.

## KPI Query Design

KPI calculations should use normalized operational data.

Avoid manually entered dashboard KPI values.

Example:

``` text
Task Completion Rate
       ↓
tasks + task_events
```

Example:

``` text
Employee Productivity
       ↓
completed boxes
+ task duration
+ employee attribution
```

Example:

``` text
Damage Rate
       ↓
quality records
```

## Load Testing

Eventually simulate concurrent warehouse users at the expected client
scale.

Test:

-   task creation
-   task updates
-   photo metadata
-   inventory queries
-   KPI queries
-   dashboard queries
-   report generation
-   realtime activity

Measure:

-   p50
-   p95
-   p99

## Routing

The current grid-distance routing model should remain a documented
architectural concern.

Before replacing it with a graph-based routing engine, establish:

-   actual route complexity
-   number of locations
-   query frequency
-   expected scale
-   accuracy requirements
-   performance measurements

Do not introduce a graph engine without evidence that the current model
is insufficient.
