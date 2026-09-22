# Frontend Contract Assumptions

These assumptions keep the preview functional. They are explicit, replaceable, and non-authoritative.

1. IDs are opaque strings and remain stable across list/detail navigation.
2. Transport timestamps are ISO 8601 UTC; the UI may display friendly local labels such as “Today · 14:30”.
3. Mock display strings for money and quantities are not authoritative calculations. A backend must choose decimal/minor-unit money representation and explicit unit codes before financial implementation.
4. Quantity, weight, and volume are transported as value-plus-unit pairs; the UI does not infer conversions.
5. A list response is page-based with bounded `pageSize`, total count, and navigation metadata.
6. Search is server-backed after adapter replacement; the current command palette uses a read-only mock search adapter.
7. Form submissions and action menus remain local preview states until an API adapter is selected. No preview success means durable mutation.
8. The backend-managed session is represented by `SessionResponse`; this document does not prescribe browser token storage.
9. Permission codes are UX hints from the session and are re-enforced server-side on every request.
10. `stale` belongs to the mock repository result and future query state, not to a business record.
11. Resource-specific lifecycle status values remain provisional until the open workflow decisions are answered.
