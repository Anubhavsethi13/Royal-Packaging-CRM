# Backend Contract Freeze

## Contract Status

**PARTIALLY FROZEN — BACKEND CONFIRMATION REQUIRED**

This audit is a repository evidence report for Phase 16. It does not implement backend behavior, change frontend behavior, or convert planned documentation into an API contract.

The only implemented domain-independent backend routes are `GET /api` and `GET /api/health/`. No client, order, inventory, task, employee, management, warehouse, authentication, authorization, report, or AI endpoint is currently implemented.

## Sources Reviewed

### Backend implementation

- `backend/src/app.ts`
- `backend/src/server.ts`
- `backend/src/config/env.ts`
- `backend/src/db/client.ts`
- `backend/src/middleware/error-handler.ts`
- `backend/src/middleware/validate.ts`
- `backend/src/utils/errors.ts`
- `backend/src/utils/errors.test.ts`
- `backend/src/modules/health/health.routes.ts`
- `backend/src/modules/health/health.service.ts`
- `prisma/schema.prisma`
- `prisma/migrations/0001_phase_1_foundation/migration.sql`

### Frontend implementation

- `frontend/src/api/client.ts`
- `frontend/src/api/contracts.ts`
- `frontend/src/api/repositories.ts`
- `frontend/src/state/auth.tsx`
- `frontend/src/state/repositories.tsx`
- `frontend/src/types/domain.ts`
- `frontend/src/pages/`
- `frontend/src/ai/`
- `frontend/src/mock/`
- `frontend/src/app/App.tsx`
- `frontend/src/app/routes.ts`
- `frontend/vite.config.ts`
- `.env.example`

### Documentation and project configuration

- `Docs/api/README.md`
- `Docs/api/authentication.md`
- `Docs/api/authorization.md`
- `Docs/api/domains.md`
- `Docs/api/errors.md`
- `Docs/api/pagination.md`
- `Docs/api/open-decisions.md`
- `Docs/frontend/api-contracts.md`
- `Docs/frontend/deployment.md`
- `Docs/frontend/release-readiness.md`
- `README.md`
- `PRODUCT.md`
- `REQUIREMENTS_REGISTER.md`
- `Build Docs/`
- `package.json`

Implementation and tests were treated as higher authority than planned or future-facing documentation.

## API Base URL

| Item | Evidence-based result |
| --- | --- |
| Development backend origin | `http://localhost:4000` by the backend `PORT` default and server log |
| Development API prefix | `/api` |
| Frontend development API base | `http://localhost:4000/api` when `VITE_API_URL` is absent |
| Implemented route prefix/version | `/api`; version prefix is **NOT CONFIRMED** |
| Production API URL | **NOT CONFIRMED** |

The backend CORS middleware accepts the configured `FRONTEND_ORIGIN`, defaulting to `http://localhost:5173`. Production origin, API origin, HTTPS, proxy behavior, and CORS policy are **NOT CONFIRMED**.

## Authentication

### Implemented evidence

**NOT IMPLEMENTED.** No `/auth/login`, `/auth/session`, `/auth/logout`, password reset route, auth controller, auth service, session middleware, cookie issuance, bearer parsing, or refresh mechanism exists in `backend/src`.

The Prisma schema contains `User`, `UserPassword`, `Session`, and `LoginAttempt` models, but database models are not API behavior and do not establish an authentication contract.

### Frontend/documentation expectation

The frontend documentation describes planned operations:

- `POST /auth/login` with `{ email, password }` returning `SessionResponse`.
- `GET /auth/session` returning `SessionResponse`.
- `POST /auth/logout` returning `204` or a safe acknowledgement.
- Password reset operations.

These paths are **NOT IMPLEMENTED** in the backend and therefore cannot be frozen for Phase 16.

Cookie versus bearer transport, `credentials: 'include'`, token storage, refresh, expiration behavior, session bootstrap, and production cookie attributes are **NOT CONFIRMED**.

