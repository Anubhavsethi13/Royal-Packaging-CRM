# Frontend API Contract Freeze

Phase 6 freezes the boundary the future backend must satisfy without implementing that backend. The reference product remains the React UI. Today it reads deterministic snapshots from `frontend/src/mock/preview.ts`, backed by the typed repository interfaces in `frontend/src/mock/repositories.ts`.

## Architecture

```text
Frontend UI -> query/state layer -> repository interface -> API adapter -> frozen transport contract -> future backend
```

The mock adapter and a future API adapter must implement the same repository-facing result shape. The UI must not learn whether a record came from a fixture or HTTP. `frontend/src/api/contracts.ts` contains transport envelopes, request shapes, session shapes, and runtime validators; `frontend/src/types/domain.ts` remains the UI/domain vocabulary.

## Current Inventory

Every current mock repository exposes only:

- `peek(): T[]` for synchronous preview snapshots.
- `list(query?: ListQuery): Promise<ListResponse<T>>` with search and pagination.
- `getById(id: string): Promise<T | undefined>`.

Repositories exist for clients, orders, inventory, employees, tasks, KPIs, incentives, payroll, audits, and reports. There are no current repository create/update/delete methods. Forms and action menus are explicitly local preview interactions. `searchPreview()` is a read-only mock search adapter for the command palette.

## Conventions

- HTTP methods: `GET` for reads, `POST` for creates and named domain actions, `PATCH` for partial updates, and `DELETE` only where a future domain policy explicitly permits it.
- Resource paths: plural lowercase resources under a versioned deployment base such as `/api/v1/clients`. The current `VITE_API_URL` default remains `/api`; no endpoint is implemented by this phase.
- IDs are opaque strings. Clients must not infer database shape from them.
- Transport timestamps are ISO 8601 UTC strings. Date-only values use `YYYY-MM-DD`.
- JSON request and response bodies use `data` for resource payloads and `meta` for list metadata.
- Empty collections return `data: []`, not `null`. A successful no-content mutation may return `204`.
- Errors use the standardized shape in `errors.md`; stack traces and database details never cross the API boundary.

## Contract Documents

- [Domains and repository mapping](domains.md)
- [Authentication](authentication.md)
- [Authorization](authorization.md)
- [Errors](errors.md)
- [Pagination, filtering, and sorting](pagination.md)
- [Open business decisions](open-decisions.md)
- [Frontend assumptions](assumptions.md)

## Integration Strategy

The future adapter should map `ApiListEnvelope<T>` to the existing `ListResponse<T>` (`items`, `page`, `pageSize`, `total`, `stale`) and map `ApiError` into current form and alert states. Dependency injection or a single configured adapter should select mock versus API repositories. No UI component should import an API client directly.

This freeze covers only what the frontend can depend on. Workflow rules, financial formulas, concurrency, infrastructure, and hardware remain open or deferred.
