# List Envelope & Pagination Reconciliation

This document records the contract alignment and reconciliation between frontend repositories and backend collection routes for Step 8: **List Envelope + Pagination Standardization**.

---

## 1. Global Transport & Pagination Contract

### Documented Standard (`Docs/api/pagination.md`)

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 100,
    "totalPages": 4,
    "hasNext": true,
    "hasPrevious": false
  }
}
```

### Empty List Convention
When `total === 0`:
- `totalPages`: 0
- `hasNext`: false
- `hasPrevious`: false
- `data`: `[]`

### Sorting Security & Sanitation
Frontend sort parameters (`sortBy`, `sortDirection`, or snake_case variants) are resolved against an explicit, deterministic column allowlist per resource route. Unmapped keys are ignored (falling back to canonical default ordering, typically `created_at desc`) to prevent dynamic SQL injection.

### Frontend API Client Authentication
All authenticated requests in `frontend/src/api/client.ts` include `credentials: 'include'` to pass HTTP-only session cookies cleanly to the backend.

---

## 2. Resource Reconciliations

### 2.1 Clients

- **Frontend resource**: Client
- **Frontend repository method**: `clientsRepo.list(filter)`
- **Backend route**: `/clients`
- **HTTP method**: `GET`
- **Current query parameters**: `page`, `pageSize` / `page_size`, `status` (`active` | `inactive` | `all`), `search`, `sortBy` / `sort_by` / `sort`, `sortDirection` / `sort_direction` / `dir`
- **Current response shape**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "uuid",
        "name": "string",
        "account_code": "string",
        "accountCode": "string",
        "contact_name": "string | null",
        "contactName": "string | null",
        "contact_email": "string | null",
        "contactEmail": "string | null",
        "contact_phone": "string | null",
        "contactPhone": "string | null",
        "address": "string | null",
        "status": "active | inactive",
        "created_at": "ISO string",
        "createdAt": "ISO string",
        "updated_at": "ISO string",
        "updatedAt": "ISO string",
        "version": "number | string"
      }
    ],
    "meta": {
      "page": 1,
      "pageSize": 25,
      "total": 3,
      "totalPages": 1,
      "hasNext": false,
      "hasPrevious": false
    }
  }
  ```
- **Expected response shape**: Standard list envelope with pagination metadata and camelCase mirrored keys.
- **Pagination support**: Yes (`parsePagination` with `pageItems` and `sendList`).
- **Search support**: Yes (case-insensitive search across client `name`, `account_code`, `contact_name`).
- **Filtering support**: Yes (filters by `status`, safely ignoring `"all"`).
- **Sorting support**: Yes (`CLIENT_SORT_MAP`: `name`, `account_code`/`accountCode`, `created_at`/`createdAt`).
- **Mapper**: `withCamelCaseMirror` providing both snake_case and camelCase field compatibility.
- **Authentication**: Required (`requireAuth` session cookie).
- **RBAC**: Required (`client:read`).
- **Scope**: Multi-tenant / depot scope when applicable.
- **Status**: `IMPLEMENTED`

---

### 2.2 Orders

