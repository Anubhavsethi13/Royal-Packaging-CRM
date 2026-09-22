# Final Implementation Readiness

## End-to-end trace

| Step | Database representation | Service / API / transaction / event / audit / KPI impact | Readiness |
|---|---|---|---|
| Client / Order | clients, orders, order items | ClientService/OrderService; API fields/linkage remain configurable; audit as required. | READY WITH CONFIGURATION |
| Inventory | items, batches, balances, movements | InventoryService/movement API; atomic balance + movement; inventory freshness; audit. | READY WITH CONFIGURATION |
| Scan / Trace | task photos with upload status/layer box quantity | PhotoTraceService/photo API; failed upload represented; policy configurable; audit. | READY WITH CONFIGURATION |
| Task / Assign / Start | tasks, assignments, events | WarehouseTaskService/lifecycle APIs; assignment/start transactions; warehouse freshness; audit. | BLOCKED (transition authority/policy) |
| Move | movements/balances/in-transit status | InventoryService; partial formulas/no-negative/immutable correction are confirmed; inventory event/audit. | READY WITH CONFIGURATION |
| Complete / Quality | task, quality, events | Completion service/API; quality score/damage status; downstream boundary and authority configurable. | READY WITH CONFIGURATION |
| Incentive / equal allocation | rules/events/ledger per employee ID | Canonical IncentiveService; equal shares; formula/legacy link/participant cutoff unavailable. | BLOCKED |
| Payroll / approval | payroll ledger/approvals | PayrollService; pending/approved/paid, Monday–Sunday, adjustment records; authority/timing configurable. | READY WITH CONFIGURATION |
| KPI / Report | definition/target/snapshot/report data | Derived KPI/report services; dimensions/daily cadence confirmed; formulas/templates unavailable. | READY WITH CONFIGURATION |
| Realtime | versions/events/outbox policy if selected | RealtimeService post-commit; authoritative resync; no financial authority. | READY WITH CONFIGURATION |

## Module assessment

| Module | Status | Rationale |
|---|---|---|
| Auth | READY WITH CONFIGURATION | Confirmed session, cookie, bcryptjs/jose, and lockout rules; lifecycle settings remain configuration. |
| RBAC | BLOCKED | Role names/broad intent exist; permission/depot/approval matrix changes core authorization. |
| Users | READY WITH CONFIGURATION | Core identity can be implemented; user-employee/provisioning details remain configurable. |
| Employees | READY WITH CONFIGURATION | Employees/two data-driven shifts exist; exact times are configuration. |
| Clients | READY WITH CONFIGURATION | Entity exists; detailed fields/access are configuration. |
| Orders | READY WITH CONFIGURATION | Entity exists; task linkage/detail is configuration. |
| Inventory | READY WITH CONFIGURATION | Box, partial movement formula, no-negative, immutable/reversal rules now define core operations; movement catalogue/reservation are configuration decisions. |
| Warehouse Tasks | BLOCKED | Core state intent is known but final transition permission/guard policy changes state-machine/API behavior. |
| Photo/Trace | READY WITH CONFIGURATION | Required metadata/box quantity/upload status are known; mandatory/deletion/retention policies are configurable. |
| Quality | READY WITH CONFIGURATION | Score/damage/accuracy/status threshold are known; financial/authority policy is configurable. |
| Incentives | BLOCKED | Equal sharing is known but task formula, historical 6% relationship, participant cutoff, overtime/rounding rules change calculation. |
| Payroll | READY WITH CONFIGURATION | Chain, states, period, and adjustment rule are known; approval authority/timing remains configurable. |
| KPI | READY WITH CONFIGURATION | Structures/dimensions/daily cadence and source derivation are known; formulas/targets are configuration/decision inputs. |
| Reports | BLOCKED | Templates/source fields are authoritative and still unavailable. |
| Realtime | READY WITH CONFIGURATION | Channels/post-commit/resync authority are known; payload/subscription contract is configuration. |
| Audit | READY WITH CONFIGURATION | Lifetime retention and critical-operation trace requirements are known; exact audit matrix is configuration. |

# Remaining Blocking Decisions

1. RBAC permission, depot scope, delegation, and approval-authority matrix.
2. Final task transition permissions/guards and cancellation/reopen policy.
3. New task incentive formula, participant cutoff, historical 6% relationship, overtime/rounding/quality impact.
4. Supplied report templates and their data mappings.

# Non-Blocking Configuration

- Shift times, session lifecycle settings, employee/client/order details.
- Photo provider, retention, mandatory-upload/deletion/replacement policy.
- Movement-type catalogue, reservation/reconciliation detail.
- Quality inspector/correction and payroll approval timing details.
- KPI formulas/targets/cadence and realtime payload/subscription contract.

# Deferred Decisions

- Any SLA formula/business target.
- External salary-payment integration.
- Kafka, RabbitMQ, Redis, microservices, durable Floot, graph routing, or other infrastructure not justified by requirements.

# Backend Implementation Order

1. Establish approved technical foundations and PostgreSQL schema only for confirmed/configurable modules; do not encode blocking business rules.
2. Implement auth/session/lockout/audit primitives, users, employees/shifts, depots/locations, clients/orders.
3. Implement inventory products/batches/balances/movements with boxes, partial-movement invariants, no-negative stock, reversals, and audit.
4. Implement photo/trace metadata/upload-status workflow without assuming optional photo policies.
5. Resolve and implement RBAC and task state-machine policy before task command APIs.
6. Resolve and implement canonical IncentiveService before financial calculation/payroll posting.
7. Implement payroll states/ledger/adjustments after approval authority is configured.
8. Implement post-commit Floot freshness and authoritative resync.
9. Configure KPIs and implement reports only when formulas/templates are supplied.
