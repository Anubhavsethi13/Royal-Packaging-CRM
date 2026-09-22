# Final Specification Gaps

## Cross-document chain check

The documents 18–24 preserve the required chain, but several links remain intentionally unimplementable until client decisions are made. PostgreSQL authority, post-commit Floot freshness, multi-employee assignment, equal incentive allocation, duplicate-prevention invariants, and MB51/MB52 exclusion are consistently represented.

| Flow stage | Database -> service -> API -> transaction -> event -> KPI/report trace | Result |
|---|---|---|
| Scan | `task_photos`/inventory links -> PhotoTraceService/InventoryService -> `/warehouse/scan`, `/tasks/{id}/photos` -> approved metadata/movement transaction -> no required event -> trace/report source. | Broken: scan identity, validation, and evidence rules are not approved. |
| Validate | Task/photo/inventory/quality fields -> WarehouseTask/PhotoTrace/Quality -> lifecycle commands -> state/evidence validation -> task freshness -> KPI/report sources. | Broken: guards/actor/evidence acceptance rules are not approved. |
| Assign | `task_assignments`, `task_events` -> WarehouseTaskService -> assignment command -> atomic history/event/audit -> `task.assignment.changed` -> productivity source. | Partial: assignment history and freshness exist; authority/membership/KPI effects not approved. |
| Move | inventory movement/balance -> InventoryService -> movement command -> atomic movement/balance -> `inventory.movement.recorded` -> operational source. | Broken: partial/reversal/reservation/negative-stock semantics not approved. |
| Start / in progress | task/status/event -> WarehouseTaskService -> start command -> atomic state/event/audit -> status freshness -> duration source. | Partial: confirmed path, but actor/guard/KPI semantics not approved. |
| Complete | task/movement/event -> WarehouseTask/Inventory -> complete command -> duplicate-safe transaction -> status freshness -> completion source. | Broken: evidence/inventory/quality/payroll boundary not approved. |
| Quality | quality record -> QualityService -> quality command -> correction/financial transaction -> event CDR -> damage source. | Broken: inspector/criteria/financial consequence/reopen rules not approved. |
| Incentive | rule/event/ledger -> canonical IncentiveService -> incentive command -> canonical ledger transaction -> event CDR -> financial/KPI source. | Broken: formula, legacy reconciliation, participant cutoff, rounding, approval not approved. |
| Payroll / approval | payroll ledger/approvals -> PayrollService -> payroll/approval command -> source-linked transaction -> payroll freshness -> report source. | Broken: approver/timing/correction policy not approved. |
| KPI | definitions/targets/snapshots -> KPIService -> read/drill-down -> derived snapshot -> KPI freshness CDR -> dashboard/report. | Broken: formulas/targets/cadence/ownership/corrections not approved. |
| Realtime / resync | resource versions -> RealtimeService -> `/resync/*` -> post-commit only -> channels -> authoritative refetch. | Partial: authority/recovery rule exists; payload/subscription/resync filters need decision. |

## Remaining issues

| ID | Classification | Broken link / issue | Why it matters | Required decision or next action |
|---|---|---|---|---|
| G-01 | BLOCKING | Complete task transition matrix has no allowed actors, guard conditions, cancellation/reopen target states, event/audit/KPI effects. | Tasks, API, schema state, RBAC, and audit cannot be safely implemented. | Client approves full state/operation matrix. |
| G-02 | BLOCKING | Scan/trace and layer-photo acceptance/correction/upload-failure/completion rules missing. | Completion and evidence validity are undefined. | Client supplies trace workflow and retention/correction policy. |
| G-03 | BLOCKING | Inventory partial movement, reservation, source/destination, reversal, negative-stock, and reconciliation rules missing. | Movement/balance constraints and duplicate prevention cannot be finalized. | Client approves movement lifecycle. |
| G-04 | BLOCKING | Quality/damage criteria, authority, correction/reopen and payability impact missing. | Quality, incentive, payroll, and completion boundaries conflict if assumed. | Client approves quality workflow. |
| G-05 | BLOCKING | Incentive formula, historical 6% relationship, penalties, overtime boundaries, participant membership, rounding, corrections and approvals missing. | Canonical service cannot calculate financial values. | Client supplies versioned approved incentive policy. |
| G-06 | BLOCKING | Payroll approval/posting/correction/period rules missing. | Payroll ledger may be premature or duplicated. | Client approves payroll workflow. |
| G-07 | BLOCKING | Permission matrix, depot/employee scope, user-employee link, approval authority missing. | No protected mutation/read has an approved allowed actor. | Client approves RBAC/scope matrix. |
| G-08 | BLOCKING for reporting | Templates and source mappings for all named reports, including attendance/GPS/leave/salary, are missing. | Reporting cannot be implemented without inventing columns/calculations. | Client supplies templates/mappings; MB51/MB52 stay excluded. |
| G-09 | NON-BLOCKING for core transactions | KPI formulas/targets/owner/cadence/correction attribution missing. | KPI/dashboard/report implementation is not valid, but core factual operational recording can proceed once G-01–G-07 are resolved. | Client approves KPI catalogue. |
| G-10 | NON-BLOCKING for core transactions | Floot payload/version/subscription/retry and resync filter contracts missing. | Realtime UI integration cannot be completed, though database operations remain correct. | Approve realtime/read contract; retain PostgreSQL recovery. |
| G-11 | NON-BLOCKING | Photo object-store provider/finalization, session lifecycle, retention/privacy, backup/restore, observability platform and SLOs missing. | Production readiness/compliance is incomplete. | Select technical policies/platforms. |
| G-12 | DEFERRED | SLA calculation. | No supplied SLA rule exists. | Add only if client supplies separate SLA requirements. |
| G-13 | DEFERRED | Broker/cache/microservice/graph routing. | No documented need; adds unsupported architecture. | Reconsider only with measured need/requirement. |

## Consistency conclusion

No new business rule was silently added in final specifications: technical keys, versions, idempotency, timestamps, correlation, and source-link requirements are explicitly labelled technical. All remaining open semantic choices are retained as client decisions. Backend implementation should not begin for blocked domains until G-01 through G-08 are resolved; no database migration should encode CDR semantics.
