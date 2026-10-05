# e-Time Office attendance integration

**Status: CONDITIONALLY READY.** The integration is implemented and tested against the response shapes in `API Documentation.pdf` using a mock provider. **External provider verification NOT PERFORMED:** no provider credentials or API access were available. Production use also depends on the open provider questions in §20.

**Source of truth:** `API Documentation.pdf` (e-Time Office, 7 pages). Two labels are used throughout:
- **IMPLEMENTED:** what the code does.
- **PROVIDER CONFIRMATION REQUIRED:** anything the PDF leaves undefined or contradicts itself on. These items are never resolved by guessing.

**Direction:** **e-Time Office → CRM** only (read/download).
- The provider documentation lists GET endpoints only.
- **Attendance write-back:** NOT IMPLEMENTED — PROVIDER API DOCUMENTATION REQUIRED (no documented POST/PUT/PATCH/DELETE).
- **Webhook / event subscription:** NOT IMPLEMENTED — PROVIDER API DOCUMENTATION REQUIRED (no documented endpoint).
- **Synchronization:** near-real-time polling of `DownloadLastPunchData`. This is periodic, not real-time.

## 1. Architecture (IMPLEMENTED)

```
e-Time Office API (HTTPS, Basic auth, GET only)
        │
  EtimeOfficeClient              apps/api/src/integrations/etime-office/
  auth · timeout · bounded retry · Zod validation · provider field names
        │
  etime-office-mapper            provider names → CRM names
        │
  AttendanceSyncService          apps/api/src/modules/attendance/
  checkpoint · single transaction · dedup · Empcode mapping · exceptions
        │                  ▲
  PostgreSQL (migration 017)   AttendancePoller (opt-in, started by server.ts)
        │
  AttendanceReadService + /attendance routes (existing session auth + RBAC policy)
```

**Reused:**
- Zod configuration (`packages/config`);
- Kysely transactions and file migrations;
- session authentication;
- the role-switch authorization policy;
- the route, pagination and error helpers;
- console logging;
- the per-domain event-table audit pattern.

**New, because the backend had none:**
- outbound HTTP: Node's built-in `fetch`, no new dependency;
- a minimal in-process poller.

There are no duplicate employee, user, audit, role or permission models.

## 2. Configuration (IMPLEMENTED)

- **Validation:** all settings are validated at start-up by `loadConfig` (`backend/packages/config/src/index.ts`). Invalid combinations stop the API from starting:
  - partial credentials;
  - polling enabled without credentials;
  - a non-https base URL;
  - a malformed initial `LastRecord`.
- **Default:** the integration is **off by default**, and the API runs normally without it.
- **Exposure:** credentials are **backend-only**. None are `VITE_*` variables, and the frontend never calls the provider.

## 3. Environment variables

Placeholders are in `.env.example` and `backend/.env.example`. Real values go only in the deployment environment (Render) and are never committed.

| Variable | Default | Notes |
|---|---|---|
| `ETIME_BASE_URL` | `https://api.etimeoffice.com/api/` | The documented base URL; must be https. With or without a trailing slash. |
| `ETIME_CORPORATE_ID` | unset | All three credentials together, or none |
| `ETIME_USERNAME` | unset | |
| `ETIME_PASSWORD` | unset | |
| `ETIME_INITIAL_LAST_RECORD` | unset | Provider-approved first `LastRecord` (`MMyyyy$ID`). **No value is invented**; see §9 |
| `ETIME_SYNC_ENABLED` | `false` | Starts the poller; requires the credentials |
| `ETIME_SYNC_EMPCODE` | `ALL` | `ALL` or one employee code |
| `ETIME_POLL_INTERVAL_MINUTES` | `5` | A CRM configuration choice, not a provider requirement (1–1440) |
| `ETIME_REQUEST_TIMEOUT_MS` | `30000` | Finite timeout for each attempt (headers and body) |
| `ETIME_INOUT_DATE_FORMAT` | `date` | Date format for `DownloadInOutPunchData` (§6) |
| `ETIME_INTEGRATION_TEST` | unset | Tests only: `true` enables the opt-in live test (§17) |

