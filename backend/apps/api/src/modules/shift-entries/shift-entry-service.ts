import crypto from "node:crypto";
import type {
  CreateShiftEntryRequest,
  ListShiftEntriesFilter,
  ShiftEntryDTO,
  ShiftEntryErrorField,
  ShiftEntryOptionsDTO
} from "@royal-packaging/contracts";
import { createShiftEntryRequestSchema, ShiftEntryDomainError } from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";

const POSTGRES_UNIQUE_VIOLATION = "23505";

/**
 * Resolves the active employee linked to a user (the single place the
 * session -> employee mapping lives). Throws EMPLOYEE_PROFILE_REQUIRED when
 * the user has no active employee profile.
 */
export async function requireActiveEmployeeId(database: DatabaseConnection, userId: string): Promise<string> {
  const employee = await database
    .selectFrom("employees")
    .select("id")
    .where("user_id", "=", userId)
    .where("is_active", "=", true)
    .executeTakeFirst();

  if (!employee) {
    throw new ShiftEntryDomainError(
      "EMPLOYEE_PROFILE_REQUIRED",
      "The authenticated user is not linked to an active employee profile."
    );
  }
  return employee.id;
}

export interface ShiftEntryServiceConfig {
  readonly database: DatabaseConnection;
}

export interface ShiftEntryPage {
  readonly items: ShiftEntryDTO[];
  readonly total: number;
}

interface ShiftEntryRow {
  id: string;
  employee_id: string;
  work_date: string;
  shift_start: string;
  shift_end: string;
  labour_count: number;
  unloading_total: number;
  loading_total: number;
  created_by_user_id: string;
  updated_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

/**
 * Daily shift entries. The employee is always resolved server-side from the
 * authenticated user (`employees.user_id`); request payloads can never
 * choose it. Warehouses reference existing `depots`, truck types reference
 * `truck_types`; nothing from either table is copied into the entry.
 *
 * Authorization for reading a specific entry lives in the RBAC policy
 * (`shift:read`); this service performs no role checks.
 */
export class ShiftEntryService {
  private readonly database: DatabaseConnection;

  public constructor(config: ShiftEntryServiceConfig) {
    this.database = config.database;
  }

  public async create(actorUserId: string, request: unknown): Promise<ShiftEntryDTO> {
    const parsed = createShiftEntryRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new ShiftEntryDomainError(
        "VALIDATION_FAILED",
        parsed.error.issues[0]?.message ?? "Invalid shift entry request",
        parsed.error.issues.map((issue) => ({ field: issue.path.join("."), code: issue.code, message: issue.message }))
      );
    }

    const employeeId = await this.requireEmployeeId(actorUserId);
    const data: CreateShiftEntryRequest = parsed.data;
    const depotIds = await this.resolveDepots(data);
    const truckTypeIds = await this.resolveTruckTypes(data);

    const id = crypto.randomUUID();
    const now = new Date();

    try {
      await this.database.transaction().execute(async (trx) => {
        await trx
          .insertInto("shift_entries")
          .values({
            id,
            employee_id: employeeId,
            work_date: data.work_date,
            shift_start: data.shift_start,
            shift_end: data.shift_end,
            labour_count: data.labour_count,
            unloading_total: data.unloading_total,
            loading_total: data.loading_total,
            created_by_user_id: actorUserId,
            updated_by_user_id: null,
            created_at: now,
            updated_at: now,
            version: "1"
          })
          .execute();

        await trx
          .insertInto("shift_entry_depots")
          .values(depotIds.map((depot_id) => ({ shift_entry_id: id, depot_id })))
          .execute();

        if (truckTypeIds.length > 0) {
          await trx
            .insertInto("shift_entry_truck_types")
            .values(truckTypeIds.map((truck_type_id) => ({ shift_entry_id: id, truck_type_id })))
            .execute();
        }
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ShiftEntryDomainError(
          "SHIFT_ENTRY_DUPLICATE",
          `A shift entry already exists for work_date '${data.work_date}'.`
        );
      }
      throw err;
    }

    return this.getByIdOrThrow(id);
  }

