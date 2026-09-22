# Warehouse, Task, Inventory and Quality Workflow

## Task State Machine

Use explicit domain transitions.

Conceptually:

``` text
CREATED
   ↓
ASSIGNED
   ↓
IN_PROGRESS
   ↓
PAUSED
   ↓
IN_PROGRESS
   ↓
COMPLETED
```

Controlled additional transitions may include:

-   REASSIGNED
-   CANCELLED
-   REOPENED

Do not allow arbitrary status changes from generic update endpoints.

Recommended operations:

-   `assignTask()`
-   `startTask()`
-   `pauseTask()`
-   `resumeTask()`
-   `reassignTask()`
-   `completeTask()`
-   `reopenTask()`
-   `cancelTask()`

## Photo Evidence

Royal Packaging uses photo-based layer tracing.

Every photo/layer record should capture:

-   taskId
-   layerNumber
-   boxQuantity
-   capturedBy
-   capturedAt
-   storageKey/photo reference

Example:

``` text
Task T1001

Layer 1 → 42 boxes → photo
Layer 2 → 40 boxes → photo
Layer 3 → 38 boxes → photo

Total = 120 boxes
```

Box is the only operational unit.

Recommended architecture:

``` text
Mobile Device
      ↓
Backend API
      ↓
Object Storage

Photo metadata
      ↓
PostgreSQL
```

Do not impose an artificial photo size limit until storage and
operational requirements are known.

## Shift and Overtime

There are 2 shifts.

Exact timings are TBD.

Do not hard-code them.

Use configuration:

``` text
shifts
- id
- name
- startTime
- endTime
- active
```

and employee shift assignments with effective dates.

If completion occurs after the applicable shift boundary, the overtime
rule is applied.

The exact overtime formula must be implemented only after the approved
business rule is available.

## Inventory Architecture

Inventory is authoritative in PostgreSQL.

``` text
Business Operation
      ↓
PostgreSQL Transaction
      ↓
Inventory Movement Recorded
      ↓
Current Inventory State Updated
      ↓
Realtime Freshness Signal
```

Never make realtime state authoritative.

## Task Completion Transaction

Task completion is a high-risk backend operation.

Conceptually:

``` text
BEGIN TRANSACTION

Validate task
Validate task state
Validate employee authorization
Validate required photo evidence
Calculate completed box quantity
Update inventory movement
Record task completion
Record task event
Evaluate quality outcome
Calculate incentive
Create incentive ledger/event
Create payroll ledger entry if appropriate

COMMIT

THEN publish realtime freshness signals
```

The exact transaction boundary must follow the approved domain design.

## Quality Gate

Logical flow:

``` text
COMPLETE
   ↓
QUALITY GATE
   ↓
PASS / FAIL / ADJUST
   ↓
INCENTIVE
   ↓
PAYROLL
```

Quality data must be captured before an incentive becomes payable when
required by the approved business rule.
