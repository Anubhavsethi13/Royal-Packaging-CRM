import assert from "node:assert/strict";
import test from "node:test";

import { loadProjectEnv } from "../packages/config/src/index.js";
import { EtimeOfficeClient } from "../apps/api/src/integrations/etime-office/etime-office-client.js";
import { formatProviderDateTime } from "../apps/api/src/integrations/etime-office/etime-office-dates.js";
import { mapPunchData } from "../apps/api/src/integrations/etime-office/etime-office-mapper.js";

/**
 * Opt-in check against the real e-Time Office API (read-only GETs). Skipped unless
 * ETIME_INTEGRATION_TEST=true and ETIME_CORPORATE_ID / ETIME_USERNAME / ETIME_PASSWORD are set
 * in the environment. Never put real credentials in this file.
 */
loadProjectEnv();
const enabled = process.env.ETIME_INTEGRATION_TEST === "true";
const credentials = {
  corporateId: process.env.ETIME_CORPORATE_ID ?? "",
  username: process.env.ETIME_USERNAME ?? "",
  password: process.env.ETIME_PASSWORD ?? ""
};
const ready = enabled && credentials.corporateId !== "" && credentials.username !== "" && credentials.password !== "";
const skip = ready ? false : "set ETIME_INTEGRATION_TEST=true and the ETIME_* credentials to run";

const client = () => new EtimeOfficeClient({
  baseUrl: process.env.ETIME_BASE_URL || "https://api.etimeoffice.com/api/",
  credentials,
  timeoutMs: 30_000,
  retryDelaysMs: [2_000],
  log: () => {}
});

test("LIVE-1: DownloadPunchData for the last 24 hours returns the documented shape", { skip }, async () => {
  const now = new Date();
  const from = new Date(now.getTime() - 86_400_000);
  const parts = (date: Date) => ({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes() });
  const rows = await client().downloadPunchData({ empcode: process.env.ETIME_SYNC_EMPCODE || "ALL", fromDate: formatProviderDateTime(parts(from)), toDate: formatProviderDateTime(parts(now)) });
  assert.ok(Array.isArray(rows));
  for (const punch of mapPunchData(rows)) assert.match(punch.punchedAtLocal, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test("LIVE-2: DownloadLastPunchData from the configured initial LastRecord returns a MaxRecord", { skip: skip || (process.env.ETIME_INITIAL_LAST_RECORD ? false : "set ETIME_INITIAL_LAST_RECORD to run") }, async () => {
  const response = await client().downloadLastPunchData({ empcode: process.env.ETIME_SYNC_EMPCODE || "ALL", lastRecord: process.env.ETIME_INITIAL_LAST_RECORD as string });
  assert.match(response.MaxRecord, /^(0[1-9]|1[0-2])\d{4}\$\d+$/);
});
