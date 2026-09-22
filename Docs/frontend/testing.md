# Frontend Testing

Vitest covers the permission policy, repository pagination and cloning guarantees, and safe API error shape. The existing backend error tests remain part of the same `npm test` command.

Browser verification covers the major list/detail routes, authentication support routes, dialog interactions, and browser diagnostics against the Vite preview server. React component tests can be added when a DOM testing library is introduced deliberately; this phase does not add a second test framework.

Phase 5 additionally audits narrow viewport document overflow, direct URL navigation, scanner and order workflows, destructive confirmation, form reset after cancel/reopen, and the production bundle warnings. The browser suite records route headings and fails when a route has no heading, page-level horizontal overflow, or console errors.
