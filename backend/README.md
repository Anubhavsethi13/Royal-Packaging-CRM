# Royal Packaging CRM & Warehouse

Production-grade warehouse operations control and CRM backend system built with TypeScript, PostgreSQL, Kysely, and Zod.

---

## Final Backend Deployment & Operations Guide

### 1. Requirements

- **Runtime**: Node.js `>= 20.0.0`
- **Database**: PostgreSQL `14+` (tested against PostgreSQL 15/16)
- **Package Manager**: npm `>= 10.0.0`

---

### 2. Environment Variables

Create a local `.env` file from `.env.example`:

```bash
cp .env.example .env
```

| Variable | Required | Description | Example |
|---|---|---|---|
| `NODE_ENV` | Yes | Application environment (`development`, `test`, `production`) | `production` |
| `SERVER_HOST` | Yes | HTTP bind interface | `0.0.0.0` |
| `SERVER_PORT` | Yes | HTTP listening port | `3000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/royal_packaging` |
| `SESSION_SECRET` | Yes | High-entropy session secret (min 32 chars) | `your-secret-key-at-least-32-chars-long` |
| `FLOOT_ENDPOINT` | Optional | Floot Realtime WebSocket / HTTP Gateway | `https://realtime.floot.example.com` |
| `FLOOT_API_KEY` | Optional | Floot Gateway API authentication key | `floot_sec_...` |
| `LOG_LEVEL` | No (default `info`) | Log verbosity (`trace`, `debug`, `info`, `warn`, `error`) | `info` |
| `LOG_FORMAT` | No (default `json`) | Log output format (`json`, `pretty`) | `json` |

*Note: `FLOOT_ENDPOINT` and `FLOOT_API_KEY` must either both be configured or both omitted.*

---

### 3. PostgreSQL Database Setup

Ensure target PostgreSQL database is created:

```sql
CREATE DATABASE royal_packaging;
```

---

### 4. Migration Command

Execute all database migrations (001 through 011) in strict dependency order:

```bash
npm run db:migrate
```

---

### 5. Development Start Command

Start development server with live reload:

```bash
npm run dev
```

---

### 6. Production Build Command

Verify type safety and compile TypeScript:

```bash
npm run build
npm run typecheck
```

---

### 7. Production Start Command

Start the production HTTP API server with verified database connectivity and graceful shutdown handlers:

```bash
npm start
```

---

### 8. Health & Monitoring Endpoints

- **Liveness Probe**: `GET /health`
  - Returns `200 OK` with `{ "success": true, "data": { "status": "ok", "timestamp": "..." } }`
- **Readiness Probe**: `GET /health/ready`
  - Returns `200 OK` when PostgreSQL database is reachable.
  - Returns `503 Service Unavailable` if database connectivity fails.

---

### 9. Test Commands

Run the full automated test harness:

```bash
# Unit & Domain Tests (130 tests)
npm test

# Full PostgreSQL Integration Suite (32 tests)
npm run test:integration

# Static Type Verification
npm run typecheck

# Code Style & Linting
npm run lint
```

---

### 10. Security Notes

- **Authoritative Server-Side RBAC**: Authorization is evaluated entirely server-side. Client-supplied roles, user IDs, or employee IDs are ignored.
- **Incentive Mutations**: Strictly restricted to `SUPER_ADMIN` only (`incentive:record_kot`, `incentive:record_penalty`, `incentive:calculate`, `incentive:approve`).
- **Session Security**: Session tokens are cryptographically generated, hashed via SHA-256 before database storage, and transmitted via HTTP-only, `SameSite=Strict` cookies (with `Secure` flag enabled in production).
- **Brute-force Protection**: 5 failed login attempts within 15 minutes trigger a 15-minute lockout.
- **SQL Safety**: Parameterized queries through Kysely with compile-time query validation.

---

### 11. Known Unresolved Business Rules (Intentional TBDs)

The following business rules remain unconfirmed and are intentionally marked as TBD in the system:
- **Task-to-Monthly-Pool Reconciliation**: Source of task incentive amounts and reconciliation to the monthly pool (`TBD_SOURCE_UNDEFINED`).
- **Penalty Aggregation Relationship**: Global monthly pool deduction vs task/employee aggregation model (`TBD_PENDING_POLICY`).
- **Negative Incentive Handling**: Zero-floor policy (`max(0, ...)`) is unconfirmed (`TBD_NOT_CONFIRMED`).
- **Currency Rounding Policy**: Exact remainder is held unassigned (`EXACT_REMAINDER_HELD`).
- **Overtime Multiplier**: Overtime formula is pending client configuration (`PENDING_CONFIGURATION`).
- **Remainder Recipient**: Remainder recipient is undecided and no remainder is allocated to employees or administrators.

---

### 12. Realtime / Floot Integration Status

- **Status**: Configurable Freshness Signal.
- **Authoritative Rule**: PostgreSQL is the sole authoritative source of truth. Realtime events are non-authoritative freshness notifications.
- **Resilience**: If Floot is unavailable or misconfigured, core database operations, inventory movements, task state transitions, and incentive calculations continue uninterrupted without data loss. Clients can recover authoritative state from PostgreSQL on reconnect.
