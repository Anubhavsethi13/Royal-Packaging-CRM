# Frontend QA

Phase 5 QA is a frontend regression gate. It covers the authenticated shell, support/auth routes, list/detail routes, dialog workflows, permission-aware actions, global search, scanner preview states, and browser diagnostics.

## Verification Method

- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.
- Smoke every major route by direct URL and verify its heading, navigation context, and absence of browser errors.
- Exercise client creation, multi-line order creation, scanner identification/confirmation, global search, destructive confirmation, auth error states, and mobile navigation.
- Check narrow browser layouts for document-level horizontal overflow. Tables may scroll inside `.table-wrap`; page content must not widen to the table minimum width.

## Supported Viewports

The layout has dedicated behavior at 980px, 720px, 480px, and coarse-pointer breakpoints. Desktop, laptop, tablet, 768px, 480px, and rugged-device-style widths are the intended QA targets. The warehouse, task, inventory, and loading/unloading surfaces prioritize large touch targets and scrollable data tables.

## Known Frontend Limits

The repository still uses preview data and mock authentication. Backend authorization, durable mutations, hardware scanning, realtime, offline sync, and repository failure injection remain deferred. These are documented UX states, not production guarantees.