## 4. Authentication

**IMPLEMENTED** (`etime-office-auth.ts`):
- **Header:** `Authorization: Basic Base64(UTF-8 "Corporateid:Username:Password:true")` and `Content-Type: application/json`, sent on every request.
- **Encoding:** Base64 is an encoding, not encryption; HTTPS protects the credentials in transit. The client refuses non-https base URLs.

**PROVIDER CONFIRMATION REQUIRED:**
- **Flag casing:** the PDF's format line writes the last token as `True`, its example as `true`. `true` is used, as in the example.
- **Base64 example:** the PDF's sample `c3VwcG9ydDpzdXBwb3J0OnN1cHBvcnQ6dHJ1ZTo=` decodes to `support:support:support:true:`, not its stated example `support:support:support@1:true`. Tests therefore don't use it as a reference.

## 5. Provider endpoints (all GET; IMPLEMENTED as client methods)

| Client method | Endpoint | Parameters | Documented response | CRM use |
|---|---|---|---|---|
| `downloadPunchData` | `/DownloadPunchData` | `Empcode` (code or `ALL`), `FromDate`, `ToDate` | bare array `[{Empcode, PunchDate}]` | Client method only (diagnostics, backfill, live test) |
| `downloadPunchDataMCID` | `/DownloadPunchDataMCID` | same | `{Error, Msg, IsAdmin, PunchData:[{Name, Empcode, PunchDate, M_Flag, mcid}]}` | Client method only |
| `downloadInOutPunchData` | `/DownloadInOutPunchData` | same | `{InOutPunchData:[{Empcode, INTime, OUTTime, WorkTime, OverTime, Status, DateString, Remark, Erl_Out, Late_In, Name}], Error, Msg, IsAdmin}` | `POST /attendance/daily/import` |
| `downloadLastPunchData` | `/DownloadLastPunchData` | `Empcode` (code or `ALL`), `LastRecord` | `{Error, Msg, IsAdmin, PunchData:[{Name, Empcode, PunchDate, M_Flag, ID, Table, EmpcardNo}], MaxRecord, TableName}` | Incremental sync (poller and `POST /attendance/sync`) |

## 6. Request parameters

**IMPLEMENTED:**
- **Parameter names:** `Empcode`, `FromDate`, `ToDate`, `LastRecord`, exactly as in the PDF's example URLs.
- **Encoding:** values are percent-encoded except `/`, `:` and `$`. These are valid in a query string and appear unencoded in every documented example, so requests match the examples byte for byte (tested).
- **Date-time parameters:** `dd/MM/yyyy_HH:mm`, validated before sending. Malformed or impossible values are rejected with `INVALID_REQUEST` and no request is made: `2026/01/01_01:00`, `01-01-2026_01:00`, `01/01/26_01:00`, `01/01/2026 01:00`, `31/02/2026_01:00`.
- **`LastRecord`:** must match `MMyyyy$ID` (month 01–12).

**PROVIDER CONFIRMATION REQUIRED:**
- **Parameter names:** the PDF's parameter table writes "From Date"/"To Date", while its examples use `FromDate`/`ToDate`.
- **`DownloadInOutPunchData` dates:** the PDF says all dates use `dd/MM/yyyy_HH:mm`, but this endpoint's example uses date-only `dd/MM/yyyy`. Neither is assumed: `ETIME_INOUT_DATE_FORMAT=date` (default, as in the endpoint's example) or `datetime` selects the format, and the client validates whichever is configured. Both are tested.

## 7. Response mapping (IMPLEMENTED)

- **Validation:** every response is validated with Zod before use.
- **Provider error flag:** a 200 response with `Error: true` is a `PROVIDER_ERROR`.
- **Extra fields:** tolerated and ignored. `IsAdmin`, `Msg` (except in errors) and `TableName` are not stored.
- **Empcode:** must be a string; a numeric `Empcode` is rejected, because it would lose leading zeros.

