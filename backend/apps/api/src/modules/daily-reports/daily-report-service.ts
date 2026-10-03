import crypto from "node:crypto";
import type {
  CreateDailyReportRequest,
  DailyReportDepotDTO,
  DailyReportDTO,
  DailyReportErrorField,
  DailyReportOptionsDTO,
  DailyReportRegisteredTasksDTO,
  DailyReportStatus,
  ListDailyReportsFilter,
  UpdateDailyReportRequest
} from "@royal-packaging/contracts";
import {
  classifyTaskType,
  createDailyReportRequestSchema,
  DAILY_REPORT_SUBMISSION_FIELDS,
  DailyReportDomainError,
  deriveDailyReportFigures,
  listDailyReportsFilterSchema,
  submitDailyReportRequestSchema,
  updateDailyReportRequestSchema
} from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql, type Transaction } from "kysely";
import type { RoyalPackagingDatabase } from "@royal-packaging/db";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export interface DailyReportServiceConfig {
  readonly database: DatabaseConnection;
  /** IANA zone (OPERATIONS_TIMEZONE) that defines the operational date of completed tasks. */
  readonly timeZone?: string;
}

/**
 * Who is acting and how far their depot authority reaches. Both values come
 * from the authenticated session and the server-side RBAC policy, never from
 * the request: `allDepots` is true only for roles the policy grants
 * `daily_report:read_all` / `daily_report:write_all`. Everyone else is scoped
 * to the depot of their own active employee profile.
 */
export interface DailyReportAccess {
  readonly userId: string;
  readonly allDepots: boolean;
}

export interface DailyReportPage {
  readonly items: DailyReportDTO[];
  readonly total: number;
}

interface ReportRow {
  id: string;
  depot_id: string;
  supervisor_employee_id: string | null;
  report_date: string;
  loading_count: number;
  unloading_count: number;
  start_time: string | null;
  end_time: string | null;
  labour_required: number | null;
  labour_present: number | null;
  status: string;
  submitted_at: Date | null;
  submitted_by_user_id: string | null;
  approved_at: Date | null;
  approved_by_user_id: string | null;
  created_by_user_id: string;
  updated_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

type Executor = DatabaseConnection | Transaction<RoyalPackagingDatabase>;

function validationError(error: { issues: ReadonlyArray<{ path: PropertyKey[]; code: string; message: string }> }): DailyReportDomainError {
  return new DailyReportDomainError(
    "VALIDATION_FAILED",
    error.issues[0]?.message ?? "Invalid daily report request",
    error.issues.map((issue) => ({ field: issue.path.map(String).join("."), code: issue.code, message: issue.message }))
  );
}

/**
 * Supervisor daily depot reports: structured operational figures per depot
 * per operational date, with a DRAFT → SUBMITTED lifecycle. Submitted reports
 * are read-only (no approval or reopening rule has been approved yet).
 * Every mutation writes a `depot_daily_report_events` audit row in the same
 * transaction.
 */
export class DailyReportService {
  private readonly database: DatabaseConnection;
  private readonly timeZone: string;

  public constructor(config: DailyReportServiceConfig) {
    this.database = config.database;
    this.timeZone = config.timeZone ?? "UTC";
  }

  public async listOptions(access: DailyReportAccess): Promise<DailyReportOptionsDTO> {
    const scopeDepotId = await this.resolveScopeDepot(access);
    let depots = this.database.selectFrom("depots").select(["id", "code", "name"]).where("active", "=", true);
    if (scopeDepotId) {
      depots = depots.where("id", "=", scopeDepotId);
    }
    const [depotRows, truckTypes] = await Promise.all([
      depots.orderBy("code", "asc").execute(),
      this.database.selectFrom("truck_types").select(["id", "code", "name"]).where("active", "=", true).orderBy("code", "asc").execute()
    ]);
    return { depots: depotRows, truck_types: truckTypes };
  }

