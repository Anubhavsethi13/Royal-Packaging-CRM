# Open Business Decisions

These questions come from `Docs/Architecture Development Questions.docx`. They remain OPEN; this phase does not answer them or convert preview behavior into policy. Each row records the affected frontend surface, the contract consequence, the temporary behavior, and the backend consequence.

| Open question | Frontend area | Contract that cannot be finalized | Temporary frontend behavior | Backend consequence |
|---|---|---|---|---|
| Which operations require ACID atomicity? | orders, inventory, tasks, payroll | mutation transaction and retry semantics | preview actions only | define transaction boundaries and idempotency |
| Can two employees operate on inventory simultaneously, and how are conflicts resolved? | inventory, scanner | reservation/movement version fields and conflict errors | local identification only | concurrency control and `409` policy |
| Which events are durable facts versus UI notifications, and must events replay? | activity, audit, dashboards | event envelope, replay cursor, freshness | mock activity snapshots | event store and delivery semantics |
| What timestamps define each KPI, and which KPIs are live or periodic? | KPI dashboard, reports | KPI query and snapshot fields | illustrative actual/target values | calculation pipeline and ownership |
| Who owns KPIs and who may change targets? | KPI/settings | authorization and target mutation contract | read-only preview | role policy and target history |
| What is the canonical incentive formula and what is a quality failure? | incentives, payroll | rule inputs, version, failure reasons | display-only estimates | versioned calculation service |
| Can supervisors override payouts, who changes rules, and how are versions retained? | incentives, payroll, audit | approval/override request and audit payload | no mutation | immutable rule versions and authority |
| Is at-most-once realtime delivery sufficient and what staleness is acceptable? | dashboards, task queues | freshness/version and notification contract | explicit preview/stale labels | realtime guarantees and recovery |
| What are expected tasks/day, peak users, depots, inventory size, event retention, and KPI volume? | all list/report surfaces | pagination, limits, retention and performance budgets | small fixtures | capacity and infrastructure plan |
| What happens when a task is stuck? | tasks, warehouse | exception/status action and SLA event | status display only | escalation and transition rules |
| What happens when inventory is missing, a barcode is wrong, or material is damaged? | scanner, inventory, tasks | exception reason, correction, and conflict payloads | local error/offline states | exception workflow and audit trail |
| What happens when payroll is disputed? | payroll | dispute resource and status transitions | preview only | authority, correction, and retention policy |
| Is payroll internal or external, and does this system initiate payment? | payroll | integration boundary and export contract | no payment action | system-of-record and payment integration |
| Does Royal Packaging have an ERP/accounting system? | reports, payroll, clients | identifiers, ownership, synchronization direction | no integration | integration ownership and reconciliation |
| What scanner/device hardware is used? | loading/unloading | device capability and scan transport | simulated input | hardware adapter and deployment model |
| What happens to inventory when an order is cancelled, modified, partially fulfilled, or reopened? | orders, inventory | lifecycle command and reservation response | visual status only | state machine and transaction policy |
| Can one inventory item serve multiple orders, and can an order contain multiple SKUs? | order detail, inventory | item/reservation relationships | multi-item UI is preview-only | allocation model and invariants |
| Can inventory be reserved before physical movement, and what are valid inventory states? | order detail, scanner | reservation and state transition contract | mock reservation text | inventory state machine |
| Can tasks be cancelled, reassigned, paused, resumed, or reopened, and who may transition them? | tasks, warehouse | command list, permissions, conflict/version behavior | read-only task states | lifecycle authority |
| What happens when an employee leaves mid-task, and can tasks/workers overlap? | tasks, employees, KPI | assignment history and active-work constraints | preview employee labels | workforce and productivity rules |
| How many depots exist and what is the depot → zone → row → aisle → location hierarchy? | warehouse, locations, inventory | location resource and stable path | illustrative locations | warehouse master data |
| Is the location structure standardized, and can locations be blocked or restricted? | locations, scanner | capability/status fields and authorization | preview blocked/restricted labels | location policy |
| Which units are used for quantity, weight, and volume? | inventory, tasks, orders | unit codes and conversion metadata | display strings | measurement vocabulary |
| Is kg/m³ authoritative, and how are pallets/skids/crates represented? | inventory, payroll/KPI | measurement source and packaging resource | no calculations | authoritative measurement rules |
| Do SLAs vary by client, order priority, material, task, depot, or shift? | orders, tasks, KPI | SLA policy reference and deadline calculation | preview SLA badge | configurable SLA engine |
| Are weekends/holidays included, and how are shifts and hold reasons handled? | tasks, reports, KPI | business calendar and time accounting | friendly display timestamps | calendar/SLA policy |
| Who may correct recorded data, and is original data retained? | audit, forms, payroll | correction command, before/after, authority | local form validation only | immutable audit and correction model |
| Can KPI definitions/formulas change, and are historical results recalculated? | KPI, reports | definition/rule version and snapshot contract | no formula editing | versioned KPI history |
| How long must KPI history remain available? | KPI, reports | retention and archival behavior | fixture history only | storage/retention policy |
| How many years must warehouse, payroll, and audit records be retained? | audit, payroll | pagination/archive/export guarantees | preview history | compliance and archival |
| Is an immutable audit trail required, who can view it, and who can export? | audit, access control | append-only event shape and permission codes | UX-only permissions | server enforcement and retention |
| Where is PostgreSQL hosted, and what are backup/RPO/RTO/HA/environment requirements? | none directly; affects operational errors | deployment/runtime assumptions | no infrastructure behavior | platform and recovery design |
| If realtime stops, can scanning/tasks continue and are events queued? | warehouse, scanner | stale/offline/deferred command contract | simulated offline warning | queue/reconnect/validation behavior |
| What offline operation is required during scan → complete? | scanner | local queue, replay, or blocked-operation response | offline state blocks confirmation | authoritative reconnect validation |
| Which reports, formats, recipients, schedules, and historical views are required? | reports | export job and saved/scheduled report contract | report catalog/preview only | reporting/export service |
