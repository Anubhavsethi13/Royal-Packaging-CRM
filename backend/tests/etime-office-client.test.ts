import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../packages/config/src/index.js";
import { buildEtimeOfficeHeaders, encodeEtimeOfficeCredentials } from "../apps/api/src/integrations/etime-office/etime-office-auth.js";
import { EtimeOfficeClient, encodeQueryValue } from "../apps/api/src/integrations/etime-office/etime-office-client.js";
import {
  formatProviderDateTime,
  isProviderDate,
  isProviderDateTime,
  parseClockTime,
  parseDateString,
  parseDurationMinutes,
  parsePunchDate
} from "../apps/api/src/integrations/etime-office/etime-office-dates.js";
import { EtimeOfficeError } from "../apps/api/src/integrations/etime-office/etime-office-errors.js";
import { mapInOutPunchData, mapLastPunchData, mapPunchData, mapPunchDataMcid } from "../apps/api/src/integrations/etime-office/etime-office-mapper.js";
import { AttendancePoller } from "../apps/api/src/modules/attendance/attendance-poller.js";

/**
 * e-Time Office client, auth, dates and mappers. No network: a fake fetch returns the
 * response shapes documented in API Documentation.pdf.
 */
const CREDENTIALS = { corporateId: "corp-77", username: "sync-user", password: "S3cret!pass" };
const ENCODED = Buffer.from("corp-77:sync-user:S3cret!pass:true", "utf8").toString("base64");

// Documented sample responses (API Documentation.pdf).
const SAMPLE_PUNCH_DATA = [{ Empcode: "0001", PunchDate: "01/01/2026 09:00:00" }];
const SAMPLE_MCID = { Error: false, Msg: "Success", IsAdmin: true, PunchData: [{ Name: "JIGNESH PADHIYAR", Empcode: "0001", PunchDate: "01/01/2026 15:58:00", M_Flag: null, mcid: "3" }] };
const SAMPLE_IN_OUT = { InOutPunchData: [{ Empcode: "0001", INTime: "12:06", OUTTime: "--:--", WorkTime: "00:00", OverTime: "00:00", Status: "P/2", DateString: "01/01/2026", Remark: "MIS-LT", Erl_Out: "00:00", Late_In: "02:36", Name: "JIGNESH PADHIYAR" }], Error: false, Msg: "Success", IsAdmin: true };
const SAMPLE_LAST = {
  Error: false, Msg: "Success", IsAdmin: true,
  PunchData: [
    { Name: "RAVI PARMAR", Empcode: "0005", PunchDate: "30/04/2026 09:46:00", M_Flag: null, ID: 455, Table: "TextFileData042026", EmpcardNo: "00000005" },
    { Name: "TANAY MISTRY", Empcode: "0010", PunchDate: "30/04/2026 09:49:00", M_Flag: null, ID: 456, Table: "TextFileData042026", EmpcardNo: "00000010" }
  ],
  MaxRecord: "042026$456",
  TableName: "TextFileData092026"
};

interface Call { url: string; init: RequestInit | undefined }

