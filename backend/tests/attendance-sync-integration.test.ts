import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before, beforeEach } from "node:test";
import bcrypt from "bcryptjs";
import { sql } from "kysely";
import type { DatabaseConnection } from "@royal-packaging/db";
import { loadConfig } from "../packages/config/src/index.js";
import { createApiApp } from "../apps/api/src/app.js";
import { EtimeOfficeError } from "../apps/api/src/integrations/etime-office/etime-office-errors.js";
import type { DownloadInOutPunchDataResponse, DownloadLastPunchDataResponse } from "../apps/api/src/integrations/etime-office/etime-office-schemas.js";
import { AttendanceSyncService, ETIME_PROVIDER, LAST_PUNCH_SCOPE } from "../apps/api/src/modules/attendance/attendance-sync-service.js";
import {
  cleanupTestDatabase,
  ensureTestDatabase,
  getScopedTestDatabaseUrl,
  getTestDatabase,
  migrateTestDatabase,
  truncateAllTables
} from "./helpers/postgres-test-helper.js";

/**
 * e-Time Office attendance sync against PostgreSQL with a fake provider client returning the
 * documented DownloadLastPunchData / DownloadInOutPunchData shapes. No external API is called.
 */
const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);
const PASSWORD = "Password123!";
let db: DatabaseConnection;

const punch = (empcode: string, id: number, time = "09:46:00", table = "TextFileData042026") => ({ Name: `EMP ${empcode}`, Empcode: empcode, PunchDate: `30/04/2026 ${time}`, M_Flag: null, ID: id, Table: table, EmpcardNo: `0000${empcode}` });
const lastResponse = (punches: ReturnType<typeof punch>[], maxRecord: string): DownloadLastPunchDataResponse => ({ Error: false, Msg: "Success", IsAdmin: true, PunchData: punches, MaxRecord: maxRecord, TableName: "TextFileData092026" });

class FakeClient {
  public lastRecords: string[] = [];
  public responses: Array<DownloadLastPunchDataResponse | Error> = [];
  public onCall: (() => Promise<void>) | null = null;
  public inOut: DownloadInOutPunchDataResponse | null = null;
  public inOutQueries: Array<{ empcode: string; fromDate: string; toDate: string }> = [];

  public async downloadLastPunchData(query: { empcode: string; lastRecord: string }): Promise<DownloadLastPunchDataResponse> {
    this.lastRecords.push(query.lastRecord);
    if (this.onCall) await this.onCall();
    const next = this.responses.shift();
    if (!next) throw new Error("no fake response");
    if (next instanceof Error) throw next;
    return next;
  }

  public async downloadInOutPunchData(query: { empcode: string; fromDate: string; toDate: string }): Promise<DownloadInOutPunchDataResponse> {
    this.inOutQueries.push(query);
    if (!this.inOut) throw new Error("no fake in/out response");
    return this.inOut;
  }

