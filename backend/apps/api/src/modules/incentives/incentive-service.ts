import crypto from "node:crypto";
import type {
  ApproveIncentiveRequest,
  CalculateMonthlyIncentiveRequest,
  CalculateTaskIncentiveRequest,
  IncentiveLedgerRecord,
  ManualPenaltyRecord,
  MonthlyIncentiveCalculationResult,
  MonthlyKotRecord,
  RecordManualPenaltyRequest,
  RecordMonthlyKotRequest,
  TaskIncentiveAllocationResult
} from "@royal-packaging/contracts";
import {
  approveIncentiveRequestSchema,
  calculateMonthlyIncentiveRequestSchema,
  calculateTaskIncentiveRequestSchema,
  IncentiveDomainError,
  recordManualPenaltyRequestSchema,
  recordMonthlyKotRequestSchema
} from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";

export interface IncentiveServiceConfig {
  readonly database: DatabaseConnection;
}

const SCALE = 2n;
const MULTIPLIER = 100n; // 10^2 for 2 decimal places

/**
 * Converts a decimal number or string representation to a scaled BigInt (cents/paise).
 */
export function toScaledBigInt(value: string | number | bigint, scaleMultiplier: bigint = MULTIPLIER): bigint {
  if (typeof value === "bigint") {
    return value * scaleMultiplier;
  }

  const str = typeof value === "number" ? value.toFixed(Number(SCALE)) : value.trim();
  if (!/^\d+(\.\d+)?$/.test(str)) {
    throw new IncentiveDomainError("VALIDATION_FAILED", `Invalid numeric value: ${value}`);
  }

  const parts = str.split(".");
  const whole = BigInt(parts[0] || "0");
  const fractionalStr = (parts[1] || "").padEnd(Number(SCALE), "0").slice(0, Number(SCALE));
  const fractional = BigInt(fractionalStr);

  return whole * scaleMultiplier + fractional;
}

/**
 * Converts a scaled BigInt back to a standard decimal string (e.g. "1200.00").
 */
export function fromScaledBigInt(cents: bigint, scaleMultiplier: bigint = MULTIPLIER): string {
  const isNegative = cents < 0n;
  const absCents = isNegative ? -cents : cents;
  const whole = absCents / scaleMultiplier;
  const fractional = absCents % scaleMultiplier;
  const fractionalStr = fractional.toString().padStart(Number(SCALE), "0");

  return `${isNegative ? "-" : ""}${whole.toString()}.${fractionalStr}`;
}

/**
 * Canonical Incentive Engine Service (FND-18).
 * Strictly implements confirmed B-03 business rules:
 * - KOT: Key Operational Throughput entered once per month by Super Admin.
 * - Monthly Incentive: KOT × 6%.
 * - Task-Level Sharing: Equal shares among employees assigned at completion.
 * - Participant Exclusion: Employees removed before completion are excluded.
 * - Manual Penalties: Entered by authorized actors with audit trail.
 * - Remainder Handling: Surfaced as held/unresolved remainder (never allocated to arbitrary recipients).
 * - Overtime: Pending configuration marker (no guessed multipliers).
 * - Approvals: Super Admin only.
 */
export class IncentiveService {
  private readonly database: DatabaseConnection;

  public constructor(config: IncentiveServiceConfig) {
    this.database = config.database;
  }

  /**
   * Records monthly KOT value entered manually by Super Admin.
   * Enforces once-per-month constraint; rejects duplicate entries for the same month.
   */
  public async recordMonthlyKot(
    request: RecordMonthlyKotRequest,
    actorUserId: string
  ): Promise<MonthlyKotRecord> {
    this.assertActor(actorUserId);

    const parseResult = recordMonthlyKotRequestSchema.safeParse(request);
    if (!parseResult.success) {
      throw new IncentiveDomainError(
        "VALIDATION_FAILED",
        parseResult.error.issues[0]?.message ?? "Invalid monthly KOT request"
      );
    }

    const { effective_month, kot_value, notes } = parseResult.data;
    const scaledKot = toScaledBigInt(kot_value);
    if (scaledKot < 0n) {
      throw new IncentiveDomainError("INVALID_KOT_VALUE", "KOT value cannot be negative.");
    }

    const formattedKotValue = fromScaledBigInt(scaledKot);

    return this.database.transaction().execute(async (trx) => {
      // Check for existing monthly KOT record
      const existing = await trx
        .selectFrom("monthly_kot")
        .select(["id", "effective_month", "kot_value"])
        .where("effective_month", "=", effective_month)
        .where("status", "=", "ACTIVE")
        .executeTakeFirst();

      if (existing) {
        throw new IncentiveDomainError(
          "DUPLICATE_MONTHLY_KOT",
          `A KOT value of ${existing.kot_value} has already been recorded for month '${effective_month}'. Duplicate or conflicting KOT entries for the same month are not permitted.`
        );
      }

      const id = crypto.randomUUID();
      const now = new Date();

      await trx
        .insertInto("monthly_kot")
        .values({
          id,
          effective_month,
          kot_value: formattedKotValue,
          status: "ACTIVE",
          created_by_user_id: actorUserId,
          notes: notes ?? null,
          created_at: now,
          updated_at: now,
          version: sql`1`
        })
        .execute();

      const created = await trx
        .selectFrom("monthly_kot")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirstOrThrow();

      return this.formatMonthlyKot(created);
    });
  }

