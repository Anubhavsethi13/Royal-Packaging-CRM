# Authentication, Authorization and Security

## Authentication

Implement:

-   login
-   logout
-   session validation
-   password hashing
-   rate limiting

Use:

-   bcryptjs for password hashing
-   jose for required authentication/cryptographic operations
-   secure HTTP-only session cookies
-   `Secure`
-   `SameSite=Lax`

## Login Rate Limiting

Required rule:

``` text
5 failed attempts within 15 minutes
             ↓
15-minute lockout
```

The lockout behavior must be enforced server-side.

## Server-Side Authorization

Never trust client-supplied:

-   user IDs
-   employee IDs
-   role IDs
-   depot IDs
-   approval actors
-   incentive approvers

Request flow:

``` text
Request
   ↓
Session
   ↓
Authenticated User
   ↓
Roles
   ↓
Permissions
   ↓
Domain Authorization
   ↓
Operation
```

## RBAC Roles

The known roles are:

-   Super Admin
-   Main Admin
-   Admin
-   Manager

Prefer permissions over scattering role-name checks throughout the code.

## Security Tests

Test:

-   Employee attempts Admin endpoint
-   Manager attempts Super Admin endpoint
-   unauthorized incentive correction
-   user submits another user's ID
-   user submits another employee's ID
-   user accesses another depot's data

Every unauthorized operation must be rejected server-side.

## Transactional Security

Employee account creation, task completion, and role/permission
management must have clearly defined transaction boundaries.

A security failure must not leave partial business state.

## Secrets

Do not place production credentials in source code.

Use environment/secret management appropriate to the deployment
platform.
