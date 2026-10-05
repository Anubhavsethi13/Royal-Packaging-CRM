import crypto from "node:crypto";
import { ETIME_RECORD_PATTERN } from "@royal-packaging/config";
import type { DatabaseConnection, DatabaseTransaction } from "@royal-packaging/db";
import { sql } from "kysely";

import type { EtimeOfficeClient } from "../../integrations/etime-office/etime-office-client.js";
import { ETIME_ENDPOINTS } from "../../integrations/etime-office/etime-office-client.js";
import { parseIsoDate } from "../../integrations/etime-office/etime-office-dates.js";
import { EtimeOfficeError } from "../../integrations/etime-office/etime-office-errors.js";
import { mapInOutPunchData, mapLastPunchData, type MappedDailyAttendance, type MappedPunch } from "../../integrations/etime-office/etime-office-mapper.js";

export const ETIME_PROVIDER = "ETIME_OFFICE";
export const LAST_PUNCH_SCOPE = "LAST_PUNCH";

export type SyncTrigger = "SCHEDULER" | "MANUAL";

export interface SyncOutcome {
  readonly runId: string | null;
  readonly status: "SUCCEEDED" | "FAILED" | "SKIPPED";
  readonly requestLastRecord: string | null;
  readonly maxRecord: string | null;
  readonly recordsReceived: number;
  readonly recordsInserted: number;
  readonly duplicates: number;
  readonly unmapped: number;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
}

export interface AttendanceSyncServiceConfig {
  readonly database: DatabaseConnection;
  /** Null when ETIME_* credentials are not configured. */
  readonly client: Pick<EtimeOfficeClient, "downloadLastPunchData" | "downloadInOutPunchData" | "formatInOutDate"> | null;
  /** Provider-approved first LastRecord (ETIME_INITIAL_LAST_RECORD); never invented. */
  readonly initialLastRecord?: string | undefined;
  /** `ALL` or one employee code for the incremental poll. */
  readonly empcode?: string;
  readonly log?: (message: string) => void;
}

/** Thrown inside the batch transaction when another sync advanced the checkpoint first. */
class CheckpointChangedError extends Error {
  public readonly code = "CHECKPOINT_CHANGED";
}

const MAX_ERROR_LENGTH = 500;
const safeMessage = (error: unknown): { code: string; message: string } => {
  if (error instanceof EtimeOfficeError) return { code: error.code, message: error.message.slice(0, MAX_ERROR_LENGTH) };
  if (error instanceof CheckpointChangedError) return { code: error.code, message: error.message };
  // Database failures keep only the SQLSTATE code (e.g. 23505): the driver message may contain row data.
  const sqlState = typeof error === "object" && error !== null && "code" in error && typeof (error as { code: unknown }).code === "string" ? (error as { code: string }).code : null;
  return { code: "PERSISTENCE_FAILED", message: `Attendance records could not be stored${sqlState ? ` (database error ${sqlState})` : ""}; the checkpoint was not advanced.` };
};

/**
 * Upper bound for one sync run: 5 provider attempts (default 30 s timeout) with 30 s of backoff
 * plus the database work is far below this, so an older RUNNING run belongs to a process that
 * stopped mid-run (its transaction never committed, so its checkpoint was never advanced).
 */
export const INTERRUPTED_RUN_AFTER_MINUTES = 60;

/**
 * e-Time Office → CRM attendance synchronization.
 *
 * Incremental (DownloadLastPunchData): read the stored LastRecord (or the configured initial
 * value on the very first run), download, validate, then in ONE transaction store the punches,
 * record unmapped employee codes and only then advance the checkpoint to the returned
 * MaxRecord. Any failure rolls the transaction back and keeps the previous checkpoint, so no
 * punch can be skipped. Punches are deduplicated on the provider's Table + ID.
 */
export class AttendanceSyncService {
  private readonly database: DatabaseConnection;
  private readonly client: AttendanceSyncServiceConfig["client"];
  private readonly initialLastRecord: string | undefined;
  private readonly empcode: string;
  private readonly log: (message: string) => void;
  private running = false;

