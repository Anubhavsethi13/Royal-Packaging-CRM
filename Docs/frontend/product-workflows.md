# Product Workflows

## Client workflow

Users search and filter the client register, open a client detail page, review account facts and related orders, and open the client form from the New client action. The form validates client name, contact, and phone values and reports a local preview success. Persistence, duplicate detection, and server authorization remain deferred.

## Order workflow

Users search and filter orders by status and priority, open an order detail route, inspect fulfillment and customer context, and create a preview order with multiple line items. Dangerous menu actions use a shared confirmation dialog. Order transitions, cancellation effects, reservation behavior, and partial fulfillment rules remain unresolved backend policy.

## Inventory workflow

Users search inventory by SKU, barcode, material, or location and open a detail page with quantity, location, reservation context, movement history, and customer relationship. Movement and reservation controls are preview surfaces only; authoritative inventory state and concurrency are deferred.

## Warehouse workflow

Warehouse pages expose depot occupancy, zone health, locations, blocked/restricted indicators, and a touch-oriented loading/unloading queue. The scanner is a local UI simulation; device integration, offline behavior, and routing policy remain deferred.

## Task workflow

Users search tasks and filter by status and priority, then open task detail for assignment, SLA, measurements, and activity extension points. Assignment and lifecycle actions are preview-only because transition authority and multi-worker behavior are unanswered.

## Employee workflow

Users search the employee directory and open a profile with role, depot, shift, workload, productivity, KPI, incentive, and payroll preview context. Sensitive records are represented only with synthetic values.

## KPI workflow

The KPI dashboard shows target, actual, variance, trend, and period context with detail routes. Formula ownership, target changes, versioning, and historical recalculation are deliberately not decided here.

## Incentive and payroll workflow

Incentive events, rules extension points, payroll periods, approval status, and contribution previews are visible as labelled mock surfaces. No payout formula, payroll calculation, payment execution, or override policy is implemented.

## Reporting workflow

Users search reports by name, category, or owner, preview a catalog item, and access export/schedule extension points. Export and scheduling controls remain local preview actions with no generated artifact or external delivery.

## Audit workflow

Users search audit events and filter by result or entity. Actor, action, entity, timestamp, and before/after values are shown where the fixture supports them. The UI does not claim immutable history; retention and authority belong to the future backend.
