export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface OrderItemRecord {
  id: string;
  sku: string;
  materialName: string;
  quantity: string;
  unit: string;
}

export interface ActivityRecord {
  id: string;
  actor: string;
  action: string;
  description: string;
  timestamp: string;
  status?: StatusTone;
}

export const TASK_ACTIVITY_EVENTS = ['TASK_ASSIGNED', 'TASK_ACCEPTED', 'TASK_REJECTED', 'TASK_STARTED', 'TASK_PAUSED', 'TASK_RESUMED', 'TASK_COMPLETED', 'TASK_REOPENED', 'TASK_CANCELLED', 'TASK_REASSIGNED', 'BOXES_UPDATED', 'QUALITY_RECORDED', 'CORRECTION_MADE', 'EVIDENCE_SUBMITTED', 'EVIDENCE_ACCEPTED', 'EVIDENCE_REJECTED', 'VERIFICATION_COMPLETED'] as const;
export type TaskActivityEventType = (typeof TASK_ACTIVITY_EVENTS)[number];
export interface TaskActivityEvent { id: string; eventType: TaskActivityEventType; timestamp: string; actor: string; taskId: string; details: Record<string, string | number | undefined>; }
export interface TaskTimerEvent { id: string; eventType: 'START' | 'PAUSE' | 'RESUME' | 'END'; timestamp: string; reason?: string; }

export interface ClientRecord {
  id: string;
  accountCode: string;
  name: string;
  contactName: string;
  phone: string;
  status: 'Active' | 'On hold' | 'Prospect';
  orderCount: number;
  openOrders: number;
  lastActivity: string;
  segment: string;
}

export interface OrderRecord {
  id: string;
  orderCode: string;
  clientId: string;
  clientName: string;
  materialName: string;
  quantity: string;
  unit: string;
  status: 'Draft' | 'Confirmed' | 'In production' | 'Partially fulfilled' | 'Ready' | 'Dispatched' | 'Completed' | 'Cancelled';
  priority: 'Low' | 'Normal' | 'High' | 'Urgent';
  dueAt: string;
  fulfillment: number;
  sla: 'On track' | 'At risk' | 'Breach risk';
  items?: OrderItemRecord[];
  activity?: ActivityRecord[];
}

export interface InventoryRecord {
  id: string;
  barcode: string;
  sku: string;
  materialName: string;
  quantity: string;
  unit: string;
  legacyWeightKg?: string;
  legacyVolumeM3?: string;
  location: string;
  status: 'Available' | 'Reserved' | 'Staged' | 'Damaged';
  clientName: string;
  lastMovement: string;
  reservation?: string;
  movements?: ActivityRecord[];
}

export interface EmployeeRecord {
  id: string;
  code: string;
  name: string;
  role: 'Supervisor' | 'Loader' | 'Picker' | 'Operator';
  depot: string;
  status: 'Active' | 'On leave' | 'Inactive';
  productivity: string;
  kpi: string;
  shift: string;
  tasks: number;
}

