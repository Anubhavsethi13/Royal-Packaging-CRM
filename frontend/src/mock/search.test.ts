import { describe, expect, it } from 'vitest';
import { searchPreview } from './search';

describe('global preview search', () => {
  it('groups related entities behind detail paths', () => {
    const results = searchPreview('Kaveri');
    expect(results.some((result) => result.kind === 'Client' && result.path === '/clients/cl-kaveri')).toBe(true);
    expect(results.some((result) => result.kind === 'Order' && result.path === '/orders/ord-10482')).toBe(true);
  });

  it('returns no records for an empty query', () => {
    expect(searchPreview('')).toEqual([]);
  });
});
