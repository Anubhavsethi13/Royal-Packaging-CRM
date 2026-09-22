# Final Client Decisions

# Confirmed Decisions

| Area | Confirmed decision |
|---|---|
| Quantity and trace | Box is the only operational quantity unit. Every photo records a box quantity for its corresponding layer/operation. |
| Employees/incentives | Multiple employees may work on a task. Participating employees receive equal shares of that task’s incentive. Historical employee percentage allocation is not the new task allocation rule. |
| Lifecycle intent | Scan, validate inventory, assign/select/enter quantity/route, start/in-transit/physical work, complete, quality, SLA, incentive, inventory movement, audit, payroll, approval is the operational flow. |
| Start/timing | Start sets task in progress, puts inventory in transit, and starts active-work time. Pause pauses active time while retaining wall-clock time; resume continues active time. |
| Inventory | Partial movement is proportional; remaining source quantity and destination moved quantity are maintained. Full movement relocates existing inventory. Negative stock is never allowed. Completed movements are immutable and corrections use reversal/adjustment transactions. |
| Quality | Quality score, damage rate, task accuracy, final inventory status, and quality incentive rule are concepts to preserve. Damage rate >= 5% means `damaged`; otherwise `available`. |
| Shifts | Two configurable/data-driven shifts; exact timings are not known and must not be hard-coded. |
| Payroll | Chain: Task -> IncentiveService -> Incentive Ledger -> Payroll Ledger -> Approval -> payroll processing. Payroll states are pending, approved, paid; default period Monday–Sunday; approved records use adjustment/correction, not silent edit. |
| Roles/security | Roles are Super Admin, Main Admin, Admin, Manager; their broad authority intent is confirmed. Authorization is server-side; client identity/scope/financial assertions never authorize actions. |
| KPI/reporting | KPI data derives from operational data with dimensions depot, employee, task type, client, material/product, date, shift. Daily cadence applies where applicable. |
| Reports/realtime | MB51 and MB52 are excluded. PostgreSQL is authoritative; Floot is post-commit freshness/resynchronization only on warehouse:ops, inventory, payroll. |

# Client Decisions Still Required

| Decision | Why it remains open |
|---|---|
| Task transition permissions, exact final enum/API policy, cancellation/reopen guards. | Lifecycle intent is supplied, but role authority and detailed policy are not frozen. |
| Photo mandatory-before/after/layer count, upload-blocking, deletion/replacement, retention, provider, correction actor. | Required metadata is known, policy is not. |
| Participant cutoff for join/leave/removal/reassignment/no-work assignment. | Equal sharing is confirmed but group membership timing is not. |
| New task incentive formula and relation of historical 6% pool to it. | Historical calculation is authoritative legacy reference, not approved current task formula. |
| Overtime formula, SLA/business-target formula, shift times. | Operational timing is known; formulas/times are not. |
| Quality financial penalties/deductions, inspection authority, correction/reopen pay effect. | Only damage-status threshold and concepts are confirmed. |
| RBAC capability matrix, depot scope/delegation, approval authority. | Role names/broad intent do not define permissions. |
| KPI formulas/targets/owner/correction rules and report templates/source fields. | Daily cadence/dimensions are known; metrics/templates are not. |
| Realtime payload/subscription/retry and authoritative resync filter policy. | Source-of-truth/recovery rule is known; contract is not. |

# Historical vs New Incentive Model

## Incentive Calculation Source of Truth

`docs/references/Incentive_Calculation_Observations.md` is authoritative for the **historical** workbook only:

```text
Super Incentive = Total Kot × 3%
Staff Incentive = Total Kot × 3%
Total Incentive = Total Kot × 6%
Final Incentive Pool = Total Incentive − Penalties/Payouts
```

The historical workbook hardcodes 3%, 3%, and 6%; uses Total Kot; has manual penalty/recovery entries; and allocates period pools by manually maintained employee allocation percentages. It uses manual historical sheets, some hardcoded finalized allocations, manually copied/rounded period values, and inconsistent employee names. Allocation totals are incomplete in March 2024 (99.72%, leaving 0.28%) and June 2025 (99.5%, leaving 0.5%). Penalty/recovery rows are sometimes mixed with employee percentage allocations. These observations are historical data quality facts, not new warehouse rules.

The historical workbook’s legacy points formula is also reference-only:

```text
volumePoints = floor(weightKg / 50)
quality >= 98 -> 1.25
quality >= 95 -> 1.10
quality >= 90 -> 0.90
otherwise -> 0.50
speedPoints = 25 when duration <= 30; otherwise 0
finalPoints = max(0, floor((volumePoints + speedPoints) × qualityMultiplier))
cash = points × 5
```