| Provider field | CRM field | Notes |
|---|---|---|
| `Empcode` | `employee_code` | Unchanged text |
| `PunchDate` (`dd/MM/yyyy HH:mm:ss`) | `punched_at_local` (`timestamp` without time zone) | Wall-clock time, no timezone conversion |
| `mcid` (API 2) | `machine_id` | String |
| `M_Flag` | `machine_flag` | NULL allowed |
| `ID`, `Table` (API 4) | `external_record_id`, `external_table` | Deduplication key |
| `EmpcardNo` | `emp_card_no` | |
| `Name` | `provider_employee_name` | Informational; **never** used for matching |
| `DateString` | `attendance_date` (`date`) | |
| `INTime`, `OUTTime` (`HH:mm`) | `in_time`, `out_time` (`time`) | **`--:--` → NULL**; originals kept in `raw_in_time` / `raw_out_time`; any other invalid value fails the import instead of being stored as text |
| `WorkTime`, `OverTime`, `Late_In`, `Erl_Out` | `work_minutes`, `overtime_minutes`, `late_in_minutes`, `early_out_minutes` | `HH:mm` → minutes |
| `Status`, `Remark` | `status`, `remark` | Stored as given; not interpreted |

**Timezone (PROVIDER CONFIRMATION REQUIRED):** the PDF documents none.
- Provider times are stored as wall-clock values and returned with `to_char`, so no UTC conversion can shift them; tested.
- Day filters use `[from 00:00, to + 1 day)`, so punches up to 23:59:59 on the end date are included.

## 8. Employee mapping (IMPLEMENTED)

- **Matching rule:** provider `Empcode` must equal `employees.employee_code` exactly, as text. Leading zeros are significant (`0001` ≠ `1`). Name, email and phone are never used.
- **One code, one employee:** the existing unique index `employees_employee_code_unique_index` prevents duplicate codes.
- **Unknown codes:** the data is **kept**, never discarded:
  - the punch or daily row is stored with `employee_id` NULL;
  - an `attendance_sync_exceptions` row records `EMPLOYEE_NOT_FOUND`, the empcode, the payload (mapped documented fields only), the sync run and the time;
  - exceptions are visible to the admin tier at `GET /attendance/sync/exceptions`, and their count appears on the status route.
- **Production prerequisite:** CRM `employee_code` values must be set to the e-Time Office `Empcode` values. Current production codes (`EMP-…`, `TEST-EMP-01`) will **not** match. Unmatched punches are not re-linked automatically once a code is added later.

## 9. LastRecord / MaxRecord

**IMPLEMENTED:**
- **First run:** `ETIME_INITIAL_LAST_RECORD`.
- **Later runs:** the stored `attendance_sync_state.last_record`.
- **No starting value:** with neither set, the run fails with `NOT_CONFIGURED` and the provider is not called.
- **`MaxRecord`:** required in every response and validated as `MMyyyy$ID`. A missing or malformed value fails the run.
- **Empty `PunchData`:** still advances the checkpoint to the returned `MaxRecord`.

**PROVIDER CONFIRMATION REQUIRED:**
- **Initial value:** the PDF says to "pass the initial LastRecord value" but does not define it, so no default exists.
- **Ordering:** whether `MaxRecord` can move backward is undocumented, so no ordering is enforced.

## 10. Transactions (IMPLEMENTED)

```
close runs abandoned by a stopped process (RUNNING for > 60 min → FAILED/INTERRUPTED)
read checkpoint ─► record run RUNNING ─► GET DownloadLastPunchData ─► validate ─► map
   └─► BEGIN
         SELECT checkpoint … FOR UPDATE
         abort if it differs from the value sent  (CHECKPOINT_CHANGED)
         insert punches  ON CONFLICT DO NOTHING
         insert EMPLOYEE_NOT_FOUND exceptions for newly stored unmatched punches
         last_record = MaxRecord · counts · SUCCEEDED · run SUCCEEDED
       COMMIT
```

