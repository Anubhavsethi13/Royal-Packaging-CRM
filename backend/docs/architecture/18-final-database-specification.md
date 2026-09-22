# Final Database Specification

## Scope, authority, and notation

PostgreSQL is the authoritative source of operational, financial, audit, and metadata state. This is a schema specification, not a migration. Every field marked **TECHNICAL REQUIREMENT** is necessary for persistence, integrity, concurrency, or auditability—not a new business rule. Every field/relationship marked **CLIENT DECISION REQUIRED (CDR)** must be approved before implementation.

### Common technical conventions

- `id uuid PK NOT NULL` is a **TECHNICAL REQUIREMENT** for every listed entity unless a stated natural key is later approved.
- `created_at timestamptz NOT NULL`, `updated_at timestamptz NOT NULL`, and `version bigint NOT NULL` are **TECHNICAL REQUIREMENT** fields for mutable entities. Immutable ledger/event tables use `created_at`/`event_at` and do not update business facts.
- Money/rates use `numeric`, never JavaScript floating point (**CONFIRMED**). Precision/scale is **CDR**.
- Foreign keys are `NOT NULL` where the confirmed relationship is mandatory; otherwise the relationship/nullability is **CDR**.
- Retain warehouse/operational, payroll, and audit records for system lifetime (**CONFIRMED**). Photo binary retention is **CDR**.
- State values, business check constraints, and most domain unique constraints are **CDR** unless stated below. `version >= 1`, timestamps, and non-negative box quantity where a quantity is stored are **TECHNICAL REQUIREMENT** checks.

## Identity and access

### `users`

Purpose: authenticated user identity. Source-of-truth: PostgreSQL. Retention: operational lifetime.

| Columns | Keys/constraints/indexes | Relationships/audit |
|---|---|---|
| `id uuid NOT NULL`; `login_identifier text NOT NULL` (**CDR** identifier policy); `password_hash text NOT NULL`; `is_active boolean NOT NULL`; common mutable fields. | PK `id`; unique `login_identifier` (**TECHNICAL REQUIREMENT** if it is login key); index active login lookup. Password policy is **CDR**. | `users` 1:* `sessions`, `user_access_roles`, `access_audit_logs`; user-to-employee link is **CDR**. Audit user lifecycle/privilege changes (**TECHNICAL REQUIREMENT** for sensitive mutation). |

### `sessions`

Purpose: database-backed authenticated sessions. Source-of-truth: PostgreSQL. Retention/lifecycle: **CDR**.

| Columns | Keys/constraints/indexes | Relationships/audit |
|---|---|---|
| `id uuid NOT NULL`; `user_id uuid NOT NULL`; `session_token_hash text NOT NULL`; `created_at timestamptz NOT NULL`; `expires_at timestamptz NOT NULL`; `revoked_at timestamptz NULL`; `last_seen_at timestamptz NULL`; `version bigint NOT NULL`. | PK `id`; unique `session_token_hash`; index `(user_id, revoked_at, expires_at)`; check `expires_at > created_at`. | FK `user_id -> users`; session creation/revocation audit detail is **CDR**. |

### `login_attempts`

Purpose: server-enforced five-failures-in-15-minutes lockout. Source-of-truth: PostgreSQL. Retention: **CDR**.

| Columns | Keys/constraints/indexes | Relationships/audit |
|---|---|---|
| `id uuid NOT NULL`; `login_identifier text NOT NULL`; `attempted_at timestamptz NOT NULL`; `succeeded boolean NOT NULL`; `user_id uuid NULL` (**CDR** if known); `lockout_until timestamptz NULL`; technical request/correlation reference **CDR**. | PK `id`; index `(login_identifier, attempted_at)`; check lockout timestamp ordering if present. | Optional FK to `users`; logging of security attempts is **TECHNICAL REQUIREMENT**, exact audit/retention is **CDR**. |

### `access_roles`, `access_permissions`, `access_role_permissions`, `user_access_roles`

Purpose: normalized server-side RBAC. Source-of-truth: PostgreSQL. Retention: operational/audit lifetime.