  /** Active warehouses (depots) and truck types the entry form may reference. */
  public async listOptions(): Promise<ShiftEntryOptionsDTO> {
    const [depots, truckTypes] = await Promise.all([
      this.database.selectFrom("depots").select(["id", "code", "name"]).where("active", "=", true).orderBy("code", "asc").execute(),
      this.database.selectFrom("truck_types").select(["id", "code", "name"]).where("active", "=", true).orderBy("code", "asc").execute()
    ]);
    return { warehouses: depots, truck_types: truckTypes };
  }

  /** Paginated entries for the employee linked to `userId`, newest work date first. */
  public async listForUser(
    userId: string,
    filter: ListShiftEntriesFilter,
    pagination: { limit: number; offset: number }
  ): Promise<ShiftEntryPage> {
    const employeeId = await this.requireEmployeeId(userId);

    let countQuery = this.database
      .selectFrom("shift_entries")
      .select((eb) => eb.fn.countAll<string>().as("total"))
      .where("employee_id", "=", employeeId);
    let rowsQuery = this.selectRows().where("shift_entries.employee_id", "=", employeeId);

    if (filter.from) {
      countQuery = countQuery.where(sql<boolean>`work_date >= ${filter.from}::date`);
      rowsQuery = rowsQuery.where(sql<boolean>`shift_entries.work_date >= ${filter.from}::date`);
    }
    if (filter.to) {
      countQuery = countQuery.where(sql<boolean>`work_date <= ${filter.to}::date`);
      rowsQuery = rowsQuery.where(sql<boolean>`shift_entries.work_date <= ${filter.to}::date`);
    }

    const [countRow, rows] = await Promise.all([
      countQuery.executeTakeFirst(),
      rowsQuery
        .orderBy(sql`shift_entries.work_date`, "desc")
        .orderBy("shift_entries.created_at", "desc")
        .orderBy("shift_entries.id", "asc")
        .limit(pagination.limit)
        .offset(pagination.offset)
        .execute()
    ]);

    return { items: await this.hydrate(rows), total: Number(countRow?.total ?? 0) };
  }

  public async getById(id: string): Promise<ShiftEntryDTO | null> {
    const row = await this.selectRows().where("shift_entries.id", "=", id).executeTakeFirst();
    if (!row) {
      return null;
    }
    const [dto] = await this.hydrate([row]);
    return dto ?? null;
  }

  public async getByIdOrThrow(id: string): Promise<ShiftEntryDTO> {
    const dto = await this.getById(id);
    if (!dto) {
      throw new ShiftEntryDomainError("SHIFT_ENTRY_NOT_FOUND", `Shift entry with ID '${id}' was not found.`);
    }
    return dto;
  }

  // -------------------------------------------------------------------------

  private async requireEmployeeId(userId: string): Promise<string> {
    return requireActiveEmployeeId(this.database, userId);
  }

  private async resolveDepots(data: CreateShiftEntryRequest): Promise<string[]> {
    const codes = data.warehouses.map((warehouse) => warehouse.warehouse_code.toUpperCase());
    const depots = await this.database
      .selectFrom("depots")
      .select(["id", "code", "name"])
      .where(sql<string>`upper(code)`, "in", codes)
      .where("active", "=", true)
      .execute();

    const byCode = new Map(depots.map((depot) => [depot.code.toUpperCase(), depot]));
    const errors: ShiftEntryErrorField[] = [];
    const ids: string[] = [];

    data.warehouses.forEach((warehouse, index) => {
      const depot = byCode.get(warehouse.warehouse_code.toUpperCase());
      if (!depot) {
        errors.push({
          field: `warehouses.${index}.warehouse_code`,
          code: "invalid_warehouse",
          message: `Warehouse '${warehouse.warehouse_code}' does not exist or is inactive.`
        });
        return;
      }
      if (warehouse.warehouse_name !== undefined && warehouse.warehouse_name.toLowerCase() !== depot.name.toLowerCase()) {
        errors.push({
          field: `warehouses.${index}.warehouse_name`,
          code: "warehouse_name_mismatch",
          message: `warehouse_name does not match warehouse '${depot.code}'.`
        });
        return;
      }
      ids.push(depot.id);
    });

    if (errors.length > 0) {
      throw new ShiftEntryDomainError("INVALID_WAREHOUSE", errors[0]!.message, errors);
    }
    return ids;
  }