- **Frontend resource**: Order
- **Frontend repository method**: `ordersRepo.list(filter)`
- **Backend route**: `/orders`
- **HTTP method**: `GET`
- **Current query parameters**: `page`, `pageSize` / `page_size`, `status`, `priority`, `clientId` / `client_id`, `search`, `sortBy` / `sort_by` / `sort`, `sortDirection` / `sort_direction` / `dir`
- **Current response shape**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "uuid",
        "client_id": "uuid",
        "clientId": "uuid",
        "order_code": "string",
        "orderCode": "string",
        "material_name": "string | null",
        "materialName": "string | null",
        "quantity": "string | number | null",
        "unit": "string | null",
        "status": "string",
        "priority": "string",
        "due_at": "ISO string | null",
        "dueAt": "ISO string | null",
        "notes": "string | null",
        "cancelled_at": "ISO string | null",
        "cancelledAt": "ISO string | null",
        "cancellation_reason": "string | null",
        "cancellationReason": "string | null",
        "created_at": "ISO string",
        "createdAt": "ISO string",
        "updated_at": "ISO string",
        "updatedAt": "ISO string",
        "version": "number | string"
      }
    ],
    "meta": {
      "page": 1,
      "pageSize": 25,
      "total": 3,
      "totalPages": 1,
      "hasNext": false,
      "hasPrevious": false
    }
  }
  ```
- **Expected response shape**: Standard list envelope with pagination metadata and camelCase mirrored keys.
- **Pagination support**: Yes (`parsePagination` with `pageItems` and `sendList`).
- **Search support**: Yes (search across `order_code` and `material_name`).
- **Filtering support**: Yes (filters by `status` [ignoring `"all"`], `priority` [ignoring `"all"`], `client_id`).
- **Sorting support**: Yes (`ORDER_SORT_MAP`: `order_code`/`orderCode`, `order_number`/`orderNumber`, `created_at`/`createdAt`, `due_at`/`dueAt`, `priority`, `status`).
- **Mapper**: `withCamelCaseMirror`.
- **Authentication**: Required (`requireAuth` session cookie).
- **RBAC**: Required (`order:read`).
- **Scope**: Client or depot scoped.
- **Status**: `IMPLEMENTED`

---

### 2.3 Employees

- **Frontend resource**: Employee
- **Frontend repository method**: `employeesRepo.list(filter)`
- **Backend route**: `/employees`
- **HTTP method**: `GET`
- **Current query parameters**: `page`, `pageSize` / `page_size`, `department`, `depot_id` / `depotId` / `depot`, `is_active` / `status`, `search`, `sortBy` / `sort_by` / `sort`, `sortDirection` / `sort_direction` / `dir`
- **Current response shape**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "uuid",
        "user_id": "uuid | null",
        "userId": "uuid | null",
        "employee_code": "string",
        "employeeCode": "string",
        "name": "string",
        "full_name": "string",
        "fullName": "string",
        "department": "string | null",
        "depot_id": "uuid | null",
        "depotId": "uuid | null",
        "is_active": true,
        "isActive": true,
        "created_at": "ISO string",
        "createdAt": "ISO string",
        "updated_at": "ISO string",
        "updatedAt": "ISO string",
        "version": "number | string"
      }
    ],
    "meta": {
      "page": 1,
      "pageSize": 25,
      "total": 2,
      "totalPages": 1,
      "hasNext": false,
      "hasPrevious": false
    }
  }
  ```
- **Expected response shape**: Standard list envelope with pagination metadata and camelCase mirrored keys.
- **Pagination support**: Yes (`parsePagination` with `pageItems` and `sendList`).
- **Search support**: Yes (search across employee `name` and `employee_code`).
- **Filtering support**: Yes (filters by `department`, `depot_id`, `is_active`).
- **Sorting support**: Yes (`EMPLOYEE_SORT_MAP`: `name`, `full_name`/`fullName`, `employee_code`/`employeeCode`, `department`, `created_at`/`createdAt`).
- **Mapper**: `withCamelCaseMirror`.
- **Authentication**: Required (`requireAuth` session cookie).
- **RBAC**: Required (`employee:read`).
- **Scope**: Depot or organization-level.
- **Status**: `IMPLEMENTED`

---

### 2.4 Tasks

- **Frontend resource**: Task
- **Frontend repository method**: `tasksRepo.list(filter)`
- **Backend route**: `/tasks`
- **HTTP method**: `GET`
- **Current query parameters**: `page`, `pageSize` / `page_size`, `status`, `employee_id`, `depot_id`, `task_type`, `client_id`, `order_id`, `search`, `sortBy` / `sort_by` / `sort`, `sortDirection` / `sort_direction` / `dir`
- **Current response shape**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "uuid",
        "task_type": "PICK | PACK | MOVE | REPACK",
        "taskType": "PICK | PACK | MOVE | REPACK",
        "status": "PENDING | ASSIGNED | IN_PROGRESS | PAUSED | COMPLETED | CANCELLED",
        "depot_id": "uuid",
        "depotId": "uuid",
        "order_id": "uuid | null",
        "orderId": "uuid | null",
        "planned_box_quantity": "string | number | null",
        "plannedBoxQuantity": "string | number | null",
        "completed_box_quantity": "string | number | null",
        "completedBoxQuantity": "string | number | null",
        "created_at": "ISO string",
        "createdAt": "ISO string",
        "updated_at": "ISO string",
        "updatedAt": "ISO string",
        "version": "number | string"
      }
    ],
    "meta": {
      "page": 1,
      "pageSize": 25,
      "total": 2,
      "totalPages": 1,
      "hasNext": false,
      "hasPrevious": false
    }
  }
  ```
- **Expected response shape**: Standard list envelope with pagination metadata and camelCase mirrored keys.
- **Pagination support**: Yes (`parsePagination` with `pageItems` and `sendList`).
- **Search support**: Yes (search across task `id`, `status`, `task_type`).
- **Filtering support**: Yes (filters by `status`, `employee_id`, `depot_id`, `task_type`, `client_id`, `order_id`).
- **Sorting support**: Yes (`TASK_SORT_MAP`: `id`, `task_type`/`taskType`, `status`, `depot_id`/`depotId`, `planned_box_quantity`/`plannedBoxQuantity`, `completed_box_quantity`/`completedBoxQuantity`, `started_at`/`startedAt`, `completed_at`/`completedAt`, `created_at`/`createdAt`).
- **Mapper**: `withCamelCaseMirror`.
- **Authentication**: Required (`requireAuth` session cookie).
- **RBAC**: Required (`task:read`).
- **Scope**: User/employee and depot scoped.
- **Status**: `IMPLEMENTED`

---

### 2.5 Inventory

- **Frontend resource**: Inventory
- **Frontend repository method**: `inventoryRepo.list(filter)`
- **Backend route**: `/inventory`
- **HTTP method**: `GET`
- **Current query parameters**: `page`, `pageSize` / `page_size`, `search`, `sortBy` / `sort_by` / `sort`, `sortDirection` / `sort_direction` / `dir`
- **Current response shape**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "uuid",
        "product_code": "string",
        "productCode": "string",
        "name": "string | null",
        "total_box_quantity": "string | number",
        "totalBoxQuantity": "string | number",
        "created_at": "ISO string",
        "createdAt": "ISO string",
        "updated_at": "ISO string",
        "updatedAt": "ISO string",
        "version": "number | string"
      }
    ],
    "meta": {
      "page": 1,
      "pageSize": 25,
      "total": 3,
      "totalPages": 1,
      "hasNext": false,
      "hasPrevious": false
    }
  }
  ```