  public constructor(config: AttendanceSyncServiceConfig) {
    this.database = config.database;
    this.client = config.client;
    this.initialLastRecord = config.initialLastRecord;
    this.empcode = config.empcode ?? "ALL";
    this.log = config.log ?? ((message) => console.log(message));
  }

  public get configured(): boolean {
    return this.client !== null;
  }

  public get syncEmpcode(): string {
    return this.empcode;
  }

  public async syncLastPunchData(trigger: SyncTrigger, actorUserId: string | null = null): Promise<SyncOutcome> {
    if (this.running) {
      return outcome({ status: "SKIPPED", errorCode: "SYNC_IN_PROGRESS", errorMessage: "A synchronization is already running." });
    }
    this.running = true;
    try {
      return await this.runLastPunchSync(trigger, actorUserId);
    } finally {
      this.running = false;
    }
  }

  private async runLastPunchSync(trigger: SyncTrigger, actorUserId: string | null): Promise<SyncOutcome> {
    const endpoint = ETIME_ENDPOINTS.lastPunchData;
    await this.closeInterruptedRuns();
    await this.ensureState();
    const state = await this.readState(this.database);
    const requestLastRecord = state?.last_record ?? this.initialLastRecord ?? null;
    const runId = await this.startRun(endpoint, trigger, actorUserId, { requestLastRecord });

    if (!this.client) {
      return this.fail(runId, requestLastRecord, { code: "NOT_CONFIGURED", message: "e-Time Office credentials are not configured (ETIME_CORPORATE_ID, ETIME_USERNAME, ETIME_PASSWORD)." });
    }
    if (!requestLastRecord || !ETIME_RECORD_PATTERN.test(requestLastRecord)) {
      return this.fail(runId, requestLastRecord, { code: "NOT_CONFIGURED", message: "No LastRecord checkpoint: set ETIME_INITIAL_LAST_RECORD to the provider-approved initial value (MMyyyy$ID)." });
    }

    let maxRecord: string;
    let punches: MappedPunch[];
    try {
      const response = await this.client.downloadLastPunchData({ empcode: this.empcode, lastRecord: requestLastRecord });
      maxRecord = response.MaxRecord;
      punches = mapLastPunchData(response);
    } catch (error) {
      return this.fail(runId, requestLastRecord, safeMessage(error));
    }

    try {
      const counts = await this.database.transaction().execute(async (trx) => {
        const locked = await trx
          .selectFrom("attendance_sync_state")
          .select("last_record")
          .where("provider", "=", ETIME_PROVIDER)
          .where("scope", "=", LAST_PUNCH_SCOPE)
          .where("empcode", "=", this.empcode)
          .forUpdate()
          .executeTakeFirstOrThrow();
        if ((locked.last_record ?? this.initialLastRecord ?? null) !== requestLastRecord) {
          throw new CheckpointChangedError("The checkpoint changed during this sync (another sync ran); nothing was stored.");
        }

        const written = await this.storePunches(trx, runId, punches);
        await trx
          .updateTable("attendance_sync_state")
          .set({
            last_record: maxRecord,
            last_success_at: sql<Date>`now()`,
            records_received: punches.length,
            records_inserted: written.inserted,
            sync_status: "SUCCEEDED",
            error_code: null,
            error_message: null,
            updated_at: sql<Date>`now()`,
            version: sql<string>`version + 1`
          })
          .where("provider", "=", ETIME_PROVIDER)
          .where("scope", "=", LAST_PUNCH_SCOPE)
          .where("empcode", "=", this.empcode)
          .execute();
        await trx
          .updateTable("attendance_sync_runs")
          .set({ status: "SUCCEEDED", response_max_record: maxRecord, records_received: punches.length, records_inserted: written.inserted, duplicates: written.duplicates, unmapped: written.unmapped, finished_at: sql<Date>`now()` })
          .where("id", "=", runId)
          .execute();
        return written;
      });

      this.log(`[INFO] e-Time Office sync ${runId}: ${punches.length} received, ${counts.inserted} stored, ${counts.duplicates} duplicate, ${counts.unmapped} unmapped; checkpoint ${requestLastRecord} -> ${maxRecord}.`);
      return outcome({ runId, status: "SUCCEEDED", requestLastRecord, maxRecord, recordsReceived: punches.length, recordsInserted: counts.inserted, duplicates: counts.duplicates, unmapped: counts.unmapped });
    } catch (error) {
      return this.fail(runId, requestLastRecord, safeMessage(error), punches.length);
    }
  }

