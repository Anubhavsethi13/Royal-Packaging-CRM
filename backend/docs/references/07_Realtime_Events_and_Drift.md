# Event Stream and Realtime Architecture

## Realtime Channels

Use the existing channels:

-   `warehouse:ops`
-   `inventory`
-   `payroll`

Possible realtime messages include:

-   task status changed
-   assignment changed
-   inventory movement occurred
-   payroll status changed
-   relevant KPI freshness update

## Core Architecture

``` text
PostgreSQL
     ↓
Backend Domain Service
     ↓
Floot Realtime
     ↓
UI
```

PostgreSQL remains authoritative.

Realtime is only a freshness mechanism.

## Event Model

The event stream data model should document:

``` text
taskEvents
- taskId
- eventType
- eventAt
- actorId
- metadata
```

Other event-related structures include:

-   incentiveEvents
-   KPI snapshots

Event metadata must be designed deliberately rather than becoming an
uncontrolled JSON dump.

## At-Most-Once Delivery

At-most-once realtime delivery is acceptable because the UI can recover
authoritative state from PostgreSQL.

The system should not depend on receiving every event.

## Reconnect / Resynchronization

On reconnect:

``` text
Realtime Reconnect
       ↓
Request Current State
       ↓
Backend
       ↓
PostgreSQL
       ↓
Return Authoritative State
       ↓
Update UI
```

Do not assume that receiving every event is equivalent to having correct
state.

## Realtime Failure Test

Simulate:

``` text
PostgreSQL works
Floot Realtime fails
```

Expected:

-   warehouse operation succeeds
-   database state is correct
-   UI can resynchronize later

Then:

``` text
Realtime reconnect
      ↓
Fetch authoritative state
      ↓
UI becomes current
```

## Drift Detection

Monitor:

-   realtime publication attempts
-   realtime publication failures
-   reconnects
-   stale clients
-   resynchronization requests

Do not make realtime delivery the business state.

If useful, use server-side state versions or `updated_at`/version fields
to help clients detect stale state.

## Duplicate Completion Protection

Simulate rapid duplicate requests:

``` text
COMPLETE TASK
COMPLETE TASK
```

The backend must prevent duplicate:

-   inventory movements
-   incentives
-   payroll entries
-   completion side effects

Use state validation and appropriate idempotency controls.
