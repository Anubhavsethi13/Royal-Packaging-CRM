# e-Time Office → CRM Employee Mapping

## Status

**PROVIDER ROSTER REQUIRED**

No e-Time Office employee list (`Empcode` + name) has been received yet, so no CRM employee can be mapped. No `employee_code` has been changed, and no provider code has been invented.

## Mapping Rules

- Match by exact e-Time Office `Empcode`.
- `Empcode` is treated as text.
- Leading zeros must be preserved (`0001` ≠ `1`).
- Employee name is for verification only, not identity matching.
- Do not automatically map based on name similarity.
- Do not change CRM `employee_code` until identity is confirmed.

How the sync applies these rules (`Docs/integration/etimeoffice-attendance-integration.md` §8):
- **Match:** provider `Empcode` = `employees.employee_code`, an exact, case-sensitive text comparison.
- **Unknown codes:** a punch with an unknown `Empcode` is still stored (unlinked) and listed as `EMPLOYEE_NOT_FOUND` in `GET /attendance/sync/exceptions`.

## Current CRM employee records

### Production (Render/Neon)

Read through the production API on 2026-10-04 and 2026-10-05. The production database was not queried directly.

| CRM Employee ID | Employee Name | Current employee_code | User/Login | Role | Active | Notes |
|---|---|---|---|---|---|---|
| not recorded | System Administrator | `EMP-E6BF06E4` | linked login (identifier not shown) | SUPER_ADMIN + ADMIN (seed definition) | yes | Seeded admin account. Not expected to punch |
| not recorded | Super Administrator | `EMP-9C8DBE69` | linked login (identifier not shown) | SUPER_ADMIN (seed definition) | yes | Seeded admin account. Not expected to punch |
| not recorded | Warehouse Supervisor | `EMP-D4E688D0` | linked login (identifier not shown) | SUPERVISOR (seed definition) | yes | Seeded placeholder account. Whether it represents a real person is unknown |
| `6392398f-5ae1-469c-b74f-141f75f3a88f` | Production Smoke Test Employee | `TEST-EMP-01` | none | — | yes | Smoke-test record kept under the retention rule. **Must not be mapped** |

- **Totals:** 4 employees in production.
- **Roles:** shown as defined by the seed script; production role assignments are not exposed by any API.
- **Logins:** identifiers aren't shown, because the production API doesn't return them.

### Local development database (`royal_packaging_crm`)

Queried read-only on 2026-10-06.

| CRM Employee ID | Employee Name | Current employee_code | User/Login | Role | Active | Notes |
|---|---|---|---|---|---|---|
| `6312ac66-b1dc-465d-a9d2-0089ab47e012` | System Administrator | `EMP-A34835EE` | admin@royalpackaging.com | ADMIN, SUPER_ADMIN | yes | Development seed account |
| `02bebcf8-3f36-4e3c-bc51-fd309eb69b1f` | Super Administrator | `EMP-25651125` | superadmin@royalpackaging.com | SUPER_ADMIN | yes | Development seed account |
| `d6c24e44-fdd4-4754-bb4b-33a71c4bff2b` | Warehouse Supervisor | `EMP-063075DF` | supervisor@royalpackaging.com | SUPERVISOR | yes | Development seed account |

### Assessment

- **No match:** no current CRM employee has a code in the e-Time Office style (the PDF's examples are `0001`, `0005`, `0010`). Every current code is either generated (`EMP-` + 8 hex characters) or the smoke-test code.
- **No candidates:** no record can be identified as corresponding to an e-Time Office employee from CRM data alone. The CRM currently holds no warehouse staff, only administrative and seed accounts plus one test employee.
- **Likely approach:** most e-Time Office employees will need **new** CRM employee records, created with `POST /employees` using the exact `Empcode` as `employee_code`. Re-coding an existing record applies only if the provider roster confirms that person (e.g. the Warehouse Supervisor) is a punching employee.

## Mapping Table

| e-Time Office Empcode | e-Time Office Name | CRM Employee ID | CRM Name | Current CRM employee_code | Proposed CRM employee_code | Match Status | Verification Notes |
|---|---|---|---|---|---|---|---|
| PENDING PROVIDER ROSTER | PENDING PROVIDER ROSTER | not recorded | System Administrator | `EMP-E6BF06E4` | none (keep) | NOT EXPECTED TO MATCH | Admin account; confirm it does not punch |
| PENDING PROVIDER ROSTER | PENDING PROVIDER ROSTER | not recorded | Super Administrator | `EMP-9C8DBE69` | none (keep) | NOT EXPECTED TO MATCH | Admin account; confirm it does not punch |
| PENDING PROVIDER ROSTER | PENDING PROVIDER ROSTER | not recorded | Warehouse Supervisor | `EMP-D4E688D0` | PENDING IDENTITY CONFIRMATION | UNCONFIRMED | Re-code only if the roster confirms this is a real punching employee |
| — | — | `6392398f-5ae1-469c-b74f-141f75f3a88f` | Production Smoke Test Employee | `TEST-EMP-01` | none (keep) | EXCLUDED | Smoke-test record; never map |
| PENDING PROVIDER ROSTER | PENDING PROVIDER ROSTER | (new record) | PENDING PROVIDER ROSTER | — | = provider Empcode, exactly | NEW EMPLOYEE REQUIRED | One row per roster employee with no CRM record |

## Required Provider Data

We need at minimum:
- `Empcode`
- Employee Name

Optional useful fields:
- Department
- Designation
- Active/Inactive

## Alignment Rule

- **Before the first real sync:** every employee expected to receive attendance data must have an exact CRM `employee_code` matching the provider `Empcode`.
- **Not before identity is confirmed:** do not change codes until the provider roster and identity confirmation are available.

### Safe procedure once the roster arrives

1. **Fill in the table above.** Confirm each identity with someone who knows the staff; never by name similarity alone.
2. **Create new employees** with `POST /employees`, `employee_code` = `Empcode` exactly (text, zeros kept). The existing unique index rejects duplicates.
3. **Re-code an existing employee only after confirmation.** The update API cannot change codes, so this needs one reviewed SQL transaction that:
   - checks each row's current code;
   - checks the new code is unused;
   - writes the code exactly.

   It is a data change, not a migration. Nothing else needs to change: every other table links to employees by ID, not by code.
4. **Leave `TEST-EMP-01` untouched.**
5. **Do this before the first live sync.** Punches synced before alignment stay unlinked, with no automatic re-link.