| Table / columns | Keys/constraints/indexes | Relationships/audit |
|---|---|---|
| `access_roles`: common ID/mutable fields; `code text NOT NULL`; `name text NOT NULL`; `active boolean NOT NULL`. | PK ID; unique `code`; index active role. Role hierarchy is **CDR**. | Roles include known names Super Admin/Main Admin/Admin/Manager; their permissions are **CDR**. |
| `access_permissions`: common ID/mutable fields; `code text NOT NULL`; `name text NOT NULL`; `description text NULL`. | PK ID; unique `code`. | Permission catalogue is **CDR**. |
| `access_role_permissions`: `role_id uuid NOT NULL`; `permission_id uuid NOT NULL`; `created_at timestamptz NOT NULL`; `created_by_user_id uuid NOT NULL` (**TECHNICAL REQUIREMENT** audit actor). | composite PK/unique `(role_id, permission_id)`; indexes by each FK. | FKs role/permission/user; privilege mutation must audit. |
| `user_access_roles`: `user_id uuid NOT NULL`; `role_id uuid NOT NULL`; `assigned_at timestamptz NOT NULL`; `assigned_by_user_id uuid NOT NULL`; `revoked_at timestamptz NULL`. | PK `id uuid`; unique active assignment is **CDR**; indexes user/role/revoked. | FKs users/roles/actor; role assignment/revocation audit required. |

### `access_audit_logs`

Purpose: lifetime audit trail for access/security/business-critical mutations. Source-of-truth: PostgreSQL. Retention: lifetime (**CONFIRMED**).

| Columns | Keys/constraints/indexes | Relationships/audit |
|---|---|---|
| `id uuid NOT NULL`; `occurred_at timestamptz NOT NULL`; `actor_user_id uuid NULL`; `action text NOT NULL`; `entity_type text NOT NULL`; `entity_id uuid NULL`; `correlation_id uuid NULL`; `metadata jsonb NULL` (bounded schema **CDR**). | PK ID; indexes `(entity_type,entity_id,occurred_at)`, `(actor_user_id,occurred_at)`, correlation. | FK actor to users nullable only for system/failed-auth cases (**TECHNICAL REQUIREMENT**); append-only. |

## Organisation, workforce, and commercial data

### `employees`, `shifts`, `employee_shift_assignments`

| Table / purpose / columns | Keys/constraints/indexes | Relationships/audit/retention |
|---|---|---|
| `employees`: workforce identity. `id uuid`; `employee_code text NOT NULL` (**CDR**); common mutable fields; `user_id uuid NULL` (**CDR**); depot scope relation **CDR**. | PK; unique employee code if adopted; indexes user/depot scope once approved. | User mapping and depot model are **CDR**; employee security changes audit. |
| `shifts`: configurable two-shift definitions. `id uuid`; `name text NOT NULL`; `start_time time NOT NULL`; `end_time time NOT NULL`; `active boolean NOT NULL`; common fields. | PK; unique active name **CDR**; timing validation/overnight semantics **CDR**. | Exact two timings and overtime semantics are **CDR**. |
| `employee_shift_assignments`: effective-dated assignment. `id uuid`; `employee_id uuid NOT NULL`; `shift_id uuid NOT NULL`; `effective_from date NOT NULL`; `effective_to date NULL`; `created_at timestamptz NOT NULL`. | PK; indexes employee/date and shift/date; date overlap constraint **CDR**. | FKs employee/shift; preserve history, audit changes. |

### `depots`, `locations`

| Table / purpose / columns | Keys/constraints/indexes | Relationships/audit/retention |
|---|---|---|
| `depots`: nine depot records. `id uuid`; `code text NOT NULL`; `name text NOT NULL`; `active boolean NOT NULL`; common fields. | PK; unique `code`; index active. | Exact depot master data is business input; changes audit. |
| `locations`: depot-specific hierarchy. `id uuid`; `depot_id uuid NOT NULL`; `parent_location_id uuid NULL`; `code text NOT NULL`; `name text NOT NULL`; `active boolean NOT NULL`; common fields. | PK; FK depot/self-parent; unique location code scope **CDR**; indexes depot/parent. Cycle prevention strategy **TECHNICAL REQUIREMENT**. | Each location belongs to a depot (**CONFIRMED**); hierarchy semantics/move eligibility **CDR**. |