function fakeFetch(responses: Array<{ status?: number; body?: unknown; raw?: string; throws?: Error }>): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = queue.shift() ?? queue.at(-1) ?? responses.at(-1);
    if (!next) throw new Error("no fake response");
    if (next.throws) throw next.throws;
    return new Response(next.raw ?? JSON.stringify(next.body), { status: next.status ?? 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function client(fetchImpl: typeof fetch, extra: { inOutDateFormat?: "date" | "datetime"; logs?: string[]; sleeps?: number[]; timeoutMs?: number } = {}): EtimeOfficeClient {
  return new EtimeOfficeClient({
    baseUrl: "https://api.etimeoffice.com/api/",
    credentials: CREDENTIALS,
    timeoutMs: extra.timeoutMs ?? 30_000,
    fetchImpl,
    sleep: async (ms) => { extra.sleeps?.push(ms); },
    log: (message) => { extra.logs?.push(message); },
    ...(extra.inOutDateFormat ? { inOutDateFormat: extra.inOutDateFormat } : {})
  });
}

const range = { empcode: "0001", fromDate: "01/01/2026_01:00", toDate: "01/12/2026_00:00" };
const expectCode = async (promise: Promise<unknown>, code: string) => {
  await assert.rejects(promise, (error: unknown) => error instanceof EtimeOfficeError && error.code === code);
};

// ---------------------------------------------------------------- authentication

test("ETO-1: Basic auth is Base64(UTF-8 'Corporateid:Username:Password:true') with JSON content type", () => {
  assert.equal(encodeEtimeOfficeCredentials(CREDENTIALS), ENCODED);
  assert.equal(Buffer.from(ENCODED, "base64").toString("utf8"), "corp-77:sync-user:S3cret!pass:true");
  assert.deepEqual(buildEtimeOfficeHeaders(CREDENTIALS), { Authorization: `Basic ${ENCODED}`, "Content-Type": "application/json" });
  // Non-ASCII is encoded as UTF-8.
  assert.equal(Buffer.from(encodeEtimeOfficeCredentials({ corporateId: "c", username: "ü", password: "p" }), "base64").toString("utf8"), "c:ü:p:true");
});

test("ETO-2: requests carry the header; credentials never appear in logs or errors, even on 401", async () => {
  const logs: string[] = [];
  const { fetchImpl, calls } = fakeFetch([{ status: 401, body: {} }]);
  await assert.rejects(client(fetchImpl, { logs }).downloadPunchData(range), (error: unknown) => {
    assert.ok(error instanceof EtimeOfficeError);
    assert.equal(error.code, "AUTHENTICATION_FAILED");
    for (const secret of [CREDENTIALS.password, ENCODED, "Basic "]) assert.ok(!error.message.includes(secret));
    return true;
  });
  assert.equal(calls.length, 1, "401 is not retried");
  assert.equal((calls[0]?.init?.headers as Record<string, string>).Authorization, `Basic ${ENCODED}`);
  assert.equal(calls[0]?.init?.method, "GET");
  for (const line of logs) for (const secret of [CREDENTIALS.password, ENCODED, "Basic ", CREDENTIALS.username]) assert.ok(!line.includes(secret), line);
});

test("ETO-3: the client refuses a non-https base URL", () => {
  assert.throws(() => new EtimeOfficeClient({ baseUrl: "http://api.etimeoffice.com/api/", credentials: CREDENTIALS, timeoutMs: 1000 }), (error: unknown) => error instanceof EtimeOfficeError && error.code === "NOT_CONFIGURED");
});

// ---------------------------------------------------------------- dates

test("ETO-4: request dates must be real dd/MM/yyyy_HH:mm values; malformed values are rejected", () => {
  assert.ok(isProviderDateTime("01/01/2026_01:00"));
  for (const bad of ["2026/01/01_01:00", "01-01-2026_01:00", "01/01/26_01:00", "01/01/2026 01:00", "31/02/2026_01:00", "01/13/2026_01:00", "01/01/2026_24:00", ""]) {
    assert.equal(isProviderDateTime(bad), false, bad);
  }
  assert.ok(isProviderDate("01/12/2026"));
  assert.equal(isProviderDate("01/12/2026_00:00"), false);
  assert.equal(formatProviderDateTime({ year: 2026, month: 1, day: 1, hour: 1, minute: 0 }), "01/01/2026_01:00");
  assert.throws(() => formatProviderDateTime({ year: 2026, month: 2, day: 30, hour: 0, minute: 0 }));
});

test("ETO-5: provider values: PunchDate, DateString, clock '--:--' → null, durations in minutes", () => {
  assert.equal(parsePunchDate("30/04/2026 09:46:00"), "2026-04-30 09:46:00");
  assert.equal(parsePunchDate("30/02/2026 09:46:00"), null);
  assert.equal(parsePunchDate("2026-04-30 09:46:00"), null);
  assert.equal(parseDateString("01/01/2026"), "2026-01-01");
  assert.equal(parseClockTime("12:06"), "12:06:00");
  assert.equal(parseClockTime("--:--"), null);
  assert.throws(() => parseClockTime("25:00"));
  assert.throws(() => parseClockTime("--"));
  assert.equal(parseDurationMinutes("02:36"), 156);
  assert.equal(parseDurationMinutes("00:00"), 0);
  assert.equal(parseDurationMinutes("26:30"), 1590);
  assert.equal(parseDurationMinutes("--:--"), null);
});

test("ETO-6: invalid dates and Empcode are rejected before any request is made", async () => {
  const { fetchImpl, calls } = fakeFetch([{ body: SAMPLE_PUNCH_DATA }]);
  const c = client(fetchImpl);
  await expectCode(c.downloadPunchData({ ...range, fromDate: "01/01/2026 01:00" }), "INVALID_REQUEST");
  await expectCode(c.downloadPunchData({ ...range, toDate: "2026/12/01_00:00" }), "INVALID_REQUEST");
  await expectCode(c.downloadPunchData({ ...range, empcode: " " }), "INVALID_REQUEST");
  await expectCode(c.downloadLastPunchData({ empcode: "ALL", lastRecord: "000000$0" }), "INVALID_REQUEST");
  await expectCode(c.downloadLastPunchData({ empcode: "ALL", lastRecord: "04-2026$454" }), "INVALID_REQUEST");
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------- API 1: DownloadPunchData

test("ETO-7: DownloadPunchData builds the documented request (single employee and ALL) and maps the bare array", async () => {
  const { fetchImpl, calls } = fakeFetch([{ body: SAMPLE_PUNCH_DATA }, { body: [] }]);
  const c = client(fetchImpl);
  const rows = await c.downloadPunchData(range);
  assert.equal(calls[0]?.url, "https://api.etimeoffice.com/api/DownloadPunchData?Empcode=0001&FromDate=01/01/2026_01:00&ToDate=01/12/2026_00:00");
  assert.deepEqual(mapPunchData(rows), [{ employeeCode: "0001", punchedAtLocal: "2026-01-01 09:00:00", machineId: null, machineFlag: null, externalRecordId: null, externalTable: null, empCardNo: null, providerEmployeeName: null, source: "DownloadPunchData" }]);
  assert.deepEqual(await c.downloadPunchData({ ...range, empcode: "ALL" }), []);
  assert.ok(calls[1]?.url.includes("Empcode=ALL&"));
});

test("ETO-8: HTTP 400 and 404 fail once without retry; 500 retries with 2s/4s/8s/16s backoff then fails", async () => {
  for (const [status, code] of [[400, "INVALID_REQUEST"], [404, "RESOURCE_NOT_FOUND"]] as const) {
    const sleeps: number[] = [];
    const { fetchImpl, calls } = fakeFetch([{ status, body: {} }]);
    await expectCode(client(fetchImpl, { sleeps }).downloadPunchData(range), code);
    assert.equal(calls.length, 1, String(status));
    assert.deepEqual(sleeps, []);
  }
  const sleeps: number[] = [];
  const { fetchImpl, calls } = fakeFetch([{ status: 500, body: {} }]);
  await expectCode(client(fetchImpl, { sleeps }).downloadPunchData(range), "PROVIDER_SERVER_ERROR");
  assert.equal(calls.length, 5, "1 attempt + 4 retries");
  assert.deepEqual(sleeps, [2000, 4000, 8000, 16000]);
});

test("ETO-9: a transient 500 followed by 200 succeeds", async () => {
  const sleeps: number[] = [];
  const { fetchImpl, calls } = fakeFetch([{ status: 500, body: {} }, { body: SAMPLE_PUNCH_DATA }]);
  assert.equal((await client(fetchImpl, { sleeps }).downloadPunchData(range)).length, 1);
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [2000]);
});

test("ETO-10: a request that exceeds the timeout fails as TIMEOUT (and is retried as transient)", async () => {
  const hanging = ((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  })) as typeof fetch;
  const sleeps: number[] = [];
  const c = new EtimeOfficeClient({ baseUrl: "https://api.etimeoffice.com/api/", credentials: CREDENTIALS, timeoutMs: 1000, retryDelaysMs: [1], fetchImpl: hanging, sleep: async (ms) => { sleeps.push(ms); }, log: () => {} });
  await expectCode(c.downloadPunchData(range), "TIMEOUT");
  assert.deepEqual(sleeps, [1], "timeout is retried once with the configured delay");
});

test("ETO-11: malformed JSON, an undocumented shape and a non-string Empcode are INVALID_RESPONSE", async () => {
  await expectCode(client(fakeFetch([{ raw: "<html>oops" }]).fetchImpl).downloadPunchData(range), "INVALID_RESPONSE");
  await expectCode(client(fakeFetch([{ body: { PunchData: [] } }]).fetchImpl).downloadPunchData(range), "INVALID_RESPONSE");
  await expectCode(client(fakeFetch([{ body: [{ Empcode: 1, PunchDate: "01/01/2026 09:00:00" }] }]).fetchImpl).downloadPunchData(range), "INVALID_RESPONSE");
  await expectCode(client(fakeFetch([{ body: [{ Empcode: "0001" }] }]).fetchImpl).downloadPunchData(range), "INVALID_RESPONSE");
});

test("ETO-12: network failures are classified and retried", async () => {
  const sleeps: number[] = [];
  const { fetchImpl, calls } = fakeFetch([{ throws: new TypeError("fetch failed") }, { body: SAMPLE_PUNCH_DATA }]);
  assert.equal((await client(fetchImpl, { sleeps }).downloadPunchData(range)).length, 1);
  assert.equal(calls.length, 2);
});

// ---------------------------------------------------------------- API 2: DownloadPunchDataMCID

test("ETO-13: DownloadPunchDataMCID maps machine ID and null M_Flag; Error=true is a provider error", async () => {
  const { fetchImpl, calls } = fakeFetch([{ body: SAMPLE_MCID }, { body: { ...SAMPLE_MCID, Error: true, Msg: "Invalid Empcode", PunchData: [] } }]);
  const c = client(fetchImpl);
  const mapped = mapPunchDataMcid(await c.downloadPunchDataMCID(range));
  assert.equal(calls[0]?.url, "https://api.etimeoffice.com/api/DownloadPunchDataMCID?Empcode=0001&FromDate=01/01/2026_01:00&ToDate=01/12/2026_00:00");
  assert.deepEqual(mapped, [{ employeeCode: "0001", punchedAtLocal: "2026-01-01 15:58:00", machineId: "3", machineFlag: null, externalRecordId: null, externalTable: null, empCardNo: null, providerEmployeeName: "JIGNESH PADHIYAR", source: "DownloadPunchDataMCID" }]);
  await expectCode(c.downloadPunchDataMCID(range), "PROVIDER_ERROR");
});

// ---------------------------------------------------------------- API 3: DownloadInOutPunchData

test("ETO-14: DownloadInOutPunchData maps IN/OUT, '--:--' to NULL, work/overtime/late/early and status", async () => {
  const { fetchImpl, calls } = fakeFetch([{ body: SAMPLE_IN_OUT }]);
  const c = client(fetchImpl);
  const mapped = mapInOutPunchData(await c.downloadInOutPunchData({ empcode: "ALL", fromDate: "01/01/2026", toDate: "01/12/2026" }));
  assert.equal(calls[0]?.url, "https://api.etimeoffice.com/api/DownloadInOutPunchData?Empcode=ALL&FromDate=01/01/2026&ToDate=01/12/2026");
  assert.deepEqual(mapped, [{
    employeeCode: "0001", attendanceDate: "2026-01-01", inTime: "12:06:00", outTime: null,
    workMinutes: 0, overtimeMinutes: 0, lateInMinutes: 156, earlyOutMinutes: 0,
    status: "P/2", remark: "MIS-LT", providerEmployeeName: "JIGNESH PADHIYAR", rawInTime: "12:06", rawOutTime: "--:--"
  }]);
});

test("ETO-15: the In/Out date format is explicit per configuration (date-only default, documented example)", async () => {
  const dateOnly = client(fakeFetch([{ body: SAMPLE_IN_OUT }]).fetchImpl);
  assert.equal(dateOnly.formatInOutDate({ year: 2026, month: 1, day: 1 }, false), "01/01/2026");
  await expectCode(dateOnly.downloadInOutPunchData({ empcode: "ALL", fromDate: "01/01/2026_00:00", toDate: "01/12/2026_23:59" }), "INVALID_REQUEST");
  const { fetchImpl, calls } = fakeFetch([{ body: SAMPLE_IN_OUT }]);
  const dateTime = client(fetchImpl, { inOutDateFormat: "datetime" });
  assert.equal(dateTime.formatInOutDate({ year: 2026, month: 12, day: 1 }, true), "01/12/2026_23:59");
  await dateTime.downloadInOutPunchData({ empcode: "ALL", fromDate: "01/01/2026_00:00", toDate: "01/12/2026_23:59" });
  assert.ok(calls[0]?.url.endsWith("FromDate=01/01/2026_00:00&ToDate=01/12/2026_23:59"));
  await expectCode(dateTime.downloadInOutPunchData({ empcode: "ALL", fromDate: "01/01/2026", toDate: "01/12/2026" }), "INVALID_REQUEST");
});

test("ETO-16: an invalid OUTTime value is rejected rather than stored as text", async () => {
  const bad = { ...SAMPLE_IN_OUT, InOutPunchData: [{ ...SAMPLE_IN_OUT.InOutPunchData[0], OUTTime: "late" }] };
  const response = await client(fakeFetch([{ body: bad }]).fetchImpl).downloadInOutPunchData({ empcode: "ALL", fromDate: "01/01/2026", toDate: "01/12/2026" });
  assert.throws(() => mapInOutPunchData(response), (error: unknown) => error instanceof EtimeOfficeError && error.code === "INVALID_RESPONSE");
});

// ---------------------------------------------------------------- API 4: DownloadLastPunchData

test("ETO-17: DownloadLastPunchData sends LastRecord as documented and maps provider ID/Table/EmpcardNo", async () => {
  const { fetchImpl, calls } = fakeFetch([{ body: SAMPLE_LAST }]);
  const response = await client(fetchImpl).downloadLastPunchData({ empcode: "ALL", lastRecord: "042026$454" });
  assert.equal(calls[0]?.url, "https://api.etimeoffice.com/api/DownloadLastPunchData?Empcode=ALL&LastRecord=042026$454");
  assert.equal(response.MaxRecord, "042026$456");
  const mapped = mapLastPunchData(response);
  assert.deepEqual(mapped.map((punch) => [punch.employeeCode, punch.punchedAtLocal, punch.externalRecordId, punch.externalTable, punch.empCardNo, punch.machineFlag]), [
    ["0005", "2026-04-30 09:46:00", 455, "TextFileData042026", "00000005", null],
    ["0010", "2026-04-30 09:49:00", 456, "TextFileData042026", "00000010", null]
  ]);
});

test("ETO-18: missing or malformed MaxRecord, or a non-array PunchData, is INVALID_RESPONSE; empty PunchData is valid", async () => {
  const last = (body: unknown) => client(fakeFetch([{ body }]).fetchImpl).downloadLastPunchData({ empcode: "ALL", lastRecord: "042026$454" });
  const withoutMax: Record<string, unknown> = { ...SAMPLE_LAST };
  delete withoutMax.MaxRecord;
  await expectCode(last(withoutMax), "INVALID_RESPONSE");
  await expectCode(last({ ...SAMPLE_LAST, MaxRecord: "456" }), "INVALID_RESPONSE");
  await expectCode(last({ ...SAMPLE_LAST, MaxRecord: "132026$456" }), "INVALID_RESPONSE");
  await expectCode(last({ ...SAMPLE_LAST, PunchData: {} }), "INVALID_RESPONSE");
  await expectCode(last({ ...SAMPLE_LAST, PunchData: [{ ...SAMPLE_LAST.PunchData[0], ID: "455" }] }), "INVALID_RESPONSE");
  const empty = await last({ Error: false, Msg: "Success", IsAdmin: true, PunchData: [], MaxRecord: "042026$456" });
  assert.deepEqual(mapLastPunchData(empty), []);
});

test("ETO-19: leading zeros in Empcode are preserved end to end", async () => {
  const response = await client(fakeFetch([{ body: [{ Empcode: "0001", PunchDate: "01/01/2026 09:00:00" }] }]).fetchImpl).downloadPunchData({ ...range, empcode: "0001" });
  assert.equal(mapPunchData(response)[0]?.employeeCode, "0001");
});

test("ETO-20: query values keep the documented '/', ':' and '$' and encode anything else", () => {
  assert.equal(encodeQueryValue("01/01/2026_01:00"), "01/01/2026_01:00");
  assert.equal(encodeQueryValue("042026$454"), "042026$454");
  assert.equal(encodeQueryValue("A&B=C D"), "A%26B%3DC%20D");
});

// ---------------------------------------------------------------- configuration and polling

const baseEnv = { NODE_ENV: "test", DATABASE_URL: "postgresql://u:p@localhost:5432/x", SESSION_SECRET: "s".repeat(48) };

test("ETO-21: configuration defaults, https-only base URL, all-or-nothing credentials, validated initial LastRecord", () => {
  const defaults = loadConfig(baseEnv);
  assert.equal(defaults.ETIME_BASE_URL, "https://api.etimeoffice.com/api/");
  assert.equal(defaults.ETIME_SYNC_ENABLED, false);
  assert.equal(defaults.ETIME_SYNC_EMPCODE, "ALL");
  assert.equal(defaults.ETIME_POLL_INTERVAL_MINUTES, 5);
  assert.equal(defaults.ETIME_REQUEST_TIMEOUT_MS, 30_000);
  assert.equal(defaults.ETIME_INOUT_DATE_FORMAT, "date");
  assert.equal(defaults.ETIME_INITIAL_LAST_RECORD, undefined, "no initial LastRecord is invented");
  assert.throws(() => loadConfig({ ...baseEnv, ETIME_BASE_URL: "http://api.etimeoffice.com/api/" }), /https/);
  assert.throws(() => loadConfig({ ...baseEnv, ETIME_USERNAME: "u" }), /configured together/);
  assert.throws(() => loadConfig({ ...baseEnv, ETIME_SYNC_ENABLED: "true" }), /requires/);
  assert.throws(() => loadConfig({ ...baseEnv, ETIME_INITIAL_LAST_RECORD: "000000$0" }), /MMyyyy\$ID/);
  const full = loadConfig({ ...baseEnv, ETIME_CORPORATE_ID: "c", ETIME_USERNAME: "u", ETIME_PASSWORD: "p", ETIME_SYNC_ENABLED: "true", ETIME_INITIAL_LAST_RECORD: "042026$454", ETIME_POLL_INTERVAL_MINUTES: "10" });
  assert.equal(full.ETIME_SYNC_ENABLED, true);
  assert.equal(full.ETIME_INITIAL_LAST_RECORD, "042026$454");
  assert.equal(full.ETIME_POLL_INTERVAL_MINUTES, 10);
});

test("ETO-22: the poller never overlaps runs and survives a crashing sync", async () => {
  let release: (() => void) | undefined;
  let calls = 0;
  const poller = new AttendancePoller({
    intervalMs: 60_000,
    log: () => {},
    syncService: {
      syncLastPunchData: () => {
        calls += 1;
        if (calls === 2) return Promise.reject(new Error("boom"));
        return new Promise((resolve) => { release = () => resolve({ runId: null, status: "SUCCEEDED", requestLastRecord: null, maxRecord: null, recordsReceived: 0, recordsInserted: 0, duplicates: 0, unmapped: 0, errorCode: null, errorMessage: null }); });
      }
    }
  });
  const first = poller.tick();
  assert.equal(await poller.tick(), null, "a second tick while running is skipped");
  release?.();
  assert.equal((await first)?.status, "SUCCEEDED");
  assert.equal(await poller.tick(), null, "a crashing sync is contained");
  assert.equal(calls, 2);
  await poller.stop();
});

test("ETO-23: HTTP 503 is retried as transient; a base URL without the trailing slash builds the same request", async () => {
  const sleeps: number[] = [];
  const { fetchImpl, calls } = fakeFetch([{ status: 503, body: {} }, { body: SAMPLE_LAST }]);
  const noSlash = new EtimeOfficeClient({ baseUrl: "https://api.etimeoffice.com/api", credentials: CREDENTIALS, timeoutMs: 30_000, fetchImpl, sleep: async (ms) => { sleeps.push(ms); }, log: () => {} });
  assert.equal((await noSlash.downloadLastPunchData({ empcode: "ALL", lastRecord: "042026$454" })).MaxRecord, "042026$456");
  assert.deepEqual(sleeps, [2000]);
  assert.deepEqual(calls.map((call) => call.url), [
    "https://api.etimeoffice.com/api/DownloadLastPunchData?Empcode=ALL&LastRecord=042026$454",
    "https://api.etimeoffice.com/api/DownloadLastPunchData?Empcode=ALL&LastRecord=042026$454"
  ]);
});

test("ETO-24: an undocumented status (e.g. 403, 429) is not retried", async () => {
  for (const status of [403, 429]) {
    const sleeps: number[] = [];
    const { fetchImpl, calls } = fakeFetch([{ status, body: {} }]);
    await expectCode(client(fetchImpl, { sleeps }).downloadPunchData(range), "UNEXPECTED_STATUS");
    assert.equal(calls.length, 1, String(status));
    assert.deepEqual(sleeps, []);
  }
});
