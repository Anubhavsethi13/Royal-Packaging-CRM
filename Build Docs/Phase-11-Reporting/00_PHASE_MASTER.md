# Phase 11 Master — Reporting & Exports

Read prior phases and decision register.

Implement reports for inventory, orders, warehouse activity, productivity, SLA, KPI, incentives, payroll, exceptions and audit.

Support CSV/Excel/PDF through appropriate adapters where required.

Every export must be permission-controlled and audited with actor, filters, scope, timestamp and format.

Design scheduled reports with recipient, filters, frequency, timezone and delivery status, but do not assume an email provider unless confirmed.

Separate reporting/read-model concerns from transactional workflows.

Historical KPI/incentive reporting must respect rule versions and snapshots.

Test report totals against transactional data and enforce scope permissions.
