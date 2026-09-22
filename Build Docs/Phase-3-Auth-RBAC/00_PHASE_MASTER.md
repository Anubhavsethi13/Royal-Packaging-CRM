# Phase 3 Master — Authentication & RBAC

Read `AGENTS.md`, Phase 1 foundation, and Phase 2 decision register.

Implement authentication, users, employees, roles, permissions, organizational/depot scope, sessions and protected audit actor identity.

Extend existing models rather than duplicating them.

Server-side authorization is mandatory. Support permission categories for dashboard, customer, order, inventory, warehouse, task, employee, KPI, incentive, payroll, audit, report/export and system administration.

Support scope restrictions where the business model requires them:
- all depots
- assigned depot
- assigned zone
- own tasks
- supervisor team

Protect sensitive mutations and exports.

Add security tests proving unauthorized users cannot mutate or access out-of-scope records.

Document all assumptions and run full verification.
