# KPI Results API (V1)

KPI results are **calculated on demand** by the backend from completed tasks and exposed read-only. They are not persisted: the same data, period and KPI definition always give the same result (deterministic ids), so there is nothing to deduplicate or recalculate. `kpi_snapshots` is left unused. Writing it would duplicate this live model, and the table has no source column (the same reason given in Phase 2 of the shift KPI work). There are no migrations.

No scores, rankings, incentives or payroll are calculated.

## Architecture

```
tasks (status COMPLETED, completed_at, completed_box_quantity, task_type, depot)
 + task_assignments (who was assigned at completion)
 + task_events (start / pause / resume / complete timing)
   → KpiResultCalculator (apps/api/src/modules/kpi/kpi-result-calculator.ts)
       for each active kpi_definitions row whose code has a supported calculation
       × each employee with completed tasks × each period bucket
       + kpi_targets (target in force on the period's first day)
   → KpiService.listResults / getResult
   → GET /kpi/results, GET /kpi/results/:id
   → frontend repositories.kpiResults (kpi/kpi-result-api.ts, zod-validated)
   → KPI results page
```

Daily shift entries are **not** a source here. They are self-reported and already have their own KPI summary (`/kpi/me/summary`, `/kpi/summary`); mixing them with task data would double count.

## Which KPIs produce results

A result exists for each **active** `kpi_definitions` row whose `code` is one of the supported calculations below and whose effective range overlaps the period. Definitions are configuration: nothing is seeded, so an administrator must create them (see `Docs/api/kpi-configuration.md`). Other codes are not calculable.

| `kpi_definitions.code` | Metric | Operation | Tasks counted | Value | Unit | Direction |
|---|---|---|---|---|---|---|
| `BOXES_HANDLED` | BOXES_HANDLED | WAREHOUSE | all | Σ credited completed BOX | BOX | higher |
| `LOADING_BOXES` | BOXES_HANDLED | LOADING | loading | Σ credited completed BOX | BOX | higher |
| `UNLOADING_BOXES` | BOXES_HANDLED | UNLOADING | unloading | Σ credited completed BOX | BOX | higher |
| `TASKS_COMPLETED` | TASKS_COMPLETED | TASK | all | number of completed tasks | COUNT | higher |
| `TASK_TIME` / `LOADING_TIME` / `UNLOADING_TIME` | TIME_TAKEN | TASK / LOADING / UNLOADING | per scope | Σ active minutes | DURATION (minutes) | lower |
| `AVERAGE_BOXES_PER_TASK` | AVERAGE_BOXES_PER_TASK | TASK | all | Σ credited BOX ÷ completed tasks | BOX | higher |
| `LOADING_SLA_COMPLIANCE` / `UNLOADING_SLA_COMPLIANCE` | SLA_COMPLIANCE | LOADING / UNLOADING | per scope | **not calculable**: no SLA targets exist | PERCENTAGE | higher |

Metric, category, unit and direction follow the existing frontend KPI metric catalogue. Loading and unloading use the task-type classification from the warehouse operations work (provisional list in `Docs/api/warehouse-operations.md`).

## Exact formulas

For employee *e* and period *P* (a set of local dates):

- **Tasks:** status `COMPLETED` with `completed_at` whose local date (in `OPERATIONS_TIMEZONE`) falls in *P*.
- **Participants of a task:** employees whose assignment was active at completion (`assigned_at ≤ completed_at < unassigned_at`, or never unassigned). This reuses the confirmed incentive participant rule; employees unassigned before completion are excluded.
- **Credited BOX of a task for one participant:** `completed_box_quantity ÷ participants`. Per-employee BOX totals therefore add up to the warehouse total.
- **BOXES_HANDLED** = Σ credited BOX over *e*'s tasks in *P* (within the KPI's task scope).
- **TASKS_COMPLETED** = count of those tasks (each participant is credited with the task).
- **TIME_TAKEN** = Σ active time ÷ 60000 ms, where active time per task = Σ (pause or complete − start or resume) from its task events. Tasks without a start event have no duration. If none of the tasks has one, the result is `NOT_AVAILABLE` (never 0).
- **AVERAGE_BOXES_PER_TASK** = BOXES_HANDLED ÷ TASKS_COMPLETED. A result exists only when there is at least one task, so it never divides by zero.
- **SLA_COMPLIANCE**: always `NOT_AVAILABLE` (no SLA targets in the schema).
- **Rounding:** 2 decimals, half-up, using exact integer and rational arithmetic.
- **Rows:** a result row exists only when *e* has at least one qualifying task in *P*. No zero rows are invented for idle employees.

**Target:** the `kpi_targets` row in force on the period's first day, preferring the employee's own warehouse (`employees.depot_id`) over the all-warehouse target. It is `null` when none exists.

**Status:**

| Status | When |
|---|---|
| `NOT_AVAILABLE` | Value not calculable (`not_available_reason` explains why) |
| `PENDING` | The period has not ended yet (value is partial) |
| `AVAILABLE` | Otherwise |

