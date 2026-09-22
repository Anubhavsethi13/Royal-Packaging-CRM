# Implementation Blockers

This list contains only the genuinely blocking decisions from [27-final-implementation-readiness.md](architecture/27-final-implementation-readiness.md).

| ID | Blocking decision | Impacted modules |
|---|---|---|
| B-01 | RBAC permission, depot scope, delegation, and approval-authority matrix. | RBAC; task/inventory/payroll/report authorization; access audit. |
| B-02 | Final task transition permissions/guards and cancellation/reopen policy. | Warehouse Tasks; task APIs; state/event/audit logic. |
| B-03 | New task incentive formula, participant cut-off, historical 6% relationship, overtime/rounding/quality impact. | IncentiveService; source-linked payroll posting; incentive-related KPI/reporting. |
| B-04 | Supplied report templates and their data mappings. | Royal Packaging report implementation and exports. |
