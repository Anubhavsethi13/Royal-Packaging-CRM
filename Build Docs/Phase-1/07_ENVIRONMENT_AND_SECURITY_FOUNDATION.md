# Phase 1 Environment and Security Foundation

Establish secure configuration boundaries.

## Environment variables

Create `.env.example`.

Prepare for:

```text
DATABASE_URL=
NODE_ENV=
PORT=
```

Never commit `.env`.

## Environment validation

Create a typed configuration module.

The application should fail with a clear developer-facing configuration error if required variables are missing.

Do not expose server-only secrets to the browser.

## Database security

Use Prisma through a server-side database module.

The frontend must never connect directly to PostgreSQL.

## API boundary

Prepare middleware structure for future:

- authentication
- authorization
- validation
- error handling

Do not implement Phase 2 authentication behavior yet.

## General rules

Never trust client-provided authorization information.

Never put secrets in source code.

Never log passwords, tokens or connection strings.

Keep business logic in services rather than UI code.

## Future security compatibility

The foundation must allow the later implementation to enforce the specification's rule:

**Frontend hiding a button is not authorization.**

All sensitive operations will eventually be independently enforced server-side.
