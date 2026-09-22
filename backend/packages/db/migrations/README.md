# Migrations

Kysely migrations are applied in lexical filename order. FND-04A establishes
only the approved core identity, organization, session, shift, and structural
RBAC tables. Future migrations must be additive, reviewed, and keep PostgreSQL
as the authoritative source of truth.
