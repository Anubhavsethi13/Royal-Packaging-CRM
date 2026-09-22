# Royal Packaging CRM — Implementation Checklist

## Current baseline

Repository inspection on 2026-09-14 found a documentation-only scaffold. `apps/api`, `apps/web`, `packages/db`, `packages/contracts`, `packages/config`, `packages/shared`, `scripts`, and `tests` are empty. `package.json`, `.env.example`, and `README.md` are empty. No TypeScript configuration, lockfile, database configuration, environment schema, migrations, source code, tests, or backend component exists.

Status meanings: **Not started**, **Ready**, **Ready with configuration**, **Blocked**. “None” in the blocker column means no final blocking client decision prevents foundation work; it does not authorize inventing business rules.

## PHASE 1 — Foundation

| Task ID | Task name | Dependencies | Relevant architecture document | Blocking client decision | Implementation status |
|---|---|---|---|---|---|
| FND-01 | Initialize workspace package manifest, TypeScript project configuration, and package layout | None | 02, 15, 18, 21 | None | Ready — exact first implementation task |
| FND-02 | Add baseline dependency/tooling configuration for TypeScript, Kysely, Zod, bcryptjs, jose, tests, linting, and type checks | FND-01 | 02, 14, 23, 24 | None | Ready |
| FND-03 | Define non-secret environment configuration contract for PostgreSQL, sessions, object storage, and Floot | FND-01 | 02, 18, 20, 23 | None | Ready with configuration |
| FND-04 | Create domain-module, contracts, database, and test directory skeletons without business implementation | FND-01 | 02, 15, 21 | None | Ready |

## PHASE 2 — Database

| Task ID | Task name | Dependencies | Relevant architecture document | Blocking client decision | Implementation status |
|---|---|---|---|---|---|
| DB-01 | Translate confirmed technical foundations into an approved Kysely schema plan and migration sequence | FND-01, FND-03 | 04, 18, 27 | None | Ready with configuration |
| DB-02 | Implement foundational identity, access, audit, depot/location, employee/shift, client/order, product/batch schema | DB-01 | 18, 23, 27 | None | Ready with configuration |
| DB-03 | Implement inventory balances/movements with box-only quantities, partial-movement invariants, no-negative-stock, reversals, and audit | DB-02 | 18, 26, 27 | None | Ready with configuration |
| DB-04 | Implement task, assignment, event, photo, quality, incentive, payroll, KPI, and reporting persistence only after each blocked domain rule is resolved | DB-02 | 18, 25, 27 | See relevant domain blocker | Blocked in part |

## PHASE 3 — Authentication & RBAC

| Task ID | Task name | Dependencies | Relevant architecture document | Blocking client decision | Implementation status |
|---|---|---|---|---|---|
| SEC-01 | Implement database-backed sessions, secure cookie handling, bcryptjs password verification, jose cryptography, and login lockout | DB-02, FND-02 | 10, 18, 23, 27 | None | Ready with configuration |
| SEC-02 | Implement role/permission/depot/employee/approval authorization matrix | SEC-01, DB-02 | 10, 17, 23, 26, 27 | B-01: RBAC permission, depot scope, delegation, and approval-authority matrix | Blocked |
| SEC-03 | Implement access-audit coverage for sensitive mutations and authorization failures as approved | SEC-01, SEC-02 | 13, 18, 23, 27 | B-01 for exact matrix | Blocked in part |

## PHASE 4 — Core Domain

| Task ID | Task name | Dependencies | Relevant architecture document | Blocking client decision | Implementation status |
|---|---|---|---|---|---|
| CORE-01 | Implement depot/location hierarchy and scoped operational lookup services | DB-02, SEC-01 | 03, 18, 21, 27 | None | Ready with configuration |
| CORE-02 | Implement employee and effective-dated shift-assignment services | DB-02, SEC-01 | 03, 18, 21, 26, 27 | None | Ready with configuration |
| CORE-03 | Implement client/order/order-item services and validated contracts | DB-02, SEC-01 | 03, 18, 19, 21, 27 | None | Ready with configuration |

## PHASE 5 — Warehouse Workflow