The current frontend API-mode auth intentionally returns `api_auth_unavailable`; it does not claim a successful server session.

## RBAC

### Implemented evidence

**NOT IMPLEMENTED at the HTTP layer.** No backend authorization middleware or protected route exists.

The Prisma schema contains:

- `UserRole`: `admin`, `user`.
- `AccessRole`, `AccessPermission`, `AccessRolePermission`, and `UserAccessRole` persistence models.

No seeded role identifiers, permission identifiers, permission evaluation code, or endpoint-to-permission mapping exists in the backend source.

### Frontend/documentation vocabulary

The frontend uses preview-only role labels `admin`, `supervisor`, and `operator`, plus view/action permission strings such as `view:dashboard` and `action:create`. These are not confirmed backend role or permission identifiers. UI route guards and hidden buttons do not prove authorization.

Backend roles, permissions, affected endpoints, and 401/403 enforcement are **NOT CONFIRMED**.

## Common Response Contracts

### Confirmed implemented foundation responses

`GET /api` returns a JSON body with this implementation shape:

```json
{
  "data": {
    "service": "royal-packaging-api",
    "phase": "foundation"
  }
}
```

`GET /api/health/` returns:

```json
{
  "data": {
    "status": "ok",
    "service": "royal-packaging-api",
    "phase": "foundation",
    "timestamp": "<ISO 8601 string>"
  }
}
```

These are foundation/status payloads, not list or domain DTO contracts.

### List response

The frontend expects:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 0,
    "totalPages": 0,
    "hasNext": false,
    "hasPrevious": false
  }
}
```

No backend list endpoint exists, so this shape is **NOT IMPLEMENTED** by the backend. It remains a frontend contract expectation only.

### Mutation response

The frontend expects `{ data, requestId }`. No backend mutation endpoint exists, so this shape is **NOT IMPLEMENTED**.

### DTO and serialization rules

No backend DTO or serializer layer exists. Prisma field names and database types must not be treated as transport DTOs. ID formats, nullable transport fields, decimal serialization, timestamps, units, and relationship expansion are **NOT CONFIRMED**.

## Error Contract

### Actual implemented backend error shape

The backend error handler emits:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Resource is already in use.",
    "details": {}
  }
}
```

Known behavior:

- Unknown errors become HTTP `500` with code `INTERNAL_ERROR` and a generic message.
- Unknown routes become HTTP `404` with `{ "error": { "code": "NOT_FOUND", "message": "Route not found." } }`.
- `validateBody()` can produce HTTP `400` with code `VALIDATION_ERROR` and Zod `flatten()` output in `details`, but no route currently mounts this middleware.
- The error utility test verifies a `409 CONFLICT` serialization shape, but no production route currently emits that error.

### Status coverage

| Status | Backend evidence | Contract result |
| --- | --- | --- |
| 400 | Unmounted `validateBody()` helper | Implemented helper only; route behavior **NOT CONFIRMED** |
| 401 | No route or middleware | **NOT IMPLEMENTED** |
| 403 | No route or middleware | **NOT IMPLEMENTED** |
| 404 | Global unknown-route handler | Confirmed as `{ error: { code, message } }` |
| 409 | `ApiError` type and unit test | Serializer confirmed; domain usage **NOT IMPLEMENTED** |
| 422 | No implementation | **NOT IMPLEMENTED** |
| 429 | Error code exists in type union only | **NOT IMPLEMENTED** |
| 500+ | Global unknown-error handler | Confirmed generic `500 INTERNAL_ERROR` shape |

### Conflict with frontend expectation

The frontend expects top-level `{ code, message, errors, fieldErrors, requestId }`. The implemented backend nests `code`, `message`, and `details` under `error`, has no `requestId`, and does not implement the documented `errors[]` validation format. This is a **CONTRACT CONFLICT**. The frontend must not silently normalize this as a frozen domain contract until backend behavior is confirmed.

## Resource Contracts

