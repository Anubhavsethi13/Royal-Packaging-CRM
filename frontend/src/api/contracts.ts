import { z } from 'zod';
import type { DataScope, Role } from '../types/v1';
export type { DataScope, KpiResult, KpiRule, KpiRuleVersion, Role, ScopedPermission, TaskAssignment, TaskCorrection, TaskEvidence, TaskOutput, TaskTimeLog, TaskV1, TaskVerification } from '../types/v1';

export type SortDirection = 'asc' | 'desc';

export interface ApiListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: SortDirection;
  filters?: Record<string, string | undefined>;
}

export interface ApiPageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface ApiListEnvelope<T> {
  data: T[];
  meta: ApiPageMeta;
}

export interface ApiValidationIssue {
  field?: string;
  code: string;
  message: string;
}

export interface ApiErrorBody {
  code?: string;
  message?: string;
  errors?: ApiValidationIssue[];
  fieldErrors?: Record<string, string[]>;
  requestId?: string;
}

export const apiValidationIssueSchema = z.object({ field: z.string().optional(), code: z.string(), message: z.string() });
export const apiErrorBodySchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  errors: z.array(apiValidationIssueSchema).optional(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  requestId: z.string().optional(),
});

export const apiPageMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNext: z.boolean(),
  hasPrevious: z.boolean(),
});

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SessionUser {
  id: string;
  userName: string;
  email: string;
  role: Role;
  roles?: Role[];
  permissions: string[];
  scopes?: DataScope[];
}

export interface SessionResponse {
  user: SessionUser;
  expiresAt: string;
}

export type CurrentUser = SessionUser;
export type LoginResponse = SessionResponse;
export interface LogoutResponse { requestId?: string; message?: string; }

export const sessionUserSchema = z.object({
  id: z.string(),
  userName: z.string(),
  email: z.string(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'EMPLOYEE']),
  roles: z.array(z.enum(['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'EMPLOYEE'])).optional(),
  permissions: z.array(z.string()),
  scopes: z.array(z.enum(['OWN', 'TEAM', 'DEPARTMENT', 'LOCATION', 'ORGANIZATION', 'CUSTOM'])).optional(),
});

export const sessionResponseSchema = z.object({ user: sessionUserSchema, expiresAt: z.string() });

export interface ClientCreateRequest {
  accountCode?: string;
  name: string;
  contactName: string;
  phone: string;
  segment?: string;
}

export interface OrderItemInput {
  sku: string;
  materialName: string;
  quantity: string;
  unit: string;
}

export interface OrderCreateRequest {
  clientId: string;
  priority: string;
  dueAt: string;
  items: OrderItemInput[];
}

export interface OrderCancellationRequest {
  reason?: string;
}

export interface ApiMutationEnvelope<T> {
  data: T;
  requestId: string;
}

export function parseApiList<T>(payload: unknown, itemSchema: z.ZodType<T>): ApiListEnvelope<T> {
  return z.object({ data: z.array(itemSchema), meta: apiPageMetaSchema }).parse(payload);
}
