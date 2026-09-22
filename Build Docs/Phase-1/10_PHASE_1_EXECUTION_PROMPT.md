# Execute Phase 1

You are now authorized to implement Phase 1 of the Royal Packaging CRM.

Read these files first:

1. `00_MASTER_PROMPT.md`
2. `01_PHASE_1_SCOPE.md`
3. `02_TECH_STACK.md`
4. `03_DATABASE_PROMPT.md`
5. `04_DESIGN_SYSTEM_PROMPT.md`
6. `05_ROUTING_APP_SHELL.md`
7. `06_COMPONENT_LIBRARY.md`
8. `07_ENVIRONMENT_AND_SECURITY_FOUNDATION.md`
9. `08_API_FOUNDATION.md`
10. `09_VERIFICATION.md`

## Execution strategy

Work autonomously.

### Step 1 — Inspect

Inspect the repository before modifying anything.

Identify:

- existing application structure
- package manager
- current dependencies
- existing source files
- existing configuration
- whether PostgreSQL/Prisma already exists

Do not destroy useful existing work without understanding it.

### Step 2 — Plan

Create a concise internal implementation plan.

Resolve architecture before making large edits.

### Step 3 — Implement foundation

Implement the complete Phase 1 foundation.

### Step 4 — Database

Set up Prisma and PostgreSQL integration.

Create migrations.

Do not seed fake production data unless explicitly isolated as development seed data.

### Step 5 — UI

Implement the design system and application shell.

Make the foundation visually polished enough that later phases can build directly on it.

### Step 6 — Routes

Implement all documented route shells.

### Step 7 — API architecture

Create clean API/service boundaries for later modules.

### Step 8 — Verify

Run typecheck, lint, build and available runtime checks.

Fix problems rather than reporting them as completed.

## Critical constraints

Do not:

- rewrite the requirements
- rename domain concepts unnecessarily
- invent business rules
- implement fake authentication
- implement fake RBAC
- implement fake warehouse transactions
- implement fake incentive calculations
- implement fake payroll approval
- hardcode secrets
- connect the browser directly to PostgreSQL
- create a monolithic backend file
- create a monolithic React component

## Completion condition

Phase 1 is complete only when the foundation builds successfully and the documented route shells work.

Then produce the verification report described in `09_VERIFICATION.md`.