  /**
   * Retrieves applicable monthly KOT for a given YYYY-MM.
   */
  public async getMonthlyKot(effectiveMonth: string): Promise<MonthlyKotRecord | null> {
    const row = await this.database
      .selectFrom("monthly_kot")
      .selectAll()
      .where("effective_month", "=", effectiveMonth)
      .where("status", "=", "ACTIVE")
      .executeTakeFirst();

    return row ? this.formatMonthlyKot(row) : null;
  }

  /**
   * Records a manual penalty entered by an authorized actor with audit tracking.
   */
  public async recordManualPenalty(
    request: RecordManualPenaltyRequest,
    actorUserId: string
  ): Promise<ManualPenaltyRecord> {
    this.assertActor(actorUserId);

    const parseResult = recordManualPenaltyRequestSchema.safeParse(request);
    if (!parseResult.success) {
      throw new IncentiveDomainError(
        "VALIDATION_FAILED",
        parseResult.error.issues[0]?.message ?? "Invalid penalty request"
      );
    }

    const { employee_id, amount, reason, effective_month, task_id } = parseResult.data;
    const scaledAmount = toScaledBigInt(amount);
    if (scaledAmount <= 0n) {
      throw new IncentiveDomainError("INVALID_PENALTY_AMOUNT", "Penalty amount must be greater than 0.");
    }

    const formattedAmount = fromScaledBigInt(scaledAmount);

    return this.database.transaction().execute(async (trx) => {
      // Verify employee exists
      const employee = await trx
        .selectFrom("employees")
        .select("id")
        .where("id", "=", employee_id)
        .executeTakeFirst();

      if (!employee) {
        throw new IncentiveDomainError("EMPLOYEE_NOT_FOUND", `Employee with ID '${employee_id}' was not found.`);
      }

      // Verify task if provided
      if (task_id) {
        const task = await trx
          .selectFrom("tasks")
          .select("id")
          .where("id", "=", task_id)
          .executeTakeFirst();

        if (!task) {
          throw new IncentiveDomainError("TASK_NOT_FOUND", `Task with ID '${task_id}' was not found.`);
        }
      }

      const id = crypto.randomUUID();
      const now = new Date();

      await trx
        .insertInto("manual_penalties")
        .values({
          id,
          employee_id,
          task_id: task_id ?? null,
          amount: formattedAmount,
          reason,
          effective_month,
          recorded_by_user_id: actorUserId,
          status: "ACTIVE",
          created_at: now,
          updated_at: now,
          version: sql`1`
        })
        .execute();

      const created = await trx
        .selectFrom("manual_penalties")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirstOrThrow();

      return this.formatManualPenalty(created);
    });
  }

  /**
   * Retrieves manual penalties for a given effective month or employee.
   */
  public async getManualPenalties(filters: {
    effectiveMonth?: string | undefined;
    employeeId?: string | undefined;
    taskId?: string | undefined;
  }): Promise<ManualPenaltyRecord[]> {
    let query = this.database
      .selectFrom("manual_penalties")
      .selectAll()
      .where("status", "=", "ACTIVE");

    if (filters.effectiveMonth) {
      query = query.where("effective_month", "=", filters.effectiveMonth);
    }
    if (filters.employeeId) {
      query = query.where("employee_id", "=", filters.employeeId);
    }
    if (filters.taskId) {
      query = query.where("task_id", "=", filters.taskId);
    }

    const rows = await query.orderBy("created_at", "asc").execute();
    return rows.map((r) => this.formatManualPenalty(r));
  }

