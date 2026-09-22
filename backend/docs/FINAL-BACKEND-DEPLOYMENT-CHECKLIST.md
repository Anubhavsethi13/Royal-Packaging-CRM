# Royal Packaging CRM — Final Backend Deployment Checklist

This document provides the definitive pre-flight deployment and operations checklist for the Royal Packaging CRM backend.

---

## 1. Environment & Secrets Configuration

- [ ] **Environment Template**: Copy `.env.example` to `.env` in the deployment environment.
- [ ] **Node Environment**: Set `NODE_ENV=production` for live deployments (enforces `Secure` flag on session cookies).
- [ ] **Server Host & Port**: Configure `SERVER_HOST` (e.g. `0.0.0.0` or private IP) and `SERVER_PORT` (e.g. `3000`).
- [ ] **Database URL**: Set `DATABASE_URL` with credentials for the production PostgreSQL instance. Use TLS connection mode where available (`sslmode=require`).
- [ ] **Session Secret**: Generate and configure `SESSION_SECRET` with a high-entropy string (minimum 32 characters, recommended 64+ random bytes).
- [ ] **Floot Realtime (Freshness Signal)**:
  - If Floot is deployed: Set both `FLOOT_ENDPOINT` and `FLOOT_API_KEY`.
  - If Floot is not yet deployed: Leave both empty. Database remains the authoritative source of truth; absence of Floot will not degrade data integrity.
- [ ] **Logging**: Configure `LOG_LEVEL` (`info`, `warn`, `error`) and `LOG_FORMAT` (`json` for production log aggregators).

---

## 2. PostgreSQL Database Provisioning & Migrations

- [ ] **PostgreSQL Version**: PostgreSQL 14+ recommended (compatible with PostgreSQL 15 and 16).
- [ ] **Database Created**: Ensure the target database exists and the database user has schema migration permissions (CREATE TABLE, ALTER TABLE, CREATE INDEX, etc.).
- [ ] **Execute Migrations**: Run the canonical migration command before launching API traffic:
  ```bash
  npm run db:migrate
  ```
- [ ] **Migration Sequence**: Verify all migrations (001 through 011) execute cleanly in order:
  - `001_create_users_and_rbac.ts`
  - `002_create_sessions_and_employees.ts`
  - `003_create_depots_locations_and_shifts.ts`
  - `004_create_clients_orders_and_order_items.ts`
  - `005_create_inventory_items_batches_balances_and_movements.ts`
  - `006_create_tasks_assignments_and_events.ts`
  - `007_create_quality_records_and_task_photos.ts`
  - `008_create_login_attempts.ts`
  - `009_create_incentive_rules_events_and_ledger.ts`
  - `010_create_kpi_definitions_targets_and_snapshots.ts`
  - `011_create_monthly_kot_and_penalties.ts`
- [ ] **Database Connection Pool**: The backend uses connection pooling with automatic client release. In high-traffic deployments, tune PostgreSQL `max_connections` to accommodate pool size.

---

## 3. Security & Access Control

- [ ] **Authoritative Server-Side RBAC**: Authorization is performed exclusively on the server using verified session state (`ctx.user`). Client-provided roles, user IDs, or employee IDs are never trusted.
- [ ] **Incentive Mutations Authority**:
  - `incentive:record_kot` → Super Admin ONLY
  - `incentive:record_penalty` → Super Admin ONLY
  - `incentive:calculate` → Super Admin ONLY
  - `incentive:approve` → Super Admin ONLY
- [ ] **Warehouse Operations Authority**:
  - Task Creation, Assignment, Unassignment, Cancellation: Super Admin, Main Admin, Admin, Manager (Employee blocked).
  - Task Reopen: Super Admin, Main Admin, Admin (Manager and Employee blocked).
  - Quality Inspection: Super Admin, Main Admin, Admin, Manager (Employee blocked).
  - Task Pause/Resume: Manager override; Employees limited strictly to their own assigned tasks.
- [ ] **Authentication & Rate Limiting**:
  - Passwords hashed with `bcryptjs`.
  - Sessions stored as SHA-256 hashes in PostgreSQL.
  - HTTP-only cookies (`__Host-` / `SameSite=Strict`).
  - Brute-force protection: 5 failed login attempts within 15 minutes trigger a 15-minute lockout.

---

## 4. Operational Invariants & Business Safeguards

- [ ] **Unit of Measure**: The **BOX** is the only operational inventory and task unit.
- [ ] **Non-Negative Stock**: Database CHECK constraints and atomic serializable row locking prevent negative stock.
- [ ] **Atomic Orchestration**: `executeTaskMovement` commits inventory movements, balance adjustments, task status updates, and event logs in a single database transaction with complete rollback on any failure.
- [ ] **Quality Gate**: Quality damage rate `>= 5%` marks inventory as `DAMAGED` and blocks task completion until a passing reinspection is recorded.
- [ ] **Idempotency**: All critical mutations support idempotency keys to prevent duplicate execution during network retries.

---

## 5. Unresolved Business Rules (Intentional TBDs)

The following items are intentionally marked as unresolved and must NOT be assumed by external callers:
- **Task-to-Monthly-Pool Reconciliation**: Source of task-level incentive amounts is undefined (`TBD_SOURCE_UNDEFINED`).
- **Penalty Aggregation Model**: Relationship between manual penalties and the monthly incentive pool is undefined (`TBD_PENDING_POLICY`).
- **Negative Incentive Zero-Floor**: Policy on negative net incentives is unconfirmed (`TBD_NOT_CONFIRMED`).
- **Currency Rounding**: Exact remainder is preserved and held unassigned (`EXACT_REMAINDER_HELD`); floor division is not corporate policy.
- **Overtime Multiplier**: Overtime formula is pending client configuration (`PENDING_CONFIGURATION`).
- **Remainder Recipient**: No employee or administrator receives unallocated remainder amounts.

---

## 6. Health Checks & Monitoring

- [ ] **Liveness Probe**:
  - Endpoint: `GET /health`
  - Response: `200 OK` (`{ success: true, data: { status: "ok", timestamp: "..." } }`)
- [ ] **Readiness Probe**:
  - Endpoint: `GET /health/ready`
  - Response: `200 OK` when PostgreSQL is reachable; `503 Service Unavailable` when database is down.
- [ ] **Graceful Shutdown**: Process responds to `SIGTERM` and `SIGINT` by stopping HTTP ingress, draining ongoing transactions, and closing database pools.

---

## 7. Final Verification Checklist

Before opening production traffic, execute:

```bash
# 1. Verify TypeScript types
npm run typecheck

# 2. Verify ESLint rules
npm run lint

# 3. Run unit test suite
npm test

# 4. Run full PostgreSQL integration suite
npm run test:integration

# 5. Apply migrations
npm run db:migrate

# 6. Start server
npm start
```