  /**
   * DownloadInOutPunchData for a date range (calculated daily attendance). There is no
   * incremental API for it, so rows are upserted per employee code and date: a later
   * download of the same day replaces the earlier provider values.
   */
  public async importInOutRange(input: { from: string; to: string; empcode?: string | undefined }, trigger: SyncTrigger, actorUserId: string | null): Promise<SyncOutcome> {
    const from = parseIsoDate(input.from);
    const to = parseIsoDate(input.to);
    if (!from || !to || input.from > input.to) {
      throw new EtimeOfficeError("INVALID_REQUEST", ETIME_ENDPOINTS.inOutPunchData, "from and to must be YYYY-MM-DD dates with from <= to.");
    }
    const empcode = input.empcode?.trim() || "ALL";
    if (!this.client) {
      throw new EtimeOfficeError("NOT_CONFIGURED", ETIME_ENDPOINTS.inOutPunchData, "e-Time Office credentials are not configured.");
    }
    const fromDate = this.client.formatInOutDate(from, false);
    const toDate = this.client.formatInOutDate(to, true);
    const runId = await this.startRun(ETIME_ENDPOINTS.inOutPunchData, trigger, actorUserId, { requestFrom: fromDate, requestTo: toDate, empcode });

    let rows: MappedDailyAttendance[];
    try {
      rows = mapInOutPunchData(await this.client.downloadInOutPunchData({ empcode, fromDate, toDate }));
    } catch (error) {
      return this.failRun(runId, safeMessage(error), 0);
    }

    try {
      const written = await this.database.transaction().execute(async (trx) => {
        const employees = await this.employeesByCode(trx, rows.map((row) => row.employeeCode));
        let unmapped = 0;
        for (const row of rows) {
          const employeeId = employees.get(row.employeeCode) ?? null;
          const upserted = await trx
            .insertInto("attendance_daily_records")
            .values({
              id: crypto.randomUUID(),
              employee_id: employeeId,
              employee_code: row.employeeCode,
              attendance_date: row.attendanceDate,
              in_time: row.inTime,
              out_time: row.outTime,
              work_minutes: row.workMinutes,
              overtime_minutes: row.overtimeMinutes,
              late_in_minutes: row.lateInMinutes,
              early_out_minutes: row.earlyOutMinutes,
              status: row.status,
              remark: row.remark,
              provider_employee_name: row.providerEmployeeName,
              raw_in_time: row.rawInTime,
              raw_out_time: row.rawOutTime,
              sync_run_id: runId
            })
            .onConflict((oc) => oc.constraint("attendance_daily_records_code_date_unique").doUpdateSet((eb) => ({
              employee_id: eb.ref("excluded.employee_id"),
              in_time: eb.ref("excluded.in_time"),
              out_time: eb.ref("excluded.out_time"),
              work_minutes: eb.ref("excluded.work_minutes"),
              overtime_minutes: eb.ref("excluded.overtime_minutes"),
              late_in_minutes: eb.ref("excluded.late_in_minutes"),
              early_out_minutes: eb.ref("excluded.early_out_minutes"),
              status: eb.ref("excluded.status"),
              remark: eb.ref("excluded.remark"),
              provider_employee_name: eb.ref("excluded.provider_employee_name"),
              raw_in_time: eb.ref("excluded.raw_in_time"),
              raw_out_time: eb.ref("excluded.raw_out_time"),
              sync_run_id: eb.ref("excluded.sync_run_id"),
              updated_at: sql<Date>`now()`
            })))
            // xmax = 0 only for a freshly inserted row (an updated row carries the updating transaction id).
            .returning(sql<boolean>`(xmax = 0)`.as("inserted"))
            .executeTakeFirstOrThrow();
          if (!employeeId) {
            unmapped += 1;
          }
          if (!employeeId && upserted.inserted) {
            await this.recordException(trx, runId, row.employeeCode, `Empcode ${row.employeeCode} has no CRM employee (employees.employee_code).`, { endpoint: ETIME_ENDPOINTS.inOutPunchData, ...row });
          }
        }
        await trx
          .updateTable("attendance_sync_runs")
          .set({ status: "SUCCEEDED", records_received: rows.length, records_inserted: rows.length, unmapped, finished_at: sql<Date>`now()` })
          .where("id", "=", runId)
          .execute();
        return { unmapped };
      });
      this.log(`[INFO] e-Time Office in/out import ${runId}: ${rows.length} daily rows stored, ${written.unmapped} unmapped.`);
      return outcome({ runId, status: "SUCCEEDED", recordsReceived: rows.length, recordsInserted: rows.length, unmapped: written.unmapped });
    } catch (error) {
      return this.failRun(runId, safeMessage(error), rows.length);
    }
  }