### `clients`, `orders`, `order_items`

| Table / purpose / columns | Keys/constraints/indexes | Relationships/audit/retention |
|---|---|---|
| `clients`: client master. `id uuid`; `client_code text NOT NULL` (**CDR**); `name text NOT NULL`; common fields. | PK; code uniqueness if adopted; name lookup index **CDR**. | Client field set/access is **CDR**. |
| `orders`: commercial work origin. `id uuid`; `client_id uuid NOT NULL`; `order_code text NOT NULL` (**CDR**); common fields; status/date fields **CDR**. | PK; FK client; unique order code if adopted; index client. | Task/order linkage mandatory/optional is **CDR**. |
| `order_items`: order line. `id uuid`; `order_id uuid NOT NULL`; product/batch/box quantity fields **CDR**. | PK; FK order; order/line uniqueness **CDR**. | Product/order task relationships **CDR**. |

## Inventory and warehouse execution

### `inventory_items`, `inventory_batches`, `inventory_balances`

| Table / purpose / columns | Keys/constraints/indexes | Relationships/audit/retention |
|---|---|---|
| `inventory_items`: product/material identity. `id uuid`; `product_code text NOT NULL`; `name text NULL` (**CDR**); common fields. | PK; unique `product_code`; lookup index. | Product-code identity is confirmed; other fields **CDR**. |
| `inventory_batches`: batch identity. `id uuid`; `inventory_item_id uuid NOT NULL`; `batch_number text NOT NULL`; common fields. | PK; FK item; unique `(inventory_item_id,batch_number)` (**TECHNICAL REQUIREMENT** for product+batch identity); index item/batch. | Batch applicability/attributes **CDR**. |
| `inventory_balances`: authoritative current state. `id uuid`; `inventory_batch_id uuid NOT NULL`; `location_id uuid NOT NULL`; `box_quantity bigint NOT NULL`; `version bigint NOT NULL`; `updated_at timestamptz NOT NULL`. | PK; unique `(inventory_batch_id,location_id)`; check `box_quantity >= 0` only if negative inventory is prohibited (**CDR**); index location/batch. | FKs batch/location; balance update occurs with movement; retention lifetime. |

### `inventory_movements`

Purpose: append-oriented record of authoritative stock movement. Source-of-truth: PostgreSQL. Retention: warehouse lifetime.

| Columns | Keys/constraints/indexes | Relationships/audit |
|---|---|---|
| `id uuid NOT NULL`; `inventory_batch_id uuid NOT NULL`; `source_location_id uuid NULL`; `destination_location_id uuid NULL`; `box_quantity bigint NOT NULL`; `task_id uuid NULL`; `movement_type text NOT NULL` (**CDR**); `occurred_at timestamptz NOT NULL`; `actor_user_id uuid NULL`; `idempotency_key text NULL` (**TECHNICAL REQUIREMENT for externally retried mutation**); `correlation_id uuid NULL`. | PK; check `box_quantity > 0`; unique idempotency key within operation scope (**TECHNICAL REQUIREMENT**, exact scope **CDR**); indexes batch/time, task, source/destination, correlation. Source/destination requirements and same-location check **CDR**. | FKs batch, locations, task, actor; audit required; partial/reversal/negative behavior **CDR**. |

### `tasks`, `task_assignments`, `task_events`, `task_photos`

