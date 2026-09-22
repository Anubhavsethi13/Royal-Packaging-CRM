# ROYAL PACKAGING CRM — PHASE 1 BASE PROJECT PROMPT

You are the lead full-stack engineer. Build Phase 1 — Foundation of the Royal Packaging CRM & Warehouse exactly according to the project specification.

SOURCE OF TRUTH:
The uploaded `Royal Packaging CRM.docx` and the accompanying Phase 1 markdown files are authoritative. Preserve their terminology, domain model, architecture intent, UI philosophy, and documented values. Do not silently invent or change requirements.

READ FIRST:
- 00_MASTER_PROMPT.md
- 01_PHASE_1_SCOPE.md
- 02_TECH_STACK.md
- 03_DATABASE_PROMPT.md
- 04_DESIGN_SYSTEM_PROMPT.md
- 05_ROUTING_APP_SHELL.md
- 06_COMPONENT_LIBRARY.md
- 07_ENVIRONMENT_AND_SECURITY_FOUNDATION.md
- 08_API_FOUNDATION.md
- 09_VERIFICATION.md

PHASE 1 ONLY:
React + TypeScript + routing + design tokens + reusable component library + PostgreSQL + Prisma ORM + environment configuration + clean service-oriented architecture.

TARGET STRUCTURE:
frontend/src/{app,pages,components,api,hooks,state,styles}
backend/src/{app.ts,server.ts,config,db,middleware,modules,realtime,utils}

DOMAIN MODEL TO PREPARE:
users, userPasswords, sessions, loginAttempts, employees, clients, orders, inventoryItems, inventoryMovements, tasks, palletAssets, dockSchedules, incentiveRules, incentiveEvents, payrollLedger, accessRoles, accessPermissions, accessRolePermissions, userAccessRoles, accessAuditLogs.

ROUTES:
/
 /warehouse
 /operations
 /employees
 /access-control
 /login
 /register

DESIGN:
Precision logistics control room.
IBM Plex Sans, DM Serif Display, IBM Plex Mono.
Use the exact light/dark theme tokens documented in 04_DESIGN_SYSTEM_PROMPT.md.
Light-first, premium operational UI, responsive, dense but breathable data surfaces.

IMPORTANT:
Do not implement later-phase business behavior. Do not fake authentication, RBAC, warehouse transactions, incentive calculations, payroll approval or realtime behavior. Create clean extension points instead.

ARCHITECTURE:
React UI → API client → HTTP API → validation → middleware → service layer → Prisma → PostgreSQL.

SECURITY FOUNDATION:
No secrets in source. Use `.env.example`. Browser never connects directly to PostgreSQL. Prepare centralized authentication/authorization middleware boundaries.

QUALITY:
Inspect existing code first. Plan before large edits. Preserve useful work. Use strict TypeScript. Avoid `any`. Keep components and backend modules modular.

DATABASE:
Create Prisma schema and migrations corresponding to the documented domain. Preserve documented relationships and enums. Do not add speculative business rules.

VERIFICATION:
Run dependency installation, Prisma generation, migrations where configured, typecheck, lint, production build and available runtime checks. Fix errors before completion. Do not claim a check passed if it could not actually run.

COMPLETION:
Provide a concise report with:
- files/architecture created
- database setup
- commands to run
- environment variables
- verification results
- known Phase 1 limitations
- recommended Phase 2 starting point

START NOW:
Inspect the repository, read the Phase 1 files, create the implementation plan, and then implement Phase 1 completely.
