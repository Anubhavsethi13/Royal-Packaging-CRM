import { z } from "zod";

export const createEmployeeRequestSchema = z.object({
  employee_code: z.string().trim().min(1, { message: "employee_code is required" }),
  name: z.string().trim().min(1, { message: "name is required" }),
  department: z.string().trim().min(1).optional(),
  depot_id: z.string().uuid({ message: "depot_id must be a valid UUID" }).optional(),
  user_id: z.string().uuid({ message: "user_id must be a valid UUID" }).optional()
});
export type CreateEmployeeRequest = z.infer<typeof createEmployeeRequestSchema>;

export const updateEmployeeRequestSchema = z.object({
  name: z.string().trim().min(1).optional(),
  department: z.string().trim().min(1).nullable().optional(),
  depot_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional()
});
export type UpdateEmployeeRequest = z.infer<typeof updateEmployeeRequestSchema>;

export const listEmployeesFilterSchema = z.object({
  department: z.string().trim().min(1).optional(),
  depot_id: z.string().uuid().optional(),
  is_active: z.coerce.boolean().optional(),
  search: z.string().trim().min(1).optional()
});
export type ListEmployeesFilter = z.infer<typeof listEmployeesFilterSchema>;

export const createShiftAssignmentRequestSchema = z.object({
  shift_id: z.string().uuid({ message: "shift_id must be a valid UUID" }),
  effective_from: z.coerce.date(),
  effective_to: z.coerce.date().nullable().optional()
});
export type CreateShiftAssignmentRequest = z.infer<typeof createShiftAssignmentRequestSchema>;

export interface CurrentShiftSummary {
  readonly shift_id: string;
  readonly shift_name: string;
  readonly effective_from: Date;
  readonly effective_to: Date | null;
}

export interface EmployeeDTO {
  readonly id: string;
  readonly employee_code: string | null;
  readonly name: string | null;
  readonly department: string | null;
  readonly depot_id: string | null;
  readonly user_id: string | null;
  readonly is_active: boolean;
  readonly currentShift: CurrentShiftSummary | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly version: bigint;
}
