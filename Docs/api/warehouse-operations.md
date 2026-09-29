# Warehouse Operations and Locations API

Read-only projections over existing tables, used by the Warehouse operations and Locations pages in API mode. No new tables or migrations: tasks, assignments and events come from `TaskService`'s tables, warehouses are `depots`, locations are `locations`, and BOX on hand is `inventory_balances`. Task lifecycle writes stay on the existing `/tasks/*` routes.

All routes require an authenticated session, accept the optional `/api` prefix, and use the standard envelopes (`{ success, data, meta }` and the canonical error envelope). Success bodies carry snake_case keys with the additive camelCase mirror.

## Authorization and scope

| Endpoint | Policy action | Who |
|---|---|---|
| `GET /warehouse/operations`, `GET /warehouse/operations/:id` | `warehouse:read_operations` | Every approved role |
| (scope) | `warehouse:read_all_operations` | Management tier (SUPER_ADMIN, MAIN_ADMIN, ADMIN, MANAGER/SUPERVISOR) sees every task. Any other approved role sees only tasks **actively assigned to their own employee profile**; without an employee profile the list is empty |
| `GET /locations` | `location:read` | Every approved role (warehouse master data) |

Scope is decided server-side by the policy; filters cannot widen it (an employee filtering by another employee gets an empty result). There is no team or depot scoping model, so management sees all depots, consistent with the rest of the policy. For scoped callers a task outside their scope and a missing task both return `403`; management gets `404` for a missing task.

The seed script adds these codes (`warehouse:read_operations`, `warehouse:read_all_operations`, `location:read`) so live sessions carry them; the policy itself is role-based and does not depend on the re-seed.

## `GET /warehouse/operations`

Query: `page`, `pageSize` (default 25, max 200), `status` (`PENDING|ASSIGNED|IN_PROGRESS|PAUSED|COMPLETED|CANCELLED`), `operation_type` (one of `LOADING|UNLOADING|PUTAWAY|PICKING|PACKING|OTHER`, or a comma-separated list such as `LOADING,UNLOADING`; case-insensitive, duplicates collapse), `warehouse_code` (case-insensitive; an unknown code is `400 INVALID_WAREHOUSE`), `employee_id` (UUID, active assignee; an unknown employee is `400 INVALID_EMPLOYEE`, and a scoped caller naming anyone but themselves is `403`), `search` (task code, task type, depot, source/destination location code, item name/code, order code, assignee name/code; `%` and `_` are literal). Ordered newest first. Paginated in SQL.

Item:

```json
{
  "id": "uuid",
  "task_code": "TSK-3F2A9C1E",
  "task_type": "LOADING",
  "operation_type": "LOADING",
  "status": "COMPLETED",
  "warehouse": { "id": "uuid", "code": "DEP-01", "name": "Main Depot" },
  "source_location": { "id": "uuid", "code": "A-01", "name": "Receiving bay" },
  "destination_location": { "id": "uuid", "code": "A-02", "name": "Dispatch hold" },
  "inventory_item": { "id": "uuid", "product_code": "CB-500", "name": "Corrugated box 500" },
  "order": null,
  "assignees": [{ "employee_id": "uuid", "employee_code": "EMP-001", "name": "Asha Rao" }],
  "planned_box_quantity": 100,
  "completed_box_quantity": 90,
  "started_at": "…", "paused_at": null, "completed_at": "…", "created_at": "…", "updated_at": "…",
  "timing_events": [{ "id": "uuid", "event_type": "TASK_STARTED", "event_at": "…" }],
  "sla": { "target_seconds": null, "status": "NOT_DEFINED" }
}
```

