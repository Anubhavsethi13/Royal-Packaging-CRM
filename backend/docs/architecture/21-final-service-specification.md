# Final Service Specification

## Service boundary rules

The backend is a modular monolith (**RECOMMENDATION aligned with architecture**). Route/API layers validate input and invoke services; domain logic is not placed in route handlers (**CONFIRMED**). Every service derives actor/scope from verified session and uses PostgreSQL transactions for approved atomic operations. Floot publication is delegated after commit.

| Service | Responsibility / owned entities | Inputs / outputs / validation | Authorization / transactions / events / dependencies |
|---|---|---|---|
| `AuthService` | Users, sessions, login attempts. | Login/logout/session validation; Zod inputs. | Session-derived actor; login lockout transaction; depends on bcryptjs/jose/PostgreSQL; no required realtime. |
| `UserService` | Users and approved user-employee linkage. | User lifecycle DTOs **CDR**. | RBAC guarded; account changes atomic/audited; depends Auth/RBAC. |
| `RBACService` | Roles, permissions, mappings, access audit. | Role/permission assignment; matrix **CDR**. | Server-only authority; mapping/audit transaction; depends Auth/Audit. |
| `EmployeeService` | Employees, shifts, effective assignments. | Employee/shift inputs; timing policy **CDR**. | Scoped authorization; assignment transaction/audit; depends RBAC/Audit. |
| `ClientService` | Clients. | Client inputs **CDR**. | Scoped authorization/mutation audit; depends RBAC/Audit. |
| `OrderService` | Orders/order items. | Order inputs/linkage **CDR**. | Scoped authorization/mutation audit; depends Client/RBAC. |
| `InventoryService` | Items, batches, balances, movements. | Product/batch/location/box movement; movement semantics **CDR**. | Transactional movement/balance/idempotency; post-commit `inventory` freshness; depends RBAC/Audit/Realtime. |
| `WarehouseTaskService` | Tasks, assignments, task events. | Controlled task commands; full transition matrix **CDR**. | State/actor/version transaction; assignment/status freshness; depends Inventory, PhotoTrace, Quality, RBAC, Audit, Realtime. |
| `PhotoTraceService` | Task-photo metadata/object-store workflow. | Layer/photo references; evidence rules **CDR**. | Capturer derived server-side; metadata transaction after approved upload protocol; depends WarehouseTask, object storage, Audit. |
| `QualityService` | Quality records/corrections. | Outcome/evidence criteria **CDR**. | Inspector scope/financial side effects **CDR**; transaction/audit/events depend approved workflow; depends WarehouseTask, Incentive, Audit. |
| `IncentiveService` | Rules, canonical calculation/events/ledger allocations. | Approved task/quality/shift/participants; formula **CDR**. | **Only service that calculates incentives**; validates quality, approved penalties, equal allocations, rule version/rounding once approved; transactional ledger/idempotency; depends Tasks, Quality, Employees/Shifts, Audit. |
| `PayrollService` | Payroll ledger/approvals. | Approved incentive result, approval decision **CDR**. | Never recalculates incentive; transactional source-linked entry/idempotency/audit; `payroll` freshness; depends Incentive/RBAC/Audit/Realtime. |
| `KPIService` | KPI definitions/targets/snapshots. | Approved KPI definitions/dimensions. | Derived reads/snapshots only; formula/cadence **CDR**; may trigger KPI freshness; depends operational domains. |
| `ReportService` | Report definitions/executions/render data. | Approved template/filter requests. | Authorised report scope; MB51/MB52 excluded; depends KPI/operational domains; output/audit **CDR**. |
| `RealtimeService` | Post-commit Floot adapter/monitoring. | Committed freshness events. | Never owns state or transaction; depends PostgreSQL result/Floot/observability. |
| `AuditService` | Access/business audit records. | Server-provided actor/action/entity/correlation. | Append-oriented audit write within applicable transaction; detail matrix **CDR**; depends PostgreSQL/Auth. |

No service may duplicate `IncentiveService` calculations. Payroll, reports, KPIs, and API handlers consume canonical incentive records only.

