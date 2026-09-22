import { z } from "zod";

export const qualityOutcomeSchema = z.enum(["PASS", "FAIL", "ADJUST"]).or(z.string().min(1));
export type QualityOutcome = z.infer<typeof qualityOutcomeSchema>;

export const finalInventoryStatusSchema = z.enum(["AVAILABLE", "DAMAGED"]).or(z.string().min(1));
export type FinalInventoryStatus = z.infer<typeof finalInventoryStatusSchema>;

const numericPercentageSchema = z.union([
  z.number().min(0, { message: "Percentage must be between 0 and 100" }).max(100, { message: "Percentage must be between 0 and 100" }),
  z.string().regex(/^\d+(\.\d+)?$/, { message: "Percentage must be a valid non-negative number" }).refine((val) => {
    const num = Number(val);
    return !Number.isNaN(num) && num >= 0 && num <= 100;
  }, { message: "Percentage must be between 0 and 100" })
]);

export const inspectTaskRequestSchema = z.object({
  task_id: z.string().uuid({ message: "task_id must be a valid UUID" }),
  outcome: z.string().min(1, { message: "Outcome is required" }),
  damage_rate: numericPercentageSchema.optional(),
  quality_score: numericPercentageSchema.optional(),
  task_accuracy: numericPercentageSchema.optional(),
  notes: z.string().optional(),
  supersedes_record_id: z.string().uuid({ message: "supersedes_record_id must be a valid UUID" }).optional(),
  correlation_id: z.string().uuid({ message: "correlation_id must be a valid UUID" }).optional()
});

export type InspectTaskRequest = z.infer<typeof inspectTaskRequestSchema>;

export const recordTaskPhotoRequestSchema = z.object({
  task_id: z.string().uuid({ message: "task_id must be a valid UUID" }),
  layer_number: z.number().int({ message: "layer_number must be an integer" }).positive({ message: "layer_number must be greater than 0" }),
  box_quantity: z.union([
    z.bigint().positive({ message: "box_quantity must be greater than 0" }),
    z.number().int({ message: "box_quantity must be an integer" }).positive({ message: "box_quantity must be greater than 0" }),
    z.string().regex(/^[1-9]\d*$/, { message: "box_quantity must be a positive integer" })
  ]),
  storage_key: z.string().min(1, { message: "storage_key is required" }),
  captured_by_employee_id: z.string().uuid({ message: "captured_by_employee_id must be a valid UUID" }).optional(),
  status: z.string().optional(),
  supersedes_photo_id: z.string().uuid({ message: "supersedes_photo_id must be a valid UUID" }).optional(),
  correlation_id: z.string().uuid({ message: "correlation_id must be a valid UUID" }).optional()
});

export type RecordTaskPhotoRequest = z.infer<typeof recordTaskPhotoRequestSchema>;

export interface QualityRecord {
  id: string;
  task_id: string;
  outcome: string;
  quality_score: number | null;
  damage_rate: number | null;
  task_accuracy: number | null;
  final_inventory_status: string | null;
  inspected_at: Date;
  inspected_by_user_id: string | null;
  superseded_by_record_id: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  version: bigint;
}

export interface TaskPhotoRecord {
  id: string;
  task_id: string;
  layer_number: number;
  box_quantity: bigint;
  captured_by_employee_id: string | null;
  captured_at: Date;
  storage_key: string;
  status: string | null;
  superseded_by_photo_id: string | null;
  created_at: Date;
  updated_at: Date;
  version: bigint;
}

export type QualityErrorCode =
  | "TASK_NOT_FOUND"
  | "INVALID_DAMAGE_RATE"
  | "INVALID_QUALITY_SCORE"
  | "INVALID_TASK_ACCURACY"
  | "INVALID_PHOTO_LAYER"
  | "INVALID_BOX_QUANTITY"
  | "INVALID_STORAGE_KEY"
  | "QUALITY_RECORD_NOT_FOUND"
  | "PHOTO_NOT_FOUND"
  | "EMPLOYEE_NOT_FOUND"
  | "UNAUTHORIZED_ACTOR"
  | "VALIDATION_FAILED";

export class QualityDomainError extends Error {
  public readonly code: QualityErrorCode;

  public constructor(code: QualityErrorCode, message: string) {
    super(message);
    this.name = "QualityDomainError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
