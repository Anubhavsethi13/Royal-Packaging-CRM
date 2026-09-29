# Daily Shift Entries API (KPI Daily Shift Tracking, Phase 1)

Backend foundation for `Docs/requirements/KPI_DAILY_SHIFT_TRACKING.md`. Phase 1 covers creating and reading shift entries only. KPI aggregation, updates (`PATCH`) and the frontend are later phases.

All routes are served with or without the `/api` prefix, require an authenticated session (cookie or `Authorization: Bearer`), and use the standard envelopes: `{ success: true, data, meta? }` for success, and the canonical flattened error envelope (`success`, `code`, `message`, `errors[]`, `requestId`, plus the legacy nested `error`) for failures. Success bodies carry snake_case keys with an additive camelCase mirror (`work_date` and `workDate`).

## Authorization

| Endpoint | Policy action | Who |
|---|---|---|
| `POST /shift-entries` | `shift:create` | Every approved role (SUPER_ADMIN, MAIN_ADMIN, ADMIN, MANAGER/SUPERVISOR, EMPLOYEE), and the user must have an active `employees` row |
| `GET /shift-entries/me` | `shift:read_own` | Same as above |
| `GET /shift-entries/:id` | `shift:read` | Management tier (SUPER_ADMIN, MAIN_ADMIN, ADMIN, MANAGER/SUPERVISOR): any entry. EMPLOYEE: only their own entry |

Enforcement lives in `DatabaseRBACAuthorizationPolicy` (`auth-middleware.ts`), evaluated server-side from the database. The permission codes are also seeded in `scripts/seed-admin.ts` (`shift:create`, `shift:read_own`, `shift:read`) for consistency with the `access_permissions` tables.

The employee is **never** taken from the request. It is resolved from `employees.user_id = <session user>` (active employees only). A body containing `employee_id` (or any unknown key) is rejected with 400.

A non-owner employee requesting someone else's entry, or an id that does not exist, receives the same `403 FORBIDDEN`, so entry ids cannot be probed. Management users get `404 SHIFT_ENTRY_NOT_FOUND` for an id that does not exist.

## `POST /shift-entries`

Creates the authenticated employee's entry. Returns `201`.

Request body (all keys snake_case):

| Field | Type | Rules |
|---|---|---|
| `work_date` | string | Required. Real calendar date, `YYYY-MM-DD` |
| `shift_start` | string | Required. `HH:MM` or `HH:MM:SS`, 00:00–23:59:59. Stored and returned as `HH:MM:SS` |
| `shift_end` | string | Required. Same format. Must be **later** than `shift_start` (overnight shifts are not supported in V1; the value is never adjusted) |
| `labour_count` | integer | Required, `>= 0` |
| `unloading_total` | integer | Required, `>= 0`, unit BOX |
| `loading_total` | integer | Required, `>= 0`, unit BOX |
| `warehouses` | array | Required, at least one. Each item: `{ "warehouse_code": "DEP-01", "warehouse_name"?: "Main Depot" }`. `warehouse_code` matches an existing **active** `depots.code` (case-insensitive). If `warehouse_name` is supplied it must match that depot's name. Duplicate codes are rejected. No depot is ever created or renamed |
| `truck_types` | string[] | Optional (default `[]`). Codes of active `truck_types` (seeded: `32FT`, `CROSSING`, `OTHER`), case-insensitive. Duplicates rejected |

Example:

```json
{
  "work_date": "2026-09-28",
  "shift_start": "08:00",
  "shift_end": "16:30",
  "labour_count": 6,
  "unloading_total": 120,
  "loading_total": 340,
  "warehouses": [{ "warehouse_code": "DEP-01" }],
  "truck_types": ["32FT", "CROSSING"]
}
```

Response `data`:

```json
{
  "id": "uuid",
  "employee_id": "uuid",
  "work_date": "2026-09-28",
  "shift_start": "08:00:00",
  "shift_end": "16:30:00",
  "labour_count": 6,
  "unloading_total": 120,
  "loading_total": 340,
  "warehouses": [{ "id": "uuid", "code": "DEP-01", "name": "Main Depot" }],
  "truck_types": [{ "id": "uuid", "code": "32FT", "name": "32ft" }],
  "created_by_user_id": "uuid",
  "updated_by_user_id": null,
  "created_at": "2026-09-28T16:45:00.000Z",
  "updated_at": "2026-09-28T16:45:00.000Z",
  "version": "1"
}
```

