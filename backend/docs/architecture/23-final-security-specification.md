# Final Security Specification

## Authentication

| Control | Specification |
|---|---|
| Passwords | Hash with bcryptjs (**CONFIRMED**); password policy **CDR**. |
| Sessions | Database-backed sessions, secure HTTP-only cookies with `Secure` and `SameSite=Lax` (**CONFIRMED**); expiry/rotation/revocation details **CDR**. |
| Cryptography | Use jose where session/JWT cryptographic operations apply (**CONFIRMED**). |
| Login protection | Five failed attempts within fifteen minutes produces a server-enforced fifteen-minute lockout (**CONFIRMED**). |
| Auth flow | Credentials -> login attempt/lockout check -> bcrypt verification -> transactionally create session -> issue cookie. Session validation resolves user/roles/permissions/scope server-side (**TECHNICAL REQUIREMENT** implementing confirmed controls). |

## Authorization and scope

Every protected operation follows verified session -> authenticated user -> roles -> permissions -> domain/depot/employee/approval scope -> service operation (**CONFIRMED**). Permission catalogue, role hierarchy/matrix, depot scope, employee scope, approval authority, user-employee mapping, and sensitive-operation list are **CDR**.

Never trust client-supplied user ID, employee ID, role/role ID, depot ID/scope, approval actor, incentive approver, points, or payout amount (**CONFIRMED**). Such fields, if accepted as a subject reference, require server-side entitlement validation and never establish authority (**TECHNICAL REQUIREMENT**).

## Sensitive operations and audit

Account creation, role/permission changes, task assignment/completion, inventory movements, quality/incentive/payroll corrections, approvals, report exports, and access to cross-depot data require server-side authorization and applicable audit treatment. Exact permissions/audit event matrix is **CDR**. Audit entries preserve actor, action, entity, time, and correlation as technical integrity requirements; warehouse/payroll/audit retention is lifetime (**CONFIRMED**).

Realtime subscriptions and authoritative resync reads must apply the same server-side permission/depot scope (**TECHNICAL REQUIREMENT**). Subscription policy is **CDR**.

