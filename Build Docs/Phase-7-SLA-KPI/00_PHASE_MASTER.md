# Phase 7 Master — SLA, Calendars & KPI Governance

Read prior phases and decision register.

Implement configurable:
- business calendars
- weekends/holidays
- shifts/time zones
- SLA policies by confirmed dimensions
- productive/waiting/paused/hold time

KPI definitions must be versioned and include:
- code/name
- formula/version
- source events
- aggregation
- unit
- owner
- target
- effective dates
- status

KPI results must reference the definition version and source facts.

Support live/near-real-time and periodic/snapshot calculation modes where appropriate.

Do not silently recalculate historical KPIs after a formula change. Make historical policy explicit/configurable.

Use event timestamps rather than client-side timer values.

Add deterministic calculation tests, including cross-shift, holiday, pause/hold and formula-version cases.