export interface TaskRecord {
  id: string;
  taskCode: string;
  type: 'Loading' | 'Unloading' | 'Putaway' | 'Picking' | 'Wrapping';
  priority: 'Low' | 'Normal' | 'High' | 'Urgent';
  source: string;
  destination: string;
  material: string;
  barcode: string;
  quantity: string;
  legacyWeight?: string;
  legacyVolume?: string;
  timer: string;
  employee: string;
  employeeId?: string;
  status: 'Queued' | 'In progress' | 'Completed' | 'Exception' | 'Cancelled';
  v1Status?: import('./v1').TaskStatusV1;
  supervisor?: string;
  createdAt?: string;
  startedAt?: string;
  pausedAt?: string;
  resumedAt?: string;
  completedAt?: string;
  boxesPlanned?: number;
  boxesCompleted?: number;
  qualityStatus?: 'PASS' | 'FAIL' | 'PENDING';
  acceptedBoxes?: number;
  rejectedBoxes?: number;
  qualityNotes?: string;
  correctionRequired?: boolean;
  correctionReason?: string;
  correctionComment?: string;
  correctedBoxes?: number;
  evidence?: Array<{ id: string; filename: string; type: 'PHOTO' | 'DOCUMENT' | 'OTHER'; status: 'PENDING' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED'; timestamp: string; rejectionReason?: string; acceptedBy?: string; acceptedAt?: string; rejectedBy?: string; rejectedAt?: string }>;
  rejectionReason?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  reopenedBy?: string;
  reopenedAt?: string;
  reopenedReason?: string;
  failureReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  cancelledReason?: string;
  activity?: TaskActivityEvent[];
  timerEvents?: TaskTimerEvent[];
  slaTargetSeconds?: number;
  sla: 'On track' | 'At risk' | 'Breach risk';
}

export const LOADING_UNLOADING_OPERATION_TYPES = ['LOADING', 'UNLOADING'] as const;
export type LoadingUnloadingOperationType = (typeof LOADING_UNLOADING_OPERATION_TYPES)[number];
export type OperationalSlaStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'MET' | 'AT_RISK' | 'BREACHED' | 'NOT_APPLICABLE';

// This is a read-only projection of TaskRecord used by the loading/unloading surfaces.
export interface LoadingUnloadingOperationRecord {
  id: string;
  taskId: string;
  taskCode: string;
  operationType: LoadingUnloadingOperationType;
  orderReference?: string;
  warehouse: string;
  employee: string;
  employeeId?: string;
  supervisor?: string;
  status: import('./v1').TaskStatusV1;
  boxesAssigned: number;
  boxesHandled: number;
  boxesRemaining: number;
  startedAt?: string;
  completedAt?: string;
  activeDurationSeconds: number;
  pausedDurationSeconds: number;
  totalDurationSeconds: number;
  slaTargetSeconds?: number;
  slaStatus: OperationalSlaStatus;
  evidence: NonNullable<TaskRecord['evidence']>;
  activity: NonNullable<TaskRecord['activity']>;
  task: TaskRecord;
}

export const WAREHOUSE_OPERATION_TYPES = ['RECEIVING', 'STORAGE', 'PICKING', 'PACKING', 'DISPATCH'] as const;
export type WarehouseOperationType = (typeof WAREHOUSE_OPERATION_TYPES)[number];

// This is a task read-model, not a second warehouse data store. It keeps every warehouse view aligned with F6 task state.
export interface WarehouseOperationRecord {
  id: string;
  taskId: string;
  taskCode: string;
  operation: WarehouseOperationType;
  employee: string;
  employeeId?: string;
  supervisor?: string;
  warehouse: string;
  status: import('./v1').TaskStatusV1;
  boxesAssigned: number;
  boxesHandled: number;
  boxesRemaining: number;
  startedAt?: string;
  completedAt?: string;
  activeDurationSeconds: number;
  pausedDurationSeconds: number;
  totalDurationSeconds: number;
  slaTargetSeconds?: number;
  evidence: NonNullable<TaskRecord['evidence']>;
  activity: NonNullable<TaskRecord['activity']>;
  sla: TaskRecord['sla'];
  task: TaskRecord;
}

export interface KpiRecord {
  id: string;
  name: string;
  owner: string;
  actual: string;
  target: string;
  variance: string;
  trend: 'Up' | 'Flat' | 'Down';
  period: string;
  tone: StatusTone;
  source?: 'mock' | 'api';
}

export interface IncentiveRecord {
  id: string;
  employee: string;
  task: string;
  event: string;
  points: string;
  amount: string;
  status: 'Preview' | 'Pending review' | 'Approved';
  createdAt: string;
}

export interface PayrollRecord {
  id: string;
  period: string;
  employees: number;
  baseAmount: string;
  incentiveAmount: string;
  status: 'Draft preview' | 'Pending approval' | 'Approved';
  updatedAt: string;
}

export interface AuditRecord {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  timestamp: string;
  result: 'Success' | 'Blocked' | 'Preview';
  before: string;
  after: string;
}

export interface ReportRecord {
  id: string;
  name: string;
  category: string;
  cadence: string;
  lastRun: string;
  owner: string;
  status: 'Ready' | 'Scheduled' | 'Preview';
}