The following sections report actual backend implementation status first, then the frontend expectation. Database models are listed only as storage evidence and do not upgrade an endpoint to implemented status.

### Clients

- Backend endpoint: **NOT IMPLEMENTED**.
- Frontend expectation: read list/detail through a configured repository; planned path family is plural lowercase, but exact path/version is **NOT CONFIRMED**.
- Auth, permissions, query parameters, request/response DTO, errors, ID format, timestamps, and nullable fields: **NOT CONFIRMED**.
- Prisma storage evidence: `Client` model with UUID string ID, account code, contact fields, optional JSON specs, and optional open order count. This is not a transport contract.

### Orders

- Backend endpoint: **NOT IMPLEMENTED**.
- Frontend expectation: list/detail and future create/update/cancel adapters.
- Exact path, lifecycle transitions, request bodies, item DTO, pagination/search/filter/sort, auth, permissions, errors, quantities, units, timestamps, and cancellation semantics: **NOT CONFIRMED**.
- Prisma storage evidence: `Order`, `OrderStatus`, `Priority`, and client relation only.

### Inventory

- Backend endpoint: **NOT IMPLEMENTED**.
- Frontend expectation: read list/detail; movement and reservation behavior is intentionally not wired.
- Exact path, query parameters, DTO, quantity/unit/weight/volume semantics, movement, reservation, reversal, reconciliation, negative-stock, auth, permissions, and errors: **NOT CONFIRMED**.
- Prisma storage evidence: `InventoryItem`, `InventoryMovement`, `InventoryStatus`, and `MovementType`; fields do not establish business rules.

### Tasks

- Backend endpoint: **NOT IMPLEMENTED**.
- Task actions assign, start, pause, resume, reassign, cancel, reopen, and complete: **NOT IMPLEMENTED**.
- Exact list/detail paths, lifecycle states, request/response bodies, idempotency/conflict rules, auth, permissions, and errors: **NOT CONFIRMED**.
- Prisma storage evidence: `Task`, `TaskStatus`, `TaskType`, assignment and inventory/client relations.

### Employees

- Backend endpoint: **NOT IMPLEMENTED**.
- Frontend expectation: read list/detail; employee mutations remain unavailable in API mode.
- Exact path, DTO, role identifiers, work data, auth, permissions, query parameters, and errors: **NOT CONFIRMED**.
- Prisma storage evidence: `Employee` and `EmployeeRole` with UUID string IDs and optional user relation.

### KPIs

- Backend endpoint: **NOT IMPLEMENTED**.
- Formula ownership, target/actual calculation, trend, period, history, recalculation, and timestamps: **NOT CONFIRMED**.
- Frontend displays illustrative preview records only; no backend-compatible DTO exists.

### Incentives

- Backend endpoint: **NOT IMPLEMENTED**.
- Rules, eligibility, progress, payout, approval, overrides, status, permissions, and formulas: **NOT CONFIRMED**.
- Prisma storage evidence: `IncentiveRule` and `IncentiveEvent`; no service or route implements their semantics.

### Payroll

- Backend endpoint: **NOT IMPLEMENTED**.
- Period/detail, approval, dispute, export, payment integration, and permissions: **NOT CONFIRMED**.
- Prisma storage evidence: `PayrollLedger` and `PayrollStatus`; no payroll service or route exists.

### Reports

- Backend endpoint: **NOT IMPLEMENTED**.
- Report list/detail, generation, export, download, scheduling, file content type, and streaming behavior: **NOT CONFIRMED**.
- The report UI is metadata/preview-only and is not evidence of a report API.

### Audit

- Backend endpoint: **NOT IMPLEMENTED**.
- Immutable event creation, list/detail, filters, before/after payloads, export, retention, and permissions: **NOT CONFIRMED**.
- Prisma storage evidence: `AccessAuditLog`; no audit service or route exists.

### Warehouse