  public formatInOutDate(parts: { year: number; month: number; day: number }): string {
    return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${parts.year}`;
  }
}

let client: FakeClient;
let service: AttendanceSyncService;
const employees: Record<string, string> = {};

const state = () => db.selectFrom("attendance_sync_state").selectAll().where("provider", "=", ETIME_PROVIDER).where("scope", "=", LAST_PUNCH_SCOPE).where("empcode", "=", "ALL").executeTakeFirst();
const punches = () => db.selectFrom("attendance_punches").select(["employee_id", "employee_code", "external_record_id", "external_table", sql<string>`to_char(punched_at_local, 'YYYY-MM-DD HH24:MI:SS')`.as("at")]).orderBy("external_record_id").execute();
const count = async (table: "attendance_punches" | "attendance_sync_exceptions" | "attendance_daily_records") => Number((await db.selectFrom(table).select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirstOrThrow()).n);

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);
});

beforeEach(async () => {
  await truncateAllTables(db);
  for (const code of ["0005", "0001"]) {
    employees[code] = crypto.randomUUID();
    await db.insertInto("employees").values({ id: employees[code] as string, user_id: null, employee_code: code, name: `Employee ${code}`, depot_id: null, is_active: true }).execute();
  }
  client = new FakeClient();
  service = new AttendanceSyncService({ database: db, client, initialLastRecord: "042026$454", empcode: "ALL", log: () => {} });
});

after(async () => {
  if (db) await cleanupTestDatabase(db);
});

test("ATT-1: first sync uses the configured initial LastRecord, stores punches and only then advances to MaxRecord", async () => {
  client.responses.push(lastResponse([punch("0005", 455), punch("0010", 456, "09:49:00")], "042026$456"));
  const result = await service.syncLastPunchData("MANUAL");
  assert.deepEqual(client.lastRecords, ["042026$454"]);
  assert.equal(result.status, "SUCCEEDED");
  assert.deepEqual([result.recordsReceived, result.recordsInserted, result.duplicates, result.unmapped], [2, 2, 0, 1]);
  assert.equal((await state())?.last_record, "042026$456");
  assert.equal((await state())?.sync_status, "SUCCEEDED");
  assert.deepEqual((await punches()).map((row) => [row.employee_code, row.employee_id, row.external_record_id, row.external_table, row.at]), [
    ["0005", employees["0005"], "455", "TextFileData042026", "2026-04-30 09:46:00"],
    ["0010", null, "456", "TextFileData042026", "2026-04-30 09:49:00"]
  ]);
  const run = await db.selectFrom("attendance_sync_runs").selectAll().executeTakeFirstOrThrow();
  assert.deepEqual([run.status, run.trigger, run.request_last_record, run.response_max_record, run.records_inserted, run.unmapped], ["SUCCEEDED", "MANUAL", "042026$454", "042026$456", 2, 1]);
});

test("ATT-2: an unknown Empcode is kept (employee_id NULL) and quarantined as EMPLOYEE_NOT_FOUND, never discarded", async () => {
  client.responses.push(lastResponse([punch("0010", 456)], "042026$456"));
  await service.syncLastPunchData("SCHEDULER");
  const exception = await db.selectFrom("attendance_sync_exceptions").selectAll().executeTakeFirstOrThrow();
  assert.equal(exception.error_type, "EMPLOYEE_NOT_FOUND");
  assert.equal(exception.empcode, "0010");
  assert.equal(exception.resolved_at, null);
  const payload = (typeof exception.payload === "string" ? JSON.parse(exception.payload) : exception.payload) as Record<string, unknown>;
  assert.equal(payload.employeeCode, "0010");
  assert.equal(payload.externalRecordId, 456);
  assert.equal(await count("attendance_punches"), 1);
});

test("ATT-3: the next sync sends the stored MaxRecord; re-delivered punches are deduplicated on Table + ID", async () => {
  client.responses.push(lastResponse([punch("0005", 455), punch("0001", 456)], "042026$456"));
  await service.syncLastPunchData("SCHEDULER");
  client.responses.push(lastResponse([punch("0005", 455), punch("0001", 456), punch("0001", 457, "18:02:00")], "042026$457"));
  const second = await service.syncLastPunchData("SCHEDULER");
  assert.deepEqual(client.lastRecords, ["042026$454", "042026$456"]);
  assert.deepEqual([second.recordsReceived, second.recordsInserted, second.duplicates], [3, 1, 2]);
  assert.equal(await count("attendance_punches"), 3);
  assert.equal((await state())?.last_record, "042026$457");
  // The same provider ID in another monthly table is a different punch.
  client.responses.push(lastResponse([punch("0005", 455, "08:00:00", "TextFileData052026")], "052026$455"));
  assert.equal((await service.syncLastPunchData("SCHEDULER")).recordsInserted, 1);
});

test("ATT-4: a failed transaction stores nothing and does not advance the checkpoint", async () => {
  client.responses.push(lastResponse([punch("0005", 455)], "042026$455"));
  await service.syncLastPunchData("SCHEDULER");
  // Make the second punch of the next batch fail inside the transaction.
  await sql`CREATE OR REPLACE FUNCTION att_test_fail() RETURNS trigger AS $$ BEGIN IF NEW.employee_code = 'FAIL' THEN RAISE EXCEPTION 'forced failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`.execute(db);
  await sql`CREATE TRIGGER att_test_fail BEFORE INSERT ON attendance_punches FOR EACH ROW EXECUTE FUNCTION att_test_fail()`.execute(db);
  try {
    client.responses.push(lastResponse([punch("0001", 456), punch("FAIL", 457)], "042026$457"));
    const result = await service.syncLastPunchData("SCHEDULER");
    assert.equal(result.status, "FAILED");
    assert.equal(result.errorCode, "PERSISTENCE_FAILED");
    assert.match(result.errorMessage ?? "", /database error P0001/, "the SQLSTATE is kept for diagnosis");
    assert.equal(await count("attendance_punches"), 1, "the batch's first punch was rolled back too");
    const current = await state();
    assert.equal(current?.last_record, "042026$455", "checkpoint unchanged");
    assert.equal(current?.sync_status, "FAILED");
    // The next attempt re-requests from the old checkpoint, so nothing is skipped.
    await sql`DROP TRIGGER att_test_fail ON attendance_punches`.execute(db);
    client.responses.push(lastResponse([punch("0001", 456), punch("0005", 457)], "042026$457"));
    assert.equal((await service.syncLastPunchData("SCHEDULER")).recordsInserted, 2);
    assert.deepEqual(client.lastRecords, ["042026$454", "042026$455", "042026$455"]);
  } finally {
    await sql`DROP TRIGGER IF EXISTS att_test_fail ON attendance_punches`.execute(db);
    await sql`DROP FUNCTION IF EXISTS att_test_fail()`.execute(db);
  }
});

