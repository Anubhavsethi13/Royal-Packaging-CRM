import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";
import { z } from "zod";

import { parseIsoDate } from "../../integrations/etime-office/etime-office-dates.js";
import { BadRequestError, ForbiddenError } from "../../middleware/error-handler.js";
import { ETIME_PROVIDER } from "./attendance-sync-service.js";

/** Who is asking: `allEmployees` comes from the authorization policy, never from the request. */
export interface AttendanceAccess {
  readonly userId: string;
  readonly allEmployees: boolean;
}

export interface AttendanceSyncSettings {
  readonly configured: boolean;
  readonly pollingEnabled: boolean;
  readonly pollIntervalMinutes: number;
  readonly empcode: string;
}

const isoDate = z.string().refine((value) => parseIsoDate(value) !== null, "must be a real YYYY-MM-DD date");
const filterSchema = z.object({
  employee_id: z.string().uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional()
});

export type AttendanceFilter = z.input<typeof filterSchema>;

export interface AttendancePage<T> {
  readonly items: T[];
  readonly total: number;
}

/**
 * Read model for attendance synchronized from e-Time Office. Organisation-wide readers see
 * every employee; everyone else sees only the employee profile linked to their own user.
 * Provider wall-clock values are returned as text so no timezone conversion can alter them.
 */
export class AttendanceReadService {
  private readonly database: DatabaseConnection;
  private readonly settings: AttendanceSyncSettings;

  public constructor(config: { database: DatabaseConnection; settings: AttendanceSyncSettings }) {
    this.database = config.database;
    this.settings = config.settings;
  }

  public async listPunches(filter: AttendanceFilter, access: AttendanceAccess, page: { limit: number; offset: number }): Promise<AttendancePage<Record<string, unknown>>> {
    const { employeeId, from, to } = await this.scope(filter, access);
    let query = this.database.selectFrom("attendance_punches as p").leftJoin("employees as e", "e.id", "p.employee_id");
    if (employeeId) query = query.where("p.employee_id", "=", employeeId);
    if (from) query = query.where("p.punched_at_local", ">=", from);
    if (to) query = query.where(sql<boolean>`p.punched_at_local < (${to}::date + 1)`);
    const total = await query.select((eb) => eb.fn.countAll<string>().as("count")).executeTakeFirstOrThrow();
    const rows = await query
      .select([
        "p.id",
        "p.employee_id",
        "p.employee_code",
        "e.name as employee_name",
        sql<string>`to_char(p.punched_at_local, 'YYYY-MM-DD"T"HH24:MI:SS')`.as("punched_at_local"),
        "p.machine_id",
        "p.machine_flag",
        "p.external_record_id",
        "p.external_table",
        "p.source",
        "p.created_at"
      ])
      .orderBy("p.punched_at_local", "desc")
      .orderBy("p.id")
      .limit(page.limit)
      .offset(page.offset)
      .execute();
    return { items: rows.map((row) => ({ ...row, employee_mapped: row.employee_id !== null })), total: Number(total.count) };
  }

  public async listDaily(filter: AttendanceFilter, access: AttendanceAccess, page: { limit: number; offset: number }): Promise<AttendancePage<Record<string, unknown>>> {
    const { employeeId, from, to } = await this.scope(filter, access);
    let query = this.database.selectFrom("attendance_daily_records as d").leftJoin("employees as e", "e.id", "d.employee_id");
    if (employeeId) query = query.where("d.employee_id", "=", employeeId);
    if (from) query = query.where("d.attendance_date", ">=", from);
    if (to) query = query.where("d.attendance_date", "<=", to);
    const total = await query.select((eb) => eb.fn.countAll<string>().as("count")).executeTakeFirstOrThrow();
    const rows = await query
      .select([
        "d.id",
        "d.employee_id",
        "d.employee_code",
        "e.name as employee_name",
        sql<string>`to_char(d.attendance_date, 'YYYY-MM-DD')`.as("attendance_date"),
        sql<string | null>`to_char(d.in_time, 'HH24:MI')`.as("in_time"),
        sql<string | null>`to_char(d.out_time, 'HH24:MI')`.as("out_time"),
        "d.work_minutes",
        "d.overtime_minutes",
        "d.late_in_minutes",
        "d.early_out_minutes",
        "d.status",
        "d.remark",
        "d.source",
        "d.updated_at"
      ])
      .orderBy("d.attendance_date", "desc")
      .orderBy("d.employee_code")
      .limit(page.limit)
      .offset(page.offset)
      .execute();
    return { items: rows.map((row) => ({ ...row, employee_mapped: row.employee_id !== null })), total: Number(total.count) };
  }

