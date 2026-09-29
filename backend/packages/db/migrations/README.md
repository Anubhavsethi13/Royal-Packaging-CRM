# Migrations

Kysely migrations are applied in lexical filename order. FND-04A establishes
only the approved core identity, organization, session, shift, and structural
RBAC tables. Future migrations must be additive, reviewed, and keep PostgreSQL
as the authoritative source of truth.

## Log

- `015_create_shift_entries`: adds `truck_types` (seeded 32FT, CROSSING,
  OTHER), `shift_entries`, `shift_entry_depots` and `shift_entry_truck_types`.
  Additive; reuses `employees` and `depots`; leaves `shifts` untouched.
