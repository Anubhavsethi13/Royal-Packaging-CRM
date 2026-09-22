import { z } from "zod";

export type PayrollErrorCode =
  | "INCENTIVE_NOT_FOUND"
  | "PAYROLL_ENTRY_NOT_FOUND"
  | "INCENTIVE_NOT_APPROVED"
  | "DUPLICATE_PAYROLL_ENTRY"
  | "APPROVAL_ALREADY_DECIDED"
  | "UNAUTHORIZED_ACTOR"
  | "VALIDATION_FAILED";

export class PayrollDomainError extends Error {
  public readonly code: PayrollErrorCode;

  public constructor(code: PayrollErrorCode, message: string) {
    super(message);
    this.name = "PayrollDomainError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const PAYROLL_ENTRY_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type PayrollEntryStatus = (typeof PAYROLL_ENTRY_STATUSES)[number];

/**
 * Deliberately has NO `amount` field: the payroll amount is always
 * server-side snapshotted from the approved incentive ledger entry it is
 * created from, never accepted from the client, to prevent tampering.
 */
export const createPayrollEntryRequestSchema = z.object({
  incentive_ledger_id: z.string().uuid({ message: "incentive_ledger_id must be a valid UUID" })
});
export type CreatePayrollEntryRequest = z.infer<typeof createPayrollEntryRequestSchema>;

export const payrollApprovalDecisionSchema = z.enum(["APPROVE", "REJECT"]);
export type PayrollApprovalDecision = z.infer<typeof payrollApprovalDecisionSchema>;

export const createPayrollApprovalRequestSchema = z.object({
  decision: payrollApprovalDecisionSchema,
  notes: z.string().optional()
});
export type CreatePayrollApprovalRequest = z.infer<typeof createPayrollApprovalRequestSchema>;

export const listPayrollEntriesFilterSchema = z.object({
  status: z.enum(PAYROLL_ENTRY_STATUSES).optional(),
  employee_id: z.string().uuid().optional()
});
export type ListPayrollEntriesFilter = z.infer<typeof listPayrollEntriesFilterSchema>;

export interface PayrollApprovalDTO {
  readonly id: string;
  readonly payroll_entry_id: string;
  readonly decision: string;
  readonly actor_user_id: string;
  readonly notes: string | null;
  readonly decided_at: Date;
  readonly created_at: Date;
}

export interface PayrollEntryDTO {
  readonly id: string;
  readonly incentive_ledger_id: string;
  readonly employee_id: string;
  readonly amount: string;
  readonly status: string;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly version: bigint;
  readonly approvals: readonly PayrollApprovalDTO[];
}