test("ATT-5: provider failures (401, 500 exhausted, invalid response) keep the checkpoint and record the error", async () => {
  client.responses.push(lastResponse([], "042026$455"));
  await service.syncLastPunchData("SCHEDULER");
  for (const code of ["AUTHENTICATION_FAILED", "PROVIDER_SERVER_ERROR", "INVALID_RESPONSE"] as const) {
    client.responses.push(new EtimeOfficeError(code, "DownloadLastPunchData", `forced ${code}`));
    const result = await service.syncLastPunchData("SCHEDULER");
    assert.equal(result.status, "FAILED");
    assert.equal(result.errorCode, code);
    assert.equal((await state())?.last_record, "042026$455");
    assert.equal((await state())?.error_code, code);
  }
  const failed = await db.selectFrom("attendance_sync_runs").select("error_code").where("status", "=", "FAILED").execute();
  assert.equal(failed.length, 3);
});

test("ATT-6: without a stored checkpoint or a configured initial LastRecord the sync refuses (no invented value)", async () => {
  const unconfigured = new AttendanceSyncService({ database: db, client, empcode: "ALL", log: () => {} });
  const result = await unconfigured.syncLastPunchData("SCHEDULER");
  assert.equal(result.status, "FAILED");
  assert.equal(result.errorCode, "NOT_CONFIGURED");
  assert.deepEqual(client.lastRecords, [], "the provider was not called");
  const noClient = new AttendanceSyncService({ database: db, client: null, initialLastRecord: "042026$454", log: () => {} });
  assert.equal((await noClient.syncLastPunchData("SCHEDULER")).errorCode, "NOT_CONFIGURED");
});

test("ATT-7: empty PunchData still advances to the returned MaxRecord", async () => {
  client.responses.push(lastResponse([], "042026$454"));
  const result = await service.syncLastPunchData("SCHEDULER");
  assert.deepEqual([result.status, result.recordsInserted], ["SUCCEEDED", 0]);
  assert.equal((await state())?.last_record, "042026$454");
});