**Any failure:**
- the transaction rolls back, so none of the batch's punches or exceptions are kept;
- `last_record` is **not** advanced;
- the run and the checkpoint row are then marked FAILED, with a code and a safe message;
- database failures keep only the SQLSTATE (e.g. `database error 23505`), never row data;
- the next run re-requests from the last committed checkpoint, so no punch is skipped.

**Concurrency:**
- In one process, overlapping runs are refused (a manual call gets 409).
- Across processes, the row lock and checkpoint comparison let exactly one instance commit. The other stores nothing (test ATT-15).

## 11. Idempotency (IMPLEMENTED, tested)

| Scenario | Result |
|---|---|
| Same response / same `MaxRecord` twice | Second run stores 0, counts duplicates, checkpoint unchanged (ATT-12) |
| Timeout after the provider may have answered | Checkpoint not advanced; retried from the same `LastRecord`; stored once (ATT-13) |
| 500 / database failure | Rolled back; next run retries from the old checkpoint (ATT-4, ATT-5) |
| Process stopped mid-sync | Nothing committed; abandoned run closed as `INTERRUPTED`; next run resumes (ATT-14) |
| Concurrent syncs (two instances or two requests) | One commits; no duplicates (ATT-15, ATT-11) |

- **Deduplication keys:**
  - Provider `Table` + `ID` for `DownloadLastPunchData` punches. The same ID in another monthly table is a different punch.
  - Fallback `(employee_code, punched_at_local, source)` for punches without a provider ID.
