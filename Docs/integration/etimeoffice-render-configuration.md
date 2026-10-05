# e-Time Office — Render configuration

**Status: CONDITIONALLY READY — PROVIDER VERIFICATION PENDING.**

**Placeholders only.** Real values exist only in the Render dashboard. Never put them in tracked `.env` files, documentation, commits or chat.

**Keep polling off:** `ETIME_SYNC_ENABLED` stays **`false`** until every item in §2 is done.

The general backend variables are documented in `Docs/deployment/production-configuration.md`. This page lists them for completeness and adds the `ETIME_*` settings. Variable names and defaults come from `backend/packages/config/src/index.ts`.

## 1. Required before the live provider test

Existing backend settings, already required for the API to start in production:

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `DATABASE_URL` | `<Render/Neon production database URL>` | **Secret** |
| `SESSION_SECRET` | `<production secret, ≥ 32 characters>` | **Secret** |
| `FRONTEND_ORIGIN` | `https://royal-packaging-crm.vercel.app` | |
| `OPERATIONS_TIMEZONE` | `Asia/Kolkata` | Required in production; the server refuses to start without it |

e-Time Office credentials. Set all three together; the API refuses partial credentials:

| Variable | Value |
|---|---|
| `ETIME_BASE_URL` | `https://api.etimeoffice.com/api` (the default; with or without the trailing slash; must be https) |
| `ETIME_CORPORATE_ID` | `<PENDING PROVIDER>` — **Secret** |
| `ETIME_USERNAME` | `<PENDING PROVIDER>` — **Secret** |
| `ETIME_PASSWORD` | `<PENDING PROVIDER>` — **Secret** |
| `ETIME_SYNC_ENABLED` | `false` |

**How the live test runs:** `npm run test:etime-live` runs from a trusted machine, not on Render. It needs the same three credentials plus `ETIME_INTEGRATION_TEST=true` in that machine's local, untracked environment. `LIVE-2` also needs `ETIME_INITIAL_LAST_RECORD`.

## 2. Required before the first production sync

All of these must be true, in this order:

1. `ETIME_INITIAL_LAST_RECORD` = `<PENDING PROVIDER>`: the provider-approved first `LastRecord` (`MMyyyy$ID`). No value is invented; without it every sync fails with `NOT_CONFIGURED`.
2. `ETIME_INOUT_DATE_FORMAT` set to the provider's answer (`date` or `datetime`), if the In/Out import will be used.
3. Migration `017_create_attendance_sync` applied to production (`npm run db:migrate`).
4. CRM employee codes aligned with the provider roster (`Docs/integration/etimeoffice-employee-mapping.md`).
5. The live provider test passing.
6. One manual `POST /api/attendance/sync` by an admin, checked through `GET /api/attendance/sync/status` and `GET /api/attendance/sync/exceptions`. Running the sync again must store no duplicates.

Only then:

| Variable | Value |
|---|---|
| `ETIME_SYNC_ENABLED` | `true`, set deliberately after the steps above; **not now** |

## 3. Optional settings (defaults shown)

| Variable | Default | Notes |
|---|---|---|
| `ETIME_SYNC_EMPCODE` | `ALL` | `ALL` or one employee code |
| `ETIME_POLL_INTERVAL_MINUTES` | `5` | A CRM choice; set within the provider's rate limits once known |
| `ETIME_REQUEST_TIMEOUT_MS` | `30000` | Per request attempt |
| `ETIME_INOUT_DATE_FORMAT` | `date` | Pending provider confirmation |

## 4. Secrets that must exist only in Render

| Variable | When |
|---|---|
| `DATABASE_URL`, `SESSION_SECRET` | Always |
| `ETIME_CORPORATE_ID`, `ETIME_USERNAME`, `ETIME_PASSWORD` | Always, once received |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (and the other `SEED_*` values) | **Only while running `npm run db:seed`; remove afterwards** |

Base64 is not encryption: the e-Time Office credentials are only protected by HTTPS and by keeping these values secret.