| Table / purpose / columns | Keys/constraints/indexes | Relationships/audit/retention |
|---|---|---|
| `tasks`: operational task. `id uuid`; `status text NOT NULL`; `depot_id uuid NULL` (**CDR**); `task_type text NULL` (**CDR**); order/item/product/batch/source/destination links **CDR**; `planned_box_quantity bigint NULL`; `completed_box_quantity bigint NULL`; `started_at/paused_at/completed_at timestamptz NULL`; common fields. | PK; status enum/check **CDR**; non-negative quantities; indexes status/depot, type/date, order/product fields once approved. `version` is technical duplicate/concurrency control. | Relationships to assignments/events/photos/movements/quality; preserve task record and audit business-critical changes. |
| `task_assignments`: historical many-to-many employee assignment. `id uuid`; `task_id uuid NOT NULL`; `employee_id uuid NOT NULL`; `assigned_at timestamptz NOT NULL`; `assigned_by_user_id uuid NOT NULL`; `unassigned_at timestamptz NULL`; reason **CDR**. | PK; indexes task/active, employee/active; duplicate active-assignment uniqueness **TECHNICAL REQUIREMENT** if same employee cannot be concurrently duplicated on one task. | FKs task/employee/actor; permits multiple active tasks per employee; audit assignment changes. |
| `task_events`: durable lifecycle record. `id uuid`; `task_id uuid NOT NULL`; `event_type text NOT NULL`; `event_at timestamptz NOT NULL`; `actor_user_id uuid NULL`; `correlation_id uuid NULL`; `metadata jsonb NULL` (schema **CDR**). | PK; indexes task/time, type/time, correlation; append-only. | FK task/actor; type catalogue/metadata **CDR**; task events required. |
| `task_photos`: layer evidence metadata. `id uuid`; `task_id uuid NOT NULL`; `layer_number integer NOT NULL`; `box_quantity bigint NOT NULL`; `captured_by_employee_id uuid NULL`; `captured_at timestamptz NOT NULL`; `storage_key text NOT NULL`; `status text NULL` (**CDR**); correction/supersession link **CDR**. | PK; check positive layer/box; task/layer uniqueness and replacement policy **CDR**; indexes task/layer, storage key. | FKs task/employee/self; metadata retained with warehouse record; binary retention **CDR**; evidence audit required when approved. |

### `pallet_assets`, `dock_schedules`

These required names are not present in confirmed business requirements; they are reserved only as potential entities.

| Table / purpose / columns | Keys/constraints/indexes | Relationships/audit/retention |
|---|---|---|
| `pallet_assets`: **CDR** business purpose, ownership, fields, lifecycle. Only `id uuid PK`, common technical fields are specified. | All business constraints/indexes **CDR**. | Relationships/audit/retention **CDR**. |
| `dock_schedules`: **CDR** business purpose, dock model, appointments, fields, lifecycle. Only `id uuid PK`, common technical fields are specified. | All business constraints/indexes **CDR**. | Relationships/audit/retention **CDR**. |

## Quality and financial records

### `quality_records`

Purpose: task quality pass/fail/adjust evidence. Source-of-truth: PostgreSQL. Retention: warehouse lifetime.

| Columns | Keys/constraints/indexes | Relationships/audit |
|---|---|---|
| `id uuid NOT NULL`; `task_id uuid NOT NULL`; `outcome text NOT NULL`; `inspected_at timestamptz NOT NULL`; `inspected_by_user_id uuid NULL`; damage/accuracy/box verification fields **CDR**; correction/supersession link **CDR**; common fields. | PK; outcome enum/check **CDR**; index task/time; one-current-record rule **CDR**. | FKs task/inspector/self; audit inspection/correction; quality financial consequence **CDR**. |

### `incentive_rules`, `incentive_events`, `incentive_ledger`

| Table / purpose / columns | Keys/constraints/indexes | Relationships/audit/retention |
|---|---|---|
| `incentive_rules`: approved, versioned policy. `id uuid`; `rule_version text NOT NULL`; `effective_from timestamptz NOT NULL`; `effective_to timestamptz NULL`; rule definition/formula/penalty/overtime fields **CDR**; approval actor/time **CDR**. | PK; unique version; effective-period overlap check **CDR**; index active effective period. | Rule history/audit required; historical vs current model must remain distinct. |
| `incentive_events`: canonical calculation lifecycle. `id uuid`; `task_id uuid NOT NULL`; `incentive_rule_id uuid NULL`; `event_type text NOT NULL`; `event_at timestamptz NOT NULL`; `actor_user_id uuid NULL`; `correlation_id uuid NULL`; metadata **CDR**. | PK; indexes task/time/type; event type **CDR**. | FKs task/rule/actor; append-only/audit. |
| `incentive_ledger`: per-employee allocation. `id uuid`; `task_id uuid NOT NULL`; `employee_id uuid NOT NULL`; `incentive_rule_id uuid NULL`; `amount numeric NOT NULL`; `status text NOT NULL`; `created_at timestamptz NOT NULL`; approval/correction references **CDR**; `idempotency_key text NULL` technical. | PK; money precision/rounding status checks **CDR**; unique task/employee/current allocation and idempotency rules **CDR**; indexes employee/status, task. | FKs task/employee/rule; one canonical service writes; lifetime financial retention/audit. |