## Periods and timezone

- **Kinds:** `DAILY`, `WEEKLY` (ISO weeks, Monday to Sunday) and `MONTHLY` (calendar month). The default is `DAILY`. `CUSTOM` is not supported by the API.
- **Boundaries:** calendar dates in the backend's `OPERATIONS_TIMEZONE` (IANA name, default `UTC`). Set it to the site's zone (e.g. `Asia/Kolkata`); otherwise work done after 00:00 UTC is counted on the next UTC day.
- **Default range:** the 30 days up to today (in that timezone), snapped to whole periods.
- **Maximum range:** DAILY 92 days, WEEKLY 371 days, MONTHLY 731 days.

## Endpoints

| Method | Path | Policy | Notes |
|---|---|---|---|
| GET | `/kpi/results` | `kpi:read_results` (any approved role) | Scope: `kpi:read_all` (management) sees every employee; everyone else only their own employee; no employee profile gives an empty list |
| GET | `/kpi/results/:id` | same | Scoped callers get `403` for anyone else's result |

- **Query parameters:** `period`, `from`, `to`, `employee_id`, `kpi_id`, `metric`, `operation`, `status`, `warehouse_code`, `search`, `page`, `pageSize`. These camelCase aliases are also accepted: `periodStart`, `periodEnd`, `employeeId`, `kpiId`, `warehouseCode`.
- **Ordering:** newest period first, then employee name, then KPI code.
- **Detail id:** `<kpiDefinitionId>_<employeeId>_<PERIOD>_<periodStart>`. It is deterministic, and `periodStart` must be the period's first day.

List item:

```json
{
  "id": "k1_e1_DAILY_2026-09-28",
  "employee": { "id": "e1", "code": "EMP-001", "name": "Asha Rao" },
  "kpi": { "id": "k1", "code": "BOXES_HANDLED", "name": "Boxes handled" },
  "rule_version_id": "k1:v1",
  "metric": "BOXES_HANDLED", "category": "PRODUCTIVITY", "operation": "WAREHOUSE", "scope": "OWN",
  "period": { "kind": "DAILY", "start": "2026-09-28", "end": "2026-09-28", "label": "2026-09-28", "timezone": "UTC" },
  "actual": { "value": 150, "unit": "BOX" },
  "target": { "value": 150, "unit": "BOX", "target_id": "t1" },
  "unit": "BOX", "direction": "HIGHER_IS_BETTER",
  "status": "AVAILABLE", "not_available_reason": null,
  "source": "TASK", "source_count": 2,
  "calculated_at": "2026-09-30T08:00:00.000Z", "calculation_version": "task-kpi-v1"
}
```

Detail adds `source_references`, one per source task:

```json
{ "source_record_id": "task-uuid", "source_type": "WAREHOUSE_OPERATION", "task_id": "task-uuid", "task_code": "TSK-8EC75BED",
  "operation_type": "WAREHOUSE", "employee_id": "e1", "timestamp": "2026-09-28T12:00:00.000Z",
  "raw_metric_value": 30, "quantity": { "value": 30, "unit": "BOX" }, "duration_seconds": 3600,
  "warehouse": "DEP-01", "participants": 2 }
```

`source_type` and `operation_type` follow the frontend traceability contract: both describe the operation the result measured. `rule_version_id` identifies the KPI definition record and version the result was calculated against.

## Errors

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Bad `period`, date, range order or length, `metric`, `operation`, `status`, UUID, or pagination |
| 400 | `INVALID_KPI` / `KPI_NOT_CALCULABLE` / `KPI_NOT_ACTIVE` | `kpi_id` does not exist / has no supported calculation / is switched off |
| 400 | `INVALID_WAREHOUSE` / `INVALID_EMPLOYEE` | Unknown `warehouse_code` / `employee_id` |
| 400 | `BAD_REQUEST` | Malformed result id |
| 401 | `UNAUTHORIZED` | No or invalid session |
| 403 | `FORBIDDEN` | No approved role, or a scoped caller asking for another employee |
| 404 | `NOT_FOUND` | Well-formed id with no result (no qualifying tasks, or not calculable) |

## Frontend

- `kpi/kpi-result-api.ts` validates every item and detail with zod and maps it onto the existing `KpiResultReadModel`. It is wired as `repositories.kpiResults` in the default API configuration.
- **Model changes:** `target` and `actual` became optional (no configured target / not calculable) instead of being invented. `AVERAGE_BOXES_PER_TASK` was added to the metric catalogue.
- **The page in API mode:**
  - it shows backend values only, with "Not configured" and "Not calculable" placeholders;
  - DURATION values are shown in minutes;
  - it offers DAILY, WEEKLY and MONTHLY periods;
  - it does not apply the mock session filter, because the backend decides scope;
  - source tasks come from the scoped backend references.
