# Phase 1 Database Implementation Prompt

Implement the PostgreSQL + Prisma foundation from the Royal Packaging CRM specification.

## Required entities

Implement the documented entities:

### users

- id
- email
- displayName
- avatarUrl
- role
- isActive
- createdAt
- updatedAt

Authentication-level role values:

- admin
- user

### userPasswords

- id
- userId
- passwordHash
- createdAt

### sessions

- id
- userId
- createdAt
- lastAccessed
- expiresAt

### loginAttempts

- id
- email
- attemptedAt
- success

### employees

- id
- employeeCode
- displayName
- role
- shiftName
- hourlyRate
- active
- userId
- createdAt

Employee roles:

- admin
- loader
- operator
- picker
- supervisor

### clients

- id
- accountCode
- name
- contactName
- phone
- materialSpecs
- openOrders
- createdAt

### orders

- id
- orderCode
- clientId
- materialName
- materialSpecs
- quantity
- unit
- weightKg
- volumeM3
- status
- priority
- requestedAt
- dueAt
- notes
- createdAt
- updatedAt

Order statuses:

- draft
- confirmed
- in_production
- ready
- dispatched
- completed
- cancelled

Priorities:

- low
- normal
- high
- urgent

### inventoryItems

- id
- barcode
- clientId
- locationCode
- materialName
- materialType
- quantity
- sku
- status
- unit
- volumeM3
- weightKg
- updatedAt

Inventory statuses:

- available
- damaged
- in_transit
- reserved
- staged

### inventoryMovements

- id
- inventoryItemId
- taskId
- employeeId
- movementType
- fromLocation
- toLocation
- quantity
- weightKg
- volumeM3
- scannedAt

Movement types:

- load
- putaway
- stage
- transfer
- unload

### tasks

- id
- employeeId
- taskType
- inventoryItemId
- clientId
- referenceCode
- status
- fromLocation
- toLocation
- startedAt
- completedAt
- durationMinutes
- weightKg
- volumeM3
- qualityScore
- damageRate
- createdAt

Task statuses:

- queued
- in_progress
- completed

Task types:

- loading
- packing
- putaway
- staging
- unloading
- wrapping

### palletAssets

- id
- assetCode
- assetType
- locationCode
- reusable
- status
- updatedAt

### dockSchedules

- id
- dockCode
- direction
- vehicleNumber
- materialSummary
- scheduledAt
- status
- clientId
- createdAt

### incentiveRules

- id
- name
- ruleType
- threshold
- payout
- active

Rule types:

- quality
- speed
- spot_reward
- volume

### incentiveEvents

- id
- employeeId
- taskId
- ruleId
- points
- cashAmount
- reason
- createdAt

### payrollLedger

- id
- employeeId
- incentiveEventId
- taskId
- amount
- points
- status
- approvedBy
- approvedAt
- periodStart
- periodEnd
- notes
- createdAt

Payroll statuses:

- pending
- approved
- paid

### RBAC

Implement the structural entities:

- accessRoles
- accessPermissions
- accessRolePermissions
- userAccessRoles
- accessAuditLogs

Do not implement authorization behavior in Phase 1.

## Important

Preserve relationships described by the specification.

Do not add speculative tables or business fields just because they are common in CRM software.

Where the source does not define a database constraint, avoid inventing a restrictive rule that could block later implementation.

Generate and verify Prisma migrations.