  private async resolveTruckTypes(data: CreateShiftEntryRequest): Promise<string[]> {
    if (data.truck_types.length === 0) {
      return [];
    }

    const types = await this.database
      .selectFrom("truck_types")
      .select(["id", "code"])
      .where("code", "in", data.truck_types)
      .where("active", "=", true)
      .execute();

    const byCode = new Map(types.map((type) => [type.code, type.id]));
    const errors: ShiftEntryErrorField[] = [];
    const ids: string[] = [];

    data.truck_types.forEach((code, index) => {
      const id = byCode.get(code);
      if (!id) {
        errors.push({
          field: `truck_types.${index}`,
          code: "invalid_truck_type",
          message: `Truck type '${code}' does not exist or is inactive.`
        });
        return;
      }
      ids.push(id);
    });

    if (errors.length > 0) {
      throw new ShiftEntryDomainError("INVALID_TRUCK_TYPE", errors[0]!.message, errors);
    }
    return ids;
  }

  private selectRows() {
    return this.database.selectFrom("shift_entries").select([
      "shift_entries.id",
      "shift_entries.employee_id",
      sql<string>`shift_entries.work_date::text`.as("work_date"),
      sql<string>`shift_entries.shift_start::text`.as("shift_start"),
      sql<string>`shift_entries.shift_end::text`.as("shift_end"),
      "shift_entries.labour_count",
      "shift_entries.unloading_total",
      "shift_entries.loading_total",
      "shift_entries.created_by_user_id",
      "shift_entries.updated_by_user_id",
      "shift_entries.created_at",
      "shift_entries.updated_at",
      "shift_entries.version"
    ]);
  }

  private async hydrate(rows: ShiftEntryRow[]): Promise<ShiftEntryDTO[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.id);

    const [depotRows, truckRows] = await Promise.all([
      this.database
        .selectFrom("shift_entry_depots")
        .innerJoin("depots", "depots.id", "shift_entry_depots.depot_id")
        .select(["shift_entry_depots.shift_entry_id", "depots.id", "depots.code", "depots.name"])
        .where("shift_entry_depots.shift_entry_id", "in", ids)
        .orderBy("depots.code", "asc")
        .execute(),
      this.database
        .selectFrom("shift_entry_truck_types")
        .innerJoin("truck_types", "truck_types.id", "shift_entry_truck_types.truck_type_id")
        .select(["shift_entry_truck_types.shift_entry_id", "truck_types.id", "truck_types.code", "truck_types.name"])
        .where("shift_entry_truck_types.shift_entry_id", "in", ids)
        .orderBy("truck_types.code", "asc")
        .execute()
    ]);

    return rows.map((row) => ({
      id: row.id,
      employee_id: row.employee_id,
      work_date: row.work_date,
      shift_start: row.shift_start,
      shift_end: row.shift_end,
      labour_count: row.labour_count,
      unloading_total: row.unloading_total,
      loading_total: row.loading_total,
      warehouses: depotRows
        .filter((depot) => depot.shift_entry_id === row.id)
        .map((depot) => ({ id: depot.id, code: depot.code, name: depot.name })),
      truck_types: truckRows
        .filter((truck) => truck.shift_entry_id === row.id)
        .map((truck) => ({ id: truck.id, code: truck.code, name: truck.name })),
      created_by_user_id: row.created_by_user_id,
      updated_by_user_id: row.updated_by_user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: String(row.version)
    }));
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION;
}