| Task ID | Task name | Dependencies | Relevant architecture document | Blocking client decision | Implementation status |
|---|---|---|---|---|---|
| WH-01 | Implement approved task-state/transition permission matrix | SEC-02, DB-04 | 05, 17, 19, 21, 26, 27 | B-02: final task transition permissions/guards and cancellation/reopen policy | Blocked |
| WH-02 | Implement task creation, assignment history, start/in-transit timing, pause/resume, reassign, cancel, complete, and reopen commands | WH-01, INV-02, TRACE-02 | 05, 06, 12, 21, 26, 27 | B-02 | Blocked |
| WH-03 | Add authoritative task reads and post-commit warehouse freshness signals | WH-02, RT-01 | 08, 12, 20, 27 | B-02 | Blocked |

## PHASE 6 — Inventory

| Task ID | Task name | Dependencies | Relevant architecture document | Blocking client decision | Implementation status |
|---|---|---|---|---|---|
| INV-01 | Implement product, batch, location-balance, and box-quantity validation services | DB-03, SEC-01 | 03, 18, 21, 26, 27 | None | Ready with configuration |
| INV-02 | Implement atomic full/partial movement, proportional weight/volume calculation, destination creation/relocation, no-negative-stock, reversal/adjustment, and audit | INV-01, RT-01 | 06, 12, 18, 21, 26, 27 | None | Ready with configuration |
| INV-03 | Implement inventory movement/query API contracts and scoped balance resynchronization | INV-02, SEC-02 | 12, 19, 20, 27 | B-01 for final scope enforcement | Blocked in part |

## PHASE 7 — Quality & Photo Trace

| Task ID | Task name | Dependencies | Relevant architecture document | Blocking client decision | Implementation status |
|---|---|---|---|---|---|
| TRACE-01 | Implement object-storage integration and task-photo metadata/upload-status persistence | FND-03, DB-04, SEC-01 | 02, 12, 18, 21, 26, 27 | None | Ready with configuration |
| TRACE-02 | Implement layer box-quantity validation, actor attribution, audit metadata, and safe failed-upload representation | TRACE-01 | 12, 18, 26, 27 | None | Ready with configuration |
| TRACE-03 | Implement mandatory evidence, delete/replace/correction, retention, and completion-gate policy | TRACE-02 | 17, 26, 27 | Non-blocking photo policy configuration | Ready with configuration |
| QLT-01 | Implement quality score, damage rate, task accuracy, final inventory status, and damage threshold (`>= 5%` damaged) | DB-04, SEC-01 | 17, 18, 21, 26, 27 | None | Ready with configuration |
| QLT-02 | Implement quality authority, correction/reopen, incentive eligibility, and financial consequence policy | QLT-01, WH-01 | 17, 21, 26, 27 | B-02 and B-03 where financial/task policy changes | Blocked in part |

## PHASE 8 — IncentiveService

| Task ID | Task name | Dependencies | Relevant architecture document | Blocking client decision | Implementation status |
|---|---|---|---|---|---|
| INC-01 | Implement canonical IncentiveService interfaces, versioned rule persistence, and ledger technical foundation | DB-04, SEC-01 | 07, 18, 21, 26, 27 | None | Ready with configuration |
| INC-02 | Implement task incentive calculation, approved quality/overtime inputs, participant cut-off, rounding, and equal allocation | INC-01, QLT-02, WH-01 | 07, 17, 21, 26, 27 | B-03: new task incentive formula, participant cut-off, historical 6% relationship, overtime/rounding/quality impact | Blocked |
| INC-03 | Preserve historical 3%/3%/6% period model as separate legacy reference/import path only if later required | INC-01 | 07, 17, 26 | B-03 for relationship to new task model | Blocked |

## PHASE 9 — Payroll

