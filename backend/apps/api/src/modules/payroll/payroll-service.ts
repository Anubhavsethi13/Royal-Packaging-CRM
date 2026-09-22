import crypto from "node:crypto";
import type {
  CreatePayrollApprovalRequest,
  CreatePayrollEntryRequest,
  ListPayrollEntriesFilter,
  PayrollEntryDTO
} from "@royal-packaging/contracts";
import {
  createPayrollApprovalRequestSchema,
  createPayrollEntryRequestSchema,
  PayrollDomainError
} from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export interface PayrollServiceConfig {
  readonly database: DatabaseConnection;
}

/**
 * Payroll entry/approval framework. There is no "paid"/disbursement
 * terminal state yet - see PayrollEntryDTO/migration doc comments. This
 * service only covers: snapshot an approved incentive into a payroll entry,
 * and record a one-shot approve/reject decision on it.
 */
export class PayrollService {
  private readonly database: DatabaseConnection;

  public constructor(config: PayrollServiceConfig) {
    this.database = config.database;
  }

  /**
   * Creates a payroll entry from an approved incentive ledger entry. The
   * amount is always snapshotted server-side from the incentive - never
   * accepted from the client (see createPayrollEntryRequestSchema doc).
   * Rejects if the source incentive is not APPROVED, or if a payroll entry
   * already exists for it (DB unique constraint on incentive_ledger_id is
   * the final authority; a pre-check gives a clean domain error first).
   */
  public async createEntry(request: CreatePayrollEntryRequest): Promise<PayrollEntryDTO> {
    const parsed = createPayrollEntryRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new PayrollDomainError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid payroll entry request");
    }

    const incentive = await this.database
      .selectFrom("incentive_ledger")
      .selectAll()
      .where("id", "=", parsed.data.incentive_ledger_id)
      .executeTakeFirst();

    if (!incentive) {
      throw new PayrollDomainError(
        "INCENTIVE_NOT_FOUND",
        `Incentive ledger entry '${parsed.data.incentive_ledger_id}' was not found.`
      );
    }

    if (incentive.status !== "APPROVED") {
      throw new PayrollDomainError(
        "INCENTIVE_NOT_APPROVED",
        `Incentive ledger entry '${incentive.id}' must be APPROVED before a payroll entry can be created (current status: '${incentive.status}').`
      );
    }

    const existing = await this.database
      .selectFrom("payroll_entries")
      .select("id")
      .where("incentive_ledger_id", "=", incentive.id)
      .executeTakeFirst();

    if (existing) {
      throw new PayrollDomainError(
        "DUPLICATE_PAYROLL_ENTRY",
        `A payroll entry already exists for incentive ledger entry '${incentive.id}'.`
      );
    }

    const now = new Date();
    const id = crypto.randomUUID();