  public async list(rawFilter: unknown, access: DailyReportAccess, page: { limit: number; offset: number }): Promise<DailyReportPage> {
    const parsed = listDailyReportsFilterSchema.safeParse(rawFilter);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const filter: ListDailyReportsFilter = parsed.data;
    const scopeDepotId = await this.resolveScopeDepot(access);
    if (scopeDepotId && filter.depot_id && filter.depot_id !== scopeDepotId) {
      throw new DailyReportDomainError("DEPOT_FORBIDDEN", "You can only view daily reports for your own depot.");
    }

    let query = this.database.selectFrom("depot_daily_reports");
    const depotId = scopeDepotId ?? filter.depot_id;
    if (depotId) query = query.where("depot_id", "=", depotId);
    if (filter.from) query = query.where("report_date", ">=", filter.from);
    if (filter.to) query = query.where("report_date", "<=", filter.to);
    if (filter.status) query = query.where("status", "=", filter.status);

    const [rows, totalRow] = await Promise.all([
      query.selectAll().orderBy("report_date", "desc").orderBy("depot_id", "asc").limit(page.limit).offset(page.offset).execute(),
      query.select((eb) => eb.fn.countAll<string>().as("total")).executeTakeFirst()
    ]);
    const items = await Promise.all((rows as ReportRow[]).map((row) => this.toDTO(row)));
    return { items, total: Number(totalRow?.total ?? 0) };
  }

  public async get(id: string, access: DailyReportAccess): Promise<DailyReportDTO> {
    const row = await this.findRow(this.database, id);
    await this.assertDepotAccess(row.depot_id, access, "view");
    return this.toDTO(row);
  }

