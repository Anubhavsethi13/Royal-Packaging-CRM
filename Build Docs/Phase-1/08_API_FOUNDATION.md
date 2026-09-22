# Phase 1 API Foundation Prompt

Prepare the API architecture without implementing later business workflows.

## Structure

Use a structure similar to:

```text
backend/src/
  app.ts
  server.ts
  config/
  db/
  middleware/
  modules/
  realtime/
  utils/
```

Each future module should have room for:

```text
controller/route
schema
service
repository
types
```

Do not put all endpoints into one large server file.

## Validation

Use Zod for request/response contracts.

The later API should preserve the documented pattern:

```text
request
↓
parse/validate
↓
authentication
↓
authorization
↓
service
↓
database transaction
↓
response
```

## Error model

Establish consistent API errors.

The specification identifies these categories:

- 400 validation/business error
- 401 authentication failure
- 403 authorization failure
- 404 resource not found
- 409 conflicting state
- 429 rate limited
- 500 unexpected server failure

Phase 1 only needs the infrastructure for consistent errors.

## Future endpoint organization

Reserve module boundaries for:

- auth
- dashboard
- warehouse
- clients/orders
- employees
- access control
- incentives
- payroll
- realtime

Do not build fake endpoints just to fill the folders.