Duplicate rule: one entry per employee per `work_date` (unique constraint). A second submission returns `409 SHIFT_ENTRY_DUPLICATE`. This is a provisional decision; see "Open decisions".

## `GET /shift-entries/options`

Selectable references for the entry form. Policy action `shift:create`. Returns `{ success, data: { warehouses: [{ id, code, name }], truck_types: [{ id, code, name }] } }`, containing only active depots and truck types, ordered by code. The form submits the returned `code` values.

## `GET /shift-entries/me`

The caller's entries, newest `work_date` first (ties by creation time). Returns `200` with `{ success, data: [...], meta }` where `meta` is the standard page meta.

Query parameters: `page` (default 1), `pageSize` (default 25, max 200), optional `from` and `to` (`YYYY-MM-DD`, inclusive on `work_date`; `to` must not be earlier than `from`). Pagination is done in SQL (`LIMIT/OFFSET` plus a count).

## `GET /shift-entries/:id`

Returns `200` with the entry (same shape as create). `:id` must be a UUID (else `400 BAD_REQUEST`).

## Errors

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Missing/invalid fields, negative or non-integer counts, bad date/time, end not after start, empty `warehouses`, duplicates, unknown keys (including `employee_id`), bad pagination or filter values. `errors[]` holds `{ field, code, message }` per issue |
| 400 | `INVALID_WAREHOUSE` | Unknown or inactive warehouse code, or `warehouse_name` mismatch. `errors[].field` is e.g. `warehouses.0.warehouse_code` |
| 400 | `INVALID_TRUCK_TYPE` | Unknown or inactive truck type. `errors[].field` is e.g. `truck_types.1` |
| 400 | `INVALID_JSON` | Malformed request body (previously any malformed JSON surfaced as 500; fixed globally in `parseJsonBody`) |
| 401 | `UNAUTHORIZED` | No/invalid/expired session |
| 403 | `FORBIDDEN` | Role not permitted, or an employee reading another employee's entry |
| 403 | `EMPLOYEE_PROFILE_REQUIRED` | Authenticated user has no active employee profile |
| 404 | `SHIFT_ENTRY_NOT_FOUND` | Management user requests a non-existent entry |
| 409 | `SHIFT_ENTRY_DUPLICATE` | Entry already exists for this employee and `work_date` |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 1 MB |

## Database (migration `015_create_shift_entries`)

Additive and reversible (`down` drops the four tables).

- `truck_types` (new, since no truck model existed): `id`, `code` (unique), `name`, `active`, timestamps, `version`. Seeded with `32FT`, `CROSSING`, `OTHER`.
- `shift_entries`: `id`, `employee_id` -> `employees`, `work_date date`, `shift_start time`, `shift_end time`, `labour_count`, `unloading_total`, `loading_total` (all `integer`, `CHECK >= 0`), `created_by_user_id`, `updated_by_user_id`, timestamps, `version`. `CHECK shift_end > shift_start`. `UNIQUE (employee_id, work_date)`. Named `shift_entries` on purpose: the existing `shifts` table (migration 003) holds shift *templates* and is unchanged.
- `shift_entry_depots`: `(shift_entry_id, depot_id)` -> existing `depots` (the warehouse master). No name/code copies.
- `shift_entry_truck_types`: `(shift_entry_id, truck_type_id)` -> `truck_types`.

Rollback: `npm run db:migrate` has no down command wired; run the migration's `down` via the Kysely migrator (`migrateDown`) if required. Take a database backup before applying to a shared database.

## Audit

The existing audit system (`AuditService`) unions `task_events` and `incentive_events`, both keyed by a required `task_id`, so shift entries cannot be recorded there without changing it. Phase 1 therefore preserves actor, timestamp, record and operation through `created_by_user_id`, `updated_by_user_id`, `created_at`, `updated_at` and `version` on the row itself, and creates no second audit architecture. A change-history table becomes relevant only once updates exist.

## Open decisions (provisional choices made in Phase 1)

1. One entry per employee per day (409 on repeat). Multiple shifts per day would need this constraint removed.
2. Overnight shifts rejected (`shift_end` must be after `shift_start`).
3. `work_date` has no past/future bound.
4. Management-tier reads are unscoped (all employees, all depots); supervisor team/depot scoping is undefined in the current architecture.
5. Truck types are a plain set (no per-type counts); `OTHER` has no free-text note.
6. Edit (`PATCH`) is not implemented pending the edit-rights decision.
