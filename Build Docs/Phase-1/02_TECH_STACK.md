# Royal Packaging CRM — Phase 1 Technology Stack

Use this stack unless the selected coding platform has a genuine technical incompatibility.

## Frontend

- React
- TypeScript
- React Router
- TanStack React Query
- CSS Modules or an equivalent maintainable styling approach
- Zod where frontend validation is required
- Lucide icons or an equivalent icon library

## Backend

- TypeScript
- Node.js
- PostgreSQL
- Prisma ORM
- Zod
- Modular service architecture

## Architecture

```text
React UI
  ↓
API client
  ↓
HTTP API
  ↓
validation
  ↓
middleware
  ↓
service layer
  ↓
Prisma
  ↓
PostgreSQL
```

Business logic must not be embedded directly in UI components.

Business logic should not be tightly coupled to route handlers.

Future modules must be able to expose services such as:

- AuthService
- AccessControlService
- EmployeeService
- ClientService
- OrderService
- InventoryService
- WarehouseTaskService
- RoutingService
- IncentiveService
- PayrollService
- DashboardService
- RealtimeService

Phase 1 only establishes the architecture; later phases implement the actual behavior.

## Database

PostgreSQL is the authoritative persistence layer.

Prisma is the ORM.

Keep migrations committed to source control.

Never commit secrets.

## Environment

Use an environment schema and fail clearly when required development configuration is missing.

At minimum prepare for:

```text
DATABASE_URL=
NODE_ENV=
PORT=
```

Do not hardcode credentials.

Provide `.env.example`.

## TypeScript

Use strict TypeScript settings.

Avoid:

- `any`
- unsafe casts
- duplicated domain types
- hidden global mutable state

Types should be shared deliberately between API contracts and frontend consumers where appropriate.