### `payroll_ledger`, `payroll_approvals`

| Table / purpose / columns | Keys/constraints/indexes | Relationships/audit/retention |
|---|---|---|
| `payroll_ledger`: payroll entry sourced from incentive result. `id uuid`; `incentive_ledger_id uuid NOT NULL`; `employee_id uuid NOT NULL`; `amount numeric NOT NULL`; `status text NOT NULL`; payroll period **CDR**; `created_at timestamptz NOT NULL`; `idempotency_key text NULL` technical. | PK; unique source incentive allocation/current payroll entry **TECHNICAL REQUIREMENT** unless approved correction model changes it; status/precision **CDR**; indexes employee/period/status. | FKs incentive ledger/employee; must not calculate incentive; lifetime/audit. |
| `payroll_approvals`: approval history. `id uuid`; `payroll_ledger_id uuid NOT NULL`; `approved_by_user_id uuid NOT NULL`; `approved_at timestamptz NOT NULL`; `decision text NOT NULL`; reason **CDR**. | PK; index ledger/time; approval state rules **CDR**. | FK payroll/user; approval authority **CDR**; append-only audit/lifetime. |

## KPI and reporting records

### `kpi_definitions`, `kpi_targets`, `kpi_snapshots`

| Table / purpose / columns | Keys/constraints/indexes | Relationships/audit/retention |
|---|---|---|
| `kpi_definitions`: KPI metadata. `id uuid`; `code text NOT NULL`; `name text NOT NULL`; formula/owner/cadence/version **CDR**; common fields. | PK; unique code; active index. | Formula/owner/cadence require approval. |
| `kpi_targets`: target values. `id uuid`; `kpi_definition_id uuid NOT NULL`; target numeric/date/dimension scope **CDR**; common fields. | PK; FK definition; effective-period uniqueness **CDR**. | Targets are not supplied. |
| `kpi_snapshots`: derived values. `id uuid`; `kpi_definition_id uuid NOT NULL`; `snapshot_at timestamptz NOT NULL`; `value numeric NOT NULL`; `depot_id/employee_id/task_type/client_id/inventory_item_id/shift_id` nullable dimensions; source-period/correction/version fields **CDR**. | PK; FKs to dimensions; index definition/time/dimensions; formula/correction uniqueness **CDR**. | Derived from operational data only; retention/cadence **CDR**. |

### `report_definitions`, `report_executions`

Purpose: technical reporting framework only; client templates are authoritative and unavailable.

| Table / columns | Keys/constraints/indexes | Relationships/audit/retention |
|---|---|---|
| `report_definitions`: `id uuid`; `code text NOT NULL`; `name text NOT NULL`; template/source mapping/format/roles **CDR**; common fields. | PK; unique code; MB51/MB52 must not be represented as definitions (**CONFIRMED**). | Template rules **CDR**. |
| `report_executions`: `id uuid`; `report_definition_id uuid NOT NULL`; `requested_by_user_id uuid NULL`; `requested_at timestamptz NOT NULL`; filters/output location/status **CDR**; correlation. | PK; FKs definition/user; indexes definition/time. | Execution/history retention **CDR**; exports need authorization/audit. |

## Cross-table duplicate prevention

| Risk | Technical requirement |
|---|---|
| Duplicate task completion | Task `version` plus transactional state check; a completion operation identity/idempotency relation is required, exact model **CDR**. |
| Duplicate inventory movement | Transactional balance update plus unique operation/idempotency scope in `inventory_movements`. |
| Duplicate incentive | Transactional canonical service write plus approved unique task/allocation/status invariant. |
| Duplicate payroll | `payroll_ledger` unique source incentive allocation/current-entry invariant plus approved correction model. |

No business table, column, relationship, or constraint marked CDR may be implemented as an assumed rule.
