import { describe, expect, it } from 'vitest';
import { ApiError, resolveApiBaseUrl } from './client';

describe('API error boundary', () => {
  it('exposes safe status and field errors without a stack trace payload', () => {
    const error = new ApiError(422, { code: 'VALIDATION_FAILED', message: 'Check the submitted fields.', fieldErrors: { email: ['Enter a valid email.'] } });
    expect(error.status).toBe(422);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.fieldErrors.email).toEqual(['Enter a valid email.']);
    expect(error.message).toBe('Check the submitted fields.');
  });
});

describe('Production API URL validation (Part 8)', () => {
  it('allows development fallback to localhost when not in production', () => {
    expect(resolveApiBaseUrl(undefined, false)).toBe('http://localhost:3000/api');
    expect(resolveApiBaseUrl('', false)).toBe('http://localhost:3000/api');
    expect(resolveApiBaseUrl('https://api.dev.com', false)).toBe('https://api.dev.com');
  });

  it('rejects missing or empty API URL in production', () => {
    expect(() => resolveApiBaseUrl(undefined, true)).toThrow('VITE_API_URL must be explicitly configured in production');
    expect(() => resolveApiBaseUrl('', true)).toThrow('VITE_API_URL must be explicitly configured in production');
  });

  it('rejects localhost and 127.0.0.1 URLs in production', () => {
    expect(() => resolveApiBaseUrl('http://localhost:3000/api', true)).toThrow('cannot point to localhost in production');
    expect(() => resolveApiBaseUrl('http://127.0.0.1:4000/api', true)).toThrow('cannot point to localhost in production');
  });

  it('allows valid HTTPS and relative API URLs in production', () => {
    expect(resolveApiBaseUrl('https://api.royalpackaging.com/api', true)).toBe('https://api.royalpackaging.com/api');
    expect(resolveApiBaseUrl('/api', true)).toBe('/api');
  });
});
