# Royal Packaging CRM — Phase 1 Master Build Prompt

## Role

You are the lead full-stack engineer responsible for creating **Phase 1 — Foundation** of the Royal Packaging CRM & Warehouse application.

The authoritative requirements are in `Royal Packaging CRM.docx`, converted into the project specification files in this folder. Treat those requirements as the source of truth.

## Objective

Create the production-quality **foundation** of the application so that Phases 2–11 can be implemented without architectural rewrites.

Phase 1 must establish:

- React
- TypeScript
- Routing
- Design tokens
- Reusable component library
- PostgreSQL
- ORM
- Environment configuration
- Clean frontend/backend separation
- Service-oriented backend structure
- Strong typing
- Validation boundaries
- Error-handling foundation
- Development documentation

Do **not** implement later business functionality merely to make the demo look complete. Create the architecture and foundation required for it.

## Required architecture

Use the conventional non-Floot rebuild architecture specified by the document:

```text
frontend/
  src/
    app/
    pages/
    components/
    api/
    hooks/
    state/
    styles/

backend/
  src/
    app.ts
    server.ts
    config/
    db/
      client.ts
      schema/
      migrations/
    middleware/
    modules/
    realtime/
    utils/
```

Use:

- React
- TypeScript
- PostgreSQL
- Prisma ORM
- Zod
- React Query
- React Router
- CSS variables/design tokens
- A reusable UI component system

Keep the code modular and suitable for future authentication, RBAC, CRM, warehouse, incentive, payroll and realtime modules.

## Important instruction

Do not invent a different product.

Preserve the terminology and domain concepts from the specification:

- Clients
- Orders
- Inventory
- Inventory Movements
- Tasks
- Employees
- Pallet Assets
- Dock Schedules
- Incentive Rules
- Incentive Events
- Payroll Ledger
- Access Roles
- Access Permissions
- Audit Logs

The central business relationship must remain:

**Physical Work → Digital Task → Employee Attribution → Measurable Performance → Rule-Based Incentive → Payroll**

## Phase boundary

Do not claim that Phase 1 implements:

- authentication
- login
- registration
- RBAC enforcement
- employee workflows
- CRM workflows
- warehouse workflows
- incentive calculation
- payroll approval
- realtime synchronization

Those belong to later phases.

However, create appropriate extension points and folder/module boundaries for them.

## Quality requirements

Before finishing:

1. Install dependencies.
2. Configure environment handling.
3. Configure PostgreSQL connection.
4. Configure Prisma.
5. Create the initial schema/migration structure needed by the documented domain.
6. Configure TypeScript.
7. Configure routing.
8. Build the design-token system.
9. Build reusable UI primitives.
10. Create route/page shells for the documented routes.
11. Add loading, error and empty-state foundations.
12. Run type checking.
13. Run linting.
14. Run the production build.
15. Fix all errors you introduce.
16. Document how to run the project locally.

Do not leave placeholder code that causes compilation errors.

## Design direction

The UI foundation must follow the specification's:

**Precision logistics control room**

Use the documented typography:

- IBM Plex Sans
- DM Serif Display
- IBM Plex Mono

Use the documented light and dark theme variables.

The interface should be light-first, premium operational software with:

- warm paper/board neutrals
- royal-indigo primary accent
- dense but breathable data surfaces
- restrained borders
- subtle elevation
- crisp radii
- compact status chips
- functional animation

## Final output

At the end, provide:

- what was created
- important architectural decisions
- commands to run the project
- environment variables required
- database setup/migration commands
- verification results
- known Phase 1 limitations
- recommended next phase

Do not skip verification.
