import type { Generated } from "kysely";

type Timestamp = Generated<Date>;
type Version = Generated<string>;

export interface UsersTable {
  id: string;
  login_identifier: string;
  password_hash: string;
  is_active: Generated<boolean>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface SessionsTable {
  id: string;
  user_id: string;
  session_token_hash: string;
  created_at: Timestamp;
  expires_at: Date;
  revoked_at: Date | null;
  last_seen_at: Date | null;
  version: Version;
}

export interface EmployeesTable {
  id: string;
  user_id: string | null;
  is_active: Generated<boolean>;
  employee_code: string;
  name: string | null;
  department: string | null;
  depot_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface DepotsTable {
  id: string;
  code: string;
  name: string;
  active: Generated<boolean>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface LocationsTable {
  id: string;
  depot_id: string;
  parent_location_id: string | null;
  code: string;
  name: string;
  active: Generated<boolean>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface ShiftsTable {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  active: Generated<boolean>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface EmployeeShiftAssignmentsTable {
  id: string;
  employee_id: string;
  shift_id: string;
  effective_from: Date;
  effective_to: Date | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface AccessRolesTable {
  id: string;
  code: string;
  name: string;
  active: Generated<boolean>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface AccessPermissionsTable {
  id: string;
  code: string;
  name: string;
  description: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface AccessRolePermissionsTable {
  role_id: string;
  permission_id: string;
  created_at: Timestamp;
  created_by_user_id: string;
}

export interface UserAccessRolesTable {
  id: string;
  user_id: string;
  role_id: string;
  assigned_at: Timestamp;
  assigned_by_user_id: string;
  revoked_at: Date | null;
  revoked_by_user_id: string | null;
  version: Version;
}

export interface ClientsTable {
  id: string;
  name: string;
  account_code: string;
  contact_name: string | null;
  phone: string | null;
  status: Generated<string>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface OrdersTable {
  id: string;
  client_id: string;
  order_code: string;
  material_name: string | null;
  quantity: string | null;
  unit: string | null;
  status: Generated<string>;
  priority: Generated<string>;
  due_at: Date | null;
  notes: string | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface OrderItemsTable {
  id: string;
  order_id: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface InventoryItemsTable {
  id: string;
  product_code: string;
  name: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface InventoryBatchesTable {
  id: string;
  inventory_item_id: string;
  batch_number: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface InventoryBalancesTable {
  id: string;
  inventory_batch_id: string;
  location_id: string;
  box_quantity: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface InventoryMovementsTable {
  id: string;
  inventory_batch_id: string;
  source_location_id: string | null;
  destination_location_id: string | null;
  box_quantity: string;
  task_id: string | null;
  movement_type: string;
  occurred_at: Timestamp;
  actor_user_id: string | null;
  idempotency_key: string | null;
  correlation_id: string | null;
  created_at: Timestamp;
}

export interface TasksTable {
  id: string;
  depot_id: string | null;
  task_type: string | null;
  status: string;
  client_id: string | null;
  order_id: string | null;
  order_item_id: string | null;
  inventory_item_id: string | null;
  inventory_batch_id: string | null;
  source_location_id: string | null;
  destination_location_id: string | null;
  shift_id: string | null;
  planned_box_quantity: string | null;
  completed_box_quantity: string | null;
  started_at: Date | null;
  paused_at: Date | null;
  completed_at: Date | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface TaskAssignmentsTable {
  id: string;
  task_id: string;
  employee_id: string;
  assigned_at: Timestamp;
  assigned_by_user_id: string;
  unassigned_at: Date | null;
  unassigned_by_user_id: string | null;
  version: Version;
}

export interface TaskEventsTable {
  id: string;
  task_id: string;
  event_type: string;
  event_at: Timestamp;
  actor_user_id: string | null;
  correlation_id: string | null;
  metadata: string | null;
  created_at: Timestamp;
}

export interface TaskPhotosTable {
  id: string;
  task_id: string;
  layer_number: number;
  box_quantity: string;
  captured_by_employee_id: string | null;
  captured_at: Timestamp;
  storage_key: string;
  status: string | null;
  superseded_by_photo_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface QualityRecordsTable {
  id: string;
  task_id: string;
  outcome: string;
  quality_score: string | null;
  damage_rate: string | null;
  task_accuracy: string | null;
  final_inventory_status: string | null;
  inspected_at: Timestamp;
  inspected_by_user_id: string | null;
  superseded_by_record_id: string | null;
  notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface LoginAttemptsTable {
  id: string;
  login_identifier: string;
  attempted_at: Timestamp;
  succeeded: boolean;
  user_id: string | null;
  lockout_until: Date | null;
  correlation_id: string | null;
  created_at: Timestamp;
}

export interface IncentiveRulesTable {
  id: string;
  rule_version: string;
  effective_from: Date;
  effective_to: Date | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface IncentiveEventsTable {
  id: string;
  task_id: string;
  incentive_rule_id: string | null;
  event_type: string;
  event_at: Timestamp;
  actor_user_id: string | null;
  correlation_id: string | null;
  metadata: string | null;
  created_at: Timestamp;
}

export interface IncentiveLedgerTable {
  id: string;
  task_id: string;
  employee_id: string;
  incentive_rule_id: string | null;
  amount: string;
  status: string;
  idempotency_key: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface KpiDefinitionsTable {
  id: string;
  code: string;
  name: string;
  pillar: string | null;
  description: string | null;
  unit: string | null;
  formula_reference: string | null;
  active: Generated<boolean>;
  effective_from: Date | null;
  effective_to: Date | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface KpiTargetsTable {
  id: string;
  kpi_definition_id: string;
  target_value: string;
  warning_threshold: string | null;
  critical_threshold: string | null;
  effective_from: Timestamp;
  effective_to: Date | null;
  depot_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface KpiSnapshotsTable {
  id: string;
  kpi_definition_id: string;
  snapshot_at: Timestamp;
  period_start: Date | null;
  period_end: Date | null;
  value: string;
  target_value: string | null;
  depot_id: string | null;
  employee_id: string | null;
  task_type: string | null;
  client_id: string | null;
  inventory_item_id: string | null;
  shift_id: string | null;
  calculation_version: string | null;
  created_at: Timestamp;
}

export interface MonthlyKotTable {
  id: string;
  effective_month: string;
  kot_value: string;
  status: Generated<string>;
  created_by_user_id: string;
  notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface ManualPenaltiesTable {
  id: string;
  employee_id: string;
  task_id: string | null;
  amount: string;
  reason: string;
  effective_month: string;
  recorded_by_user_id: string;
  status: Generated<string>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface PayrollEntriesTable {
  id: string;
  incentive_ledger_id: string;
  employee_id: string;
  amount: string;
  status: Generated<string>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface PayrollApprovalsTable {
  id: string;
  payroll_entry_id: string;
  actor_user_id: string;
  decision: string;
  notes: string | null;
  decided_at: Timestamp;
  created_at: Timestamp;
}

export interface ReportDefinitionsTable {
  id: string;
  code: string;
  name: string;
  description: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

export interface ReportExecutionsTable {
  id: string;
  report_definition_id: string;
  status: Generated<string>;
  export_format: string;
  filters: Record<string, unknown> | null;
  requested_by_user_id: string;
  requested_at: Timestamp;
  completed_at: Date | null;
  result_reference: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Version;
}

/** Approved database shape including FND-18 canonical incentive engine. */
export interface RoyalPackagingDatabase {
  users: UsersTable;
  sessions: SessionsTable;
  employees: EmployeesTable;
  depots: DepotsTable;
  locations: LocationsTable;
  shifts: ShiftsTable;
  employee_shift_assignments: EmployeeShiftAssignmentsTable;
  access_roles: AccessRolesTable;
  access_permissions: AccessPermissionsTable;
  access_role_permissions: AccessRolePermissionsTable;
  user_access_roles: UserAccessRolesTable;
  clients: ClientsTable;
  orders: OrdersTable;
  order_items: OrderItemsTable;
  inventory_items: InventoryItemsTable;
  inventory_batches: InventoryBatchesTable;
  inventory_balances: InventoryBalancesTable;
  inventory_movements: InventoryMovementsTable;
  tasks: TasksTable;
  task_assignments: TaskAssignmentsTable;
  task_events: TaskEventsTable;
  task_photos: TaskPhotosTable;
  quality_records: QualityRecordsTable;
  login_attempts: LoginAttemptsTable;
  incentive_rules: IncentiveRulesTable;
  incentive_events: IncentiveEventsTable;
  incentive_ledger: IncentiveLedgerTable;
  monthly_kot: MonthlyKotTable;
  manual_penalties: ManualPenaltiesTable;
  kpi_definitions: KpiDefinitionsTable;
  kpi_targets: KpiTargetsTable;
  kpi_snapshots: KpiSnapshotsTable;
  payroll_entries: PayrollEntriesTable;
  payroll_approvals: PayrollApprovalsTable;
  report_definitions: ReportDefinitionsTable;
  report_executions: ReportExecutionsTable;
}


