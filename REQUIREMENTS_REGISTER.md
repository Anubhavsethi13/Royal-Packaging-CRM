# Requirements Register

The architecture questionnaire contains discovery questions whose answers are not present in the repository. They remain `UNANSWERED` until Royal Packaging confirms them. Phase 1 avoids encoding those policies into behavior.

## Status vocabulary

- `CONFIRMED`: explicitly stated in the repository specification.
- `ASSUMPTION`: a temporary configurable development choice needed to keep the foundation runnable.
- `UNANSWERED`: requires a business or operational decision.

## Confirmed in Phase 1

- `CONFIRMED` The product needs a React/TypeScript frontend, a TypeScript backend, PostgreSQL, Prisma, Zod, React Router, TanStack React Query, and reusable components.
- `CONFIRMED` The central relationship is physical work to digital task to employee attribution to measured performance to incentive to payroll.
- `CONFIRMED` The initial domain entities and enum vocabularies are defined in `Build Docs/Phase-1/03_DATABASE_PROMPT.md`.
- `CONFIRMED` Authentication and authorization enforcement are later-phase behavior; Phase 1 only establishes extension points.

## Temporary assumptions

- `ASSUMPTION` Development uses `http://localhost:5173` for the frontend and port `4000` for the API unless environment configuration overrides them.
- `ASSUMPTION` Fields whose allowed values are not specified by the source remain strings or optional values in the foundation schema instead of receiving invented enums.
- `ASSUMPTION` Identifying code fields such as employee codes, barcodes, account codes, order codes, and asset codes are unique because their names indicate identifier semantics.
- `ASSUMPTION` Phase 1 uses clearly labeled in-memory demo content only for rendering route shells; it is not a production data source.

## Unanswered decisions carried forward

- `UNANSWERED` ACID boundaries, concurrent inventory behavior, conflict resolution, durable business events, replay, missed-event detection, and realtime delivery guarantees.
- `UNANSWERED` KPI timestamps, ownership, targets, calculation cadence, and historical rule versioning.
- `UNANSWERED` Canonical incentive payout formulas, quality failures, supervisor overrides, rule ownership, and payout versioning.
- `UNANSWERED` Operational exception handling for stuck tasks, missing inventory, wrong barcodes, damage, and payroll disputes.
- `UNANSWERED` Payroll and accounting integrations, ERP connectivity, scanner/device hardware, and measurement hardware.
- `UNANSWERED` Inventory/order relationships, reservations, partial fulfillment, cancellation behavior, and valid state transitions.
- `UNANSWERED` Task cancellation, reassignment, pausing, resuming, reopening, multi-worker attribution, and active-task limits.
- `UNANSWERED` Depot count, warehouse hierarchy, location standardization, blocked locations, and restricted handling areas.
- `UNANSWERED` Units of measure, authoritative measurement when values disagree, and pallet/skid/crate representation.
- `UNANSWERED` SLA calendars, holidays, shift crossover, waiting time, productive time, and hold reasons.
- `UNANSWERED` Data correction authority, original-value retention, immutable audit requirements, audit visibility, export rights, and retention periods.
- `UNANSWERED` PostgreSQL hosting, backups, RPO, RTO, high availability, and environment topology.
- `UNANSWERED` Offline operation behavior, local queues, degraded-mode UX, and reconnect validation.
- `UNANSWERED` Reporting formats, recipients, schedules, and whether a separate reporting read model is required.

Phase 2 should resolve these decisions before adding stateful domain workflows or irreversible business logic.