- Backend endpoint: **NOT IMPLEMENTED**.
- Depot/zone/row/aisle/location hierarchy, occupancy, blocked locations, and permissions: **NOT CONFIRMED**.
- Prisma storage evidence is limited to location-like string fields and `PalletAsset`/`DockSchedule`; no warehouse API exists.

### Locations

- Backend endpoint: **NOT IMPLEMENTED**.
- Location identifiers, hierarchy, capabilities, status, occupancy, and filters: **NOT CONFIRMED**.

### Loading/Unloading

- Backend endpoint: **NOT IMPLEMENTED**.
- Loading, unloading, quantity confirmation, box quantities, corrections, failed uploads, photos, evidence, acceptance, and metadata: **NOT IMPLEMENTED**.
- The current frontend surface is explicitly simulated/preview-only.

### Operations

- Backend endpoint: **NOT IMPLEMENTED**.
- Operational dashboard aggregation, freshness, events, and permissions: **NOT CONFIRMED**.

## AI Contract

**NOT IMPLEMENTED.** No AI endpoint, service, controller, route, response schema, recommendation status, confidence field, evidence schema, model version, timeout policy, or approval/dismiss/apply action exists in the backend or API documentation.

The frontend AI page intentionally returns an explicit API-unavailable state and uses deterministic mock recommendations only in mock mode. No AI DTO may be inferred from the preview shape.

## Frontend ↔ Backend Compatibility Matrix

| Domain | Backend status | Frontend status | Compatible? | Required action |
| --- | --- | --- | --- | --- |
| Clients | NOT IMPLEMENTED | Read slice and API adapter ready; mock active | No | Backend list/detail contract and configuration |
| Orders | NOT IMPLEMENTED | Read slice and mutation boundary ready; mock active | No | Backend resource/lifecycle contract |
| Inventory | NOT IMPLEMENTED | Read slice and API adapter ready; movement boundary preserved | No | Backend read and movement contract |
| Tasks | NOT IMPLEMENTED | Read slice ready; actions remain preview-only | No | Backend read and lifecycle contract |
| Employees | NOT IMPLEMENTED | Read slice ready; mock active | No | Backend read/role DTO contract |
| KPIs | NOT IMPLEMENTED | Read-only management slice; mock active | No | Backend calculation and read contract |
| Incentives | NOT IMPLEMENTED | Read-only management slice; mock active | No | Backend rule/event contract |
| Payroll | NOT IMPLEMENTED | Read-only management slice; mock active | No | Backend ledger/approval contract |
| Reports | NOT IMPLEMENTED | Catalog/preview UI; mock active | No | Backend metadata/export contract |
| Audit | NOT IMPLEMENTED | Read-only management slice; mock active | No | Backend immutable audit contract |
| Warehouse | NOT IMPLEMENTED | Explicit API-unavailable boundary | No | Backend warehouse contract |
| Locations | NOT IMPLEMENTED | Explicit API-unavailable boundary | No | Backend location hierarchy contract |
| Loading/Unloading | NOT IMPLEMENTED | Simulated mock boundary; no API fallback | No | Backend evidence/workflow contract |
| Operations | NOT IMPLEMENTED | Explicit API-unavailable boundary | No | Backend aggregation/freshness contract |
| Authentication | NOT IMPLEMENTED | Mock boundary; API sign-in unavailable | No | Backend session/auth transport |
| RBAC | NOT IMPLEMENTED | Frontend preview vocabulary only | No | Backend roles/permissions/enforcement |
| AI | NOT IMPLEMENTED | Mock preview and explicit API unavailable | No | AI endpoint and response contract |

The foundation/status endpoints are compatible only with direct health/status checks; they do not satisfy any resource repository.

## P0 Blockers

### Backend blockers

- All domain resource endpoints are absent.
- Authentication/session endpoints and enforcement are absent.
- RBAC middleware and permission mappings are absent.
- AI endpoint/service is absent.
- Task lifecycle and inventory movement contracts are absent.

### Contract conflict

