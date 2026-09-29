import type { z } from 'zod';
import { ApiError } from './client';

/** Raised when a response does not match the confirmed contract. Never silently patched. */
export class ContractValidationError extends Error {
  constructor(resource: string, error: z.ZodError) {
    const issue = error.issues[0];
    super(`The ${resource} response did not match the expected contract${issue ? ` (${issue.path.join('.') || 'root'}: ${issue.message})` : ''}.`);
    this.name = 'ContractValidationError';
  }
}

export function parseContract<T>(schema: z.ZodType<T>, payload: unknown, resource: string): T {
  const result = schema.safeParse(payload);
  if (!result.success) throw new ContractValidationError(resource, result.error);
  return result.data;
}

/** Human-readable failure text for API-backed screens (no server internals for 5xx). */
export function describeApiError(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError) {
    if (cause.status === 401) return 'Your session has expired. Sign in again.';
    if (cause.status === 403) return cause.message || 'You do not have permission to view this.';
    if (cause.status >= 500) return 'The server could not complete the request. Try again shortly.';
    return cause.message || fallback;
  }
  if (cause instanceof TypeError) return 'Could not reach the server. Check your connection and try again.';
  return cause instanceof Error ? cause.message : fallback;
}
