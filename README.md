# Royal Packaging CRM

Phase 1 establishes the foundation for a precision logistics control room: React and TypeScript on the frontend, a modular Express API, Prisma over PostgreSQL, typed configuration, reusable UI primitives, and route shells for the future CRM and warehouse domains.

## Prerequisites

- Node.js 20 or later
- PostgreSQL 15 or later
- npm 10 or later

## Local setup

```powershell
npm install
Copy-Item .env.example .env
# Edit .env with a reachable PostgreSQL connection string.
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

The frontend runs at `http://localhost:5173` and the API at `http://localhost:4000`.

## Verification

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run prisma:migrate` requires PostgreSQL. The schema and migration directory are committed so another developer can apply the same foundation reproducibly.

## Phase 1 boundary

The UI contains honest route shells and isolated demo content for visual development. Authentication, authorization enforcement, CRM mutations, warehouse transactions, incentive calculations, payroll approval, realtime delivery, and offline synchronization remain future phases.

See [REQUIREMENTS_REGISTER.md](REQUIREMENTS_REGISTER.md) for unresolved business decisions carried forward from the architecture questionnaire.
