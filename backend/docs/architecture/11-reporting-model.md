# Reporting Model

## Purpose and dependencies

Defines reporting scope and safeguards. Depends on [09](09-kpi-data-model.md), [10](10-rbac-security-model.md), and authoritative templates not yet supplied.

## CONFIRMED

- Reports are generated daily. Scope includes Daily, Monthly, Periodic, Location, Leave, Salary, Yearly, and Other Report.
- Named daily reports include performance, present/absent, short performance, in/out, late/early in, early out, overtime, GPS approved/rejected/pending, mis-punch, and half-day.
- Supplied Royal Packaging templates control columns, order, totals, filters, formatting, and Excel/PDF requirements.
- MB51 and MB52 must not be implemented.

## RECOMMENDATIONS

- Use a shared report query layer that creates normalized data for separate Excel and PDF renderers; do not duplicate calculations in individual reports.
- Enforce report authorization and depot/data scope server-side.
- Inspect `EXPLAIN ANALYZE` for real expensive report queries and index proven patterns.

## TBD / approval decisions

- Actual templates, exact field definitions, filter rules, totals, date/time/shift interpretation, rendering library, distribution, export retention, and report execution history.
- Source-of-truth models/integrations for attendance, GPS, leave, salary, mis-punch, half-day, and overtime reports.

## Risks

- Creating layouts/calculations without templates violates the authoritative report requirement.
- Duplicate report logic produces inconsistent KPI, payroll, and export figures.

## Approval gate before coding

Provide and approve each template and data-definition mapping, including excluded MB51/MB52 confirmation, before report implementation.

## Final client-resolution addendum

Daily reporting is confirmed where applicable. Required reporting dimensions remain depot, employee, task type, client, material/product, date, and shift. Templates and report fields remain authoritative and unavailable; no fields may be inferred. MB51 and MB52 remain excluded.