test("ATT-8: Empcode matching is exact: leading zeros matter and '1' is not employee '0001'", async () => {
  client.responses.push(lastResponse([punch("1", 455), punch("0001", 456)], "042026$456"));
  const result = await service.syncLastPunchData("SCHEDULER");
  assert.equal(result.unmapped, 1);
  const rows = await punches();
  assert.equal(rows.find((row) => row.employee_code === "1")?.employee_id, null);
  assert.equal(rows.find((row) => row.employee_code === "0001")?.employee_id, employees["0001"]);
  // Duplicate employee codes cannot exist (unique index), so a code maps to exactly one employee.
  await assert.rejects(db.insertInto("employees").values({ id: crypto.randomUUID(), user_id: null, employee_code: "0001", name: "dup", depot_id: null, is_active: true }).execute());
});

test("ATT-9: if another sync advances the checkpoint meanwhile, this batch stores nothing", async () => {
  client.responses.push(lastResponse([punch("0005", 455)], "042026$455"));
  await service.syncLastPunchData("SCHEDULER");
  client.onCall = async () => {
    await db.updateTable("attendance_sync_state").set({ last_record: "042026$999" }).where("empcode", "=", "ALL").execute();
  };
  client.responses.push(lastResponse([punch("0001", 456)], "042026$456"));
  const result = await service.syncLastPunchData("SCHEDULER");
  assert.equal(result.errorCode, "CHECKPOINT_CHANGED");
  assert.equal(await count("attendance_punches"), 1);
  assert.equal((await state())?.last_record, "042026$999", "the other sync's checkpoint is kept");
});

test("ATT-10: In/Out import stores '--:--' as NULL (raw kept), upserts the same employee/date, quarantines unknown codes", async () => {
  const day = (empcode: string, out: string, status: string) => ({ Empcode: empcode, INTime: "12:06", OUTTime: out, WorkTime: "00:00", OverTime: "00:00", Status: status, DateString: "01/01/2026", Remark: "MIS-LT", Erl_Out: "00:00", Late_In: "02:36", Name: "JIGNESH PADHIYAR" });
  client.inOut = { Error: false, Msg: "Success", IsAdmin: true, InOutPunchData: [day("0001", "--:--", "P/2"), day("0099", "18:00", "P")] };
  const first = await service.importInOutRange({ from: "2026-01-01", to: "2026-01-31" }, "MANUAL", null);
  assert.deepEqual([first.status, first.recordsInserted, first.unmapped], ["SUCCEEDED", 2, 1]);
  assert.deepEqual(client.inOutQueries[0], { empcode: "ALL", fromDate: "01/01/2026", toDate: "31/01/2026" });
  const row = await db.selectFrom("attendance_daily_records").select(["employee_id", "out_time", "raw_out_time", "late_in_minutes", "status"]).where("employee_code", "=", "0001").executeTakeFirstOrThrow();
  assert.deepEqual(row, { employee_id: employees["0001"], out_time: null, raw_out_time: "--:--", late_in_minutes: 156, status: "P/2" });
  // The provider recalculates the day: the same employee/date row is updated, not duplicated.
  client.inOut = { Error: false, Msg: "Success", IsAdmin: true, InOutPunchData: [day("0001", "21:10", "P")] };
  await service.importInOutRange({ from: "2026-01-01", to: "2026-01-01", empcode: "0001" }, "MANUAL", null);
  assert.equal(await count("attendance_daily_records"), 2);
  const updated = await db.selectFrom("attendance_daily_records").select([sql<string>`to_char(out_time, 'HH24:MI')`.as("out"), "status"]).where("employee_code", "=", "0001").executeTakeFirstOrThrow();
  assert.deepEqual(updated, { out: "21:10", status: "P" });
  await assert.rejects(service.importInOutRange({ from: "2026-02-01", to: "2026-01-01" }, "MANUAL", null), (error: unknown) => error instanceof EtimeOfficeError && error.code === "INVALID_REQUEST");
});

// ---------------------------------------------------------------- routes and RBAC

