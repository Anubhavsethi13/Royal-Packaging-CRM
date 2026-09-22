export const V1_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'EMPLOYEE'] as const;
export type Role = (typeof V1_ROLES)[number];
export type UserRole = Role;

export const PERMISSION_ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'ASSIGN', 'ACCEPT', 'APPROVE', 'REJECT', 'EXPORT', 'START', 'PAUSE', 'RESUME', 'COMPLETE', 'REOPEN', 'CANCEL', 'VERIFY'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
export interface Permission { module: string; action: PermissionAction; }

export const DATA_SCOPES = ['OWN', 'TEAM', 'DEPARTMENT', 'LOCATION', 'ORGANIZATION', 'CUSTOM'] as const;
export type DataScope = (typeof DATA_SCOPES)[number];
export interface ScopedPermission extends Permission { scope: DataScope; scopeValue?: string; }

export interface OperationalQuantity { value: number; unit: 'BOX'; }

export const TASK_LIFECYCLE_STATES = ['ASSIGNED', 'ACCEPTED', 'STARTED', 'PAUSED', 'RESUMED', 'COMPLETED', 'VERIFIED'] as const;
export type TaskLifecycleState = (typeof TASK_LIFECYCLE_STATES)[number];
export const TASK_EXCEPTION_STATES = ['REJECTED', 'REASSIGNED', 'CANCELLED', 'REOPENED', 'FAILED'] as const;
export type TaskExceptionState = (typeof TASK_EXCEPTION_STATES)[number];
export type TaskStatusV1 = TaskLifecycleState | TaskExceptionState;

export interface TaskV1 {
  id: string;
  taskCode: string;
  taskType: string;
  assignedTo?: string;
  assignedBy?: string;
  status: TaskStatusV1;
  priority: string;
  plannedStartAt?: string;
  dueAt?: string;
  startedAt?: string;
  completedAt?: string;
  expectedDurationSeconds?: number;
  activeDurationSeconds?: number;
  pauseDurationSeconds?: number;
  boxesPlanned?: OperationalQuantity;
  boxesCompleted?: OperationalQuantity;
  qualityScore?: number;
  damageCount?: number;
  accuracyStatus?: 'PENDING' | 'VALID' | 'INVALID';
  slaStatus?: 'COMPLIANT' | 'NON_COMPLIANT' | 'PENDING';
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED';
}

export interface TaskAssignment { id: string; taskId: string; employeeId: string; assignedBy: string; assignedAt: string; acceptedAt?: string; status: TaskStatusV1; }
export interface TaskTimeLog { id: string; taskId: string; employeeId: string; eventType: 'START' | 'PAUSE' | 'RESUME' | 'COMPLETE'; timestamp: string; reason?: string; }
export interface TaskOutput { id: string; taskId: string; employeeId: string; boxes: OperationalQuantity; qualityScore?: number; damageCount?: number; accuracyStatus?: 'PENDING' | 'VALID' | 'INVALID'; enteredAt: string; status: 'PENDING' | 'VERIFIED' | 'REJECTED'; }
export interface TaskEvidence { id: string; taskId: string; employeeId: string; evidenceType: string; fileReference: string; submittedAt: string; acceptedAt?: string; acceptedBy?: string; rejectionReason?: string; status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; }
export interface TaskVerification { taskId: string; verifiedBy: string; verifiedAt: string; status: 'VERIFIED' | 'REJECTED'; reason?: string; }
export interface TaskCorrection { id: string; taskId: string; actorUserId: string; reason: string; createdAt: string; previousValue: unknown; newValue: unknown; }

export type KpiReviewStatus = 'DRAFT' | 'PENDING_REVIEW' | 'FINALIZED' | 'DISPUTED';
export type KpiVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
export interface KpiMetric { key: 'BOXES_HANDLED' | 'TASKS_COMPLETED' | 'TIME_TAKEN' | 'SLA_COMPLIANCE' | 'QUALITY' | 'ACCURACY' | 'REWORK_ERROR_CONTROL'; label: string; enabled: boolean; weight: number; }
export interface KpiTarget { metricKey: KpiMetric['key']; value: number; threshold?: number; gracePeriodSeconds?: number; }
export interface KpiRule { id: string; name: string; scope: DataScope; departmentId?: string; taskType?: string; metrics: KpiMetric[]; targets: KpiTarget[]; penalties?: Record<string, number>; }
export interface KpiRuleVersion { id: string; ruleId: string; version: number; status: 'DRAFT' | 'ACTIVE' | 'RETIRED'; effectiveFrom: string; createdAt: string; }
export interface KpiSourceRecord { entityType: 'TASK' | 'TASK_OUTPUT' | 'TASK_EVIDENCE' | 'ACTIVITY_EVENT'; entityId: string; verificationStatus: KpiVerificationStatus; }
export interface KpiPeriod { start: string; end: string; kind: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'CUSTOM'; }
export interface KpiResult { id: string; employeeId: string; period: KpiPeriod; ruleVersionId: string; metricScores: Record<string, number>; weightedScore: number; penalties: number; finalScore: number; target?: number; achievementPercentage?: number; performanceGrade?: string; reviewStatus: KpiReviewStatus; verificationStatus: KpiVerificationStatus; calculatedAt: string; reviewedBy?: string; reviewedAt?: string; sources: KpiSourceRecord[]; source: 'mock' | 'api'; }
export interface KpiHistory { employeeId: string; results: KpiResult[]; }