- `task_code` is derived from the id for display (tasks have no code column). Links use `id`.
- `operation_type` classifies the free-text `task_type` (case-insensitive). **Provisional mapping, pending a business decision:** LOADING ← `LOADING, LOAD, DISPATCH`; UNLOADING ← `UNLOADING, UNLOAD, RECEIVING, RECEIVE`; PUTAWAY ← `PUTAWAY, STORAGE`; PICKING ← `PICKING, PICK`; PACKING ← `PACKING, PACK, WRAPPING, WRAP`. Everything else (including `UNPACKING`, `MOVE`, and NULL) is `OTHER`; nothing is guessed. Defined once in `packages/contracts/src/warehouse-operations`.
- Quantities are BOX only. `timing_events` are the start/pause/resume/complete/cancel events used for timing.
- SLA targets do not exist in the schema, so `sla` is always `NOT_DEFINED`.

## `GET /warehouse/operations/:id`

Same shape plus `activity`: every task event in order, `{ id, event_type, event_at, actor }`, where `actor` is the acting user's employee name, else their login identifier, else `null`. `400` for a non-UUID id.

## `GET /locations`

Query: `page`, `pageSize`, `warehouse_code`, `active` (`true|false`), `search` (location code/name, depot code/name). Ordered by depot code, then location code.

```json
{ "id": "uuid", "code": "A-01", "name": "Receiving bay", "active": true,
  "warehouse": { "id": "uuid", "code": "DEP-01", "name": "Main Depot", "active": true },
  "parent": { "id": "uuid", "code": "A", "name": "Zone A" },
  "box_on_hand": 120 }
```

`box_on_hand` is `SUM(inventory_balances.box_quantity)` at the location. Occupancy percentages and blocked/restricted flags are not modelled and are not returned.

## Errors

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Bad status, operation type, UUID, `active`, pagination, or over-long search |
| 400 | `BAD_REQUEST` | Non-UUID task id |
| 400 | `INVALID_WAREHOUSE` / `INVALID_EMPLOYEE` | Unknown `warehouse_code` (operations and locations) / unknown `employee_id` |
| 401 | `UNAUTHORIZED` | No/invalid session |
| 403 | `FORBIDDEN` | No approved role, a scoped caller asking for a task outside their scope, or a scoped caller filtering by another employee |
| 404 | `NOT_FOUND` | Management caller, task does not exist |

## Frontend

- `frontend/src/pages/warehouse-api.ts` validates every response with zod (a mismatch raises `ContractValidationError`, shown as an error state, never patched) and maps the projection onto the existing `TaskRecord` so the page's projection logic is unchanged.
- Backend status → lifecycle: ASSIGNED→ASSIGNED, IN_PROGRESS→STARTED (RESUMED when the latest start/resume event is a resume), PAUSED→PAUSED, COMPLETED→COMPLETED, CANCELLED→CANCELLED. PENDING has no lifecycle equivalent and is shown as `UNASSIGNED`.
- The directory loads up to 10 pages of 200 (2,000 tasks) and shows a warning when truncated, because the page's filters and totals run over the loaded list.
- `operationalSurfaceState(mode, surface)` connects `warehouse`, `locations`, and `loading-unloading` in API mode. The operations command view (and the KPI pages) still show the API boundary message.

## Loading & unloading

The Loading & unloading page reads `GET /warehouse/operations?operation_type=LOADING,UNLOADING` and `GET /warehouse/operations/:id`: the same projection, not a second workflow. With no SLA targets in the schema the page shows SLA as `NOT_APPLICABLE` (never MET or BREACHED). The page is read-only in API mode; every write stays on the existing lifecycle routes (`POST /tasks/:id/start|pause|resume|complete|cancel|reopen`), which already reject:

| Case | Response |
|---|---|
| Unknown task | `404 TASK_NOT_FOUND` |
| Invalid transition (e.g. start a completed task, complete or pause an unstarted one) | `409 INVALID_TASK_STATE` |
| Negative, fractional, or non-numeric `completed_box_quantity` | `400 VALIDATION_FAILED` |
| Employee acting on a task not assigned to them | `403 FORBIDDEN` |

Whether a **zero** completed quantity is allowed is marked CLIENT DECISION REQUIRED in `backend/docs/architecture/17-approved-business-rules.md`, so it is not rejected. `POST /tasks` with a non-existent `depot_id` currently fails with a database foreign-key error (HTTP 500) instead of a validation error; see the open items in the diagnostic.
