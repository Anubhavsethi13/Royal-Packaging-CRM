# Task State Machine

## Purpose and dependencies

Defines confirmed lifecycle behaviour and marks unapproved transition rules. Depends on [03](03-domain-model.md); informs [04](04-database-schema.md), [06](06-transaction-boundaries.md), [07](07-incentive-engine.md), and [12](12-api-contracts.md).

## CONFIRMED

```text
CREATED --assign--> ASSIGNED --start--> IN_PROGRESS --complete--> COMPLETED
                                    ^          |
                                    |          +--pause--> PAUSED
                                    +-------------resume---+
```

- Supported controlled operations are assign, start, pause, resume, reassign, cancel, reopen, and complete.
- Generic status updates are prohibited; transition checks and authorization are server-side.
- Assignment supports multiple employees and preserves history; an employee may have multiple active tasks.
- Completion participates in the quality -> incentive -> payroll flow and must be duplicate-safe.

## RECOMMENDATIONS

- Persist a task event for every authorised transition, with actor/time and bounded context.
- Treat reassignment as an assignment-history operation plus an event unless approved requirements define `REASSIGNED` as a persistent state.
- Keep quality as a separate lifecycle until its effect on task state is approved.

## TBD / approval decisions

- Valid source states/authorities for cancel, reassign, reopen, and complete; state returned by reopen.
- Whether start requires at least one current assignment; pause-before-start behaviour.
- Whether CANCELLED, REOPENED, and REASSIGNED are states, event types, or both.
- Quality-fail/adjust consequences, including whether completion is reversed or task reopens.

## Risks

- Ambiguous transitions permit inconsistent inventory and payroll side effects.
- Treating named operations as arbitrary CRUD status updates defeats audit and duplicate protection.

## Approval gate before coding

Approve the complete transition matrix, actor permissions, and quality interaction before implementing state persistence or handlers.

## Final client-resolution addendum

The canonical operational sequence is now: `SCAN -> Validate Inventory -> ASSIGN -> Select Task -> Enter Quantity -> Route -> START -> IN TRANSIT -> Physical Work -> COMPLETE -> Quality -> SLA -> Incentive -> Inventory Movement -> Audit -> Payroll -> Approval`.

The supplied status model is `PENDING -> ASSIGNED -> IN_PROGRESS -> PAUSED -> RESUMED / IN_PROGRESS -> COMPLETED`, with `ASSIGNED / IN_PROGRESS -> CANCELLED` and `COMPLETED -> REOPENED -> IN_PROGRESS`. This is an operational model, but pause/resume, cancellation, reopening, and their final API/permission policy remain **CLIENT DECISION REQUIRED**; do not silently freeze an enum beyond these confirmed names/intents.

- **START (CONFIRMED):** changes the task to `IN_PROGRESS`, puts related inventory into `IN_TRANSIT`, and starts the active-work timer.
- **PAUSE (CONFIRMED):** pauses active-work timing while preserving wall-clock timestamps.
- **RESUME (CONFIRMED):** continues active-work timing.
- **REASSIGN (CONFIRMED):** changes the responsible employee and creates audit history; participant/incentive effects remain **CLIENT DECISION REQUIRED**.
- **CANCEL (CONFIRMED intent):** stops the task; in-transit/reservation disposition remains **CLIENT DECISION REQUIRED**.
- **COMPLETE (CONFIRMED intent):** records the operational result and begins downstream processing.
- **REOPEN (CONFIRMED intent):** an authorized management operation with audit history; exact authority is **CLIENT DECISION REQUIRED**.
