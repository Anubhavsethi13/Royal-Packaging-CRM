# Repository Setup, AGENTS.md and Codex Rules

## Recommended Repository

``` text
royal-packaging-crm/
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   ├── db/
│   ├── contracts/
│   ├── config/
│   └── shared/
├── docs/
│   ├── reference/
│   └── architecture/
├── scripts/
├── tests/
├── .env.example
├── AGENTS.md
├── README.md
└── package.json
```

## Reference Documents

Create:

``` text
docs/reference/
```

Place inside it:

-   Royal Packaging CRM source document
-   Royal CRM KPI Redesign source document
-   Incentive calculation Markdown file
-   Supplied Royal Packaging report files/templates
-   Confirmed client answers and requirements

Codex should inspect these files instead of relying on chat history.

## AGENTS.md

Create `AGENTS.md` at the repository root.

Recommended rules:

### Project Purpose

Royal Packaging CRM is an enterprise warehouse operations control
system.

Primary workflow:

``` text
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
```

### Source of Truth

-   PostgreSQL is authoritative.
-   Realtime events are freshness signals only.
-   A lost realtime event must never cause permanent loss of business
    state.
-   Clients must be able to recover authoritative state from PostgreSQL.

### Security

Never trust client-supplied:

-   user IDs
-   employee IDs
-   role IDs
-   depot IDs
-   approval actors
-   incentive approvers

All authorization must be server-side.

Authentication uses secure HTTP-only session cookies.

Password storage uses bcryptjs.

Login rate limiting:

``` text
5 failed attempts within 15 minutes
        ↓
15-minute lockout
```

### Warehouse

-   9 depots
-   Depot-specific location hierarchy
-   Product code + batch
-   Mobile phone camera
-   Photo-based layer tracing
-   Box is the only operational unit

Each layer photo records:

-   task
-   layer number
-   box quantity
-   employee
-   timestamp
-   photo reference

### Tasks

Tasks support:

-   assignment
-   multiple employees
-   multiple active tasks per employee
-   pause
-   resume
-   reassignment
-   cancellation
-   reopening
-   completion

### Incentives

There must be one canonical `IncentiveService`.

Employees working together on a task receive equal shares of that task's
incentive.

Overtime affects incentives.

Do not create duplicate incentive engines.

### Realtime

Floot Realtime is not authoritative.

At-most-once realtime delivery is acceptable because the UI can recover
state from PostgreSQL.

### Reporting

Use supplied Royal Packaging report specifications.

Do **not** implement MB51 or MB52.

Reports are generated daily.

Use supplied templates as authoritative for report columns and
formatting.

### Coding Rules

-   Do not invent business rules.
-   Do not silently resolve conflicting requirements.
-   Unknown rules must be documented as TBD.
-   Prefer explicit state machines.
-   Use database transactions for atomic business operations.
-   Keep domain logic out of route handlers.
-   Validate external input with Zod.
-   Use Kysely for database access.
-   Keep audit history for business-critical mutations where required.
-   Do not introduce Kafka/RabbitMQ unless a documented requirement
    justifies it.
