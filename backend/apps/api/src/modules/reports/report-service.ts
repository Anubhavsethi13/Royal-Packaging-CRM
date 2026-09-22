import crypto from "node:crypto";
import type {
  CreateReportExecutionRequest,
  ReportDefinitionDTO,
  ReportExecutionDTO
} from "@royal-packaging/contracts";
import { createReportExecutionRequestSchema, ReportDomainError } from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";

export interface ReportServiceConfig {
  readonly database: DatabaseConnection;
}

/**
 * Genuinely empty reports framework: definitions + execution tracking only.
 * No real report templates/content were ever supplied by requirements, so
 * there is no report generation/rendering logic here - see
 * docs/integration/backend-frontend-reconciliation.md.
 */
export class ReportService {
  private readonly database: DatabaseConnection;

  public constructor(config: ReportServiceConfig) {
    this.database = config.database;
  }

  public async listDefinitions(): Promise<ReportDefinitionDTO[]> {
    const rows = await this.database.selectFrom("report_definitions").selectAll().orderBy("name", "asc").execute();
    return rows.map((row) => this.toDefinitionDTO(row));
  }

  public async getDefinitionByCode(code: string): Promise<ReportDefinitionDTO | null> {
    const row = await this.database
      .selectFrom("report_definitions")
      .selectAll()
      .where("code", "=", code)
      .executeTakeFirst();
    return row ? this.toDefinitionDTO(row) : null;
  }

  public async requestExecution(
    code: string,
    requestedByUserId: string,
    request: CreateReportExecutionRequest
  ): Promise<ReportExecutionDTO> {
    const parsed = createReportExecutionRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new ReportDomainError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid report execution request");
    }

    const definition = await this.database
      .selectFrom("report_definitions")
      .select("id")
      .where("code", "=", code)
      .executeTakeFirst();

    if (!definition) {
      throw new ReportDomainError("REPORT_DEFINITION_NOT_FOUND", `Report definition '${code}' was not found.`);
    }

    const now = new Date();
    const id = crypto.randomUUID();

    await this.database
      .insertInto("report_executions")
      .values({
        id,
        report_definition_id: definition.id,
        status: "PENDING",
        export_format: parsed.data.export_format,
        filters: parsed.data.filters ?? null,
        requested_by_user_id: requestedByUserId,
        requested_at: now,
        completed_at: null,
        result_reference: null,
        created_at: now,
        updated_at: now,
        version: "1"
      })
      .execute();

    return this.getExecutionByIdOrThrow(id);
  }

  public async getExecutionById(id: string): Promise<ReportExecutionDTO | null> {
    const row = await this.database
      .selectFrom("report_executions")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? this.toExecutionDTO(row) : null;
  }

  private async getExecutionByIdOrThrow(id: string): Promise<ReportExecutionDTO> {
    const execution = await this.getExecutionById(id);
    if (!execution) {
      throw new ReportDomainError("REPORT_EXECUTION_NOT_FOUND", `Report execution '${id}' was not found.`);
    }
    return execution;
  }

  private toDefinitionDTO(row: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    created_at: Date;
    updated_at: Date;
    version: string;
  }): ReportDefinitionDTO {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: BigInt(row.version)
    };
  }

  private toExecutionDTO(row: {
    id: string;
    report_definition_id: string;
    status: string;
    export_format: string;
    filters: Record<string, unknown> | null;
    requested_by_user_id: string;
    requested_at: Date;
    completed_at: Date | null;
    result_reference: string | null;
    created_at: Date;
    updated_at: Date;
    version: string;
  }): ReportExecutionDTO {
    return {
      id: row.id,
      report_definition_id: row.report_definition_id,
      status: row.status,
      export_format: row.export_format,
      // node-pg auto-deserializes jsonb columns into JS objects already -
      // do NOT JSON.parse() this, it is not a JSON string.
      filters: row.filters,
      requested_by_user_id: row.requested_by_user_id,
      requested_at: row.requested_at,
      completed_at: row.completed_at,
      result_reference: row.result_reference,
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: BigInt(row.version)
    };
  }
}
