# F9.6 KPI Backend Contract Audit

**Audit date:** 2026-09-17  
**Scope:** Read-only reconciliation of the implemented backend and frontend F8/F9 KPI read models.  
**Authority:** Executable backend code and Prisma schema take precedence over planning documents. Database models are storage evidence only, not HTTP contracts.

## Executive Summary

The backend currently provides only two foundation routes: `GET /api` and `GET /api/health/`. It has no KPI configuration or KPI result module, route, controller, service, DTO, validation schema, persistence model, calculation service, historical-result implementation, authentication middleware, or RBAC enforcement.

Frontend F8/F9 is therefore a complete mock/read-model implementation with an intentionally unavailable API boundary. No F9 endpoint, result field, source-reference field, query parameter, permission, scope rule, or authentication transport can be considered backend-confirmed today.

## Sources Inspected

### Backend

- `backend/src/app.ts`
- `backend/src/server.ts`
- `backend/src/config/env.ts`
- `backend/src/db/client.ts`
- `backend/src/middleware/error-handler.ts`
- `backend/src/middleware/validate.ts`
- `backend/src/modules/health/health.routes.ts`
- `backend/src/modules/health/health.service.ts`
- `backend/src/utils/errors.ts`
- `prisma/schema.prisma`
- `prisma/migrations/0001_phase_1_foundation/migration.sql`

### Frontend KPI and API boundary

- `frontend/src/kpi/kpi-domain.ts`
- `frontend/src/kpi/kpi-data.ts`
- `frontend/src/kpi/kpi-config-store.ts`
- `frontend/src/kpi/kpi-governance.ts`
- `frontend/src/kpi/source-preview.ts`
- `frontend/src/kpi/kpi-result-domain.ts`
- `frontend/src/kpi/kpi-result-repository.ts`
- `frontend/src/kpi/kpi-result-data.ts`
- `frontend/src/kpi/source-traceability.ts`
- `frontend/src/kpi/result-pages.tsx`
- `frontend/src/api/client.ts`
- `frontend/src/api/contracts.ts`
- `frontend/src/api/repositories.ts`
- `frontend/src/state/auth.tsx`
- `frontend/src/state/repositories.tsx`
- `frontend/src/types/v1.ts`

## Backend Inventory

| Area | Evidence | Status |
| --- | --- | --- |
| Framework | Express 5 app in `backend/src/app.ts` | IMPLEMENTED |
| API entry point | `backend/src/server.ts`, default port `4000` | IMPLEMENTED |
| Database client | Prisma PostgreSQL client in `backend/src/db/client.ts` | IMPLEMENTED |
| Routes | Foundation and health routes only | IMPLEMENTED |
| Controllers/services | Health service only | PARTIALLY IMPLEMENTED |
| DTOs / request validation | Generic `validateBody()` helper only; no KPI schemas or route use | PARTIALLY IMPLEMENTED |
| Authentication | No route, parser, middleware, session handling, cookie, or bearer handling | NOT IMPLEMENTED |
| RBAC | No route middleware or evaluator | NOT IMPLEMENTED |
| KPI module / reporting module | No backend source module exists | NOT IMPLEMENTED |
| Task/event API module | No backend source module exists | NOT IMPLEMENTED |

## Implemented Endpoint Contract

| Method | Exact path | Handler | Auth / permissions / scope | Response | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `/api` | Inline handler in `backend/src/app.ts` | None | `{ "data": { "service": "royal-packaging-api", "phase": "foundation" } }` | IMPLEMENTED |
| GET | `/api/health/` | `healthRouter` -> `getHealthPayload()` | None | `{ "data": { "status": "ok", "service": "royal-packaging-api", "phase": "foundation", "timestamp": "<ISO-8601>" } }` | IMPLEMENTED |

Every other path reaches the global `404` handler. No route currently mounts `validateBody()`.

## KPI Configuration API

| Capability | Endpoint / schema / persistence | Status |
| --- | --- | --- |
| List / detail | None | NOT IMPLEMENTED |
| Create / update | None | NOT IMPLEMENTED |
| Activate / deactivate / archive | None | NOT IMPLEMENTED |
| Duplicate / clone | None | NOT IMPLEMENTED |
| Version history / detail | None | NOT IMPLEMENTED |
| Authorization / scope | None | NOT IMPLEMENTED |

`prisma/schema.prisma` contains no KPI configuration, rule, threshold, version, period, or governance model. The F8 configuration store is frontend mock state only.

## KPI Result API and Calculation

There is no `KPIResult` Prisma model, result repository, route, service, DTO, filter, pagination implementation, historical model, or calculation code. Consequently, result list, detail, employee list, history, sorting, and filtering are all **NOT IMPLEMENTED**.

