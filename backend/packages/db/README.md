# Database Foundation

`@royal-packaging/db` provides PostgreSQL/Kysely infrastructure and the
approved FND-04A core identity and organization schema. PostgreSQL remains the
authoritative source of truth.

The current migrations contain only users, sessions, employees, depots,
locations, configurable shifts and their effective-dated assignments, plus
structural RBAC tables. They deliberately do not contain warehouse, inventory,
order, quality, incentive, payroll, KPI, reporting, audit, or realtime tables.

`checkDatabaseHealth()` executes `select 1` against PostgreSQL. Running that
health check requires a reachable PostgreSQL instance and a valid `DATABASE_URL`;
the repository does not provide credentials or a database server. Use
`destroyDatabase()` during application shutdown to release an initialized Kysely
connection pool.

Kysely migrations belong in `migrations/`; development-only seeds belong in
`seeds/`.
