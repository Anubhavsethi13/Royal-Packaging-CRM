# Royal Packaging CRM

Precision logistics and customer relationship management system designed for industrial corrugation and warehouse operations.

Current Baseline: **Step 9.2 (Orders Live Integration & Client Dry-Run Hardened Baseline)**

---

## Architecture Overview

- **Frontend (`frontend/`):** React 19, TypeScript, Vite, React Router 7, Vanilla CSS design tokens.
  - Live data mode (`VITE_DATA_MODE=api`) communicates with the backend via HTTP-only session cookies (`rp_session`).
  - Standalone mock mode (`VITE_DATA_MODE=mock`) available for rapid UI/UX exploration.
- **Backend (`backend/`):** Node.js 20+ native HTTP server, TypeScript, raw SQL migrations + Kysely query builder over PostgreSQL.
  - Layered architecture: `apps/api` (REST API & Auth), `packages/contracts` (Zod schemas & types), `packages/db` (PostgreSQL client & migrations).
  - Production-ready security: Argon2id password hashing, constant-time verification, account lockout, HTTP-only SameSite cookies, CSP/HSTS defense headers, and RBAC authorization policies.
- **Database:** PostgreSQL 15+ (verified on PostgreSQL 18).

---

## Prerequisites

- **Node.js:** `>= 20.0.0`
- **PostgreSQL:** `>= 15.0`
- **npm:** `>= 10.0.0`

---

## Local Setup

1. **Install Dependencies:**
   ```powershell
   npm install
   npm install --prefix backend
   ```

2. **Configure Environment Variables:**
   ```powershell
   Copy-Item .env.example .env
   Copy-Item backend\.env.example backend\.env
   Copy-Item frontend\.env.example frontend\.env
   ```
   *Edit `backend/.env` with your PostgreSQL database credentials and generate a unique `SESSION_SECRET`.*

3. **Initialize Database (Migrations & Seed):**
   ```powershell
   # Run sequential migrations (001-014)
   npm run db:migrate

   # Seed default roles, permissions, and initial administrator
   npm run db:seed
   ```
   *Default seed credentials created:*
   - **Email:** `admin@royalpackaging.com`
   - **Password:** `AdminSecure2026!`
   - *Note: Change this password immediately upon first production deployment.*

4. **Start Development Servers:**
   ```powershell
   npm run dev
   ```
   - Frontend UI: `http://localhost:5173`
   - Backend API: `http://localhost:3000`

---

## Verification & Testing

Run the full verification suite across frontend and backend:

```powershell
# Typechecking (both frontend and backend)
npm run typecheck

# Linting
npm run lint

# Frontend Tests (145+ unit & integration tests)
npm test

# Backend Unit Tests (151 tests)
npm run test:backend

# Backend Integration Tests (PostgreSQL persistence & APIs, 84 tests)
npm run test:integration

# Production Build
npm run build
```

---

## Deployment & Production Runbook

For complete instructions on staging, production rollout, reverse proxy setup, SSL configuration, and credential rotation, consult:

📖 **[Deployment Guide](Docs/integration/client-dry-run-deployment.md)**  
📋 **[Dry-Run Fix Report](Docs/integration/client-dry-run-fix-report.md)**

---

## Scope & Implementation Status

- **Clients (Step 9.1):** Fully live with PostgreSQL persistence, search, filtering, pagination, and RBAC.
- **Orders (Step 9.2):** Fully live with multi-item creation, client association, lifecycle state machine, and cancellation.
- **Deferred Domains (Phase 3+):** Employees (9.3), Warehouse Tasks (9.4), Inventory (9.5), Docks (9.6), Automated Payroll, Incentive Calculations, and AI Recommendations.
