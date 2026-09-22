# Phase 1 — Foundation Scope

This file defines the exact boundary of Phase 1.

## Required

### Frontend foundation

- React
- TypeScript
- React Router
- React Query
- Application providers
- Global styling
- Design tokens
- Light/dark theme foundation
- Responsive layout foundation
- Reusable UI components

### Backend foundation

- TypeScript
- HTTP application/server
- Configuration layer
- Environment validation
- Database client
- Prisma ORM
- Migration system
- Validation foundation
- Error-handling foundation
- Middleware structure
- Module structure
- Service-layer structure

### Database foundation

Create the Prisma schema structure for the documented domain.

Tables/entities specified by the source document include:

- users
- userPasswords
- sessions
- loginAttempts
- employees
- clients
- orders
- inventoryItems
- inventoryMovements
- tasks
- palletAssets
- dockSchedules
- incentiveRules
- incentiveEvents
- payrollLedger
- accessRoles
- accessPermissions
- accessRolePermissions
- userAccessRoles
- accessAuditLogs

Use appropriate primary keys, foreign keys, uniqueness constraints and indexes based only on relationships explicitly supported by the specification.

Do not invent undocumented business behavior.

## Route foundation

Create route shells for:

- `/`
- `/warehouse`
- `/operations`
- `/employees`
- `/access-control`
- `/login`
- `/register`

The pages should be visually coherent but may contain foundation-level empty states because functionality belongs to later phases.

## Component foundation

Create reusable components for common application surfaces:

- Button
- Input
- Textarea
- Select
- Checkbox
- Switch
- Badge
- Card
- Dialog
- Tabs
- Table
- Dropdown
- Tooltip
- Spinner
- Skeleton
- EmptyState
- ErrorState
- PageHeader
- Sidebar
- TopBar
- StatusBadge

Prefer composition over duplicated page-specific implementations.

## Explicitly out of scope

Do not implement business workflows in Phase 1.

No fake warehouse transactions.
No fake payroll calculations.
No fake authentication.
No fake permissions.
No fake realtime events.

If sample content is needed for visual development, clearly mark it as mock/demo data and isolate it from production services.
