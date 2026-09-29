# KPI Daily Shift Tracking — V1

## 1. Objective

Add a daily employee shift-entry and KPI tracking module to the existing Royal Packaging warehouse CRM.

The module must allow employees to record their daily operational work and allow employees, supervisors, admins and authorized management users to view aggregated KPI information.

This feature must extend the existing CRM. It must not replace or duplicate existing task, warehouse, inventory, authentication, RBAC or KPI systems unless an existing implementation is demonstrably incompatible.

---

# 2. Existing System Preservation

The implementation must first inspect and reuse the existing:

- Authentication
- User model
- Employee model
- Role system
- RBAC
- Warehouse model
- Task model
- KPI model
- KPI configuration
- KPI data source architecture
- API conventions
- Error handling
- Pagination
- Audit/event architecture
- Database conventions
- Frontend component system

Do not create duplicate versions of these systems.

---

# 3. User Roles

Existing roles:

- SUPER_ADMIN
- ADMIN
- SUPERVISOR
- EMPLOYEE

The implementation must use the existing authorization system.

Do not create a second authentication or authorization mechanism.

---

# 4. Daily Shift Entry

Employees must be able to submit a daily work/shift entry.

Required fields:

### Employee

The employee must be derived from the authenticated session whenever possible.

Do not trust a client-provided employee ID when the authenticated user can determine the employee.

### Date

Required.

The date represents the operational work date.

### Shift start

Required time.

### Shift end

Required time.

### Labour count

Required integer.

Must be >= 0.

### Unloading total

Required integer.

Must be >= 0.

Unit:

BOX

### Loading total

Required integer.

Must be >= 0.

Unit:

BOX

### Warehouses

At least one warehouse is required.

Each warehouse entry contains:

- warehouseName
- warehouseCode

Warehouse references should use existing warehouse entities where possible.

Do not create duplicate warehouse records from the frontend.

### Truck types

Store truck types worked during the shift.

Examples:

- 32ft
- Crossing
- Other

The implementation should reuse existing truck/type structures if they already exist.

If no existing model exists, create a minimal normalized representation rather than hardcoding UI-only strings into the database.

---

# 5. Shift Validation

The server must validate all submitted shift data.

Validation requirements:

- employee/session must be valid
- date must be valid
- start time must be valid
- end time must be valid
- labour count cannot be negative
- unloading total cannot be negative
- loading total cannot be negative
- at least one warehouse is required
- warehouse references must be valid
- truck type entries must be valid
- malformed requests must return the existing API error envelope
- duplicate submissions must be handled according to existing project conventions

Time validation:

If the application supports overnight shifts, allow an end time on the following operational day according to the existing business rules.

If overnight shifts are not currently supported, reject end times earlier than start time with a clear validation error.

Do not silently modify submitted times.

---

# 6. Database Model

Create a persistent shift-entry model only if the existing database does not already provide an equivalent structure.

Conceptually:

ShiftEntry

- id
- employeeId
- workDate
- shiftStart
- shiftEnd
- labourCount
- unloadingTotal
- loadingTotal
- createdAt
- updatedAt

Relationships:

ShiftEntry
→ Employee
→ ShiftEntryWarehouse
→ ShiftEntryTruckType

ShiftEntryWarehouse:

- id
- shiftEntryId
- warehouseId or existing warehouse reference
- warehouseName only if required by existing architecture
- warehouseCode only if required by existing architecture

ShiftEntryTruckType:

- id
- shiftEntryId
- truckTypeId or existing truck type reference
- truckTypeName only if no existing normalized entity exists
- count if the business requirement supports truck quantities

Do not duplicate warehouse or employee master data unnecessarily.

---

# 7. API Requirements

Implement API endpoints following the existing project's API conventions.

Minimum capabilities:

## Create shift

POST

/api/.../shift-entries

Purpose:

Create the authenticated employee's daily shift entry.

---

## Get current employee shift entries

GET

/api/.../shift-entries/me

Support existing pagination conventions.

---

## Get shift detail

GET

/api/.../shift-entries/:id

Must enforce authorization.

---

## Update shift

PATCH

/api/.../shift-entries/:id

Only if the existing business rules allow employees to modify their entries.

The server must enforce who may modify entries.

---

## Employee KPI summary

GET

/api/.../kpi/me/summary

Return aggregated KPI information for the authenticated employee.

---

## Management KPI summary

GET

/api/.../kpi/summary

Only authorized roles may access aggregated employee performance.

Support existing filtering conventions.

Potential filters:

- employee
- warehouse
- date range
- truck type

Do not invent unsupported filters unnecessarily.

---

# 8. KPI Calculations

V1 should provide operational metrics rather than arbitrary scoring.

Minimum metrics:

## Total unloading

SUM(unloadingTotal)

## Total loading

SUM(loadingTotal)

## Total boxes handled

loadingTotal + unloadingTotal

## Number of shifts

COUNT(shiftEntries)

## Average boxes per shift

totalBoxes / numberOfShifts

## Average labour count

SUM(labourCount) / numberOfShifts

## Total shift duration

SUM(shiftEnd - shiftStart)

## Average shift duration

totalShiftDuration / numberOfShifts

## Loading productivity

loadingTotal / shiftDuration

## Unloading productivity

unloadingTotal / shiftDuration

## Total warehouse involvement

Number of warehouse associations.

If a metric is not mathematically meaningful because required source data does not exist, do not fabricate it.