- Backend errors use `{ error: { code, message, details } }`; frontend documentation expects top-level fields, `errors[]`, and `requestId`.

### Deployment blockers

- Production API URL, API versioning, HTTPS, proxy behavior, and CORS configuration are **NOT CONFIRMED**.

## P1 Blockers

- Frontend `ApiRepositoryConfiguration` cannot be populated safely until backend resource paths, response envelopes, and decoders are confirmed.
- Frontend API authentication cannot be enabled until transport, credentials, refresh, and session semantics are confirmed.
- Decimal, timestamp, nullable-field, relation, and ID serialization rules are not confirmed for any domain DTO.
- Report download/export behavior is absent.
- AI response and failure semantics are absent.

## P2 Follow-ups

- Decide whether the frontend API client should support the backend's nested error envelope or whether the backend will conform to the frontend documented envelope.
- Confirm production hosting rewrite behavior and environment injection.
- Confirm bundle/performance budgets and browser E2E tooling.
- Remove or quarantine legacy mock-only page implementations after API integration routing is fully confirmed.

## Backend Team Confirmation Required

- Production API URL and API version/prefix.
- Exact resource paths for all fourteen domains.
- List/detail envelopes, pagination semantics, query parameter allowlists, sort/filter names, DTOs, nullable fields, IDs, timestamps, decimal/unit serialization, and relation expansion.
- Mutation bodies, mutation envelopes, request IDs, idempotency, and conflict behavior.
- Error envelope decision: nested backend `error` versus frontend documented top-level fields; validation and request-ID format.
- Authentication endpoints, cookie versus bearer transport, credentials inclusion, token storage, refresh, expiry, logout, CORS, and cookie attributes.
- Actual roles, permissions, endpoint authorization, and 401/403 behavior.
- Task lifecycle actions and allowed transitions.
- Inventory reservation, movement, reversal, reconciliation, units, and negative-stock semantics.
- Loading/unloading quantity, correction, photo, evidence, and trace behavior.
- Warehouse and location hierarchy, occupancy, blocked/restricted state, and identifiers.
- KPI calculation, history, ownership, and recalculation policy.
- Incentive formulas, approval/override rules, and payroll authority/disputes.
- Report generation, export/download content types, streaming, and scheduling.
- AI endpoint, request, response, recommendation status, evidence, confidence, model/service version, timeout, and action semantics.
- Production CORS, HTTPS, proxy, rate limits, observability, and request-correlation policy.

## Phase 16 Integration Sequence

1. Backend publishes the confirmed resource and common error contracts, including the error-envelope decision.
2. Backend publishes authentication/session transport and CORS behavior; frontend integrates the API client/session boundary.
3. Frontend wires the confirmed API repository configuration and validates one read-only vertical slice with real responses.
4. Integrate Clients and Orders after their DTOs, list/detail envelopes, and authorization are confirmed.
5. Integrate Inventory and Tasks only after movement/lifecycle semantics and conflict behavior are confirmed.
6. Integrate Employees and management read surfaces after DTO and permission confirmation.
7. Integrate Warehouse, Locations, Loading/Unloading, and Operations after their hierarchy/evidence/freshness contracts are confirmed.
8. Integrate Reports after download/export behavior is confirmed.
9. Integrate the AI recommendation UI only after the AI endpoint and response contract are implemented and tested.
10. Run the production API-mode smoke, auth, RBAC, error, responsive, and deployment checks.

No Phase 16 source implementation should begin for a domain whose contract remains **NOT CONFIRMED**.

## Contract Freeze Rules

- No frontend developer may invent an endpoint.
- No frontend developer may invent a DTO.
- No frontend developer may invent an auth mechanism.
- No frontend developer may invent permissions.
- No frontend developer may silently fall back to mock data in API mode.
- Backend authorization remains authoritative.
- Missing contracts must be marked NOT CONFIRMED or NOT IMPLEMENTED.
- Contract changes after this freeze require explicit documentation.
- Frontend integration must consume confirmed contracts only.
