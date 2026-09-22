# Phase 1 Verification Prompt

Before declaring Phase 1 complete, verify the foundation.

## Static verification

Run:

- TypeScript type checking
- linting
- formatting checks if configured
- production build

Fix errors caused by the implementation.

## Frontend verification

Verify:

- `/`
- `/warehouse`
- `/operations`
- `/employees`
- `/access-control`
- `/login`
- `/register`

Verify:

- navigation works
- no broken links
- theme switches correctly if implemented
- responsive shell does not overflow
- keyboard navigation is usable
- loading/empty/error states render correctly

## Database verification

Verify:

- PostgreSQL connection works
- Prisma client generates
- migrations apply
- schema is internally consistent
- foreign keys are valid
- unique identifiers specified by the document are represented appropriately

## Architecture verification

Confirm:

- UI does not access PostgreSQL
- services are separated from HTTP route handling
- configuration is centralized
- environment secrets are not committed
- reusable components are not duplicated unnecessarily
- TypeScript is strict
- no unexplained `any` types

## Do not fake success

If PostgreSQL is unavailable because the developer has not configured it, document the exact missing setup instead of pretending the database test passed.

## Completion report

Produce a short report containing:

- PASS/FAIL per category
- commands executed
- remaining issues
- what Phase 2 can start from