  /**
   * Calculates high-level monthly incentive:
   * monthly incentive = applicable monthly KOT × 6%
   *
   * Note (FND-18A):
   * - Monthly Incentive pool is KOT × 6%.
   * - Penalty aggregation model, negative incentive zero-floor, and task-level reconciliation
   *   are explicitly unresolved business rules marked as TBD.
   */
  public async calculateMonthlyIncentive(
    request: CalculateMonthlyIncentiveRequest
  ): Promise<MonthlyIncentiveCalculationResult> {
    const parseResult = calculateMonthlyIncentiveRequestSchema.safeParse(request);
    if (!parseResult.success) {
      throw new IncentiveDomainError(
        "VALIDATION_FAILED",
        parseResult.error.issues[0]?.message ?? "Invalid monthly incentive request"
      );
    }

    const { effective_month } = parseResult.data;

    const kotRecord = await this.getMonthlyKot(effective_month);
    if (!kotRecord) {
      throw new IncentiveDomainError(
        "KOT_NOT_FOUND",
        `No KOT value recorded for effective month '${effective_month}'. Super Admin must record monthly KOT before incentive calculation.`
      );
    }

    const scaledKot = toScaledBigInt(kotRecord.kot_value);

    // Confirmed Rule: Monthly incentive pool = applicable monthly KOT × 6%
    const grossIncentiveCents = (scaledKot * 6n) / 100n;
    const monthlyIncentivePool = fromScaledBigInt(grossIncentiveCents);

    const penalties = await this.getManualPenalties({ effectiveMonth: effective_month });

    return {
      effective_month,
      kot_value: kotRecord.kot_value,
      monthly_incentive_pool: monthlyIncentivePool,
      gross_incentive_pool: monthlyIncentivePool,
      penalties,
      penalty_aggregation_relationship: "TBD_PENDING_POLICY",
      zero_floor_policy: "TBD_NOT_CONFIRMED",
      task_reconciliation_status: "TBD_SOURCE_UNDEFINED",
      overtime_status: "PENDING_CONFIGURATION"
    };
  }

