import type { ListQuery } from '../mock/repositories';

const appendValue = (params: URLSearchParams, key: string, value: string | number | undefined) => {
  if (value !== undefined && value !== '') params.append(key, String(value));
};

/** Build the documented list-query parameters without interpolating values into a URL. */
export function buildQueryString(query: ListQuery = {}): string {
  const params = new URLSearchParams();
  appendValue(params, 'page', query.page);
  appendValue(params, 'pageSize', query.pageSize);
  appendValue(params, 'search', query.search);
  appendValue(params, 'sortBy', query.sortBy);
  appendValue(params, 'sortDirection', query.sortDirection);

  Object.entries(query.filters ?? {})
    .filter(([, value]) => value !== undefined && value !== '')
    .sort(([first], [second]) => first.localeCompare(second))
    .forEach(([key, value]) => appendValue(params, key, value));

  const value = params.toString();
  return value ? `?${value}` : '';
}

export function appendQueryString(path: string, query?: ListQuery): string {
  return `${path}${buildQueryString(query)}`;
}
