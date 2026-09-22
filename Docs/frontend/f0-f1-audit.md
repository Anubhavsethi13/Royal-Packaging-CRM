# Frontend F0 F1 Audit

## Audit status

The frontend audit found four V1 alignment gaps: provisional lowercase roles, hard-coded preview permission assumptions, operational data expressed in non-BOX units, and missing typed boundaries for the V1 task/KPI lifecycle. The repository/provider and mock/API architecture were suitable for incremental cleanup and were preserved.

## Existing architecture

- Routing and protected navigation: `frontend/src/app/App.tsx`, `frontend/src/app/routes.ts`.
- Authentication state: `frontend/src/state/auth.tsx`; mock-only session with fixed role permissions.
- Repository selection: `frontend/src/state/repositories.tsx`; explicit mock/API modes with no fallback.
- API transport and adapters: `frontend/src/api/client.ts`, `frontend/src/api/repositories.ts`.
- Domain types: `frontend/src/types/domain.ts`.
- Preview data: `frontend/src/mock/data.ts`, `frontend/src/mock/repositories.ts`, `frontend/src/mock/task-preview.ts`.
- Task, employee, management, operational, and AI pages remain component-driven and reusable.

## F0 findings

- The backend has no domain API routes; this phase therefore only prepares frontend contracts.
- Frontend roles were `admin`, `supervisor`, and `operator`, conflicting with V1 `SUPER_ADMIN`, `ADMIN`, `SUPERVISOR`, and `EMPLOYEE`.
- Frontend permission arrays were hard-coded preview policy rather than server-supplied role/permission/scope data.
- Inventory and task previews used sheets, rolls, units, meters, kilograms, and cubic meters.
- Existing timer and SLA values were display-only strings.
- KPI, incentive, payroll, and audit records were mock presentation data, not calculated or verified results.
- Existing Prisma/backend fields were treated as legacy/backend evidence only and were not changed.

## F1 changes made

- Added `frontend/src/types/v1.ts` with V1 roles, permission actions, data scopes, BOX quantity, task lifecycle, task evidence/output/verification/correction, and KPI DTO types.
- Updated mock auth session vocabulary to V1 roles and added roles, permissions, and scopes to the session shape.
- Extended frontend API contract types for V1 session, role, scope, task, and KPI DTOs without creating endpoints.
- Updated mock operational order, inventory, and task examples to BOX quantities.
- Removed weight and volume from the active inventory/task presentation path while retaining only explicitly named legacy compatibility fields in domain types.
- Added source metadata to KPI results through the V1 DTO boundary (`mock` or `api`); no KPI calculation was added.
- Preserved repository provider, API adapter, routes, UI components, loading/error/empty/not-found states, and no-fallback behavior.

## Remaining blockers

- Backend authentication, role/permission resolution, data scope enforcement, task lifecycle, event logging, KPI calculation, verification, incentives, payroll, and audit APIs remain unimplemented.
- Backend must confirm final DTOs, permission codes, scopes, status transitions, BOX semantics, and error/session transport before API mode is enabled.
- Existing legacy backend/Prisma weight and volume columns remain untouched by design.
