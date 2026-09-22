# Royal Packaging CRM — Codex Execution Guide

## Before starting

1. Open the repository in Codex.
2. Ensure Git is initialized and the working tree is clean.
3. Read `AGENTS.md`.
4. Keep `Docs/Architecture Development Questions.docx` available as the requirements source.
5. Do not run later phases until the previous phase verification passes.

## Execution order

### Phase 1
Use the existing files under `Phase-1/`.

Recommended first prompt:

> Read `AGENTS.md` and the complete `Phase-1/` folder. Inspect the repository before changing anything. Execute Phase 1 according to the existing Phase-1 instructions. Preserve the current architecture and do not implement later business domains. Run all verification and create the Git checkpoint defined by Phase 1.

### Phase 2 onward

For each phase:

1. Read `AGENTS.md`.
2. Read the phase's `00_PHASE_MASTER.md`.
3. Inspect current implementation.
4. Implement only the phase scope.
5. Extend existing schema through migrations.
6. Add tests.
7. Run typecheck/lint/test/build.
8. Update documentation and traceability.
9. Create a Git checkpoint.

## Important

Do not paste every prompt into one conversation and ask Codex to build everything at once. Long-running uncontrolled changes make schema conflicts and regressions harder to detect.

Use one phase at a time.

## Business decisions

When Codex encounters an unanswered question:

- document it
- use an explicit assumption only when implementation must proceed
- make the assumption configurable
- do not fabricate a Royal Packaging policy
- do not destroy data later when the decision is confirmed

## Schema evolution rule

Never create a second model for an existing concept without first proving the existing model cannot support the requirement.

Before migration:
- inspect relations
- inspect API consumers
- inspect UI consumers
- inspect seed data
- write migration
- run migration against a disposable database
- test rollback/recovery strategy where appropriate
