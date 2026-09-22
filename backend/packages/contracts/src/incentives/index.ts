import { z } from "zod";

export const monthlyStringRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

const numericPositiveDecimalSchema = z.union([
  z.number().positive({ message: "Amount must be greater than 0" }),
  z.string().regex(/^\d+(\.\d+)?$/, { message: "Amount must be a valid positive number" }).refine((val) => {
    const num = Number(val);
    return !Number.isNaN(num) && num > 0;
  }, { message: "Amount must be greater than 0" })
]);

const numericNonNegativeDecimalSchema = z.union([
  z.number().min(0, { message: "Amount cannot be negative" }),
  z.string().regex(/^\d+(\.\d+)?$/, { message: "Amount must be a valid non-negative number" }).refine((val) => {
    const num = Number(val);
    return !Number.isNaN(num) && num >= 0;
  }, { message: "Amount cannot be negative" })
]);

export const recordMonthlyKotRequestSchema = z.object({
  effective_month: z.string().regex(monthlyStringRegex, {
    message: "effective_month must be in YYYY-MM format (e.g. 2026-09)"
  }),
  kot_value: numericNonNegativeDecimalSchema,
  notes: z.string().optional(),
  correlation_id: z.string().uuid({ message: "correlation_id must be a valid UUID" }).optional()
});

export type RecordMonthlyKotRequest = z.infer<typeof recordMonthlyKotRequestSchema>;

export const recordManualPenaltyRequestSchema = z.object({
  employee_id: z.string().uuid({ message: "employee_id must be a valid UUID" }),
  amount: numericPositiveDecimalSchema,
  reason: z.string().min(1, { message: "Penalty reason is required" }),
  effective_month: z.string().regex(monthlyStringRegex, {
    message: "effective_month must be in YYYY-MM format (e.g. 2026-09)"
  }),
  task_id: z.string().uuid({ message: "task_id must be a valid UUID" }).optional(),
  correlation_id: z.string().uuid({ message: "correlation_id must be a valid UUID" }).optional()
});

export type RecordManualPenaltyRequest = z.infer<typeof recordManualPenaltyRequestSchema>;

export const calculateMonthlyIncentiveRequestSchema = z.object({
  effective_month: z.string().regex(monthlyStringRegex, {
    message: "effective_month must be in YYYY-MM format (e.g. 2026-09)"
  }),
  correlation_id: z.string().uuid({ message: "correlation_id must be a valid UUID" }).optional()
});

export type CalculateMonthlyIncentiveRequest = z.infer<typeof calculateMonthlyIncentiveRequestSchema>;

export const calculateTaskIncentiveRequestSchema = z.object({
  task_id: z.string().uuid({ message: "task_id must be a valid UUID" }),
  task_incentive_amount: numericPositiveDecimalSchema,
  idempotency_key: z.string().min(1).optional(),
  correlation_id: z.string().uuid({ message: "correlation_id must be a valid UUID" }).optional()
});

export type CalculateTaskIncentiveRequest = z.infer<typeof calculateTaskIncentiveRequestSchema>;

export const approveIncentiveRequestSchema = z.object({
  ledger_ids: z.array(z.string().uuid()).min(1, { message: "At least one ledger ID is required" }).optional(),
  task_id: z.string().uuid().optional(),
  notes: z.string().optional(),
  correlation_id: z.string().uuid().optional()
}).refine((data) => data.ledger_ids !== undefined || data.task_id !== undefined, {
  message: "Either ledger_ids or task_id must be provided"
});

export type ApproveIncentiveRequest = z.infer<typeof approveIncentiveRequestSchema>;

export interface MonthlyKotRecord {
  readonly id: string;
  readonly effective_month: string;
  readonly kot_value: string;
  readonly status: string;
  readonly created_by_user_id: string;
  readonly notes: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly version: bigint;
}

export interface ManualPenaltyRecord {
  readonly id: string;
  readonly employee_id: string;
  readonly task_id: string | null;
  readonly amount: string;
  readonly reason: string;
  readonly effective_month: string;
  readonly recorded_by_user_id: string;
  readonly status: string;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly version: bigint;
}

export interface IncentiveLedgerRecord {
  readonly id: string;
  readonly task_id: string;
  readonly employee_id: string;
  readonly incentive_rule_id: string | null;
  readonly amount: string;
  readonly status: string;
  readonly idempotency_key: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly version: bigint;
}

export interface TaskIncentiveAllocationResult {
  readonly task_id: string;
  readonly total_task_incentive: string;
  readonly participating_employee_ids: readonly string[];
  readonly excluded_employee_ids: readonly string[];
  readonly per_employee_share: string;
  readonly unresolved_remainder: string;
  readonly rounding_policy: "EXACT_REMAINDER_HELD";
  readonly task_to_monthly_pool_reconciliation: "TBD_SOURCE_UNDEFINED";
  readonly overtime_status: "NOT_APPLICABLE" | "PENDING_CONFIGURATION";
  readonly ledger_entries: readonly IncentiveLedgerRecord[];
}

export interface MonthlyIncentiveCalculationResult {
  readonly effective_month: string;
  readonly kot_value: string;
  readonly monthly_incentive_pool: string;
  readonly gross_incentive_pool: string;
  readonly penalties: readonly ManualPenaltyRecord[];
  readonly penalty_aggregation_relationship: "TBD_PENDING_POLICY";
  readonly zero_floor_policy: "TBD_NOT_CONFIRMED";
  readonly task_reconciliation_status: "TBD_SOURCE_UNDEFINED";
  readonly overtime_status: "PENDING_CONFIGURATION";
}

export interface IncentiveRuleRecord {
  readonly id: string;
  readonly rule_version: string;
  readonly effective_from: Date;
  readonly effective_to: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly version: bigint;
}

export interface IncentiveEventRecord {
  readonly id: string;
  readonly task_id: string;
  readonly incentive_rule_id: string | null;
  readonly event_type: string;
  readonly event_at: Date;
  readonly actor_user_id: string | null;
  readonly correlation_id: string | null;
  readonly metadata: string | null;
  readonly created_at: Date;
}

export type IncentiveErrorCode =
  | "DUPLICATE_MONTHLY_KOT"
  | "KOT_NOT_FOUND"
  | "INVALID_KOT_VALUE"
  | "INVALID_PENALTY_AMOUNT"
  | "INVALID_INCENTIVE_AMOUNT"
  | "TASK_NOT_FOUND"
  | "TASK_NOT_COMPLETED"
  | "QUALITY_GATE_FAILED"
  | "NO_PARTICIPATING_EMPLOYEES"
  | "UNRESOLVED_REMAINDER"
  | "ALREADY_APPROVED"
  | "UNAUTHORIZED_ACTOR"
  | "VALIDATION_FAILED"
  | "EMPLOYEE_NOT_FOUND"
  | "RULE_NOT_FOUND"
  | "IDEMPOTENT_RETRY_MISMATCH";

export class IncentiveDomainError extends Error {
  public readonly code: IncentiveErrorCode;

  public constructor(code: IncentiveErrorCode, message: string) {
    super(message);
    this.name = "IncentiveDomainError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