| Metric / operation | Executable backend calculation evidence | Status |
| --- | --- | --- |
| `BOXES_HANDLED` | None | NOT IMPLEMENTED |
| `TIME_TAKEN` | None | NOT IMPLEMENTED |
| `SLA_COMPLIANCE` | None | NOT IMPLEMENTED |
| Target comparison / achievement | None | NOT IMPLEMENTED |
| Score / weighted score / ranking | None | NOT IMPLEMENTED |
| Period aggregation / history | None | NOT IMPLEMENTED |

The `Task` storage model has `durationMinutes`, `qualityScore`, `damageRate`, `startedAt`, and `completedAt`. `InventoryMovement` has a timestamp and quantity. These fields are not a KPI calculation or result contract.

## Frontend F9 Result Field Reconciliation

| Frontend F9 field | Backend evidence | Status | Required integration action |
| --- | --- | --- | --- |
| `id`, `resultId` | No result model or DTO | FRONTEND ONLY | Confirm identifier policy and detail route ID |
| `employeeId`, `employee` | `Employee` storage model only | BACKEND DIFFERENCE | Publish result DTO and allowed employee relation shape |
| `kpiId`, `kpiName`, `ruleVersionId` | No KPI models | FRONTEND ONLY | Implement/publish configuration and rule-version relations |
| `metric`, `category`, `operation`, `scope` | No KPI enum or DTO | FRONTEND ONLY | Publish exact backend enum vocabulary |
| `period.kind`, `period.start`, `period.end` | No period model or calculation | FRONTEND ONLY | Publish boundary, timezone, and ISO serialization rules |
| `target`, `actual`, `unit`, `direction` | No result representation | FRONTEND ONLY | Publish result value envelope and numeric serialization |
| `status` | No result status enum | FRONTEND ONLY | Publish statuses and lifecycle semantics |
| `sourceReferences` | No KPI source-reference model | FRONTEND ONLY | Publish source DTO and nullable field semantics |
| `calculatedAt`, `calculationVersion` | No calculation persistence | FRONTEND ONLY | Publish calculation provenance fields or mark absent |
| `isMock` | Frontend display marker | FRONTEND ONLY | Do not send as an authoritative backend field |

There are no backend-only KPI result fields because no backend KPI result DTO exists.

## Source Reference Contract

No backend source-reference implementation exists. The frontend expects the following read-only reference shape; every field is frontend-only until a backend DTO is published.

| Frontend field | Backend field / nullable status | Required mapping |
| --- | --- | --- |
| `sourceRecordId` | Absent | Confirm stable operational-record identifier |
| `taskId` | Absent as a KPI source field | Confirm whether task relation is required per source type |
| `employeeId`, `employeeName` | Absent as a KPI source field | Confirm source employee identity and display expansion |
| `sourceType`, `operationType` | Absent | Confirm enums and case |
| `timestamp` | Absent | Confirm source event timestamp and timezone |
| `warehouse`, `location` | Absent | Confirm field choice and nullability |
| `quantity.value`, `quantity.unit` | Absent | Confirm BOX-only KPI source representation |
| `durationSeconds` | Absent | Confirm unit; schema has unrelated `Task.durationMinutes` |
| `slaTarget`, `slaStatus` | Absent | Confirm field/value contract |

The frontend must retain its current structural-warning behavior for missing or mismatched fields. It must not infer them from task or inventory storage fields.

## Enum, Unit, Period, and Status Reconciliation

| Contract area | Frontend F8/F9 | Actual backend | Reconciliation |
| --- | --- | --- | --- |
| Metrics | `BOXES_HANDLED`, `TASKS_COMPLETED`, `TIME_TAKEN`, `SLA_COMPLIANCE` | No KPI metric enum | Backend must publish one |
| Operations | `TASK`, `WAREHOUSE`, `LOADING`, `UNLOADING` | `TaskType`: lowercase `loading`, `packing`, `putaway`, `staging`, `unloading`, `wrapping`; `MovementType`: lowercase `load`, `putaway`, `stage`, `transfer`, `unload` | No direct match is confirmed; explicit mapper/DTO required |
| Units | `BOX`, `COUNT`, `TASK`, `DURATION`, `PERCENTAGE`; F9 displays BOX, supplied duration, and supplied percentages | Generic nullable `unit: String?` on `Order`/`InventoryItem`; `Task.durationMinutes`; no KPI unit enum | Backend must define KPI units and duration representation |
| Forbidden operational units | F9 quantity is BOX-only | Storage has `weightKg`, `volumeM3` on orders, inventory, movements, and tasks | These are storage fields, not F9 KPI quantities; they must not leak into the KPI source DTO without a separately approved contract |
| Periods | `DAILY`, `WEEKLY`, `MONTHLY`, `CUSTOM` with ISO start/end strings | No period enum/boundary/timezone handling | Backend must publish all rules |
| Result statuses | `PENDING`, `AVAILABLE`, `NOT_AVAILABLE` | No KPI result status enum | Backend must publish statuses/transitions |

