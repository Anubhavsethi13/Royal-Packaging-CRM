# Frontend Architecture

Phase 4 is a connected frontend product shell backed by typed local preview data. `frontend/src/app` owns routing and the responsive shell, `frontend/src/pages` owns route-level compositions and workflow forms, `frontend/src/components` owns reusable controls and confirmation behavior, and `frontend/src/styles` owns tokens and layout rules.

The mock layer is deliberately isolated in `frontend/src/mock`. `data.ts` is the preview source of truth and `repositories.ts` defines the replacement boundary for asynchronous API repositories. Pages consume domain-shaped records rather than inventing transport payloads. `frontend/src/api/contracts.ts` defines the frozen transport envelopes, request shapes, session shapes, and runtime validators for the future adapter. `frontend/src/state/auth.tsx` owns the mock session and permission UX only.

TanStack Query and the existing API client remain available for the later service layer. Global search uses the preview adapter, dashboard metrics use a repository-owned summary, and client/order forms model validation and success states without persistence. No screen writes to the database, runs business calculations, or treats local preview state as authoritative.

## State boundaries

- URL state: route parameters, active screens, and breadcrumb context.
- Local UI state: filters, tabs, dialogs, theme, and form submission feedback.
- Mock session state: authenticated demo identity and preview permissions.
- Server state: intentionally not connected in this phase.
