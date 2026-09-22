import { describe, expect, it } from 'vitest';
import { ApiError } from './client';

describe('API error boundary', () => {
  it('exposes safe status and field errors without a stack trace payload', () => {
    const error = new ApiError(422, { code: 'VALIDATION_FAILED', message: 'Check the submitted fields.', fieldErrors: { email: ['Enter a valid email.'] } });
    expect(error.status).toBe(422);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.fieldErrors.email).toEqual(['Enter a valid email.']);
    expect(error.message).toBe('Check the submitted fields.');
  });
});
