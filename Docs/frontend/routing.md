# Routing

Routes are declared in `frontend/src/app/routes.ts`. Workspace routes render inside the responsive shell and pass through `ProtectedRoute`; authentication support routes render without the shell.

Workspace areas include dashboard, clients, orders, warehouse, locations, loading/unloading, tasks, inventory, employees, KPI dashboard, incentives, payroll, reports, audit logs, settings, and roles/permissions. Detail routes use stable IDs such as `/clients/:clientId`, `/orders/:orderId`, `/tasks/:taskId`, `/inventory/:itemId`, `/employees/:employeeId`, and `/kpis/:kpiId`.

Auth routes cover login, register, forgot password, reset password, unauthorized, and session expired states. The current provider starts in a clearly labelled demo session so the product surface is immediately inspectable; sign out redirects to login and protected routes redirect unauthenticated users. The shell command palette searches both screens and repository-backed preview records, then navigates directly to supported detail routes.
