# Royal Packaging CRM - Engineering Instructions

## Project Purpose

Royal Packaging CRM is an enterprise warehouse operations control system.

The primary operational workflow is:

CLIENT / ORDER
→ INVENTORY TRUTH
→ SCAN / TRACE
→ ASSIGN
→ MOVE
→ COMPLETE
→ QUALITY GATE
→ INCENTIVE
→ PAYROLL
→ KPI FEEDBACK

## Technology

- TypeScript
- PostgreSQL
- Kysely
- Zod
- bcryptjs
- jose
- Floot Realtime

## Core Architecture Rule

PostgreSQL is the authoritative source of truth.

Realtime events are freshness signals only.

A lost realtime event must never cause permanent loss of business state.

The client must be able to recover the authoritative state from PostgreSQL after reconnect or refresh.

## Security

Never trust client-supplied:
- user IDs
- employee IDs
- role IDs
- depot IDs
- approval actors
- incentive approvers

All authorization must be performed server-side.

Authentication uses secure HTTP-only session cookies.

Password storage uses bcryptjs.

JWT/session-related cryptographic operations use jose where applicable.

Login rate limiting:
- 5 failed attempts within 15 minutes
- 15-minute lockout

## Warehouse

- 9 depots
- Depot-specific location hierarchy
- Product code + batch number
- Mobile phone camera
- Photo-based layer tracing
- Box is the only operational unit

Each layer photo records:
- task
- layer number
- box quantity
- employee
- timestamp
- photo reference

## Tasks

Tasks support:
- assignment
- multiple employees
- multiple active tasks per employee
- pause
- resume
- reassignment
- cancellation
- reopening
- completion

## Incentives

There must be one canonical IncentiveService.

Employees working together on a task receive equal shares of that task's incentive.

Overtime affects incentives.

Do not create duplicate incentive engines.

## Realtime

Floot Realtime is not authoritative.

At-most-once realtime delivery is acceptable because the UI can recover state from PostgreSQL.

## Reporting

Use the supplied Royal Packaging report specifications.

Do NOT implement MB51 or MB52.

Reports are generated daily.

Excel formatting and column requirements from supplied templates are authoritative.

## Data Retention

Warehouse, payroll and audit records must be retained for the lifetime of the system.

## Coding Rules

- Do not invent business rules.
- Do not silently resolve conflicting requirements.
- If a business rule is unknown, document it as TBD.
- Prefer explicit state machines over implicit status changes.
- Use database transactions for business operations that must remain atomic.
- Keep domain logic out of route handlers.
- Validate external input with Zod.
- Use parameterized/database-safe queries through Kysely.
- Every business-critical mutation must have an audit trail where required.
- Do not modify architecture merely to satisfy a single feature.
- Do not introduce Kafka/RabbitMQ unless a documented requirement justifies it.