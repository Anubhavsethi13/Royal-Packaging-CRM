# Authentication Contract

This is a **BACKEND IMPLEMENTATION REQUIRED** contract. The current provider is mock-only and must not be treated as a security control.

## Operations

| Operation | Request | Success | Failure |
|---|---|---|---|
| Login | `POST /auth/login`, `{ email, password }` | `SessionResponse` with user and `expiresAt` | `401 INVALID_CREDENTIALS` |
| Current session | `GET /auth/session` | `SessionResponse` | `401 UNAUTHENTICATED` |
| Logout | `POST /auth/logout` | `204` or safe acknowledgement | `401` is safe to treat as already signed out |
| Password reset request | `POST /auth/password-reset`, email | `202` without account enumeration | Validation or generic failure |
| Password reset completion | `POST /auth/password-reset/confirm`, reset proof and new password | Safe acknowledgement | Validation, expired proof, or conflict |

The browser should receive a session representation and permissions, not database credentials. The transport mechanism for the session (secure cookie, token exchange, or another approved mechanism) is a backend/security decision and is not prescribed here. Expired sessions redirect to the existing session-expired UX; unauthenticated requests redirect to sign-in; error messages must not reveal whether an account exists.