  /** Inserts punches (deduplicated) and records unmapped employee codes. Runs inside the batch transaction. */
  private async storePunches(trx: DatabaseTransaction, runId: string, punches: readonly MappedPunch[]): Promise<{ inserted: number; duplicates: number; unmapped: number }> {
    if (punches.length === 0) return { inserted: 0, duplicates: 0, unmapped: 0 };
    const employees = await this.employeesByCode(trx, punches.map((punch) => punch.employeeCode));
    let inserted = 0;
    let unmapped = 0;
    for (const punch of punches) {
      const employeeId = employees.get(punch.employeeCode) ?? null;
      const row = await trx
        .insertInto("attendance_punches")
        .values({
          id: crypto.randomUUID(),
          employee_id: employeeId,
          employee_code: punch.employeeCode,
          punched_at_local: punch.punchedAtLocal,
          machine_id: punch.machineId,
          machine_flag: punch.machineFlag,
          external_record_id: punch.externalRecordId === null ? null : String(punch.externalRecordId),
          external_table: punch.externalTable,
          emp_card_no: punch.empCardNo,
          provider_employee_name: punch.providerEmployeeName,
          source: punch.source,
          sync_run_id: runId
        })
        .onConflict((oc) => (punch.externalRecordId === null
          ? oc.columns(["employee_code", "punched_at_local", "source"]).where("external_record_id", "is", null).doNothing()
          : oc.columns(["external_table", "external_record_id"]).where("external_record_id", "is not", null).doNothing()))
        .returning("id")
        .executeTakeFirst();
      if (!row) continue;
      inserted += 1;
      if (!employeeId) {
        unmapped += 1;
        await this.recordException(trx, runId, punch.employeeCode, `Empcode ${punch.employeeCode} has no CRM employee (employees.employee_code).`, { endpoint: punch.source, ...punch });
      }
    }
    return { inserted, duplicates: punches.length - inserted, unmapped };
  }

