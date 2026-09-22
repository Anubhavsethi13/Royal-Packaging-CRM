# Phase 8 Master — Incentives & Payroll

Read prior phases and decision register.

Implement a versioned incentive-rule engine.

The source document asks for the canonical payout formula but does not supply it. Therefore:
- do not invent a production formula
- implement a configurable formula engine/interface
- if a development formula is necessary, label it ASSUMPTION
- persist exact rule version and calculation inputs on every payout

Support quality guardrails, SLA modifiers, quantity/volume/weight rules, caps/floors if confirmed, and authorized supervisor overrides.

Separate:
- operational completion
- incentive calculation
- payroll ledger
- approval
- dispute
- external payment/export

Implement payroll dispute workflow and audit all overrides.

Add deterministic payout tests and duplicate-calculation protection.