  /** Safe synchronization status: checkpoint, counts, last error. Never any credential. */
  public async syncStatus(): Promise<Record<string, unknown>> {
    const [states, runs, exceptions] = await Promise.all([
      this.database
        .selectFrom("attendance_sync_state")
        .select(["scope", "empcode", "last_record", "last_attempt_at", "last_success_at", "records_received", "records_inserted", "sync_status", "error_code", "error_message"])
        .where("provider", "=", ETIME_PROVIDER)
        .orderBy("scope")
        .execute(),
      this.database
        .selectFrom("attendance_sync_runs")
        .select(["id", "endpoint", "empcode", "trigger", "status", "request_last_record", "response_max_record", "request_from", "request_to", "records_received", "records_inserted", "duplicates", "unmapped", "error_code", "error_message", "started_at", "finished_at"])
        .where("provider", "=", ETIME_PROVIDER)
        .orderBy("started_at", "desc")
        .limit(10)
        .execute(),
      this.database
        .selectFrom("attendance_sync_exceptions")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("provider", "=", ETIME_PROVIDER)
        .where("resolved_at", "is", null)
        .executeTakeFirstOrThrow()
    ]);
    return {
      provider: ETIME_PROVIDER,
      configured: this.settings.configured,
      polling_enabled: this.settings.pollingEnabled,
      poll_interval_minutes: this.settings.pollIntervalMinutes,
      empcode: this.settings.empcode,
      checkpoints: states,
      recent_runs: runs,
      open_exceptions: Number(exceptions.count)
    };
  }

  public async listExceptions(page: { limit: number; offset: number }): Promise<AttendancePage<Record<string, unknown>>> {
    const base = this.database.selectFrom("attendance_sync_exceptions").where("provider", "=", ETIME_PROVIDER);
    const total = await base.select((eb) => eb.fn.countAll<string>().as("count")).executeTakeFirstOrThrow();
    const rows = await base
      .select(["id", "sync_run_id", "empcode", "error_type", "error_message", "payload", "created_at", "resolved_at"])
      .orderBy("created_at", "desc")
      .limit(page.limit)
      .offset(page.offset)
      .execute();
    return { items: rows, total: Number(total.count) };
  }

  private async scope(filter: AttendanceFilter, access: AttendanceAccess): Promise<{ employeeId: string | undefined; from: string | undefined; to: string | undefined }> {
    const parsed = filterSchema.safeParse(filter);
    if (!parsed.success) {
      throw new BadRequestError("Invalid attendance filter.", parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
    }
    const { employee_id: requested, from, to } = parsed.data;
    if (from && to && from > to) throw new BadRequestError("from must not be after to.");
    if (access.allEmployees) return { employeeId: requested, from, to };

    // Own records only: the employee comes from the session's user, never from the request.
    const own = await this.database.selectFrom("employees").select("id").where("user_id", "=", access.userId).executeTakeFirst();
    if (!own) throw new ForbiddenError("Your user has no employee profile, so there is no attendance to show.");
    if (requested && requested !== own.id) throw new ForbiddenError("You may only view your own attendance.");
    return { employeeId: own.id, from, to };
  }
}
