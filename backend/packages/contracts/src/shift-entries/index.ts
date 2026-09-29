import { z } from "zod";

export type ShiftEntryErrorCode =
  | "SHIFT_ENTRY_NOT_FOUND"
  | "SHIFT_ENTRY_DUPLICATE"
  | "EMPLOYEE_PROFILE_REQUIRED"
  | "INVALID_WAREHOUSE"
  | "INVALID_TRUCK_TYPE"
  | "VALIDATION_FAILED";

export interface ShiftEntryErrorField {
  readonly field?: string;
  readonly code?: string;
  readonly message: string;
}

export class ShiftEntryDomainError extends Error {
  public readonly code: ShiftEntryErrorCode;
  public readonly fields: readonly ShiftEntryErrorField[] | undefined;

  public constructor(code: ShiftEntryErrorCode, message: string, fields?: readonly ShiftEntryErrorField[]) {
    super(message);
    this.name = "ShiftEntryDomainError";
    this.code = code;
    this.fields = fields;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

/** True when `value` is a real calendar date in strict YYYY-MM-DD form. */
export function isValidCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Normalises "HH:MM" or "HH:MM:SS" to "HH:MM:SS"; null when malformed. */
export function normalizeTime(value: string): string | null {
  const match = TIME_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  return `${match[1]}:${match[2]}:${match[3] ?? "00"}`;
}

const workDateSchema = z
  .string({ message: "work_date is required" })
  .refine(isValidCalendarDate, { message: "work_date must be a valid calendar date in YYYY-MM-DD format" });

const timeSchema = (field: string) =>
  z
    .string({ message: `${field} is required` })
    .refine((value) => normalizeTime(value) !== null, { message: `${field} must be a valid time in HH:MM or HH:MM:SS format` })
    .transform((value) => normalizeTime(value) as string);

/** Largest value the 32-bit integer columns accept; larger values would otherwise fail in the database. */
export const MAX_COUNT = 2_147_483_647;

const nonNegativeInteger = (field: string) =>
  z
    .number({ message: `${field} is required and must be a number` })
    .int({ message: `${field} must be an integer` })
    .min(0, { message: `${field} cannot be negative` })
    .max(MAX_COUNT, { message: `${field} is too large` });

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/**
 * Warehouse references resolve to existing `depots` rows by code.
 * `warehouse_name` is optional; when supplied it must match the stored depot
 * name (the server never creates or renames depots from this payload).
 */
export const shiftEntryWarehouseSchema = z.strictObject({
  warehouse_code: z.string({ message: "warehouse_code is required" }).trim().min(1, { message: "warehouse_code is required" }),
  warehouse_name: z.string().trim().min(1).optional()
});

/**
 * `employee_id` is intentionally not accepted: the strict object rejects it,
 * because the employee is always derived from the authenticated session.
 */
export const createShiftEntryRequestSchema = z
  .strictObject({
    work_date: workDateSchema,
    shift_start: timeSchema("shift_start"),
    shift_end: timeSchema("shift_end"),
    labour_count: nonNegativeInteger("labour_count"),
    unloading_total: nonNegativeInteger("unloading_total"),
    loading_total: nonNegativeInteger("loading_total"),
    warehouses: z
      .array(shiftEntryWarehouseSchema, { message: "warehouses must be an array" })
      .min(1, { message: "At least one warehouse is required" }),
    truck_types: z
      .array(z.string().trim().min(1, { message: "truck type code cannot be empty" }).transform((value) => value.toUpperCase()))
      .default([])
  })
  .superRefine((value, ctx) => {
    // Overnight shifts are not supported in V1: end must be after start.
    // Only compare when both times were individually valid (invalid ones already carry their own issue).
    if (normalizeTime(value.shift_start) !== null && normalizeTime(value.shift_end) !== null && value.shift_end <= value.shift_start) {
      ctx.addIssue({ code: "custom", path: ["shift_end"], message: "shift_end must be later than shift_start" });
    }

    const seenWarehouses = new Set<string>();
    value.warehouses.forEach((warehouse, index) => {
      const key = warehouse.warehouse_code.toUpperCase();
      if (seenWarehouses.has(key)) {
        ctx.addIssue({ code: "custom", path: ["warehouses", index, "warehouse_code"], message: "Duplicate warehouse in request" });
      }
      seenWarehouses.add(key);
    });

    const seenTruckTypes = new Set<string>();
    value.truck_types.forEach((code, index) => {
      if (seenTruckTypes.has(code)) {
        ctx.addIssue({ code: "custom", path: ["truck_types", index], message: "Duplicate truck type in request" });
      }
      seenTruckTypes.add(code);
    });
  });
export type CreateShiftEntryRequest = z.infer<typeof createShiftEntryRequestSchema>;

export const listShiftEntriesFilterSchema = z
  .object({
    from: workDateSchema.optional(),
    to: workDateSchema.optional()
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.to < value.from) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "to must not be earlier than from" });
    }
  });
export type ListShiftEntriesFilter = z.infer<typeof listShiftEntriesFilterSchema>;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface ShiftEntryWarehouseDTO {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface ShiftEntryTruckTypeDTO {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

/** Selectable references for the shift entry form: active depots and truck types. */
export interface ShiftEntryOptionsDTO {
  readonly warehouses: readonly ShiftEntryWarehouseDTO[];
  readonly truck_types: readonly ShiftEntryTruckTypeDTO[];
}

export interface ShiftEntryDTO {
  readonly id: string;
  readonly employee_id: string;
  readonly work_date: string;
  readonly shift_start: string;
  readonly shift_end: string;
  readonly labour_count: number;
  readonly unloading_total: number;
  readonly loading_total: number;
  readonly warehouses: readonly ShiftEntryWarehouseDTO[];
  readonly truck_types: readonly ShiftEntryTruckTypeDTO[];
  readonly created_by_user_id: string;
  readonly updated_by_user_id: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly version: string;
}
