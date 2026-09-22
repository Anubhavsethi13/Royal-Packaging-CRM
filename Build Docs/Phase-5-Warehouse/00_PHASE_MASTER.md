# Phase 5 Master — Warehouse & Task Lifecycle

Read `AGENTS.md`, prior phases, current schema and existing warehouse UI.

Implement configurable depot/zone/row/aisle/location hierarchy and restrictions.

Implement task lifecycle for loading/unloading/movement:
created → assigned → started → paused/resumed → hold → completed/cancelled/reopened/reassigned as confirmed/configured.

Define permission for every transition.

Track event timestamps needed for later SLA/KPI calculations.

Support explicit employee-task assignment history so the model can handle reassignment and, if confirmed, multiple employees.

Handle:
- stuck task
- worker leaves shift
- task crosses shift
- wrong barcode
- missing inventory
- damaged material

Build rugged-device-friendly UI:
- large controls
- scan-first flow
- task timer based on server event timestamps
- clear source/destination
- quantity capture
- explicit success/error/degraded states

Add state-machine and integration tests.
