# RBAC and Security Model

## Purpose and dependencies

Defines authentication and server-side authorization constraints. Depends on [02](02-system-architecture.md), [03](03-domain-model.md), and [04](04-database-schema.md); constrains [12](12-api-contracts.md) and [14](14-testing-strategy.md).

## CONFIRMED

- Known roles: Super Admin, Main Admin, Admin, Manager. Use permissions rather than scattered role-name checks.
- Authorize on the server through verified session -> authenticated user -> roles -> permissions -> domain/depot scope -> operation.
- Never trust client-supplied user IDs, employee IDs, roles/role IDs, depot IDs, approval actors, incentive approvers, or points.
- Use secure HTTP-only session cookies with `Secure` and `SameSite=Lax`; hash passwords with `bcryptjs`; use `jose` for applicable session/JWT cryptography.
- Enforce server-side login lockout after five failed attempts within fifteen minutes, for fifteen minutes.
- Business-critical security mutations must not leave partial state; warehouse, payroll, and audit records are lifetime retained.

## RECOMMENDATIONS

- Define permissions by domain action and apply authorization inside domain services as well as at request boundaries.
- Audit role/permission and financial approval mutations with actor and request context.
- Test identity spoofing, privilege escalation, cross-depot access, and unauthorized incentive correction.

## TBD / approval decisions

- Permission catalogue/role matrix, depot-scope model, employee/mobile/quality/payroll roles, user provisioning, user-employee mapping.
- Session expiration/rotation/revocation, password policy, MFA/recovery, audit detail and security-alert retention.

## Risks

- Client-selected actor or depot fields can enable payroll/approval fraud or data exposure.
- Role-only checks fail when operational scope and permissions evolve.

## Approval gate before coding

Approve the permission matrix, approval authority/depot scope, account lifecycle, and session policy before endpoints or database access policies are implemented.

## Final client-resolution addendum

Current roles are Super Admin, Main Admin, Admin, and Manager. Their confirmed intent is respectively highest authority, broad administrative authority, operational/administrative authority, and operational-management authority. This does not approve individual capability permissions, delegation, depot scope, or approval authority: those remain **CLIENT DECISION REQUIRED** and must be enforced server-side.

Client-supplied user ID, employee ID, role, depot scope, approval actor, incentive amount, and payroll amount must never establish authority or financial truth.
