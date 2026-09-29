# Routing

Routes are declared in `frontend/src/app/routes.ts`. Workspace routes render inside the responsive shell and pass through `ProtectedRoute`; authentication support routes render without the shell.

Workspace areas include dashboard, clients, orders, warehouse, locations, loading/unloading, tasks, inventory, employees, KPI dashboard, incentives, payroll, reports, audit logs, settings, and roles/permissions. Detail routes use stable IDs such as `/clients/:clientId`, `/orders/:orderId`, `/tasks/:taskId`, `/inventory/:itemId`, `/employees/:employeeId`, and `/kpis/:kpiId`.

Auth routes cover login, register, forgot password, reset password, unauthorized, and session expired states. The current provider starts in a clearly labelled demo session so the product surface is immediately inspectable; sign out redirects to login and protected routes redirect unauthenticated users. The shell command palette searches both screens and repository-backed preview records, then navigates directly to supported detail routes.

## Daily shift routes

| Route | Page | Permission (backend action) |
|---|---|---|
| `/my-shifts` | Personal shift dashboard: today, historical KPIs, history table | `SHIFTS:VIEW` (`shift:read_own`) |
| `/my-shifts/new` | Log a shift (warehouse and truck type options come from `GET /shift-entries/options`) | `SHIFTS:CREATE` (`shift:create`) |
| `/shift-kpi-summary` | Management summary of shift KPIs per employee, with date, employee, warehouse, and truck type filters | `KPI_SUMMARY:VIEW` (`kpi:read_all`) |

The screens live in `frontend/src/shifts/`. In `mock` data mode they run against an in-memory gateway; in `api` mode they call `/shift-entries*` and `/kpi/*summary`. The backend remains the authority for every permission and validation rule. Live sessions only see these routes once the database has been re-seeded with the new permission codes (`npm run db:seed`, idempotent).
