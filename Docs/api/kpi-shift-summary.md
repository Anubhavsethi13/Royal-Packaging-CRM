# Shift-Entry KPI Summary API (KPI Daily Shift Tracking, Phase 2)

Shift entries are a **KPI data source** (`source: "SHIFT_ENTRY"`), not a new KPI system. The existing KPI module is extended, not replaced:

```
KpiService (existing, apps/api/src/modules/kpi/kpi-service.ts)
   |-- kpi_snapshots reads: /kpis, /kpis/:id, /kpis/:code/drill-down   (unchanged)
   `-- KpiDataSource interface (kpi-data-source.ts)
         `-- ShiftEntryKpiSource (shift-entry-kpi-source.ts)  <- reads shift_entries
```

Every response names its `source`, so figures from different sources are never mixed. Task-event KPIs (`kpi_snapshots`) keep their own path; they can be exposed through the same `KpiDataSource` interface later. No schema change in this phase and no scores, rankings, targets, incentives or payroll.

## Endpoints

Both need an authenticated session and follow the standard envelopes. The `/api` prefix is optional.

| Endpoint | Policy action | Who |
|---|---|---|
| `GET /kpi/me/summary` | `kpi:read_own` | Any approved role, and the user must have an active employee profile. Always the caller's own data |
| `GET /kpi/summary` | `kpi:read_all` | Management tier (SUPER_ADMIN, MAIN_ADMIN, ADMIN, MANAGER/SUPERVISOR) |

Enforcement is in `DatabaseRBACAuthorizationPolicy`; the codes are also seeded (`kpi:read_own` to all approved roles, `kpi:read_all` to management roles). The existing `kpi:read` (snapshot routes) is unchanged. There is no supervisor team/depot scope in the current architecture, so management access is unscoped, as in Phase 1.

### Query parameters

| Param | `/kpi/me/summary` | `/kpi/summary` | Rules |
|---|---|---|---|
| `from`, `to` | yes | yes | `YYYY-MM-DD` on `work_date`, both inclusive, either optional; `to` must not be before `from` |
| `warehouse_code` | yes | yes | Existing depot code (case-insensitive). Unknown code is `400 INVALID_WAREHOUSE` |
| `truck_type` | yes | yes | Existing truck type code (case-insensitive). Unknown is `400 INVALID_TRUCK_TYPE` |
| `employee_id` | **rejected (400)** | yes (UUID) | The session decides the employee on `/me`. An unknown UUID on `/summary` returns an empty result |
| `page`, `pageSize` | no | yes | Standard pagination of the per-employee rows (default 25, max 200) |

Filter semantics: a filter selects **whole shift entries**. A warehouse or truck-type filter keeps every entry that involves it and counts that entry's full totals. The entry stores one total per shift, so totals are never apportioned per warehouse or truck type. Filters combine with AND.

## Formulas

Inputs, per matching entry: `loading_total`, `unloading_total`, `labour_count`, and `duration = shift_end - shift_start` in seconds (always positive; overnight is not supported). `N` = number of matching entries. All sums are over the matching entries.

| Metric | Formula | Empty (N = 0) |
|---|---|---|
| `shift_count` | `COUNT(entries)` | 0 |
| `total_unloading` | `SUM(unloading_total)` | 0 |
| `total_loading` | `SUM(loading_total)` | 0 |
| `total_boxes` | `total_loading + total_unloading` | 0 |
| `average_boxes_per_shift` | `total_boxes / N` | `null` |
| `total_labour_count` | `SUM(labour_count)` | 0 |
| `average_labour_count` | `total_labour_count / N` | `null` |
| `total_shift_duration_seconds` | `SUM(shift_end - shift_start)` in seconds | 0 |
| `average_shift_duration_seconds` | `total_shift_duration_seconds / N` | `null` |
| `loading_productivity_boxes_per_hour` | `total_loading / (total_shift_duration_seconds / 3600)` | `null` |
| `unloading_productivity_boxes_per_hour` | `total_unloading / (total_shift_duration_seconds / 3600)` | `null` |
| `warehouse_associations` | number of (entry, warehouse) links among matching entries | 0 |
| `distinct_warehouses` | number of distinct warehouses among those links | 0 |

Rules:
- Productivity is a **ratio of sums** (total boxes over total hours), never an average of per-shift ratios. It is only `null` when the total duration is zero. A shift with zero boxes gives `0`, not `null`.
- Averages and productivity are rounded half-up to 2 decimals using exact integer arithmetic (every ratio is a ratio of integer sums, so exact ties such as 201 boxes / 200 shifts = 1.005 give 1.01); totals and durations are exact integers.
- Productivity is per shift hour, not per labour hour: no labour-adjusted productivity is defined by the requirement, so none is invented.
- Unit is BOX (`unit: "BOX"`); duration is seconds.
- Under a warehouse filter, `warehouse_associations` and `distinct_warehouses` count all warehouses of the matching entries (an entry that also worked DEP-01 counts that link when filtering by DEP-02).