  public async create(request: unknown, access: DailyReportAccess): Promise<DailyReportDTO> {
    const parsed = createDailyReportRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const data: CreateDailyReportRequest = parsed.data;
    const depotId = await this.resolveCreateDepot(data, access);
    const vehicles = await this.resolveVehicles(data.vehicles);
    const supervisorEmployeeId = await this.findEmployeeId(access.userId);

    const id = crypto.randomUUID();
    const now = new Date();
    try {
      await this.database.transaction().execute(async (trx) => {
        await trx
          .insertInto("depot_daily_reports")
          .values({
            id,
            depot_id: depotId,
            supervisor_employee_id: supervisorEmployeeId,
            report_date: data.report_date,
            loading_count: data.loading_count,
            unloading_count: data.unloading_count,
            start_time: data.start_time ?? null,
            end_time: data.end_time ?? null,
            labour_required: data.labour_required ?? null,
            labour_present: data.labour_present ?? null,
            status: "DRAFT",
            submitted_at: null,
            submitted_by_user_id: null,
            approved_at: null,
            approved_by_user_id: null,
            created_by_user_id: access.userId,
            updated_by_user_id: null,
            created_at: now,
            updated_at: now,
            version: "1"
          })
          .execute();
        await this.replaceVehicles(trx, id, vehicles);
        await this.recordEvent(trx, id, depotId, "DAILY_REPORT_CREATED", access.userId, { report_date: data.report_date });
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new DailyReportDomainError("DAILY_REPORT_DUPLICATE", `A daily report already exists for this depot on ${data.report_date}.`);
      }
      throw err;
    }
    return this.toDTO(await this.findRow(this.database, id));
  }

  public async update(id: string, request: unknown, access: DailyReportAccess): Promise<DailyReportDTO> {
    const parsed = updateDailyReportRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const data: UpdateDailyReportRequest = parsed.data;
    const vehicles = data.vehicles ? await this.resolveVehicles(data.vehicles) : null;

    await this.database.transaction().execute(async (trx) => {
      const row = await this.lockEditable(trx, id, data.version, access);
      const next = {
        loading_count: data.loading_count ?? row.loading_count,
        unloading_count: data.unloading_count ?? row.unloading_count,
        start_time: data.start_time !== undefined ? data.start_time : row.start_time,
        end_time: data.end_time !== undefined ? data.end_time : row.end_time,
        labour_required: data.labour_required !== undefined ? data.labour_required : row.labour_required,
        labour_present: data.labour_present !== undefined ? data.labour_present : row.labour_present
      };
      if (next.start_time && next.end_time && next.end_time <= next.start_time) {
        throw new DailyReportDomainError("VALIDATION_FAILED", "end_time must be later than start_time", [{ field: "end_time", message: "end_time must be later than start_time" }]);
      }
      const changed = Object.keys(next).filter((key) => next[key as keyof typeof next] !== row[key as keyof typeof next]);
      await trx
        .updateTable("depot_daily_reports")
        .set({ ...next, updated_by_user_id: access.userId, updated_at: new Date(), version: String(Number(row.version) + 1) })
        .where("id", "=", id)
        .execute();
      if (vehicles) {
        await this.replaceVehicles(trx, id, vehicles);
        changed.push("vehicles");
      }
      await this.recordEvent(trx, id, row.depot_id, "DAILY_REPORT_UPDATED", access.userId, { changed });
    });
    return this.toDTO(await this.findRow(this.database, id));
  }

  public async submit(id: string, request: unknown, access: DailyReportAccess): Promise<DailyReportDTO> {
    const parsed = submitDailyReportRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    await this.database.transaction().execute(async (trx) => {
      const row = await this.lockEditable(trx, id, parsed.data.version, access);
      const missing: DailyReportErrorField[] = DAILY_REPORT_SUBMISSION_FIELDS.filter((field) => row[field] === null).map((field) => ({
        field,
        code: "required",
        message: `${field} is required before the report can be submitted`
      }));
      if (missing.length > 0) {
        throw new DailyReportDomainError("DAILY_REPORT_INCOMPLETE", missing[0]!.message, missing);
      }
      const now = new Date();
      await trx
        .updateTable("depot_daily_reports")
        .set({ status: "SUBMITTED", submitted_at: now, submitted_by_user_id: access.userId, updated_by_user_id: access.userId, updated_at: now, version: String(Number(row.version) + 1) })
        .where("id", "=", id)
        .execute();
      await this.recordEvent(trx, id, row.depot_id, "DAILY_REPORT_SUBMITTED", access.userId, { report_date: row.report_date });
    });
    return this.toDTO(await this.findRow(this.database, id));
  }

  // -------------------------------------------------------------------------
  // Scope
  // -------------------------------------------------------------------------

  /** null = all depots; otherwise the caller's own depot (required). */
  private async resolveScopeDepot(access: DailyReportAccess): Promise<string | null> {
    if (access.allDepots) {
      return null;
    }
    const employee = await this.database
      .selectFrom("employees")
      .select(["depot_id"])
      .where("user_id", "=", access.userId)
      .where("is_active", "=", true)
      .executeTakeFirst();
    if (!employee?.depot_id) {
      throw new DailyReportDomainError("DEPOT_ASSIGNMENT_REQUIRED", "Your employee profile is not assigned to a depot, so you cannot work with daily depot reports.");
    }
    return employee.depot_id;
  }

  private async assertDepotAccess(depotId: string, access: DailyReportAccess, verb: "view" | "change"): Promise<void> {
    const scopeDepotId = await this.resolveScopeDepot(access);
    if (scopeDepotId && scopeDepotId !== depotId) {
      throw new DailyReportDomainError("DEPOT_FORBIDDEN", `You can only ${verb} daily reports for your own depot.`);
    }
  }

  private async resolveCreateDepot(data: CreateDailyReportRequest, access: DailyReportAccess): Promise<string> {
    const scopeDepotId = await this.resolveScopeDepot(access);
    if (scopeDepotId) {
      if (data.depot_id && data.depot_id !== scopeDepotId) {
        throw new DailyReportDomainError("DEPOT_FORBIDDEN", "You can only create daily reports for your own depot.");
      }
      return scopeDepotId;
    }
    if (!data.depot_id) {
      throw new DailyReportDomainError("VALIDATION_FAILED", "depot_id is required", [{ field: "depot_id", code: "required", message: "depot_id is required" }]);
    }
    const depot = await this.database.selectFrom("depots").select("id").where("id", "=", data.depot_id).where("active", "=", true).executeTakeFirst();
    if (!depot) {
      throw new DailyReportDomainError("INVALID_DEPOT", `Depot '${data.depot_id}' does not exist or is inactive.`, [{ field: "depot_id", message: "Unknown or inactive depot" }]);
    }
    return depot.id;
  }

  private async findEmployeeId(userId: string): Promise<string | null> {
    const employee = await this.database.selectFrom("employees").select("id").where("user_id", "=", userId).where("is_active", "=", true).executeTakeFirst();
    return employee?.id ?? null;
  }

  // -------------------------------------------------------------------------
  // Persistence helpers
  // -------------------------------------------------------------------------

  private async findRow(executor: Executor, id: string): Promise<ReportRow> {
    const row = await executor.selectFrom("depot_daily_reports").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) {
      throw new DailyReportDomainError("DAILY_REPORT_NOT_FOUND", `Daily report '${id}' was not found.`);
    }
    return row as ReportRow;
  }

