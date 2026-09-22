# Pagination, Filtering, and Sorting

The existing repository already uses page-based pagination, so the frozen transport contract keeps that convention simple.

## List Request

```text
GET /resource?page=1&pageSize=25&search=kaveri&sortBy=name&sortDirection=asc&status=Active
```

Supported controls are `page`, `pageSize`, `search`, `sortBy`, `sortDirection`, and resource-specific filters already present in the UI. The backend must clamp or reject invalid values; it must never interpolate arbitrary `sortBy` values into a query.

## List Response

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 0,
    "totalPages": 0,
    "hasNext": false,
    "hasPrevious": false
  }
}
```

The frontend defaults to page 1 and a small bounded page size. `totalPages: 0` is valid for an empty collection. The current mock repository maps its `items`/`total` response into this future envelope; its `stale: true` flag is UI preview metadata and is not part of the authoritative API response.

Filters currently needed by screens are search, status, priority, date range, client, employee, warehouse, and location where applicable. A resource may reject unsupported filters with a safe `400` rather than silently changing meaning.