  /**
   * Calculates and allocates equal incentive shares among participating employees for a COMPLETED task.
   *
   * Confirmed Rules:
   * 1. Incentive is shared equally among all employees assigned to the task.
   * 2. Employees unassigned BEFORE completion are excluded from the final participant set.
   * 3. Employees who were never assigned are not included.
   * 4. Task must be in COMPLETED status.
   * 5. Quality gate: quality failure (damage_rate >= 5% or outcome FAIL) blocks incentive.
   * 6. Remainder recipient is NOT decided: non-zero remainder is surfaced as unresolved_remainder (never allocated).
   * 7. Overtime formula is NOT decided: represented as PENDING_CONFIGURATION.
   * 8. Ledger records are inserted in PENDING status pending Super Admin approval.
   */
  public async calculateTaskIncentive(
    request: CalculateTaskIncentiveRequest,
    actorUserId: string
  ): Promise<TaskIncentiveAllocationResult> {
    this.assertActor(actorUserId);

    const parseResult = calculateTaskIncentiveRequestSchema.safeParse(request);
    if (!parseResult.success) {
      throw new IncentiveDomainError(
        "VALIDATION_FAILED",
        parseResult.error.issues[0]?.message ?? "Invalid task incentive request"
      );
    }

    const { task_id, task_incentive_amount, idempotency_key, correlation_id } = parseResult.data;

    const scaledTotal = toScaledBigInt(task_incentive_amount);
    if (scaledTotal <= 0n) {
      throw new IncentiveDomainError("INVALID_INCENTIVE_AMOUNT", "Task incentive amount must be greater than 0.");
    }

    return this.database.transaction().execute(async (trx) => {
      // 1. Fetch task
      const task = await trx
        .selectFrom("tasks")
        .selectAll()
        .where("id", "=", task_id)
        .forUpdate()
        .executeTakeFirst();

      if (!task) {
        throw new IncentiveDomainError("TASK_NOT_FOUND", `Task with ID '${task_id}' was not found.`);
      }

      if (task.status !== "COMPLETED") {
        throw new IncentiveDomainError(
          "TASK_NOT_COMPLETED",
          `Cannot calculate incentive for task in status '${task.status}'. Task must be COMPLETED.`
        );
      }

      // 2. Validate Quality Gate: latest non-superseded quality record must not be failed
      const latestQuality = await trx
        .selectFrom("quality_records")
        .selectAll()
        .where("task_id", "=", task_id)
        .where("superseded_by_record_id", "is", null)
        .orderBy("inspected_at", "desc")
        .orderBy("created_at", "desc")
        .executeTakeFirst();

      if (latestQuality) {
        const isFailed =
          latestQuality.outcome === "FAIL" ||
          latestQuality.final_inventory_status === "DAMAGED" ||
          (latestQuality.damage_rate !== null && Number(latestQuality.damage_rate) >= 5);

        if (isFailed) {
          throw new IncentiveDomainError(
            "QUALITY_GATE_FAILED",
            `Incentive allocation blocked: task has failed quality inspection (outcome: '${latestQuality.outcome}', status: '${latestQuality.final_inventory_status}').`
          );
        }
      }

      // 3. Check Idempotency Key if provided
      if (idempotency_key) {
        const existingEntries = await trx
          .selectFrom("incentive_ledger")
          .selectAll()
          .where("idempotency_key", "=", idempotency_key)
          .execute();

        if (existingEntries.length > 0) {
          const totalExistingCents = existingEntries.reduce(
            (acc, curr) => acc + toScaledBigInt(curr.amount),
            0n
          );

          const participantIds = existingEntries.map((e) => e.employee_id);
          const perShare = existingEntries[0]?.amount ?? "0.00";
          const remainderCents = scaledTotal - totalExistingCents;

          return {
            task_id,
            total_task_incentive: fromScaledBigInt(scaledTotal),
            participating_employee_ids: participantIds,
            excluded_employee_ids: [],
            per_employee_share: perShare,
            unresolved_remainder: fromScaledBigInt(remainderCents >= 0n ? remainderCents : 0n),
            rounding_policy: "EXACT_REMAINDER_HELD",
            task_to_monthly_pool_reconciliation: "TBD_SOURCE_UNDEFINED",
            overtime_status: "PENDING_CONFIGURATION",
            ledger_entries: existingEntries.map((e) => this.formatLedger(e))
          };
        }
      }

      // 4. Check if task already has approved ledger entries (immutable)
      const existingApproved = await trx
        .selectFrom("incentive_ledger")
        .select("id")
        .where("task_id", "=", task_id)
        .where("status", "=", "APPROVED")
        .execute();

      if (existingApproved.length > 0) {
        throw new IncentiveDomainError(
          "ALREADY_APPROVED",
          `Incentive ledger entries for task '${task_id}' have already been approved and cannot be mutated or recalculated.`
        );
      }

      // 5. Query task assignments: active participants vs unassigned participants
      const allAssignments = await trx
        .selectFrom("task_assignments")
        .selectAll()
        .where("task_id", "=", task_id)
        .execute();

      const activeParticipants = allAssignments.filter((a) => a.unassigned_at === null);
      const excludedParticipants = allAssignments.filter((a) => a.unassigned_at !== null);

      const participatingEmployeeIds = Array.from(new Set(activeParticipants.map((a) => a.employee_id)));
      const excludedEmployeeIds = Array.from(
        new Set(
          excludedParticipants
            .map((a) => a.employee_id)
            .filter((id) => !participatingEmployeeIds.includes(id))
        )
      );

      if (participatingEmployeeIds.length === 0) {
        throw new IncentiveDomainError(
          "NO_PARTICIPATING_EMPLOYEES",
          `Task '${task_id}' has no active participating employees at completion.`
        );
      }

      // 6. Equal sharing calculation
      const participantCount = BigInt(participatingEmployeeIds.length);
      const perEmployeeShareCents = scaledTotal / participantCount;
      const totalAllocatedCents = perEmployeeShareCents * participantCount;
      const unresolvedRemainderCents = scaledTotal - totalAllocatedCents;

      const formattedShare = fromScaledBigInt(perEmployeeShareCents);
      const formattedRemainder = fromScaledBigInt(unresolvedRemainderCents);

      // 7. Ensure active canonical rule exists
      let rule = await trx
        .selectFrom("incentive_rules")
        .selectAll()
        .where("rule_version", "=", "B-03-CONFIRMED")
        .executeTakeFirst();

      if (!rule) {
        const ruleId = crypto.randomUUID();
        const now = new Date();
        await trx
          .insertInto("incentive_rules")
          .values({
            id: ruleId,
            rule_version: "B-03-CONFIRMED",
            effective_from: now,
            effective_to: null,
            created_at: now,
            updated_at: now,
            version: sql`1`
          })
          .execute();

        rule = await trx
          .selectFrom("incentive_rules")
          .selectAll()
          .where("id", "=", ruleId)
          .executeTakeFirstOrThrow();
      }

      // 8. Clean up any existing unapproved PENDING ledger rows for this task before recalculation
      await trx
        .deleteFrom("incentive_ledger")
        .where("task_id", "=", task_id)
        .where("status", "=", "PENDING")
        .execute();

      // 9. Insert PENDING incentive ledger entries for each participating employee
      const now = new Date();
      const ledgerEntries: IncentiveLedgerRecord[] = [];

      for (const employeeId of participatingEmployeeIds) {
        const ledgerId = crypto.randomUUID();
        await trx
          .insertInto("incentive_ledger")
          .values({
            id: ledgerId,
            task_id,
            employee_id: employeeId,
            incentive_rule_id: rule.id,
            amount: formattedShare,
            status: "PENDING",
            idempotency_key: idempotency_key ?? null,
            created_at: now,
            updated_at: now,
            version: sql`1`
          })
          .execute();

        ledgerEntries.push({
          id: ledgerId,
          task_id,
          employee_id: employeeId,
          incentive_rule_id: rule.id,
          amount: formattedShare,
          status: "PENDING",
          idempotency_key: idempotency_key ?? null,
          created_at: now,
          updated_at: now,
          version: 1n
        });
      }

      // 10. Record INCENTIVE_CALCULATED event
      const eventId = crypto.randomUUID();
      const metadata = JSON.stringify({
        total_task_incentive: fromScaledBigInt(scaledTotal),
        per_employee_share: formattedShare,
        unresolved_remainder: formattedRemainder,
        participating_employee_ids: participatingEmployeeIds,
        excluded_employee_ids: excludedEmployeeIds,
        overtime_status: "PENDING_CONFIGURATION"
      });

      await trx
        .insertInto("incentive_events")
        .values({
          id: eventId,
          task_id,
          incentive_rule_id: rule.id,
          event_type: "INCENTIVE_CALCULATED",
          event_at: now,
          actor_user_id: actorUserId,
          correlation_id: correlation_id ?? null,
          metadata,
          created_at: now
        })
        .execute();

      return {
        task_id,
        total_task_incentive: fromScaledBigInt(scaledTotal),
        participating_employee_ids: participatingEmployeeIds,
        excluded_employee_ids: excludedEmployeeIds,
        per_employee_share: formattedShare,
        unresolved_remainder: formattedRemainder,
        rounding_policy: "EXACT_REMAINDER_HELD",
        task_to_monthly_pool_reconciliation: "TBD_SOURCE_UNDEFINED",
        overtime_status: "PENDING_CONFIGURATION",
        ledger_entries: ledgerEntries
      };
    });
  }

