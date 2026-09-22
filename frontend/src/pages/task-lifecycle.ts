import type { PermissionAction, TaskStatusV1 } from '../types/v1';
import { TASK_WORKFLOW_ACTIONS } from './task-workflow';

export const TASK_ACTIONS_BY_STATE: Record<TaskStatusV1, PermissionAction[]> = Object.fromEntries(Object.entries(TASK_WORKFLOW_ACTIONS).map(([status, actions]) => [status, actions])) as Record<TaskStatusV1, PermissionAction[]>;

export function availableTaskActions(status: TaskStatusV1): PermissionAction[] {
  return [...TASK_ACTIONS_BY_STATE[status]];
}
