import { describe, expect, it } from 'vitest';
import { apiErrorBodySchema, parseApiList, sessionResponseSchema } from './contracts';
import { z } from 'zod';

describe('frontend API contracts', () => {
  it('accepts a paginated transport envelope and rejects malformed metadata', () => {
    const response = parseApiList({ data: [{ id: 'cl-kaveri' }], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1, hasNext: false, hasPrevious: false } }, z.object({ id: z.string() }));
    expect(response.meta.totalPages).toBe(1);
    expect(() => parseApiList({ data: [], meta: { page: 0 } }, z.object({ id: z.string() }))).toThrow();
  });

  it('validates safe error and session shapes without accepting backend internals', () => {
    expect(apiErrorBodySchema.parse({ code: 'VALIDATION_FAILED', errors: [{ field: 'email', code: 'invalid', message: 'Enter a valid email.' }] }).errors?.[0]?.field).toBe('email');
    expect(sessionResponseSchema.parse({ user: { id: 'usr-001', userName: 'Admin', email: 'admin@example.test', role: 'SUPER_ADMIN', roles: ['SUPER_ADMIN'], permissions: ['view:dashboard'], scopes: ['ORGANIZATION'] }, expiresAt: '2026-09-10T12:00:00Z' }).user.role).toBe('SUPER_ADMIN');
  });
});