---

# 9. Employee Dashboard

Create or extend the existing employee dashboard.

The dashboard should display:

## Today's shift

- Work date
- Shift start
- Shift end
- Labour count
- Loading total
- Unloading total
- Total boxes

## Today's KPI

- Loading
- Unloading
- Total boxes
- Shift duration
- Productivity where calculable

## Historical KPI

Show:

- Daily performance
- Weekly aggregation
- Monthly aggregation where supported

Use the existing CRM visual language.

Do not create an unrelated UI style.

---

# 10. Management Summary

Authorized supervisors/admins/management users should be able to view aggregated employee performance.

Example structure:

Employee

| Employee | Shifts | Loading | Unloading | Total Boxes | Avg/Shift |
| -------- | -----: | ------: | --------: | ----------: | --------: |

Additional detail can show:

- warehouses
- truck types
- date range
- total labour
- total shift hours

The UI should prioritize readability over excessive charts.

---

# 11. Role-Based Access

EMPLOYEE:

- Create own shift entry
- View own entries
- View own KPI data
- Modify own entry only when allowed

SUPERVISOR:

- View authorized employee KPI data
- View shift entries within authorized scope
- Perform supervisor functions defined by existing RBAC

ADMIN:

- View broader KPI summaries according to existing permissions
- Manage operational data according to existing RBAC

SUPER_ADMIN:

- Full authorized access according to existing RBAC

Do not implement permissions by checking role names directly throughout the application.

Use the existing permission/authorization architecture.

---

# 12. API Security

Never trust:

- employeeId
- role
- permission
- organization/scope
- warehouse ownership

when these values can be derived from the authenticated session or server-side authorization.

The backend must remain authoritative.

---

# 13. Error Handling

Handle at minimum:

- missing required fields
- invalid date
- invalid time
- end time before start time when unsupported
- negative loading
- negative unloading
- negative labour count
- missing warehouse
- invalid warehouse
- invalid truck type
- unauthorized employee access
- duplicate submission
- nonexistent shift entry
- invalid update
- malformed JSON/request body

Use the existing API error response format.

---

# 14. Frontend Validation

Implement immediate client-side validation for usability.

However:

Client validation is NOT a security boundary.

The backend must independently validate every field.

---

# 15. KPI Data Architecture

The new Shift Entry system is a KPI source.

Do not replace the existing task-event KPI architecture.

Conceptually:

Task Events

Shift Entries ---> KPI Data Sources ---> KPI Aggregation
/
/
Other operational sources

The KPI layer should be able to distinguish the source of each metric.

---

# 16. Auditability

Creating or modifying shift entries should be auditable if the existing CRM audit/event architecture supports this.

At minimum preserve:

- actor
- timestamp
- affected record
- operation

Do not create a second audit architecture.

---

# 17. Testing

Add unit/API tests for:

### Authentication

- unauthenticated request
- authenticated employee

### Shift creation

- valid shift
- missing date
- invalid date
- negative loading
- negative unloading
- negative labour
- missing warehouse
- invalid warehouse
- invalid truck type
- invalid times

### Authorization

- employee can access own data
- employee cannot access another employee's restricted data
- supervisor authorization
- admin authorization
- super admin authorization

### KPI aggregation

- loading total
- unloading total
- total boxes
- shift count
- average boxes
- labour aggregation
- duration aggregation
- date filtering

### Regression

All existing tests must continue passing.

---

# 18. Documentation

Update the project's API documentation with:

- endpoint
- method
- authentication requirement
- request body
- response body
- validation rules
- error responses
- authorization rules

Document all database migrations.

Update the backend/frontend reconciliation documentation if applicable.

---

# 19. Implementation Rules

Before modifying code:

1. Inspect the existing repository.
2. Inspect the existing database schema.
3. Inspect existing employee/user models.
4. Inspect existing warehouse models.
5. Inspect existing truck type models.
6. Inspect existing KPI models.
7. Inspect existing RBAC.
8. Inspect existing API conventions.
9. Inspect existing frontend dashboard.
10. Identify reusable components/services.

Then produce an implementation plan.

Do not immediately start coding.

---

# 20. Strict Rules

DO NOT:

- rewrite the entire CRM
- replace the existing authentication system
- replace RBAC
- create duplicate employee models
- create duplicate warehouse models
- create duplicate KPI systems
- create a second audit system
- remove existing tests
- weaken validation
- trust frontend authorization
- invent business rules
- introduce weight/volume when BOX is the V1 operational unit
- change unrelated modules
- break existing warehouse/task functionality

Use:

INSPECT
→ PLAN
→ IMPLEMENT
→ TEST
→ FIX
→ VERIFY
→ DOCUMENT

---

# 21. Completion Criteria

The feature is complete only when:

- database migration succeeds
- backend typecheck passes
- backend lint passes
- existing tests pass
- new tests pass
- frontend typecheck passes
- frontend build passes
- shift creation works
- shift retrieval works
- employee dashboard works
- KPI aggregation works
- RBAC works
- validation works
- API documentation is updated
- no duplicate domain models were introduced
- no unrelated functionality was broken

At completion provide:

1. Files changed
2. Database changes
3. API endpoints added
4. Frontend routes/components added
5. KPI formulas
6. RBAC changes
7. Tests added
8. Test results
9. Build result
10. Remaining limitations
11. Manual testing instructions

Do not claim production readiness unless all applicable verification has actually passed.
