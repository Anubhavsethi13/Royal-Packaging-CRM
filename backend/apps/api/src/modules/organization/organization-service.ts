import crypto from "node:crypto";
import type {
  CreateEmployeeRequest,
  CreateShiftAssignmentRequest,
  EmployeeDTO,
  ListEmployeesFilter,
  UpdateEmployeeRequest
} from "@royal-packaging/contracts";
import {
  CommercialDomainError,
  createEmployeeRequestSchema,
  createShiftAssignmentRequestSchema,
  updateEmployeeRequestSchema
} from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";
import { isPostgresUniqueViolation } from "../clients/clients-service.js";

export interface OrganizationServiceConfig {
  readonly database: DatabaseConnection;
}

export class OrganizationService {
  private readonly database: DatabaseConnection;

  public constructor(config: OrganizationServiceConfig) {
    this.database = config.database;
  }

  public async createEmployee(request: CreateEmployeeRequest): Promise<EmployeeDTO> {
    const parsed = createEmployeeRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new CommercialDomainError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid employee request");
    }

    const now = new Date();
    const id = crypto.randomUUID();

    try {
      await this.database
        .insertInto("employees")
        .values({
          id,
          user_id: parsed.data.user_id ?? null,
          is_active: true,
          employee_code: parsed.data.employee_code,
          name: parsed.data.name,
          department: parsed.data.department ?? null,
          depot_id: parsed.data.depot_id ?? null,
          created_at: now,
          updated_at: now,
          version: "1"
        })
        .execute();
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new CommercialDomainError(
          "DUPLICATE_EMPLOYEE_CODE",
          `employee_code '${parsed.data.employee_code}' is already in use.`
        );
      }
      throw err;
    }

    return this.getEmployeeByIdOrThrow(id);
  }

  public async updateEmployee(id: string, request: UpdateEmployeeRequest): Promise<EmployeeDTO> {
    const parsed = updateEmployeeRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new CommercialDomainError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid employee update");
    }

    const existing = await this.database.selectFrom("employees").select("id").where("id", "=", id).executeTakeFirst();
    if (!existing) {
      throw new CommercialDomainError("EMPLOYEE_NOT_FOUND", `Employee with ID '${id}' was not found.`);
    }

    await this.database
      .updateTable("employees")
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.department !== undefined ? { department: parsed.data.department } : {}),
        ...(parsed.data.depot_id !== undefined ? { depot_id: parsed.data.depot_id } : {}),
        ...(parsed.data.is_active !== undefined ? { is_active: parsed.data.is_active } : {}),
        updated_at: sql`now()`,
        version: sql`version + 1`
      })
      .where("id", "=", id)
      .execute();

    return this.getEmployeeByIdOrThrow(id);
  }

  public async getEmployeeById(id: string): Promise<EmployeeDTO | null> {
    const row = await this.database.selectFrom("employees").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) {
      return null;
    }
    return this.toDTO(row, await this.getCurrentShift(id));
  }

  public async listEmployees(filter: ListEmployeesFilter): Promise<EmployeeDTO[]> {
    let query = this.database.selectFrom("employees").selectAll();

    if (filter.department) {
      query = query.where("department", "=", filter.department);
    }
    if (filter.depot_id) {
      query = query.where("depot_id", "=", filter.depot_id);
    }
    if (filter.is_active !== undefined) {
      query = query.where("is_active", "=", filter.is_active);
    }
    if (filter.search) {
      const term = `%${filter.search}%`;
      query = query.where((eb) =>
        eb.or([eb("name", "ilike", term), eb("employee_code", "ilike", term)])
      );
    }

    const rows = await query.orderBy("created_at", "desc").execute();
    return Promise.all(rows.map(async (row) => this.toDTO(row, await this.getCurrentShift(row.id))));
  }

  public async createShiftAssignment(
    employeeId: string,
    request: CreateShiftAssignmentRequest
  ): Promise<EmployeeDTO> {
    const parsed = createShiftAssignmentRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new CommercialDomainError(
        "VALIDATION_FAILED",
        parsed.error.issues[0]?.message ?? "Invalid shift assignment request"
      );
    }

    const employee = await this.database
      .selectFrom("employees")
      .select("id")
      .where("id", "=", employeeId)
      .executeTakeFirst();
    if (!employee) {
      throw new CommercialDomainError("EMPLOYEE_NOT_FOUND", `Employee with ID '${employeeId}' was not found.`);
    }

    const shift = await this.database
      .selectFrom("shifts")
      .select("id")
      .where("id", "=", parsed.data.shift_id)
      .executeTakeFirst();
    if (!shift) {
      throw new CommercialDomainError("SHIFT_NOT_FOUND", `Shift with ID '${parsed.data.shift_id}' was not found.`);
    }

    const now = new Date();
    await this.database
      .insertInto("employee_shift_assignments")
      .values({
        id: crypto.randomUUID(),
        employee_id: employeeId,
        shift_id: parsed.data.shift_id,
        effective_from: parsed.data.effective_from,
        effective_to: parsed.data.effective_to ?? null,
        created_at: now,
        updated_at: now,
        version: "1"
      })
      .execute();

    return this.getEmployeeByIdOrThrow(employeeId);
  }

  private async getCurrentShift(employeeId: string) {
    const now = new Date();
    const row = await this.database
      .selectFrom("employee_shift_assignments")
      .innerJoin("shifts", "shifts.id", "employee_shift_assignments.shift_id")
      .select([
        "employee_shift_assignments.shift_id as shift_id",
        "shifts.name as shift_name",
        "employee_shift_assignments.effective_from as effective_from",
        "employee_shift_assignments.effective_to as effective_to"
      ])
      .where("employee_shift_assignments.employee_id", "=", employeeId)
      .where("employee_shift_assignments.effective_from", "<=", now)
      .where((eb) =>
        eb.or([
          eb("employee_shift_assignments.effective_to", "is", null),
          eb("employee_shift_assignments.effective_to", ">=", now)
        ])
      )
      .orderBy("employee_shift_assignments.effective_from", "desc")
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return {
      shift_id: row.shift_id,
      shift_name: row.shift_name,
      effective_from: row.effective_from,
      effective_to: row.effective_to
    };
  }

  private async getEmployeeByIdOrThrow(id: string): Promise<EmployeeDTO> {
    const employee = await this.getEmployeeById(id);
    if (!employee) {
      throw new CommercialDomainError("EMPLOYEE_NOT_FOUND", `Employee with ID '${id}' was not found.`);
    }
    return employee;
  }

  private toDTO(
    row: {
      id: string;
      user_id: string | null;
      is_active: boolean;
      employee_code: string;
      name: string | null;
      department: string | null;
      depot_id: string | null;
      created_at: Date;
      updated_at: Date;
      version: string;
    },
    currentShift: { shift_id: string; shift_name: string; effective_from: Date; effective_to: Date | null } | null
  ): EmployeeDTO {
    return {
      id: row.id,
      employee_code: row.employee_code,
      name: row.name,
      department: row.department,
      depot_id: row.depot_id,
      user_id: row.user_id,
      is_active: row.is_active,
      currentShift,
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: BigInt(row.version)
    };
  }
}
