# KPI Configuration API (read-only)

Backs the KPI configuration page in API mode. It reads the existing `kpi_definitions` and `kpi_targets` tables (migration 010) through `KpiService`; no new tables, no second KPI system, no scores, rankings, incentives or payroll.

## What the backend stores vs. the preview model

| Concept | Backend (`kpi_definitions`, `kpi_targets`) | API mode |
|---|---|---|
| Definition code, name, description | yes | shown |
| Pillar (category), unit, formula reference | yes (free text) | shown as stored |
| Enabled flag and effective range | yes | shown, plus derived status |
| Targets, warning and critical thresholds, effective period, per-warehouse scope | yes | shown as target history |
| Metric code, operation, applicable roles, data scope, direction, measurement period | no | not shown (not invented) |
| Rules, rule versions, governance lifecycle (draft/archive) | no | not shown |
| Create / edit / activate / archive | no write API | not available |

The preview (mock) configuration store and its governance workflow are unchanged in mock mode.

## Endpoints

Both need an authenticated session, accept the optional `/api` prefix, and use the standard envelopes.

| Endpoint | Policy action | Who |
|---|---|---|
| `GET /kpi/definitions` | `kpi:read_config` | Management tier: SUPER_ADMIN, MAIN_ADMIN, ADMIN, MANAGER/SUPERVISOR |
| `GET /kpi/definitions/:id` | `kpi:read_config` | same |

Employees and users without an approved role get `403`; anonymous requests `401`. Client-sent role or permission headers are ignored. There is no team or depot scope model, so management sees every warehouse's targets. `kpi:read_config` is also added to the seed for management roles (the policy is role-based and does not depend on the re-seed).

### `GET /kpi/definitions`

Query: `page`, `pageSize`, `search` (code or name, case-insensitive, max 100 chars), `pillar` (case-insensitive), `status` (`ACTIVE|SCHEDULED|EXPIRED|INACTIVE`). Ordered by code.

```json
{
  "id": "uuid", "code": "BOXES_HANDLED", "name": "Boxes handled", "pillar": "PRODUCTIVITY",
  "description": "Completed BOX per shift", "unit": "BOX", "formula_reference": "SUM(completed_box_quantity)",
  "active": true, "effective_from": "2026-09-01T00:00:00.000Z", "effective_to": null,
  "status": "ACTIVE",
  "current_targets": [
    { "id": "uuid", "target_value": "500", "warning_threshold": "450", "critical_threshold": "400",
      "effective_from": "…", "effective_to": null, "warehouse": null, "is_current": true }
  ],
  "target_count": 2, "created_at": "…", "updated_at": "…", "version": "1"
}
```

- `status` is derived at request time: `INACTIVE` if `active` is false; else `SCHEDULED` before `effective_from`, `EXPIRED` after `effective_to`, otherwise `ACTIVE`. Bounds are inclusive; a missing bound never limits.
- `current_targets` are the targets in force now (`effective_from <= now <= effective_to`, open end allowed). `warehouse: null` means the target applies to every warehouse.
- Numeric values are strings to keep the database's exact decimals.

### `GET /kpi/definitions/:id`

Same shape plus `targets`: every target row, newest `effective_from` first, each with `is_current`. `400` for a non-UUID id, `404` if the definition does not exist.

## Errors

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Bad `status`, over-long `search`, empty `pillar`, bad pagination |
| 400 | `BAD_REQUEST` | Non-UUID id |
| 401 | `UNAUTHORIZED` | No/invalid session |
| 403 | `FORBIDDEN` | Not management tier |
| 404 | `NOT_FOUND` | Definition does not exist |

## Data

Nothing seeds `kpi_definitions` or `kpi_targets`, and there is no write API, so a fresh database shows the page's "No KPI definitions configured" empty state. Definitions and targets must be approved (formulas and targets are CLIENT DECISION REQUIRED in `backend/docs/architecture/09-kpi-data-model.md`) and inserted by an administrator until a configuration write API exists.

## Frontend

- `frontend/src/kpi/kpi-configuration-api.ts`: zod-validated client and mappers. A response that does not match raises `ContractValidationError` and is shown as an error, never patched.
- `frontend/src/kpi/kpi-configuration-api-pages.tsx`: API-mode list (search, status filter, pagination) and detail (definition facts and target history), with loading, empty, error, unauthorized (session expiry) and not-found states. It is read-only.
- `configuration-pages.tsx` renders these in API mode instead of the "API unavailable" message; in API mode the preview source and governance panels are not rendered, so no mock data appears.
- `frontend/src/api/contract-validation.ts` now holds the shared `parseContract` / `ContractValidationError` / `describeApiError` used by the warehouse and KPI screens.
