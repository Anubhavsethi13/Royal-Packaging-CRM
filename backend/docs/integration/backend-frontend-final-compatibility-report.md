# Backend / Frontend Final Compatibility Report

## 1. Scope

This reconstructs the backend work for `apps/api`, `packages/db`,
`packages/contracts`, and `packages/config`, starting from commit
`c000561` on `main`, without breaking the pre-existing identity/auth,
RBAC, warehouse tasks, inventory (basic), quality, or incentives modules.

## 2. Repro commands

```bash
# One-time environment setup (PostgreSQL 16, role postgres/postgres,
# databases royal_packaging_dev and royal_packaging_test)
npm install

# Verification (all green as of this report)
npm run typecheck
npm run lint
npm test                 # unit tests (mocked DB)
npm run test:integration # real PostgreSQL, requires TEST_DATABASE_URL
npm run db:migrate       # additive migrations, safe to re-run

# Live smoke test
npx tsx apps/api/src/server.ts
curl -s -c cookies.txt -X POST http://127.0.0.1:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login_identifier":"<user>","password":"<password>"}'
curl -s -b cookies.txt http://127.0.0.1:3000/dashboard
```

## 3. Test results (actual, not estimated)

| Suite | Command | Count | Result |
|---|---|---|---|
| Unit tests | `npm test` | 132 | 132 pass, 0 fail |
| Integration tests (real Postgres) | `npm run test:integration` | 76 | 76 pass, 0 fail |
| `npm run typecheck` | `tsc --noEmit` | - | clean, no errors |
| `npm run lint` | `eslint .` | - | clean, no errors/warnings |
| `npm run db:migrate` (fresh + idempotent re-run) | - | 14 migrations | all applied successfully; re-run reports "already up to date" |

Integration test breakdown by file (`node:test` merges TAP output from all
files run together into one numbered stream, hence the combined total of
76):

- `tests/postgres-integration.test.ts` - existing TG* suite (pre-existing,
  unmodified in behavior; 2 employee inserts updated for the new required
  `employee_code` column).
- `tests/commercial-integration.test.ts` - CO1-CO12 (clients/orders/employees).
- `tests/warehouse-compat-integration.test.ts` - WC1-WC12 (inventory catalog,
  barcode scan, FIFO batch resolution, grid routing, task listing).
- `tests/analytics-integration.test.ts` - AN1-AN7 (audit, KPI, dashboard,
  resync, including the `/resync/payroll` 404-by-design check).
- `tests/payroll-reports-integration.test.ts` - PR1-PR9 (payroll snapshot/
  duplicate/approval/one-shot behavior), RP1-RP4 (report definitions,
  execution creation, jsonb filter round-trip, unknown-code/unknown-id).

## 4. Live smoke test (executed against real PostgreSQL, not mocked)

Ran `tsx apps/api/src/server.ts` against `royal_packaging_dev`, logged in
via `POST /auth/login` with a real bcrypt-hashed password to get a session
cookie, then exercised (with real cookies, real inserted rows, cleaned up
afterward):

- `GET /clients`, `/orders`, `/employees`, `/inventory`, `/dashboard`,
  `/audit-logs`, `/kpis`, `/resync/tasks` - all 200 with the canonical
  `{success:true,data:...}` shape and camelCase mirror keys present.
- `GET /resync/payroll` - 404 (confirmed intentionally absent).
- `POST /tasks` - created a real task; response includes both
  `depot_id`/`depotId` etc. via `withCamelCaseMirror`.
- `POST /payroll/entries` - created a payroll entry from a real APPROVED
  incentive ledger row; amount server-snapshotted (`150.00`), not
  client-supplied.
- `POST /payroll/entries/:id/approvals` - first call approved the entry
  (`status: APPROVED`); an immediate second call returned
  `APPROVAL_ALREADY_DECIDED` (409-class domain error), confirming the
  one-shot rule at the HTTP layer, not just in a unit test.
- `POST /reports/:code/executions` with a `filters` object - execution
  created with `status: PENDING`; `GET /report-executions/:id` returned
  the same `filters` object unchanged (confirms no `JSON.parse()` is
  called on the jsonb column).
- Unauthenticated `GET /payroll` - 401.
- `OPTIONS /payroll` with `Origin: http://localhost:5173` - 204 with
  `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`,
  correct allowed methods/headers - confirms CORS wiring is live.

All smoke-test rows were deleted from `royal_packaging_dev` afterward; the
dev database is back to empty domain tables.

## 5. Phase-by-phase summary

1. **Transport** (`736ec78`) - canonical error envelope, CORS, in-memory
   rate limiting, correlation IDs, `/api` prefix stripping,
   `withCamelCaseMirror`, new contracts packages for payroll/clients-orders/
   organization/audit-realtime/kpi-reports scaffolding.
2. **Auth DTO** (`eba1d2e`) - frontend `{email,password}` login shape,
   `FrontendUserDTO`, role precedence, degrades gracefully (never breaks
   existing login).
3. **Commercial** (`99362d6`) - Clients/Orders/Employees full CRUD, forward-
   only order status transitions, Postgres `23505` unique-violation
   translation, 12 integration tests.
4. **Inventory/Warehouse/camelCase** (`b80f5cf`) - item-level catalog view,
   barcode scan, FIFO batch resolution, grid routing, multi-employee task
   reassignment, camelCase reconciliation across quality/incentives; fixed
   a real route-registration-order bug (`/inventory/:id` was shadowing
   `/inventory/balances`); 12 integration tests.
5. **Audit/KPI/Dashboard/Resync** (`24d31f6`) - unified audit feed over
   task_events + incentive_events, real KPI snapshot reads, live
   cross-domain dashboard aggregates, bulk resync endpoints (no payroll
   resync by design); 7 integration tests.
6. **Payroll/Reports** (`d52fe48`) - payroll entry/approval scaffolding
   with server-snapshotted amounts and one-shot approval; reports
   definition/execution tracking framework; both explicitly acknowledged
   as incomplete business domains (no "paid" state, no report content);
   13 integration tests.

## 6. What remains genuinely outstanding

- **Payroll disbursement/"paid" state** - no settlement/payout flow was
  ever specified; `PayrollEntryDTO.status` stops at `APPROVED`/`REJECTED`.
- **Report content** - `report_definitions` has no seed rows and no
  report-generation/rendering logic exists; the execution-tracking
  framework is real and tested, the content behind any report code is not.
- **`FrontendUserDTO.scopes`** - always `[]`; no granular permission-scope
  system was specified beyond role.
- **Rate limiting** - in-memory, single-process only; needs a shared store
  for multi-instance deployment.
- **Git attribution on early commits** - the five phase commits made
  before the payroll/reports phase (`736ec78` through `24d31f6`) predate
  this session's attribution requirement and do not carry the
  `Co-Authored-By`/`Claude-Session` trailer; the payroll/reports commit
  (`d52fe48`) onward does. Amending the earlier commits was avoided per
  the repository's git safety rules (prefer new commits over amend).

See `docs/integration/backend-frontend-reconciliation.md` for the full
endpoint matrix and the complete, numbered list of documented assumptions.