## Authentication, RBAC, and Scope

### Actual backend behavior

No authentication transport exists. There is no cookie issuance, bearer parsing, JWT handling, session lookup middleware, authorization middleware, permission evaluator, or protected KPI route.

Prisma storage contains `User`, `UserPassword`, `Session`, `LoginAttempt`, `AccessRole`, `AccessPermission`, `AccessRolePermission`, and `UserAccessRole`, but no executable use. Its persisted role values are `admin` and `user`, while employee role values are `admin`, `loader`, `operator`, `picker`, and `supervisor`.

### Frontend difference

The frontend mock session uses uppercase `SUPER_ADMIN`, `ADMIN`, `SUPERVISOR`, and `EMPLOYEE`, plus scopes `OWN`, `TEAM`, `DEPARTMENT`, `LOCATION`, `ORGANIZATION`, and `CUSTOM`. This is not a confirmed backend vocabulary. Existing OWN filtering is a UI safeguard only; backend result scope enforcement is **NOT IMPLEMENTED**.

There are no implemented permissions for viewing/editing configurations, governance actions, viewing own/team/department/location/organization results, or source records.

## Pagination, Filtering, and Error Contract

No backend KPI list exists, so no result query parameters, pagination, sorting, filters, or response envelope are implemented. The frontend expects page-based `data` plus `meta` envelopes, but that is documentation/frontend infrastructure rather than an executed backend contract.

Actual backend error responses differ from the frontend parser:

```json
{ "error": { "code": "NOT_FOUND", "message": "Route not found." } }
```

`ApiError` serialization can add `details`, e.g. `{ "error": { "code": "CONFLICT", "message": "...", "details": {} } }`. Unknown errors become `500 INTERNAL_ERROR`. The unmounted validation helper would emit `400 VALIDATION_ERROR` with Zod `flatten()` data in `details`.

The frontend client instead parses top-level `{ code, message, errors, fieldErrors, requestId }`. This is a confirmed common-error-envelope conflict. No `requestId`, 401, 403, 422, 429, or KPI-specific error response is implemented by the backend.

## Date and Time Contract

The only confirmed serialized timestamp is `GET /api/health/`'s `new Date().toISOString()` value. Prisma DateTimes exist in storage, but response formatting, UTC policy, period boundaries, `calculatedAt`, and source event timestamp semantics are not implemented for KPIs.

## Legacy Contract

`frontend/src/types/v1.ts` contains a legacy `KpiResult` with `metricScores`, `weightedScore`, `penalties`, `finalScore`, `achievementPercentage`, `performanceGrade`, review/verification fields, and `sources`.

F9 deliberately uses a distinct `KpiResultReadModel` without scoring fields. The backend has no KPI result contract, so it neither matches nor formally conflicts with either model. Backend work must not treat the legacy model as the F9 transport contract without an explicit contract decision.

## Backend Capability Matrix

| Capability | Status |
| --- | --- |
| KPI configuration | NOT IMPLEMENTED |
| KPI versions | NOT IMPLEMENTED |
| KPI governance | NOT IMPLEMENTED |
| KPI result model | NOT IMPLEMENTED |
| KPI result API | NOT IMPLEMENTED |
| KPI calculation | NOT IMPLEMENTED |
| KPI history | NOT IMPLEMENTED |
| KPI source references | NOT IMPLEMENTED |
| KPI authorization | NOT IMPLEMENTED |
| KPI scope | NOT IMPLEMENTED |
| KPI verification | NOT IMPLEMENTED |
| KPI scoring | NOT IMPLEMENTED |
| Incentives | NOT IMPLEMENTED |
| Payroll | NOT IMPLEMENTED |

## Risks and Required Integration Sequence

1. Backend must first publish KPI configuration/result storage and a confirmed read-only result DTO; no frontend endpoint may be guessed.
2. Agree the common error envelope before enabling F9 API mode. Either backend emits the frontend top-level envelope or the frontend client gets an explicit, tested adapter for the nested backend envelope.
3. Publish auth transport, session shape, backend role/permission vocabulary, and server-side scope enforcement.
4. Publish result-list/detail paths, pagination/query names, source-reference fields, units, periods, statuses, and ISO/timezone rules.
5. Implement and test one authorized result list/detail vertical slice with source references, then configure `ApiRepositoryConfiguration.kpiResults` and add a strict decoder.
6. Integrate history only after period and ordering guarantees are specified. Keep frontend trend presentation-only.

## Audit Boundary

This audit created this documentation file only. It made zero backend changes and zero frontend application-code changes.
