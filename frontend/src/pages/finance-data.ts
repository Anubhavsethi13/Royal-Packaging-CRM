import { z } from 'zod';
import { parseContract } from '../api/contract-validation';
import type { IncentiveRecord, PayrollRecord } from '../types/domain';

/**
 * Super Admin finance read models (`GET /payroll`, `GET /incentives/ledger`). Only fields with a
 * backend source are mapped; everything the backend does not record (pay period, base pay, employee
 * names, task codes, event type, points) is shown as not recorded rather than invented
 * (`Docs/integration/frontend-backend-contract-reconciliation.md` §2.1, §2.3).
 */
const timestamp = z.union([z.string(), z.date()]).transform((value) => new Date(value).toLocaleString());

const payrollEntrySchema = z.object({
  id: z.string(),
  amount: z.string(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  updated_at: timestamp,
});

const payrollStatus: Record<z.infer<typeof payrollEntrySchema>['status'], PayrollRecord['status']> = {
  PENDING: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

/** One payroll entry: one employee's snapshot of one approved incentive ledger entry. */
export function mapPayrollEntryDtoToRecord(payload: unknown): PayrollRecord {
  const dto = parseContract(payrollEntrySchema, (payload as { data?: unknown })?.data ?? payload, 'payroll');
  return {
    id: dto.id,
    period: 'Not recorded',
    employees: 1,
    baseAmount: 'Not recorded',
    incentiveAmount: dto.amount,
    status: payrollStatus[dto.status],
    updatedAt: dto.updated_at,
  };
}

const incentiveLedgerSchema = z.object({
  id: z.string(),
  amount: z.string(),
  status: z.enum(['PENDING', 'APPROVED']),
  created_at: timestamp,
});

const incentiveStatus: Record<z.infer<typeof incentiveLedgerSchema>['status'], IncentiveRecord['status']> = {
  PENDING: 'Pending review',
  APPROVED: 'Approved',
};

export function mapIncentiveLedgerDtoToRecord(payload: unknown): IncentiveRecord {
  const dto = parseContract(incentiveLedgerSchema, (payload as { data?: unknown })?.data ?? payload, 'incentive ledger');
  return {
    id: dto.id,
    employee: 'Not recorded',
    task: 'Not recorded',
    event: '—',
    points: '—',
    amount: dto.amount,
    status: incentiveStatus[dto.status],
    createdAt: dto.created_at,
  };
}
