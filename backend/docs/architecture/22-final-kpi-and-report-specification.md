# Final KPI and Report Specification

## KPI framework

KPIs are derived from operational PostgreSQL data—not manually entered dashboard values (**CONFIRMED**). Required dimensions are depot, employee, task type, client, material/product, date, and shift (**CONFIRMED**). `kpi_definitions`, `kpi_targets`, and `kpi_snapshots` are the specified persistence areas.

| KPI | Definition / calculation | Source tables / fields | Dimensions / snapshot / drill-down | Owner / target / frequency / correction |
|---|---|---|---|---|
| Task Completion Rate | Tasks and task events are confirmed sources; numerator/denominator formula is **CDR**. | `tasks`, `task_events`; exact fields/status inclusion **CDR**. | All confirmed dimensions where applicable; snapshot representation technical. | Owner, target, cadence, cancellation/reopen correction/backfill **CDR**. |
| Employee Productivity | Completed boxes + task duration + employee attribution are confirmed inputs; formula is **CDR**. | `tasks`, `task_assignments`, task events, layer/movement data as approved. | All confirmed dimensions; collaborator attribution **CDR**. | Owner, target, cadence, pause/reassign correction/backfill **CDR**. |
| Damage Rate | Quality records are confirmed source; formula is **CDR**. | `quality_records`; damage/outcome fields **CDR**. | All confirmed dimensions. | Owner, target, cadence, quality correction/backfill **CDR**. |

Technical snapshot requirements: record KPI definition/version, snapshot time, value, applicable dimensional keys, source period, and correction lineage once approved. KPI formula catalogue, targets, owners, snapshot frequency, correction/backfill, and access policy are **CDR**.

## Report framework

Templates control columns, order, totals, filters, formatting, and Excel/PDF output (**CONFIRMED**). No supplied templates are present. Therefore report-specific source fields, calculations, columns, formats, access roles, and schedules are **CDR**.

| Report group | Technical framework / status |
|---|---|
| Daily Performance; Daily Present/Absent/Short Performance/In-Out/Late IN/Early IN/Early OUT/Over Time; GPS Approved/Rejected/Pending; Mis Punch; Half Day | Named report requirements **CONFIRMED**; data mappings/template detail **CDR**. |
| Monthly, Periodic, Location, Leave, Salary, Yearly, Other | Scope **CONFIRMED**; all detailed mapping **CDR**. |
| MB51 and MB52 | Excluded; do not create report definition, endpoint, query, or template (**CONFIRMED**). |

Reports are generated daily (**CONFIRMED**). A shared normalized report-query layer plus separate Excel/PDF rendering is a **RECOMMENDATION**. Attendance/GPS/leave/salary source systems/data models are **CDR**.

