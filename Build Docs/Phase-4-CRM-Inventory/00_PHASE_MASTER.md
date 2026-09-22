# Phase 4 Master — CRM, Orders & Inventory

Read `AGENTS.md`, all prior phase docs, current Prisma schema, APIs and UI.

Extend the existing Phase-1 models safely.

Implement/complete:
- customers/clients
- orders/order lines
- materials/SKUs
- inventory
- handling units
- reservations
- inventory movements
- inventory adjustments
- barcode lookup

Explicitly model quantities for ordered/reserved/fulfilled/remaining.

Create explicit order and inventory state machines. Do not invent unresolved business policy; use configurable assumptions.

Critical inventory operations must be transactional and concurrency-safe:
- reserve
- release
- move
- adjust
- complete task + movement

Prevent negative stock, duplicate movement, double reservation and lost updates.

Handle:
- cancelled/modified/reopened orders
- partial fulfillment
- wrong barcode
- missing/damaged material

Add database constraints, indexes, migrations and integration/concurrency tests.