- **Expected response shape**: Standard list envelope with aggregate inventory balances and pagination metadata.
- **Pagination support**: Yes (`parsePagination` with `pageItems` and `sendList`).
- **Search support**: Yes (search across `product_code` and `name`).
- **Filtering support**: Search term filter.
- **Sorting support**: Yes (`INVENTORY_SORT_MAP`: `product_code`/`productCode`, `name`, `total_box_quantity`/`totalBoxQuantity`, `created_at`/`createdAt`).
- **Mapper**: `withCamelCaseMirror`.
- **Authentication**: Required (`requireAuth` session cookie).
- **RBAC**: Required (`inventory:read_catalog`).
- **Scope**: Catalog / warehouse wide.
- **Status**: `IMPLEMENTED`

---

### 2.6 Warehouse

- **Frontend resource**: Warehouse Tasks (Worker scoped)
- **Frontend repository method**: `warehouseRepo.listTasks(filter)`
- **Backend route**: `/warehouse/tasks`
- **HTTP method**: `GET`
- **Current query parameters**: `page`, `pageSize` / `page_size`, `status`, `search`, `sortBy` / `sort_by` / `sort`, `sortDirection` / `sort_direction` / `dir`
- **Current response shape**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "uuid",
        "task_type": "PICK | PACK | MOVE | REPACK",
        "taskType": "PICK | PACK | MOVE | REPACK",
        "status": "PENDING | ASSIGNED | IN_PROGRESS | PAUSED | COMPLETED | CANCELLED",
        "depot_id": "uuid",
        "depotId": "uuid",
        "planned_box_quantity": "string | number | null",
        "plannedBoxQuantity": "string | number | null",
        "completed_box_quantity": "string | number | null",
        "completedBoxQuantity": "string | number | null",
        "created_at": "ISO string",
        "createdAt": "ISO string",
        "updated_at": "ISO string",
        "updatedAt": "ISO string",
        "version": "number | string"
      }
    ],
    "meta": {
      "page": 1,
      "pageSize": 25,
      "total": 1,
      "totalPages": 1,
      "hasNext": false,
      "hasPrevious": false
    }
  }
  ```
- **Expected response shape**: Standard list envelope with pagination metadata and camelCase mirrored keys.
- **Pagination support**: Yes (`parsePagination` with `pageItems` and `sendList`).
- **Search support**: Yes (search across task attributes).
- **Filtering support**: Yes (filters by `status`).
- **Sorting support**: Yes (`TASK_SORT_MAP`: safe allowlist keys).
- **Mapper**: `withCamelCaseMirror`.
- **Authentication**: Required (`requireAuth` session cookie).
- **RBAC**: Required (`warehouse:read_tasks`).
- **Scope**: Scoped to the authenticated user's linked employee (`employees.user_id = user.id`). If no employee record is linked to the user account, an empty envelope with `total: 0, totalPages: 0` is safely returned.
- **Status**: `IMPLEMENTED`