    try {
      await this.database
        .insertInto("payroll_entries")
        .values({
          id,
          incentive_ledger_id: incentive.id,
          employee_id: incentive.employee_id,
          amount: incentive.amount,
          status: "PENDING",
          created_at: now,
          updated_at: now,
          version: "1"
        })
        .execute();
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new PayrollDomainError(
          "DUPLICATE_PAYROLL_ENTRY",
          `A payroll entry already exists for incentive ledger entry '${incentive.id}'.`
        );
      }
      throw err;
    }

    return this.getEntryByIdOrThrow(id);
  }

  /**
   * Records a one-shot approval/rejection decision on a payroll entry.
   * Once a decision exists it cannot be re-decided (both a pre-check and
   * the payroll_approvals unique index on payroll_entry_id enforce this).
   */
  public async recordApproval(
    payrollEntryId: string,
    actorUserId: string,
    request: CreatePayrollApprovalRequest
  ): Promise<PayrollEntryDTO> {
    const parsed = createPayrollApprovalRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new PayrollDomainError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid approval decision");
    }

    const entry = await this.database
      .selectFrom("payroll_entries")
      .select("id")
      .where("id", "=", payrollEntryId)
      .executeTakeFirst();

    if (!entry) {
      throw new PayrollDomainError("PAYROLL_ENTRY_NOT_FOUND", `Payroll entry '${payrollEntryId}' was not found.`);
    }

    const existingApproval = await this.database
      .selectFrom("payroll_approvals")
      .select("id")
      .where("payroll_entry_id", "=", payrollEntryId)
      .executeTakeFirst();

    if (existingApproval) {
      throw new PayrollDomainError(
        "APPROVAL_ALREADY_DECIDED",
        `Payroll entry '${payrollEntryId}' has already been decided and cannot be re-decided.`
      );
    }

    const now = new Date();
    const newStatus = parsed.data.decision === "APPROVE" ? "APPROVED" : "REJECTED";

    try {
      await this.database.transaction().execute(async (trx) => {
        await trx
          .insertInto("payroll_approvals")
          .values({
            id: crypto.randomUUID(),
            payroll_entry_id: payrollEntryId,
            actor_user_id: actorUserId,
            decision: parsed.data.decision,
            notes: parsed.data.notes ?? null,
            decided_at: now,
            created_at: now
          })
          .execute();

        await trx
          .updateTable("payroll_entries")
          .set({ status: newStatus, updated_at: now, version: sql`version + 1` })
          .where("id", "=", payrollEntryId)
          .execute();
      });
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new PayrollDomainError(
          "APPROVAL_ALREADY_DECIDED",
          `Payroll entry '${payrollEntryId}' has already been decided and cannot be re-decided.`
        );
      }
      throw err;
    }

    return this.getEntryByIdOrThrow(payrollEntryId);
  }

  public async getEntryById(id: string): Promise<PayrollEntryDTO | null> {
    const row = await this.database.selectFrom("payroll_entries").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) {
      return null;
    }
    const approvals = await this.database
      .selectFrom("payroll_approvals")
      .selectAll()
      .where("payroll_entry_id", "=", id)
      .execute();

    return this.toDTO(row, approvals);
  }

  public async listEntries(filter: ListPayrollEntriesFilter = {}): Promise<PayrollEntryDTO[]> {
    let query = this.database.selectFrom("payroll_entries").selectAll();
    if (filter.status) {
      query = query.where("status", "=", filter.status);
    }
    if (filter.employee_id) {
      query = query.where("employee_id", "=", filter.employee_id);
    }

    const rows = await query.orderBy("created_at", "desc").execute();
    return Promise.all(
      rows.map(async (row) => {
        const approvals = await this.database
          .selectFrom("payroll_approvals")
          .selectAll()
          .where("payroll_entry_id", "=", row.id)
          .execute();
        return this.toDTO(row, approvals);
      })
    );
  }

  private async getEntryByIdOrThrow(id: string): Promise<PayrollEntryDTO> {
    const entry = await this.getEntryById(id);
    if (!entry) {
      throw new PayrollDomainError("PAYROLL_ENTRY_NOT_FOUND", `Payroll entry '${id}' was not found.`);
    }
    return entry;
  }

  private toDTO(
    row: {
      id: string;
      incentive_ledger_id: string;
      employee_id: string;
      amount: string;
      status: string;
      created_at: Date;
      updated_at: Date;
      version: string;
    },
    approvals: Array<{
      id: string;
      payroll_entry_id: string;
      decision: string;
      actor_user_id: string;
      notes: string | null;
      decided_at: Date;
      created_at: Date;
    }>
  ): PayrollEntryDTO {
    return {
      id: row.id,
      incentive_ledger_id: row.incentive_ledger_id,
      employee_id: row.employee_id,
      amount: row.amount,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: BigInt(row.version),
      approvals: approvals.map((a) => ({
        id: a.id,
        payroll_entry_id: a.payroll_entry_id,
        decision: a.decision,
        actor_user_id: a.actor_user_id,
        notes: a.notes,
        decided_at: a.decided_at,
        created_at: a.created_at
      }))
    };
  }
}

function isPostgresUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}
