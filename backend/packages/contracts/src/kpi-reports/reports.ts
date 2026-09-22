import { z } from "zod";

export const REPORT_EXPORT_FORMATS = ["xlsx", "csv", "pdf"] as const;
export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number];

export const REPORT_EXECUTION_STATUSES = ["PENDING", "RUNNING", "COMPLETED", "FAILED"] as const;
export type ReportExecutionStatus = (typeof REPORT_EXECUTION_STATUSES)[number];

export type ReportErrorCode =
  | "REPORT_DEFINITION_NOT_FOUND"
  | "REPORT_EXECUTION_NOT_FOUND"
  | "UNSUPPORTED_EXPORT_FORMAT"
  | "VALIDATION_FAILED";

export class ReportDomainError extends Error {
  public readonly code: ReportErrorCode;

  public constructor(code: ReportErrorCode, message: string) {
    super(message);
    this.name = "ReportDomainError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const createReportExecutionRequestSchema = z.object({
  export_format: z.enum(REPORT_EXPORT_FORMATS),
  filters: z.record(z.string(), z.unknown()).optional()
});
export type CreateReportExecutionRequest = z.infer<typeof createReportExecutionRequestSchema>;

/**
 * Genuinely empty framework (Assumption: reconciliation doc). No real report
 * templates/content were ever supplied by the requirements - this DTO
 * tracks definitions and execution status only; there is no report
 * generation/rendering logic behind it yet.
 */
export interface ReportDefinitionDTO {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly version: bigint;
}

export interface ReportExecutionDTO {
  readonly id: string;
  readonly report_definition_id: string;
  readonly status: string;
  readonly export_format: string;
  readonly filters: Record<string, unknown> | null;
  readonly requested_by_user_id: string;
  readonly requested_at: Date;
  readonly completed_at: Date | null;
  readonly result_reference: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly version: bigint;
}