  /** Exact `employees.employee_code` match; leading zeros are significant. Name is never used. */
  private async employeesByCode(executor: DatabaseConnection | DatabaseTransaction, codes: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(codes)];
    if (unique.length === 0) return new Map();
    const rows = await executor.selectFrom("employees").select(["id", "employee_code"]).where("employee_code", "in", unique).execute();
    return new Map(rows.map((row) => [row.employee_code, row.id]));
  }

  private async recordException(trx: DatabaseTransaction, runId: string, empcode: string, message: string, payload: Record<string, unknown>): Promise<void> {
    await trx
      .insertInto("attendance_sync_exceptions")
      .values({ id: crypto.randomUUID(), sync_run_id: runId, provider: ETIME_PROVIDER, empcode, error_type: "EMPLOYEE_NOT_FOUND", error_message: message, payload: JSON.stringify(payload) })
      .execute();
  }

  /** Marks runs abandoned by a stopped process as FAILED/INTERRUPTED. Data is unaffected: nothing they did was committed. */
  private async closeInterruptedRuns(): Promise<void> {
    await this.database
      .updateTable("attendance_sync_runs")
      .set({ status: "FAILED", error_code: "INTERRUPTED", error_message: "The process stopped during this run; nothing was committed and the checkpoint was not advanced.", finished_at: sql<Date>`now()` })
      .where("provider", "=", ETIME_PROVIDER)
      .where("status", "=", "RUNNING")
      .where("started_at", "<", sql<Date>`now() - make_interval(mins => ${INTERRUPTED_RUN_AFTER_MINUTES})`)
      .execute();
  }

  private async ensureState(): Promise<void> {
    await this.database
      .insertInto("attendance_sync_state")
      .values({ id: crypto.randomUUID(), provider: ETIME_PROVIDER, scope: LAST_PUNCH_SCOPE, empcode: this.empcode, last_record: null })
      .onConflict((oc) => oc.constraint("attendance_sync_state_scope_unique").doNothing())
      .execute();
  }

  private async readState(executor: DatabaseConnection): Promise<{ last_record: string | null } | undefined> {
    return executor
      .selectFrom("attendance_sync_state")
      .select("last_record")
      .where("provider", "=", ETIME_PROVIDER)
      .where("scope", "=", LAST_PUNCH_SCOPE)
      .where("empcode", "=", this.empcode)
      .executeTakeFirst();
  }

  private async startRun(endpoint: string, trigger: SyncTrigger, actorUserId: string | null, request: { requestLastRecord?: string | null; requestFrom?: string; requestTo?: string; empcode?: string }): Promise<string> {
    const id = crypto.randomUUID();
    await this.database
      .insertInto("attendance_sync_runs")
      .values({
        id,
        provider: ETIME_PROVIDER,
        endpoint,
        empcode: request.empcode ?? this.empcode,
        trigger,
        actor_user_id: actorUserId,
        status: "RUNNING",
        request_last_record: request.requestLastRecord ?? null,
        response_max_record: null,
        request_from: request.requestFrom ?? null,
        request_to: request.requestTo ?? null,
        error_code: null,
        error_message: null,
        finished_at: null
      })
      .execute();
    if (endpoint === ETIME_ENDPOINTS.lastPunchData) {
      await this.database
        .updateTable("attendance_sync_state")
        .set({ last_attempt_at: sql<Date>`now()`, sync_status: "RUNNING", updated_at: sql<Date>`now()` })
        .where("provider", "=", ETIME_PROVIDER)
        .where("scope", "=", LAST_PUNCH_SCOPE)
        .where("empcode", "=", this.empcode)
        .execute();
    }
    return id;
  }

  /** Records an incremental-sync failure. The checkpoint (`last_record`) is never touched here. */
  private async fail(runId: string, requestLastRecord: string | null, error: { code: string; message: string }, received = 0): Promise<SyncOutcome> {
    await this.database
      .updateTable("attendance_sync_state")
      .set({ sync_status: "FAILED", error_code: error.code, error_message: error.message, updated_at: sql<Date>`now()` })
      .where("provider", "=", ETIME_PROVIDER)
      .where("scope", "=", LAST_PUNCH_SCOPE)
      .where("empcode", "=", this.empcode)
      .execute();
    return this.failRun(runId, error, received, requestLastRecord);
  }

  private async failRun(runId: string, error: { code: string; message: string }, received: number, requestLastRecord: string | null = null): Promise<SyncOutcome> {
    await this.database
      .updateTable("attendance_sync_runs")
      .set({ status: "FAILED", error_code: error.code, error_message: error.message, records_received: received, finished_at: sql<Date>`now()` })
      .where("id", "=", runId)
      .execute();
    const alert = error.code === "AUTHENTICATION_FAILED" || error.code === "NOT_CONFIGURED" ? "[ALERT]" : "[ERROR]";
    this.log(`${alert} e-Time Office sync ${runId} failed: ${error.code}. ${error.message}`);
    return outcome({ runId, status: "FAILED", requestLastRecord, recordsReceived: received, errorCode: error.code, errorMessage: error.message });
  }
}

function outcome(partial: Partial<SyncOutcome> & Pick<SyncOutcome, "status">): SyncOutcome {
  return {
    runId: null,
    requestLastRecord: null,
    maxRecord: null,
    recordsReceived: 0,
    recordsInserted: 0,
    duplicates: 0,
    unmapped: 0,
    errorCode: null,
    errorMessage: null,
    ...partial
  };
}