  private async lockEditable(trx: Transaction<RoyalPackagingDatabase>, id: string, version: string, access: DailyReportAccess): Promise<ReportRow> {
    const row = await trx.selectFrom("depot_daily_reports").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
    if (!row) {
      throw new DailyReportDomainError("DAILY_REPORT_NOT_FOUND", `Daily report '${id}' was not found.`);
    }
    await this.assertDepotAccess(row.depot_id, access, "change");
    if (row.status !== "DRAFT") {
      throw new DailyReportDomainError("DAILY_REPORT_LOCKED", "This daily report has been submitted and can no longer be changed.");
    }
    if (String(row.version) !== version) {
      throw new DailyReportDomainError("DAILY_REPORT_VERSION_CONFLICT", "This daily report was changed by someone else. Reload it and try again.");
    }
    return row as ReportRow;
  }

  private async resolveVehicles(vehicles: ReadonlyArray<{ truck_type_code: string; count: number }>): Promise<Array<{ truck_type_id: string; vehicle_count: number }>> {
    if (vehicles.length === 0) return [];
    const codes = vehicles.map((vehicle) => vehicle.truck_type_code);
    const types = await this.database.selectFrom("truck_types").select(["id", "code"]).where("code", "in", codes).where("active", "=", true).execute();
    const byCode = new Map(types.map((type) => [type.code.toUpperCase(), type.id]));
    const errors: DailyReportErrorField[] = [];
    const resolved = vehicles.flatMap((vehicle, index) => {
      const id = byCode.get(vehicle.truck_type_code);
      if (!id) {
        errors.push({ field: `vehicles.${index}.truck_type_code`, message: `Unknown or inactive vehicle type '${vehicle.truck_type_code}'` });
        return [];
      }
      return [{ truck_type_id: id, vehicle_count: vehicle.count }];
    });
    if (errors.length > 0) {
      throw new DailyReportDomainError("INVALID_TRUCK_TYPE", errors[0]!.message, errors);
    }
    return resolved;
  }

  private async replaceVehicles(trx: Transaction<RoyalPackagingDatabase>, reportId: string, vehicles: ReadonlyArray<{ truck_type_id: string; vehicle_count: number }>): Promise<void> {
    await trx.deleteFrom("depot_daily_report_vehicles").where("report_id", "=", reportId).execute();
    if (vehicles.length > 0) {
      await trx.insertInto("depot_daily_report_vehicles").values(vehicles.map((vehicle) => ({ report_id: reportId, ...vehicle }))).execute();
    }
  }