## Example: `GET /kpi/me/summary`

Employee with three shifts (8h, 4h, 8.5h):

```json
{
  "success": true,
  "data": {
    "source": "SHIFT_ENTRY",
    "unit": "BOX",
    "employee_id": "6f1c…",
    "filters": { "from": null, "to": null, "warehouse_code": null, "truck_type": null, "employee_id": "6f1c…" },
    "metrics": {
      "shift_count": 3,
      "total_unloading": 150,
      "total_loading": 350,
      "total_boxes": 500,
      "average_boxes_per_shift": 166.67,
      "total_labour_count": 15,
      "average_labour_count": 5,
      "total_shift_duration_seconds": 73800,
      "average_shift_duration_seconds": 24600,
      "loading_productivity_boxes_per_hour": 17.07,
      "unloading_productivity_boxes_per_hour": 7.32,
      "warehouse_associations": 4,
      "distinct_warehouses": 2
    }
  }
}
```

(Bodies also carry the additive camelCase mirror keys, e.g. `shiftCount`.)

The same request with `?from=2026-09-01&to=2026-09-05` covers two shifts: 12h, 350 loading, 150 unloading, so `average_boxes_per_shift` 250, `loading_productivity_boxes_per_hour` 29.17 (350 / 12) and `unloading_productivity_boxes_per_hour` 12.5.

Employee with no shifts (zero, not an error):

```json
{ "shift_count": 0, "total_boxes": 0, "total_shift_duration_seconds": 0,
  "average_boxes_per_shift": null, "average_labour_count": null,
  "average_shift_duration_seconds": null,
  "loading_productivity_boxes_per_hour": null, "unloading_productivity_boxes_per_hour": null,
  "warehouse_associations": 0, "distinct_warehouses": 0 }
```

## Example: `GET /kpi/summary?from=2026-09-01&to=2026-09-30&page=1&pageSize=25`

`metrics` is the aggregate over every matching entry (not just the returned page). `employees` holds one row per employee with at least one matching entry, ordered by name then employee code; `meta` paginates those rows.

```json
{
  "success": true,
  "data": {
    "source": "SHIFT_ENTRY",
    "unit": "BOX",
    "filters": { "from": "2026-09-01", "to": "2026-09-30", "warehouse_code": null, "truck_type": null, "employee_id": null },
    "metrics": { "shift_count": 4, "total_unloading": 180, "total_loading": 420, "total_boxes": 600,
                 "average_boxes_per_shift": 150, "total_labour_count": 17, "average_labour_count": 4.25,
                 "total_shift_duration_seconds": 81000, "average_shift_duration_seconds": 20250,
                 "loading_productivity_boxes_per_hour": 18.67, "unloading_productivity_boxes_per_hour": 8,
                 "warehouse_associations": 5, "distinct_warehouses": 2 },
    "employees": [
      { "employee_id": "6f1c…", "employee_code": "EMP-001", "employee_name": "Asha",
        "metrics": { "shift_count": 3, "total_boxes": 500, "average_boxes_per_shift": 166.67, "…": "same fields as above" } },
      { "employee_id": "9a02…", "employee_code": "EMP-002", "employee_name": "Ravi",
        "metrics": { "shift_count": 1, "total_boxes": 100, "average_boxes_per_shift": 100, "…": "same fields as above" } }
    ]
  },
  "meta": { "page": 1, "pageSize": 25, "total": 2, "totalPages": 1, "hasNext": false, "hasPrevious": false }
}
```

## Errors

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Bad date, `from` after `to`, bad `employee_id`, bad pagination |
| 400 | `BAD_REQUEST` | `employee_id` sent to `/kpi/me/summary` |
| 400 | `INVALID_WAREHOUSE` / `INVALID_TRUCK_TYPE` | Unknown `warehouse_code` / `truck_type` |
| 401 | `UNAUTHORIZED` | No/invalid session |
| 403 | `FORBIDDEN` | Role lacks the action (e.g. an employee on `/kpi/summary`) |
| 403 | `EMPLOYEE_PROFILE_REQUIRED` | `/kpi/me/summary` for a user with no active employee profile |

## Not in this phase

Daily/weekly/monthly time series, task-derived source merging, KPI targets/thresholds against shift metrics, and supervisor team/depot scoping (no such model exists).