| Task ID | Task name | Dependencies | Relevant architecture document | Blocking client decision | Implementation status |
|---|---|---|---|---|---|
| PAY-01 | Implement payroll ledger states (`pending`, `approved`, `paid`), Monday–Sunday period configuration, and adjustment/correction records | DB-04, SEC-01 | 17, 18, 21, 26, 27 | None | Ready with configuration |
| PAY-02 | Implement source-linked payroll posting from canonical incentive ledger without recalculation | PAY-01, INC-02 | 07, 17, 21, 26, 27 | B-03 | Blocked |
| PAY-03 | Implement approval authority and payroll status freshness events | PAY-01, SEC-02, RT-01 | 08, 10, 20, 26, 27 | B-01 | Blocked |

## PHASE 10 — KPI & Reporting

| Task ID | Task name | Dependencies | Relevant architecture document | Blocking client decision | Implementation status |
|---|---|---|---|---|---|
| KPI-01 | Implement KPI definition/target/snapshot technical model with confirmed dimensions and daily scheduling capability | DB-04, FND-02 | 09, 18, 22, 26, 27 | None | Ready with configuration |
| KPI-02 | Implement confirmed KPI formulas, targets, ownership, correction/backfill, and drill-down calculations | KPI-01 | 09, 17, 22, 26, 27 | Non-blocking KPI configuration | Ready with configuration |
| RPT-01 | Implement report framework, authorised execution, and Excel/PDF rendering integration without report-specific fields | DB-04, SEC-01 | 11, 18, 21, 22, 27 | None | Ready with configuration |
| RPT-02 | Implement supplied Royal Packaging report mappings and exports; keep MB51/MB52 absent | RPT-01 | 11, 17, 22, 26, 27 | B-04: supplied report templates and data mappings | Blocked |

## PHASE 11 — Floot Realtime

| Task ID | Task name | Dependencies | Relevant architecture document | Blocking client decision | Implementation status |
|---|---|---|---|---|---|
| RT-01 | Implement post-commit Floot publishing adapter and publication-failure observability without authoritative state | FND-03, FND-02 | 02, 08, 20, 21, 27 | None | Ready with configuration |
| RT-02 | Implement authoritative PostgreSQL-backed resync reads for task, inventory, payroll, and KPI resources | RT-01, SEC-01 | 08, 12, 19, 20, 27 | None | Ready with configuration |
| RT-03 | Implement final event payload/version/subscription/retry/filter contract | RT-01, RT-02, SEC-02 | 08, 20, 26, 27 | Non-blocking realtime configuration | Ready with configuration |

## PHASE 12 — Testing

| Task ID | Task name | Dependencies | Relevant architecture document | Blocking client decision | Implementation status |
|---|---|---|---|---|---|
| TST-01 | Establish unit, integration, concurrency, realtime, security, and performance test harness | FND-02 | 14, 24, 27 | None | Ready |
| TST-02 | Test sessions/lockout, inventory no-negative/partial/reversal, photo metadata, damage threshold, and realtime failure/resync | SEC-01, INV-02, TRACE-02, QLT-01, RT-02 | 14, 24, 26, 27 | None | Ready with configuration |
| TST-03 | Test task guards, incentive allocation/formula, payroll approval, KPI calculations, and report outputs after business decisions/templates are supplied | WH-02, INC-02, PAY-03, KPI-02, RPT-02 | 14, 24, 27 | B-01, B-02, B-03, B-04 | Blocked |

## PHASE 13 — Deployment & Observability

| Task ID | Task name | Dependencies | Relevant architecture document | Blocking client decision | Implementation status |
|---|---|---|---|---|---|
| OPS-01 | Add structured logs, correlation IDs, transaction/realtime/photo/incentive/report failure metrics | FND-02 | 13, 20, 24, 27 | None | Ready |
| OPS-02 | Configure development/staging/production, secret management, database backups/restore verification, and CI/CD checks | FND-03, TST-01 | 02, 13, 14, 15 | None | Ready with configuration |
| OPS-03 | Establish load/performance measurement for warehouse, inventory, KPI, reporting, and realtime workloads | TST-01 | 09, 13, 14, 15 | None | Ready with configuration |

## Exact first implementation task

**FND-01 — Initialize the workspace package manifest, TypeScript project configuration, and package layout.** It is the smallest safe backend task: it implements no domain rule, schema, migration, API, or authorization decision, and it is required by every subsequent backend task.
