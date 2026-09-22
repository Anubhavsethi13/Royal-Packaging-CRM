import { describe, expect, it } from 'vitest';
import { appendQueryString, buildQueryString } from './query-string';

describe('API query-string helpers', () => {
  it('serializes pagination, search, sorting, and filters with URL encoding', () => {
    expect(buildQueryString({ page: 2, pageSize: 25, search: 'Kaveri Foods', sortBy: 'name', sortDirection: 'asc', filters: { status: 'Active', depot: 'D1' } }))
      .toBe('?page=2&pageSize=25&search=Kaveri+Foods&sortBy=name&sortDirection=asc&depot=D1&status=Active');
  });

  it('omits undefined and empty values while preserving the path', () => {
    expect(appendQueryString('/clients', { search: '', filters: { status: undefined } })).toBe('/clients');
  });
});