- **In/Out re-import:** updates the row for the same employee code and date (the provider's latest values win) and does not duplicate exceptions (ATT-16).

## 12. Polling (IMPLEMENTED)

- **Starting it:** `ETIME_SYNC_ENABLED=true` with credentials makes `server.ts` start `AttendancePoller`. It runs once at start-up and then every `ETIME_POLL_INTERVAL_MINUTES`.
- **Runs never overlap:** a tick is skipped while a run is in progress.
- **Failures are contained:** a failed or crashing run never stops the poller, and failures are recorded.
- **Graceful shutdown:** stops scheduling and waits for the run in progress, so a transaction is never cut.
- **Restart:** safe. Interrupted runs are closed (§10), and nothing uncommitted is assumed.
- **Rate limits (PROVIDER CONFIRMATION REQUIRED):** the interval is a CRM choice; provider rate limits and the recommended frequency are undocumented.
- **Single instance:** this suits the current single Render instance. Extra instances stay safe through the database lock, but they are redundant.

## 13. Error handling (IMPLEMENTED)

| Case | Code | Retried | Notes |
|---|---|---|---|
| 200, valid | — | — | Body validated; `Error: true` → `PROVIDER_ERROR` (not retried) |
| 400 | `INVALID_REQUEST` | No | Request/configuration problem |
| 401 | `AUTHENTICATION_FAILED` | No | Logged as `[ALERT]`; shown on the status route |
| 404 | `RESOURCE_NOT_FOUND` | No | Check `ETIME_BASE_URL` |
| 500 / 503 / other 5xx | `PROVIDER_SERVER_ERROR` | Yes | Bounded backoff |
| Timeout | `TIMEOUT` | Yes | Finite per attempt; the request is aborted |
| Network failure | `NETWORK_ERROR` | Yes | |
| Malformed JSON or undocumented shape | `INVALID_RESPONSE` | No | Never crashes the server |
| Other status (e.g. 403, 429) | `UNEXPECTED_STATUS` | No | Undocumented, so not retried |
| No credentials or initial `LastRecord` | `NOT_CONFIGURED` | — | Logged as `[ALERT]` |

**Retry policy:**
- transient failures only (5xx, timeout, network);
- delays of 2 s, 4 s, 8 s and 16 s: at most 5 attempts per request, never infinite;
- polling continues after a failed run.

**Route errors** use the standard `{success:false, code, message}` envelope:

| Status | Code | Meaning |
|---|---|---|
| 502 | `ATTENDANCE_SYNC_FAILED` | Provider or sync failure |
| 503 | `ATTENDANCE_SYNC_NOT_CONFIGURED` | Credentials or initial `LastRecord` missing |
| 409 | `CONFLICT` | A sync is already running |
| 400 | `BAD_REQUEST` | Invalid input |

## 14. RBAC (IMPLEMENTED in the existing policy)

New actions in `DatabaseRBACAuthorizationPolicy` (default-deny); no new roles or second RBAC system:

| Action | Allowed |
|---|---|
| `attendance:read` | Approved roles (Super Admin, Main Admin, Admin, Supervisor/Manager, Employee) and Accountant |
| `attendance:read_all` | Reporting readers: Super Admin, Main Admin, Admin, Supervisor/Manager, Accountant. Everyone else sees only the employee profile linked to their own session user; asking for another employee → **403** |
| `attendance:sync` | Admin tier: Super Admin, Main Admin, Admin |

- Identity and employee scope always come from the session, never the request.
- No business decision on attendance visibility exists; this mirrors KPI results and shift entries and is **TBD (client decision)**.

## 15. Database tables (migration `017_create_attendance_sync`, additive)

| Table | Purpose | Key constraints |
|---|---|---|
| `attendance_sync_state` | Checkpoint per provider/scope/empcode | unique (provider, scope, empcode); `last_record` CHECK `MMyyyy$ID`; status CHECK |
| `attendance_sync_runs` | One row per attempt: integration audit trail and monitoring | status RUNNING/SUCCEEDED/FAILED; trigger SCHEDULER/MANUAL; counts ≥ 0; FK actor → users |
| `attendance_punches` | Raw punches | **unique (external_table, external_record_id)** where an ID exists; fallback unique (employee_code, punched_at_local, source); FK employee (nullable); FK run |
| `attendance_daily_records` | In/Out daily rows | unique (employee_code, attendance_date); `time`/`date` columns; minutes ≥ 0 |
| `attendance_sync_exceptions` | Quarantine | error_type CHECK `EMPLOYEE_NOT_FOUND`; `resolved_at` |

- All foreign keys are **RESTRICT**, in line with the project's lifetime-retention rule. Nothing cascades.
- No credentials or headers are stored.

## 16. API routes (IMPLEMENTED)

Responses use snake_case keys with the usual camelCase mirror. Lists use the standard `{data, meta}` envelope with `page`/`pageSize`.

| Route | Action | Filters / body |
|---|---|---|
| `GET /attendance/punches` | `attendance:read` | `employee_id`, `from`, `to` (YYYY-MM-DD, real dates), pagination |
| `GET /attendance/daily` | `attendance:read` | same |
| `GET /attendance/sync/status` | `attendance:sync` | Checkpoints, last attempt/success, counts, last error, last 10 runs, open exceptions, settings (no credentials) |
| `GET /attendance/sync/exceptions` | `attendance:sync` | pagination |
| `POST /attendance/sync` | `attendance:sync` | Runs the incremental sync now |
| `POST /attendance/daily/import` | `attendance:sync` | `{from, to, empcode?}` |

**Frontend:** none. The frontend has no attendance contract yet. These routes follow existing conventions, so a future page can use them directly.

## 17. Testing

| Suite | Tests | What it covers |
|---|---|---|
| `tests/etime-office-client.test.ts` (in `npm test`) | 24 | Auth encoding; no credentials in logs or errors; https-only; date validation; documented URLs for all 4 endpoints (`Empcode=ALL`); 400/401/404/403/429 not retried; 500/503 backoff; timeout; network errors; malformed JSON/shape; `Error:true`; `--:--`; invalid `OUTTime`; leading zeros; `MaxRecord`/`LastRecord` validation; configuration; poller non-overlap |
| `tests/attendance-sync-integration.test.ts` (in `npm run test:integration`, PostgreSQL) | 16 | Initial sync; checkpoint advance; dedup; DB failure rollback (with SQLSTATE); provider failures; refusal without initial value; empty batch; exact `Empcode`; checkpoint conflict; In/Out upsert, NULL out time, quarantine; routes and RBAC; same response twice; timeout then retry; restart after a crash; two instances concurrently; concurrent route calls (409); In/Out re-import exceptions |
| `tests/etime-office-live.test.ts` (`npm run test:etime-live`) | 2 (opt-in) | Real API, read-only GETs only, 30 s timeout. **Skipped** unless `ETIME_INTEGRATION_TEST=true` and the credentials are set. Never prints credentials |

## 18. Security (IMPLEMENTED, audited)

- **Credentials appear only in backend configuration.** They are not in source, git history, the frontend, Vite variables, API responses, the database, logs or error messages. Tests check logs, errors and the status response.
- **The `Authorization` header** is built in one place and never logged.
- **Log lines** contain only the endpoint, error code, counts and checkpoints.
- **Defences:** HTTPS only, finite timeouts, Zod validation of input and responses, and server-side RBAC.
- **Base64 is not encryption.** Protect the Render environment variables accordingly.

## 19. Known limitations

- No write-back and no webhooks: NOT IMPLEMENTED — PROVIDER API DOCUMENTATION REQUIRED.
- Near-real-time polling only.
- These need provider confirmation:
  - the initial `LastRecord`;
  - the In/Out date format;
  - the `True`/`true` flag;
  - parameter naming;
  - the timezone;
  - rate limits.
- `DownloadPunchData` and `DownloadPunchDataMCID` are client methods only; nothing schedules them.
- No automatic re-link of unmatched punches after employee codes are aligned.
- No interpretation of `Status`/`Remark`. Attendance-based reports (Present/Absent, Late IN, Mis Punch, Half Day, …) remain **CLIENT DECISION REQUIRED**.
- No frontend pages.
- The external provider has **not** been contacted.

## 20. Provider confirmation questions (PROVIDER CONFIRMATION REQUIRED)

1. What is the approved initial `LastRecord`?
2. Does every endpoint accept `dd/MM/yyyy_HH:mm`?
3. Why does `/DownloadInOutPunchData` use date-only values in its example?
4. What are the provider rate limits?
5. Is there an official write-back API?
6. Is there a webhook/event API?
7. What polling frequency does the provider recommend?
8. Can `MaxRecord` move backward?
9. Can historical punches be corrected or deleted?
10. How should corrections be synchronized?
11. Is the credential flag `True` or `true`?
12. Why does the documented Base64 example not match the documented credentials?
13. Are the parameters `FromDate`/`ToDate` or "From Date"/"To Date"?
14. What timezone are punch timestamps expressed in?

e-Time Office technical support: **+91-99245 02024**.

## 21. Production deployment steps

1. Get answers to at least questions 1, 2/3, 4, 11 and 14.
2. Align CRM `employee_code` values with the e-Time Office `Empcode` values (§8).
3. In Render (never in git), set:
   - `ETIME_CORPORATE_ID`, `ETIME_USERNAME`, `ETIME_PASSWORD`;
   - `ETIME_INITIAL_LAST_RECORD`;
   - `ETIME_INOUT_DATE_FORMAT` if the provider says so.

   Leave `ETIME_SYNC_ENABLED=false` for now.
4. Deploy the backend.
5. Run `npm run db:migrate` on production; it applies migration 017.
6. From a trusted machine, run `npm run test:etime-live` with `ETIME_INTEGRATION_TEST=true` and the same credentials. Both tests must pass.
7. As an admin, call `POST /attendance/sync` once, then check `GET /attendance/sync/status` and `GET /attendance/sync/exceptions`.
8. Set `ETIME_SYNC_ENABLED=true`, choosing `ETIME_POLL_INTERVAL_MINUTES` within the provider's limits, and restart.
9. Monitor the status route, especially `error_code`, `open_exceptions` and the `last_success_at` age.