The **new warehouse task model** uses a task-specific incentive, approved task dimensions, participating employee IDs, equal allocation, incentive ledger, and payroll ledger. Historical employee allocation percentages are not the new equal-sharing mechanism. The mathematical relationship between a historical 6% pool and task-level incentive is **CLIENT DECISION REQUIRED**; do not merge them. There remains one canonical `IncentiveService`.

# Task Lifecycle Rules

| Action | Confirmed rule | Still required |
|---|---|---|
| Assign | Links employee to task. | Allowed role/employee eligibility/incentive membership cutoff. |
| Start | In progress; inventory in transit; active timer starts. | Exact task/inventory guards and API policy. |
| Pause/Resume | Active timer pauses/continues; wall-clock remains available. | Role, reason, exact state policy/KPI treatment. |
| Reassign | Changes responsible employee; audit history. | Participant/incentive and authorization policy. |
| Cancel | Stops task. | In-transit/reservation disposition and authority. |
| Complete | Records operational result and begins downstream processing. | Evidence, quality and financial transaction boundary. |
| Reopen | Authorized management action with audit history. | Exact permission/state/effect policy. |

# Photo and Box Trace Rules

Every photo requires photo ID, task/movement reference, layer reference/number, box quantity, timestamp, actor/employee reference, storage reference, upload status, and audit metadata. Box is the only quantity unit. The photo must not silently change completion state; failed upload must be represented without assuming whether completion blocks. Mandatory before/after photos, one-photo-per-layer, delete/replace policy, retention, storage provider, correction authority, and completion gate are **CLIENT DECISION REQUIRED**.

# Inventory Rules

Inventory records preserve product/batch where applicable, source/destination, task, employee, timestamp, movement type, box quantity, and audit history. For partial movement:

```text
ratio = movedQuantity / sourceQuantity
movedWeight = sourceWeight × ratio
movedVolume = sourceVolume × ratio
remainingQuantity = sourceQuantity − movedQuantity
```

Remaining quantity stays on original inventory; moved quantity becomes destination inventory. Full quantity movement relocates the existing item. Negative stock is prohibited. Completed movement is immutable; correct through reversal/adjustment. Reservation rules, movement-type catalogue, scan validation, and reconciliation remain **CLIENT DECISION REQUIRED**.

# Quality Rules

Quality records preserve quality score, damage rate, task accuracy, final inventory status, and quality incentive rule. `damage rate >= 5%` yields `damaged`; lower damage rate yields `available`. Separate quality penalties, payroll deductions for serious failure, inspector authority, correction/reopen impact, and incentive/payroll eligibility consequences are **CLIENT DECISION REQUIRED**.

# Overtime and Shift Rules

There are two data-driven/configurable shifts; no times or Shift A/B/C assumption may be hard-coded. Active work time is separately measurable through start/pause/resume. Overtime affects incentives, but the overtime formula/boundary treatment is **CLIENT DECISION REQUIRED**. SLA has no confirmed formula: distinguish operational timing measurement from overtime calculation and any future SLA target.

# Payroll Rules

Payroll consumes, and does not recalculate, the approved canonical incentive result. States are `pending`, `approved`, `paid`; the default payroll period is Monday–Sunday. Approved payroll is immutable to silent edits and corrections use adjustment/correction records. Approval actor, requirement/timing, external salary-payment integration, correction semantics, and duplicate-prevention key details remain **CLIENT DECISION REQUIRED**.

# RBAC Rules

Super Admin is highest authority; Main Admin has broad administrative authority; Admin has operational/administrative authority; Manager has operational-management authority. This does not authorize individual capabilities. The server derives user, employee, role, depot, approval, incentive amount, and payroll amount authority from verified session/persisted permissions—not client input. Detailed capability/depot/delegation/approval matrix remains **CLIENT DECISION REQUIRED**.

# KPI Rules

Use `kpiDefinitions`, `kpiTargets`, and `kpiSnapshots`, derived from operational data. Support depot, employee, task type, client, material/product, date, shift; daily reporting applies where applicable. No manual KPI dashboard values and no invented targets. KPI formulas, ownership, targets, correction/backfill, collaborator attribution, and exact daily snapshot schedule remain **CLIENT DECISION REQUIRED**.

# Reporting Rules

Use only supplied Royal Packaging report categories/templates. Daily cadence applies where applicable. MB51 and MB52 are excluded. Required dimensions are depot, employee, task type, client, material/product, date, and shift. Template fields, totals, filters, access roles, output formats, attendance/GPS/leave/salary sources, and calculations remain **CLIENT DECISION REQUIRED** until templates are supplied.