  /**
   * Approves pending incentive ledger entries.
   * Enforces Super Admin authorization and transitions status to APPROVED.
   */
  public async approveIncentiveLedger(
    request: ApproveIncentiveRequest,
    actorUserId: string
  ): Promise<IncentiveLedgerRecord[]> {
    this.assertActor(actorUserId);

    const parseResult = approveIncentiveRequestSchema.safeParse(request);
    if (!parseResult.success) {
      throw new IncentiveDomainError(
        "VALIDATION_FAILED",
        parseResult.error.issues[0]?.message ?? "Invalid approval request"
      );
    }

    const { ledger_ids, task_id, notes, correlation_id } = parseResult.data;

    return this.database.transaction().execute(async (trx) => {
      let query = trx.selectFrom("incentive_ledger").selectAll().forUpdate();

      if (ledger_ids && ledger_ids.length > 0) {
        query = query.where("id", "in", ledger_ids);
      } else if (task_id) {
        query = query.where("task_id", "=", task_id);
      }

      const records = await query.execute();
      if (records.length === 0) {
        throw new IncentiveDomainError(
          "VALIDATION_FAILED",
          "No matching incentive ledger records found to approve."
        );
      }

      const now = new Date();
      const updatedRecords: IncentiveLedgerRecord[] = [];

      for (const record of records) {
        if (record.status !== "APPROVED") {
          await trx
            .updateTable("incentive_ledger")
            .set({
              status: "APPROVED",
              updated_at: now,
              version: sql`version + 1`
            })
            .where("id", "=", record.id)
            .execute();
        }

        updatedRecords.push({
          ...this.formatLedger(record),
          status: "APPROVED",
          updated_at: now,
          version: this.parseVersion(record.version) + (record.status !== "APPROVED" ? 1n : 0n)
        });
      }

      // Record INCENTIVE_APPROVED event for each affected task
      const distinctTaskIds = Array.from(new Set(records.map((r) => r.task_id)));
      for (const tId of distinctTaskIds) {
        const eventId = crypto.randomUUID();
        const metadata = JSON.stringify({
          approved_count: records.filter((r) => r.task_id === tId).length,
          notes: notes ?? null
        });

        await trx
          .insertInto("incentive_events")
          .values({
            id: eventId,
            task_id: tId,
            incentive_rule_id: records[0]?.incentive_rule_id ?? null,
            event_type: "INCENTIVE_APPROVED",
            event_at: now,
            actor_user_id: actorUserId,
            correlation_id: correlation_id ?? null,
            metadata,
            created_at: now
          })
          .execute();
      }

      return updatedRecords;
    });
  }

