import crypto from "node:crypto";
import type {
  InspectTaskRequest,
  QualityRecord,
  RecordTaskPhotoRequest,
  TaskPhotoRecord
} from "@royal-packaging/contracts";
import {
  inspectTaskRequestSchema,
  QualityDomainError,
  recordTaskPhotoRequestSchema
} from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";

export interface QualityServiceConfig {
  readonly database: DatabaseConnection;
}

export class QualityService {
  private readonly database: DatabaseConnection;

  public constructor(config: QualityServiceConfig) {
    this.database = config.database;
  }

  /**
   * Records a task quality inspection inside a PostgreSQL transaction.
   *
   * Confirmed Business Rules:
   * 1. If damage_rate is provided:
   *    - damage_rate >= 5 -> final_inventory_status = "DAMAGED"
   *    - damage_rate < 5  -> final_inventory_status = "AVAILABLE"
   * 2. Inspector identity must be provided from trusted server-side authentication context.
   * 3. Quality records are immutable historical records. Corrections/reinspections link via superseded_by_record_id.
   * 4. Task lifecycle state is NOT automatically modified by quality inspection (B-02 preserved).
   * 5. Inventory balances are NOT mutated directly (inventory status consequence gap documented).
   *
   * @param request Inspection request parameters.
   * @param actorUserId Server-resolved authenticated user ID.
   */
  public async inspectTask(
    request: InspectTaskRequest,
    actorUserId: string
  ): Promise<QualityRecord> {
    this.assertInspector(actorUserId);

    const parseResult = inspectTaskRequestSchema.safeParse(request);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      const field = issue?.path[0];
      const message = issue?.message ?? "Invalid quality inspection request";

      if (field === "damage_rate") {
        throw new QualityDomainError("INVALID_DAMAGE_RATE", message);
      }
      if (field === "quality_score") {
        throw new QualityDomainError("INVALID_QUALITY_SCORE", message);
      }
      if (field === "task_accuracy") {
        throw new QualityDomainError("INVALID_TASK_ACCURACY", message);
      }
      throw new QualityDomainError("VALIDATION_FAILED", message);
    }

    const {
      task_id,
      outcome,
      damage_rate,
      quality_score,
      task_accuracy,
      notes,
      supersedes_record_id
    } = parseResult.data;

    // Evaluate final inventory status and outcome according to confirmed threshold
    let finalInventoryStatus: string | null = null;
    let effectiveOutcome = outcome;
    if (damage_rate !== undefined) {
      const numericDamageRate = Number(damage_rate);
      if (Number.isNaN(numericDamageRate) || numericDamageRate < 0 || numericDamageRate > 100) {
        throw new QualityDomainError("INVALID_DAMAGE_RATE", "Damage rate must be between 0 and 100");
      }
      finalInventoryStatus = numericDamageRate >= 5 ? "DAMAGED" : "AVAILABLE";
      if (numericDamageRate >= 5) {
        effectiveOutcome = "FAIL";
      }
    }

    if (quality_score !== undefined) {
      const numericScore = Number(quality_score);
      if (Number.isNaN(numericScore) || numericScore < 0 || numericScore > 100) {
        throw new QualityDomainError("INVALID_QUALITY_SCORE", "Quality score must be between 0 and 100");
      }
    }

    if (task_accuracy !== undefined) {
      const numericAccuracy = Number(task_accuracy);
      if (Number.isNaN(numericAccuracy) || numericAccuracy < 0 || numericAccuracy > 100) {
        throw new QualityDomainError("INVALID_TASK_ACCURACY", "Task accuracy must be between 0 and 100");
      }
    }

