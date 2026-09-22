# State Management

TanStack Query remains the intended server/domain state layer. The current preview adapter returns repository snapshots so the UI remains deterministic while the API is deferred. Future query hooks should own caching, stale time, retries, and invalidation rather than copying domain records into a global store. They should map the frozen `ApiListEnvelope` and `ApiError` contract into the existing repository-facing result shape.

Local React state owns filters, tabs, dialog visibility, theme, scanner preview input, and form values. The auth provider owns session status, role, permissions, sign out, and expiry. These boundaries keep UI state, form state, authentication state, and server state separate.