  /**
   * Retrieves incentive ledger records matching the given criteria.
   */
  public async getIncentiveLedger(filters: {
    taskId?: string | undefined;
    employeeId?: string | undefined;
    status?: string | undefined;
  }): Promise<IncentiveLedgerRecord[]> {
    let query = this.database.selectFrom("incentive_ledger").selectAll();

    if (filters.taskId) {
      query = query.where("task_id", "=", filters.taskId);
    }
    if (filters.employeeId) {
      query = query.where("employee_id", "=", filters.employeeId);
    }
    if (filters.status) {
      query = query.where("status", "=", filters.status);
    }

    const rows = await query.orderBy("created_at", "asc").execute();
    return rows.map((r) => this.formatLedger(r));
  }

  private assertActor(actorUserId: string): void {
    if (!actorUserId || actorUserId.trim() === "") {
      throw new IncentiveDomainError(
        "UNAUTHORIZED_ACTOR",
        "Actor user ID is required and must come from a verified server-side authentication context."
      );
    }
  }

  private parseVersion(version: unknown): bigint {
    if (typeof version === "bigint") {
      return version;
    }
    if (typeof version === "number") {
      return BigInt(version);
    }
    if (typeof version === "string" && !Number.isNaN(Number(version))) {
      return BigInt(version);
    }
    return 1n;
  }

  private formatMonthlyKot(row: {
    id: string;
    effective_month: string;
    kot_value: string;
    status: string;
    created_by_user_id: string;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
    version: unknown;
  }): MonthlyKotRecord {
    return {
      id: row.id,
      effective_month: row.effective_month,
      kot_value: row.kot_value,
      status: row.status,
      created_by_user_id: row.created_by_user_id,
      notes: row.notes,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      version: this.parseVersion(row.version)
    };
  }

  private formatManualPenalty(row: {
    id: string;
    employee_id: string;
    task_id: string | null;
    amount: string;
    reason: string;
    effective_month: string;
    recorded_by_user_id: string;
    status: string;
    created_at: Date;
    updated_at: Date;
    version: unknown;
  }): ManualPenaltyRecord {
    return {
      id: row.id,
      employee_id: row.employee_id,
      task_id: row.task_id,
      amount: row.amount,
      reason: row.reason,
      effective_month: row.effective_month,
      recorded_by_user_id: row.recorded_by_user_id,
      status: row.status,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      version: this.parseVersion(row.version)
    };
  }

  private formatLedger(row: {
    id: string;
    task_id: string;
    employee_id: string;
    incentive_rule_id: string | null;
    amount: string;
    status: string;
    idempotency_key: string | null;
    created_at: Date;
    updated_at: Date;
    version: unknown;
  }): IncentiveLedgerRecord {
    return {
      id: row.id,
      task_id: row.task_id,
      employee_id: row.employee_id,
      incentive_rule_id: row.incentive_rule_id,
      amount: row.amount,
      status: row.status,
      idempotency_key: row.idempotency_key,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      version: this.parseVersion(row.version)
    };
  }
}
