# Backend / Frontend Reconciliation

This document is the single source of truth for how the backend (`apps/api`,
`packages/db`, `packages/contracts`) maps onto what the frontend needs, and
every pragmatic decision made while filling in previously-empty modules.
"Flag, don't invent": every assumption below is also documented as a
doc-comment at its point of use in the code.

## 1. Endpoint matrix

All routes are relative to the API root; the router also accepts the same
paths prefixed with `/api` (stripped by `stripApiPrefix()` before matching).
Every route below requires an authenticated session (`rp_session` cookie)
except `POST /auth/login` and `GET /health*`.

| Method | Path | RBAC action | Module | Notes |
|---|---|---|---|---|
| POST | /auth/login | - | identity | Accepts `{login_identifier,password}` or frontend `{email,password}` |
| POST | /auth/logout | - | identity | |
| GET | /auth/session | - | identity | Returns `FrontendUserDTO` alongside legacy shape |
| GET | /health, /health/ready | - | health | |
| GET/POST/PATCH | /clients, /clients/:id | client:read / client:write | clients | |
| GET/POST/PATCH | /orders, /orders/:id | order:read / order:write | orders | |
| POST | /orders/:id/cancel | order:cancel | orders | Forward-only status transitions |
| GET/POST/PATCH | /employees, /employees/:id | employee:read / employee:write | organization | |
| POST | /employees/:id/shift-assignments | employee:assign_shift | organization | |
| GET | /inventory | inventory:read_catalog | inventory | Item-level aggregate view |
| GET | /inventory/:id | inventory:read_catalog | inventory | Registered after literal routes below (see §3.1) |
| POST | /inventory/movements | inventory:move | inventory | |
| GET | /inventory/balances | inventory:read_balances | inventory | |
| GET | /inventory/movements/:id | inventory:read_movement | inventory | |
| POST | /warehouse/scan | warehouse:scan | warehouse | Barcode/batch scan compat |
| GET | /warehouse/tasks | warehouse:read_tasks | warehouse | |
| GET | /warehouse/route | warehouse:read_route | warehouse | Grid routing |
| POST | /tasks, /tasks/initialize-from-order | task:create / task:initialize_from_order | warehouse | |
| GET | /tasks, /tasks/:id | task:read | warehouse | |
| POST | /tasks/:id/assignments | task:assign | warehouse | |
| POST | /tasks/:id/reassign | task:assign | warehouse | Multi-employee reassignment |
| POST | /tasks/:id/unassign|start|pause|resume|complete|cancel|reopen | task:* | warehouse | Existing lifecycle, unchanged |
| POST | /tasks/:id/movement | task:execute_movement | warehouse | |
| GET | /tasks/:id/summary\|assignments\|events | task:read_* | warehouse | |
| POST/GET | /tasks/:id/quality-inspections | quality:inspect / quality:read_history | quality | |
| GET | /quality-records/:id | quality:read_record | quality | |
| POST/GET | /tasks/:id/photos | quality:record_photo / quality:read_photos | quality | |
| POST | /incentives/kot, /incentives/penalties | incentive:record_kot / incentive:record_penalty | incentives | |
| GET | /incentives/kot/:month, /incentives/penalties | incentive:read | incentives | |
| POST | /incentives/monthly/calculate, /tasks/:id/incentives/calculate | incentive:calculate | incentives | |
| POST | /incentives/approve | incentive:approve | incentives | |
| GET | /incentives/ledger | incentive:read | incentives | |
| GET | /audit-logs, /audit-logs/:id | audit:read | audit | Unifies task_events + incentive_events |
| GET | /kpis, /kpis/:id, /kpis/:code/drill-down | kpi:read | kpi | Reads real kpi_snapshots |
| GET | /dashboard | dashboard:read | dashboard | Live cross-domain aggregates |
| GET | /resync/tasks, /resync/inventory, /resync/kpis | resync:read | resync | No `/resync/payroll` by design (Assumption #10) |
| GET | /payroll, /payroll/:id | payroll:read | payroll | |
| POST | /payroll/entries | payroll:write | payroll | Amount always server-snapshotted |
| POST | /payroll/entries/:id/approvals | payroll:approve | payroll | One-shot decision |
| GET | /reports | report:read | reports | |
| POST | /reports/:code/executions | report:execute | reports | |
| GET | /report-executions/:id | report:read | reports | |

## 2. Canonical error envelope

All error responses use:

```json
{ "success": false, "code": "...", "message": "...", "errors": [...], "meta": {...}, "requestId": "..." }
```

`errors` (field-level validation issues) and `meta` are optional and
mutually exclusive per call site. A nested `error: { code, message,
details }` object is also included for backward compatibility with any
earlier frontend build that read the old shape. `success: false` is kept
(rather than removed) for the same backward-compat reason.

**Assumption #1**: the envelope is additive - no existing successful
response shape (`{success:true,...}`) was changed.

## 3. Documented pragmatic decisions (assumptions)

1. **Canonical error envelope is additive.** See §2 above; nothing that
   previously worked was removed, only fields added.
2. **`withCamelCaseMirror<T>()`** is used wherever the only backend/frontend
   difference is naming (e.g. `created_at` vs `createdAt`) - it adds
   camelCase keys alongside the existing snake_case ones, recursively,
   never removing anything. Used across quality, incentive, warehouse,
   payroll, and report responses.
3. **Bespoke normalization for real structural differences.** Inventory
   movements are the one case where the frontend's shape genuinely differs
   from the DB's: the frontend sends `inventoryItemId` + `batchId`
   separately, while the DB stores a single `inventory_batch_id`.
   `normalizeMoveInventoryBody()` in `inventory-routes.ts` resolves the
   batch (FIFO, oldest-first, at the specified location) from those two
   fields before delegating to the existing service method.
4. **Route registration order.** `GET /inventory/:id` is registered after
   `/inventory/balances` and `/inventory/movements/:id` because the router
   matches routes in registration order, first match wins - a single
   `:id` segment would otherwise shadow those literal two-segment paths.
   See the comment in `inventory-routes.ts`.
5. **FIFO batch auto-selection.** `resolveBatchForItem()` picks the oldest
   batch (by `received_at`/creation order) at a given location when the
   frontend does not supply a specific `batchId`. This was not specified
   explicitly but is the standard warehouse convention and is documented
   at the call site.
6. **Grid location format.** Warehouse grid routing assumes locations are
   encoded as `<row-letter><column-number>` (e.g. `A12`); Manhattan
   distance is computed on that grid. No other format was specified.
7. **RBAC tier defaults for new actions.** Every new RBAC action added in
   this pass (`client:*`, `order:*`, `employee:*`, `warehouse:*`,
   `audit:read`, `kpi:read`, `dashboard:read`, `resync:read`, `report:*`,
   `payroll:read`/`payroll:write`) defaults to the same tier the existing
   analogous action used (management tier read, admin tier write) except
   `payroll:approve`, which reuses the **pre-existing**, stricter
   Super-Admin-only rule already present in `auth-middleware.ts` (grepped
   for before adding anything, per instructions - not duplicated).
8. **`FrontendUserDTO.scopes` is always `[]`.** No scope/permission-string
   system was ever specified for the frontend beyond role; `scopes` exists
   in the DTO for forward compatibility but is not populated. This is a
   known gap, not a bug.
9. **Dashboard `inventoryStatusCounts`** reuses
   `quality_records.final_inventory_status` rather than a separate
   inventory-status table, since no such table exists; this is the closest
   real signal available and is documented in `dashboard-service.ts`.
10. **`/resync/payroll` intentionally does not exist.** Payroll has no
    "paid"/settled terminal state (see #11), so there is nothing stable to
    bulk-resync yet; adding the endpoint would imply a completeness that
    does not exist. Confirmed by an explicit negative test (AN7).
11. **Payroll has no "paid" state.** `PAYROLL_ENTRY_STATUSES` is
    `PENDING | APPROVED | REJECTED` only. The actual disbursement/payment
    posting business rule was never specified by the source requirements
    (see `docs/references/06_Incentive_Payroll_KPI.md` and
    `docs/architecture/17-approved-business-rules.md`, neither of which
    define a settlement flow). This is a **real, acknowledged gap**, not
    an implementation shortcut - the migration, service and DTO all say so
    at the point of definition.
12. **Reports is a genuinely empty framework.** `report_definitions` has no
    seed data and no report-generation logic exists (no MB51/MB52-style
    content). The requirements referenced "supplied report specifications"
    that were never actually attached to this task. The framework
    (definition CRUD-lite + execution tracking) is real and tested; the
    content behind any given report code is not.
13. **`report_executions.filters` is `jsonb`.** node-pg deserializes jsonb
    columns automatically; `ReportService` never calls `JSON.parse()` on
    it (see the doc-comment at the `toExecutionDTO` call site) - doing so
    would throw on an already-parsed object.
14. **Payroll approval actor is a `users.id`, not `employees.id`.**
    `payroll_approvals.actor_user_id` references `users.id` because the
    approving actor is an authenticated admin/manager user, who may not
    have (or need) an `employees` row. This mirrors how `task_events`
    already records actors.

## 4. What remains genuinely outstanding

- Payroll disbursement/"paid" state and any payout-file export.
- Real report content/templates behind `report_definitions` (framework
  only; no definitions are seeded).
- `FrontendUserDTO.scopes` is unpopulated (role-only authorization today).
- Rate limiting is in-memory/single-instance only (documented in
  `rate-limit-middleware.ts`); a multi-instance deployment needs a shared
  store (e.g. Redis) instead.