  private async recordEvent(trx: Transaction<RoyalPackagingDatabase>, reportId: string, depotId: string, eventType: string, actorUserId: string, metadata: Record<string, unknown>): Promise<void> {
    await trx
      .insertInto("depot_daily_report_events")
      .values({ id: crypto.randomUUID(), report_id: reportId, depot_id: depotId, event_type: eventType, event_at: new Date(), actor_user_id: actorUserId, metadata: JSON.stringify({ report_id: reportId, depot_id: depotId, ...metadata }) })
      .execute();
  }

  // -------------------------------------------------------------------------
  // Read model
  // -------------------------------------------------------------------------

  private async toDTO(row: ReportRow): Promise<DailyReportDTO> {
    const [depot, vehicles, registeredTasks] = await Promise.all([
      this.database.selectFrom("depots").select(["id", "code", "name"]).where("id", "=", row.depot_id).executeTakeFirstOrThrow() as Promise<DailyReportDepotDTO>,
      this.database
        .selectFrom("depot_daily_report_vehicles")
        .innerJoin("truck_types", "truck_types.id", "depot_daily_report_vehicles.truck_type_id")
        .select(["truck_types.id as id", "truck_types.code as code", "truck_types.name as name", "depot_daily_report_vehicles.vehicle_count as count"])
        .where("depot_daily_report_vehicles.report_id", "=", row.id)
        .orderBy("truck_types.code", "asc")
        .execute(),
      this.registeredTasks(row.depot_id, row.report_date)
    ]);
    const reportDate = formatDate(row.report_date);
    const startTime = row.start_time ? String(row.start_time) : null;
    const endTime = row.end_time ? String(row.end_time) : null;
    return {
      id: row.id,
      depot,
      supervisor_employee_id: row.supervisor_employee_id,
      report_date: reportDate,
      loading_count: row.loading_count,
      unloading_count: row.unloading_count,
      start_time: startTime,
      end_time: endTime,
      ...deriveDailyReportFigures({ loading_count: row.loading_count, unloading_count: row.unloading_count, start_time: startTime, end_time: endTime }),
      labour_required: row.labour_required,
      labour_present: row.labour_present,
      vehicles: vehicles.map((vehicle) => ({ truck_type: { id: vehicle.id, code: vehicle.code, name: vehicle.name }, count: vehicle.count })),
      status: row.status as DailyReportStatus,
      submitted_at: row.submitted_at,
      submitted_by_user_id: row.submitted_by_user_id,
      approved_at: row.approved_at,
      approved_by_user_id: row.approved_by_user_id,
      created_by_user_id: row.created_by_user_id,
      updated_by_user_id: row.updated_by_user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: String(row.version),
      registered_tasks: registeredTasks
    };
  }

  /** Completed tasks of this depot whose completion falls on the report's operational date. */
  private async registeredTasks(depotId: string, reportDate: string | Date): Promise<DailyReportRegisteredTasksDTO> {
    const rows = await this.database
      .selectFrom("tasks")
      .select(["task_type", "completed_box_quantity"])
      .where("depot_id", "=", depotId)
      .where("status", "=", "COMPLETED")
      .where(sql<string>`(completed_at at time zone ${this.timeZone})::date`, "=", formatDate(reportDate))
      .execute();
    const summary = { loading_tasks_completed: 0, unloading_tasks_completed: 0, loading_boxes: 0, unloading_boxes: 0 };
    for (const row of rows) {
      const operation = classifyTaskType(row.task_type);
      const boxes = Number(row.completed_box_quantity ?? 0);
      if (operation === "LOADING") {
        summary.loading_tasks_completed += 1;
        summary.loading_boxes += boxes;
      } else if (operation === "UNLOADING") {
        summary.unloading_tasks_completed += 1;
        summary.unloading_boxes += boxes;
      }
    }
    return { ...summary, timezone: this.timeZone };
  }
}

function formatDate(value: string | Date): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return value.slice(0, 10);
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION;
}
