# Phase 1 Routing and Application Shell Prompt

Create the React application shell and routing foundation.

## Routes

Implement:

```text
/
 /warehouse
 /operations
 /employees
 /access-control
 /login
 /register
```

## Application shell

The main application should have:

- sidebar
- top/header area
- page title area
- content container
- responsive mobile navigation
- theme foundation
- global notification/toast foundation
- loading/error boundaries

## Sidebar terminology

Use the source document's navigation:

- Overview
- Clients & Orders
- Warehouse
- Loading & Unloading
- Employees
- Incentives
- Payroll
- Roles & Permissions

Some navigation items represent future phases. They may be visually present but must not pretend to have functionality that has not been implemented.

## Page shells

### Dashboard

Show an appropriate foundation-level operations dashboard shell.

### Warehouse

Show the structural areas that later phases will populate:

- realtime status
- operational flow
- scan panel
- task control
- quality gate
- payroll queue
- floor ledger
- employee incentive history
- payroll period

Do not implement warehouse mutations.

### Operations

Provide structural sections for:

- clients
- orders
- order lifecycle

Do not implement CRM mutations in Phase 1.

### Employees

Provide structural employee management surfaces.

Do not implement account creation or role mutation.

### Access Control

Provide the structural RBAC management UI.

Do not implement authorization mutation.

### Login/Register

Provide clean route shells only.

Authentication is Phase 2.

## Routing quality

Avoid duplicated route configuration.

Use typed route constants where practical.

Ensure unknown routes have a useful not-found experience.
