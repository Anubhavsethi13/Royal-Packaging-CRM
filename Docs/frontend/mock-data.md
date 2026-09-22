# Mock Data

`frontend/src/mock/data.ts` contains realistic but synthetic Royal Packaging records for clients, orders, inventory, employees, tasks, KPIs, incentives, payroll, reports, and audit events. No credential, token, connection string, or production identifier is stored in this layer.

`frontend/src/mock/repositories.ts` exposes typed repository aliases, `peek`, `list`, `getById`, filtering, pagination, and stale-preview metadata. `frontend/src/mock/preview.ts` is the current UI adapter; pages do not import `data.ts` directly. The later API adapter can preserve the domain record shapes while changing the implementation to asynchronous requests and query caching.

All preview-only values are labelled in the UI. The frontend does not claim real-time freshness, durable writes, scanner access, payroll authority, or immutable audit guarantees.