    return this.database.transaction().execute(async (trx) => {
      // 1. Verify task exists
      const task = await trx
        .selectFrom("tasks")
        .select("id")
        .where("id", "=", task_id)
        .forUpdate()
        .executeTakeFirst();

      if (!task) {
        throw new QualityDomainError("TASK_NOT_FOUND", `Task with ID '${task_id}' was not found.`);
      }

      // 2. If superseding a previous record, verify it exists and belongs to the same task
      if (supersedes_record_id) {
        const existingRecord = await trx
          .selectFrom("quality_records")
          .selectAll()
          .where("id", "=", supersedes_record_id)
          .where("task_id", "=", task_id)
          .forUpdate()
          .executeTakeFirst();

        if (!existingRecord) {
          throw new QualityDomainError(
            "QUALITY_RECORD_NOT_FOUND",
            `Quality record '${supersedes_record_id}' to supersede was not found on task '${task_id}'.`
          );
        }
      }

      // 3. Create the new quality record
      const newRecordId = crypto.randomUUID();
      const now = new Date();

      await trx
        .insertInto("quality_records")
        .values({
          id: newRecordId,
          task_id,
          outcome: effectiveOutcome,
          quality_score: quality_score !== undefined ? String(quality_score) : null,
          damage_rate: damage_rate !== undefined ? String(damage_rate) : null,
          task_accuracy: task_accuracy !== undefined ? String(task_accuracy) : null,
          final_inventory_status: finalInventoryStatus,
          inspected_at: now,
          inspected_by_user_id: actorUserId,
          superseded_by_record_id: null,
          notes: notes ?? null,
          created_at: now,
          updated_at: now,
          version: sql`1`
        })
        .execute();

      // 4. Update supersession pointer on the previous record if applicable
      if (supersedes_record_id) {
        await trx
          .updateTable("quality_records")
          .set({
            superseded_by_record_id: newRecordId,
            updated_at: now,
            version: sql`version + 1`
          })
          .where("id", "=", supersedes_record_id)
          .execute();
      }

      return {
        id: newRecordId,
        task_id,
        outcome: effectiveOutcome,
        quality_score: quality_score !== undefined ? Number(quality_score) : null,
        damage_rate: damage_rate !== undefined ? Number(damage_rate) : null,
        task_accuracy: task_accuracy !== undefined ? Number(task_accuracy) : null,
        final_inventory_status: finalInventoryStatus,
        inspected_at: now,
        inspected_by_user_id: actorUserId,
        superseded_by_record_id: null,
        notes: notes ?? null,
        created_at: now,
        updated_at: now,
        version: 1n
      };
    });
  }

  /**
   * Retrieves a single quality record by ID.
   */
  public async getQualityRecord(id: string): Promise<QualityRecord | null> {
    const row = await this.database
      .selectFrom("quality_records")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return this.mapQualityRecord(row);
  }

  /**
   * Retrieves the full quality inspection history for a task.
   */
  public async getTaskQualityHistory(taskId: string): Promise<QualityRecord[]> {
    const rows = await this.database
      .selectFrom("quality_records")
      .selectAll()
      .where("task_id", "=", taskId)
      .orderBy("inspected_at", "desc")
      .orderBy("created_at", "desc")
      .execute();

    return rows.map((r) => this.mapQualityRecord(r));
  }

  /**
   * Records a task layer photo metadata entry inside a PostgreSQL transaction.
   *
   * Confirmed Business Rules:
   * 1. Layer number must be positive (layer_number > 0).
   * 2. Box quantity must be positive (box_quantity > 0). BOX is the only operational unit.
   * 3. Uses abstract storage_key representation (no hard-coded storage providers).
   * 4. Photos are linked to the specific task and optional employee context.
   *
   * @param request Photo registration parameters.
   * @param actorEmployeeId Server-resolved authenticated employee ID (optional).
   */
  public async recordTaskPhoto(
    request: RecordTaskPhotoRequest,
    actorEmployeeId?: string | null
  ): Promise<TaskPhotoRecord> {
    const parseResult = recordTaskPhotoRequestSchema.safeParse(request);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      const field = issue?.path[0];
      const message = issue?.message ?? "Invalid task photo request";

      if (field === "layer_number") {
        throw new QualityDomainError("INVALID_PHOTO_LAYER", message);
      }
      if (field === "box_quantity") {
        throw new QualityDomainError("INVALID_BOX_QUANTITY", message);
      }
      if (field === "storage_key") {
        throw new QualityDomainError("INVALID_STORAGE_KEY", message);
      }
      throw new QualityDomainError("VALIDATION_FAILED", message);
    }

    const {
      task_id,
      layer_number,
      box_quantity,
      storage_key,
      captured_by_employee_id,
      status,
      supersedes_photo_id
    } = parseResult.data;

    const normalizedBoxQuantity = BigInt(box_quantity);
    if (normalizedBoxQuantity <= 0n) {
      throw new QualityDomainError("INVALID_BOX_QUANTITY", "Box quantity must be greater than 0");
    }

    if (layer_number <= 0) {
      throw new QualityDomainError("INVALID_PHOTO_LAYER", "Layer number must be greater than 0");
    }

    const effEmployeeId = actorEmployeeId !== undefined ? actorEmployeeId : (captured_by_employee_id ?? null);

    return this.database.transaction().execute(async (trx) => {
      // 1. Verify task exists
      const task = await trx
        .selectFrom("tasks")
        .select("id")
        .where("id", "=", task_id)
        .forUpdate()
        .executeTakeFirst();

      if (!task) {
        throw new QualityDomainError("TASK_NOT_FOUND", `Task with ID '${task_id}' was not found.`);
      }

      // 2. If employee is specified, verify employee exists
      if (effEmployeeId) {
        const employee = await trx
          .selectFrom("employees")
          .select("id")
          .where("id", "=", effEmployeeId)
          .executeTakeFirst();

        if (!employee) {
          throw new QualityDomainError(
            "EMPLOYEE_NOT_FOUND",
            `Employee with ID '${effEmployeeId}' was not found.`
          );
        }
      }

      // 3. If superseding a previous photo, verify it exists and belongs to the same task
      if (supersedes_photo_id) {
        const existingPhoto = await trx
          .selectFrom("task_photos")
          .selectAll()
          .where("id", "=", supersedes_photo_id)
          .where("task_id", "=", task_id)
          .forUpdate()
          .executeTakeFirst();

        if (!existingPhoto) {
          throw new QualityDomainError(
            "PHOTO_NOT_FOUND",
            `Task photo '${supersedes_photo_id}' to supersede was not found on task '${task_id}'.`
          );
        }
      }

      // 4. Create new photo record
      const newPhotoId = crypto.randomUUID();
      const now = new Date();

      await trx
        .insertInto("task_photos")
        .values({
          id: newPhotoId,
          task_id,
          layer_number,
          box_quantity: String(normalizedBoxQuantity),
          captured_by_employee_id: effEmployeeId,
          captured_at: now,
          storage_key,
          status: status ?? null,
          superseded_by_photo_id: null,
          created_at: now,
          updated_at: now,
          version: sql`1`
        })
        .execute();

      // 5. Update previous photo supersession pointer if applicable
      if (supersedes_photo_id) {
        await trx
          .updateTable("task_photos")
          .set({
            superseded_by_photo_id: newPhotoId,
            updated_at: now,
            version: sql`version + 1`
          })
          .where("id", "=", supersedes_photo_id)
          .execute();
      }

      return {
        id: newPhotoId,
        task_id,
        layer_number,
        box_quantity: normalizedBoxQuantity,
        captured_by_employee_id: effEmployeeId,
        captured_at: now,
        storage_key,
        status: status ?? null,
        superseded_by_photo_id: null,
        created_at: now,
        updated_at: now,
        version: 1n
      };
    });
  }

  /**
   * Retrieves all photos recorded for a task.
   */
  public async getTaskPhotos(taskId: string): Promise<TaskPhotoRecord[]> {
    const rows = await this.database
      .selectFrom("task_photos")
      .selectAll()
      .where("task_id", "=", taskId)
      .orderBy("layer_number", "asc")
      .orderBy("captured_at", "asc")
      .execute();

    return rows.map((r) => ({
      id: r.id,
      task_id: r.task_id,
      layer_number: r.layer_number,
      box_quantity: BigInt(r.box_quantity),
      captured_by_employee_id: r.captured_by_employee_id,
      captured_at: new Date(r.captured_at),
      storage_key: r.storage_key,
      status: r.status,
      superseded_by_photo_id: r.superseded_by_photo_id,
      created_at: new Date(r.created_at),
      updated_at: new Date(r.updated_at),
      version: BigInt(r.version)
    }));
  }

  private mapQualityRecord(row: {
    id: string;
    task_id: string;
    outcome: string;
    quality_score: string | null;
    damage_rate: string | null;
    task_accuracy: string | null;
    final_inventory_status: string | null;
    inspected_at: Date | string;
    inspected_by_user_id: string | null;
    superseded_by_record_id: string | null;
    notes: string | null;
    created_at: Date | string;
    updated_at: Date | string;
    version: bigint | string | number;
  }): QualityRecord {
    return {
      id: row.id,
      task_id: row.task_id,
      outcome: row.outcome,
      quality_score: row.quality_score != null ? Number(row.quality_score) : null,
      damage_rate: row.damage_rate != null ? Number(row.damage_rate) : null,
      task_accuracy: row.task_accuracy != null ? Number(row.task_accuracy) : null,
      final_inventory_status: row.final_inventory_status,
      inspected_at: new Date(row.inspected_at),
      inspected_by_user_id: row.inspected_by_user_id,
      superseded_by_record_id: row.superseded_by_record_id,
      notes: row.notes,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      version: BigInt(row.version)
    };
  }

  private assertInspector(actorUserId: unknown): asserts actorUserId is string {
    if (!actorUserId || typeof actorUserId !== "string" || actorUserId.trim().length === 0) {
      throw new QualityDomainError(
        "UNAUTHORIZED_ACTOR",
        "Inspector identity must be provided from trusted server-side authentication context."
      );
    }
  }
}