test("ATT-11: routes follow the existing RBAC: own records for Others, all for reporting readers, sync for the admin tier", async () => {
  client.responses.push(lastResponse([punch("0005", 455), punch("0001", 456)], "042026$456"));
  const appConfig = loadConfig({ NODE_ENV: "test", DATABASE_URL: TEST_DATABASE_URL, SESSION_SECRET: "s".repeat(48), OPERATIONS_TIMEZONE: "Asia/Kolkata", ETIME_CORPORATE_ID: "corp", ETIME_USERNAME: "user", ETIME_PASSWORD: "route-secret-pw" });
  const server = createApiApp({ database: db, appConfig, attendanceSyncService: service }).createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const login = async (key: string, role: string, employeeCode: string | null): Promise<string> => {
      const userId = crypto.randomUUID();
      await db.insertInto("users").values({ id: userId, login_identifier: `att_${key}`, password_hash: await bcrypt.hash(PASSWORD, 4), is_active: true }).execute();
      const existing = await db.selectFrom("access_roles").select("id").where("code", "=", role).executeTakeFirst();
      const roleId = existing?.id ?? crypto.randomUUID();
      if (!existing) await db.insertInto("access_roles").values({ id: roleId, code: role, name: role, active: true }).execute();
      await db.insertInto("user_access_roles").values({ id: crypto.randomUUID(), user_id: userId, role_id: roleId, assigned_at: new Date(), assigned_by_user_id: userId, revoked_at: null, revoked_by_user_id: null, version: "1" }).execute();
      if (employeeCode) await db.updateTable("employees").set({ user_id: userId }).where("employee_code", "=", employeeCode).execute();
      const res = await fetch(`${url}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login_identifier: `att_${key}`, password: PASSWORD }) });
      assert.equal(res.status, 200, key);
      return (res.headers.get("set-cookie") ?? "").split(";")[0] as string;
    };
    const admin = await login("admin", "ADMIN", null);
    const supervisor = await login("sup", "SUPERVISOR", null);
    const accountant = await login("acc", "ACCOUNTANT", null);
    const others = await login("oth", "EMPLOYEE", "0005");
    const call = (cookie: string | null, path: string, method = "GET", body?: unknown) => fetch(`${url}/api${path}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });

    assert.equal((await call(null, "/attendance/punches")).status, 401);
    assert.equal((await call(supervisor, "/attendance/sync", "POST")).status, 403);
    assert.equal((await call(accountant, "/attendance/sync/status")).status, 403);
    assert.equal((await call(others, "/attendance/sync/exceptions")).status, 403);

    const synced = await call(admin, "/attendance/sync", "POST");
    assert.equal(synced.status, 200);
    assert.equal(((await synced.json()) as { data: { records_inserted: number } }).data.records_inserted, 2);

    const all = (await (await call(accountant, "/attendance/punches")).json()) as { data: Array<{ employee_code: string }>; meta: { total: number } };
    assert.equal(all.meta.total, 2);
    const own = (await (await call(others, "/attendance/punches")).json()) as { data: Array<{ employee_code: string; punched_at_local: string }>; meta: { total: number } };
    assert.deepEqual(own.data.map((row) => [row.employee_code, row.punched_at_local]), [["0005", "2026-04-30T09:46:00"]]);
    assert.equal((await call(others, `/attendance/punches?employee_id=${employees["0001"]}`)).status, 403);
    assert.equal((await call(supervisor, `/attendance/punches?employee_id=${employees["0001"]}&from=2026-04-30&to=2026-04-30`)).status, 200);
    assert.equal((await call(accountant, "/attendance/punches?from=2026-13-01")).status, 400);

    const status = await call(admin, "/attendance/sync/status");
    assert.equal(status.status, 200);
    const statusText = await status.text();
    assert.ok(statusText.includes("042026$456"));
    for (const secret of ["route-secret-pw", Buffer.from("corp:user:route-secret-pw:true").toString("base64")]) assert.ok(!statusText.includes(secret), "no credentials in status");

    assert.equal((await call(admin, "/attendance/daily/import", "POST", { from: "bad", to: "2026-01-01" })).status, 400);
    client.inOut = { Error: false, Msg: "Success", IsAdmin: true, InOutPunchData: [] };
    assert.equal((await call(admin, "/attendance/daily/import", "POST", { from: "2026-01-01", to: "2026-01-02" })).status, 200);
    assert.equal((await call(others, "/attendance/daily")).status, 200);

    client.responses.push(new EtimeOfficeError("AUTHENTICATION_FAILED", "DownloadLastPunchData", "forced"));
    const failed = await call(admin, "/attendance/sync", "POST");
    assert.equal(failed.status, 502);
    assert.equal(((await failed.json()) as { code: string }).code, "ATTENDANCE_SYNC_FAILED");

    // Two simultaneous manual syncs: one runs, the other gets the standard 409 error envelope.
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    client.onCall = () => gate;
    client.responses.push(lastResponse([punch("0001", 460)], "042026$460"));
    const first = call(admin, "/attendance/sync", "POST");
    await new Promise((resolve) => setTimeout(resolve, 300));
    const second = await call(admin, "/attendance/sync", "POST");
    assert.equal(second.status, 409);
    const secondBody = (await second.json()) as { success: boolean; code: string };
    assert.deepEqual([secondBody.success, secondBody.code], [false, "CONFLICT"]);
    release?.();
    assert.equal((await first).status, 200);
    client.onCall = null;
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

// ---------------------------------------------------------------- idempotency and failure injection

test("ATT-12: the same response (same MaxRecord) twice stores nothing new and keeps the checkpoint", async () => {
  const batch = () => lastResponse([punch("0005", 455), punch("0001", 456)], "042026$456");
  client.responses.push(batch(), batch());
  await service.syncLastPunchData("SCHEDULER");
  const again = await service.syncLastPunchData("SCHEDULER");
  assert.deepEqual([again.status, again.recordsReceived, again.recordsInserted, again.duplicates], ["SUCCEEDED", 2, 0, 2]);
  assert.equal(await count("attendance_punches"), 2);
  assert.equal((await state())?.last_record, "042026$456");
});

test("ATT-13: a timeout after the provider may have answered is retried from the same checkpoint and stored once", async () => {
  client.responses.push(new EtimeOfficeError("TIMEOUT", "DownloadLastPunchData", "forced timeout"));
  const timedOut = await service.syncLastPunchData("SCHEDULER");
  assert.deepEqual([timedOut.status, timedOut.errorCode], ["FAILED", "TIMEOUT"]);
  assert.equal((await state())?.last_record, null, "checkpoint not advanced");
  client.responses.push(lastResponse([punch("0005", 455)], "042026$455"), lastResponse([punch("0005", 455)], "042026$455"));
  await service.syncLastPunchData("SCHEDULER");
  await service.syncLastPunchData("SCHEDULER");
  assert.deepEqual(client.lastRecords, ["042026$454", "042026$454", "042026$455"]);
  assert.equal(await count("attendance_punches"), 1);
});

test("ATT-14: after a process stops mid-sync, the abandoned run is closed and the next run resumes from the last committed checkpoint", async () => {
  client.responses.push(lastResponse([punch("0005", 455)], "042026$455"));
  await service.syncLastPunchData("SCHEDULER");
  // Simulate a process that started a run 2 hours ago and died before committing.
  const abandoned = crypto.randomUUID();
  await db.insertInto("attendance_sync_runs").values({ id: abandoned, provider: ETIME_PROVIDER, endpoint: "DownloadLastPunchData", empcode: "ALL", trigger: "SCHEDULER", actor_user_id: null, status: "RUNNING", request_last_record: "042026$455", response_max_record: null, request_from: null, request_to: null, error_code: null, error_message: null, finished_at: null, started_at: new Date(Date.now() - 2 * 3_600_000) }).execute();
  await db.updateTable("attendance_sync_state").set({ sync_status: "RUNNING" }).where("empcode", "=", "ALL").execute();
  // A recent RUNNING run (possibly another live process) is left alone.
  const recent = crypto.randomUUID();
  await db.insertInto("attendance_sync_runs").values({ id: recent, provider: ETIME_PROVIDER, endpoint: "DownloadLastPunchData", empcode: "ALL", trigger: "SCHEDULER", actor_user_id: null, status: "RUNNING", request_last_record: "042026$455", response_max_record: null, request_from: null, request_to: null, error_code: null, error_message: null, finished_at: null }).execute();

  const restarted = new AttendanceSyncService({ database: db, client, initialLastRecord: "042026$454", empcode: "ALL", log: () => {} });
  client.responses.push(lastResponse([punch("0001", 456)], "042026$456"));
  const result = await restarted.syncLastPunchData("SCHEDULER");
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(client.lastRecords.at(-1), "042026$455", "resumed from the last committed checkpoint");
  const runs = await db.selectFrom("attendance_sync_runs").select(["id", "status", "error_code"]).where("id", "in", [abandoned, recent]).execute();
  assert.deepEqual(Object.fromEntries(runs.map((run) => [run.id, [run.status, run.error_code]])), { [abandoned]: ["FAILED", "INTERRUPTED"], [recent]: ["RUNNING", null] });
});

test("ATT-15: two service instances syncing at once: one commits, the other stores nothing; no duplicates, checkpoint consistent", async () => {
  client.responses.push(lastResponse([punch("0005", 455)], "042026$455"));
  await service.syncLastPunchData("SCHEDULER");
  let arrived = 0;
  let release: (() => void) | undefined;
  const bothCalled = new Promise<void>((resolve) => { release = resolve; });
  const gated = () => { arrived += 1; if (arrived === 2) release?.(); return bothCalled; };
  const clientA = new FakeClient();
  const clientB = new FakeClient();
  clientA.onCall = gated;
  clientB.onCall = gated;
  clientA.responses.push(lastResponse([punch("0001", 456), punch("0005", 457)], "042026$457"));
  clientB.responses.push(lastResponse([punch("0001", 456), punch("0005", 457)], "042026$457"));
  const instanceA = new AttendanceSyncService({ database: db, client: clientA, initialLastRecord: "042026$454", empcode: "ALL", log: () => {} });
  const instanceB = new AttendanceSyncService({ database: db, client: clientB, initialLastRecord: "042026$454", empcode: "ALL", log: () => {} });
  const results = await Promise.all([instanceA.syncLastPunchData("SCHEDULER"), instanceB.syncLastPunchData("SCHEDULER")]);
  assert.deepEqual(clientA.lastRecords, ["042026$455"]);
  assert.deepEqual(clientB.lastRecords, ["042026$455"]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["FAILED", "SUCCEEDED"]);
  assert.equal(results.find((result) => result.status === "FAILED")?.errorCode, "CHECKPOINT_CHANGED");
  assert.equal(await count("attendance_punches"), 3);
  assert.equal((await state())?.last_record, "042026$457");
});

test("ATT-16: re-importing the same In/Out range does not duplicate EMPLOYEE_NOT_FOUND exceptions (still counted as unmapped)", async () => {
  const unknownDay = { Empcode: "0099", INTime: "09:00", OUTTime: "18:00", WorkTime: "09:00", OverTime: "00:00", Status: "P", DateString: "02/01/2026", Remark: "", Erl_Out: "00:00", Late_In: "00:00", Name: "UNKNOWN" };
  client.inOut = { Error: false, Msg: "Success", IsAdmin: true, InOutPunchData: [unknownDay] };
  const first = await service.importInOutRange({ from: "2026-01-02", to: "2026-01-02" }, "MANUAL", null);
  const second = await service.importInOutRange({ from: "2026-01-02", to: "2026-01-02" }, "MANUAL", null);
  assert.deepEqual([first.unmapped, second.unmapped], [1, 1]);
  assert.equal(await count("attendance_sync_exceptions"), 1);
  assert.equal(await count("attendance_daily_records"), 1);
});
