import type { KpiResultReadModel } from './kpi-result-domain';

// These are standalone backend-shaped fixtures. They intentionally do not derive values from F7 records.
export const kpiResults: KpiResultReadModel[] = [
  {
    id: 'kpi-result-demo-boxes-emp-002', resultId: 'kpi-result-demo-boxes-emp-002', employeeId: 'emp-002', employee: { id: 'emp-002', name: 'Meera Nair', code: 'RP-EMP-024' },
    kpiId: 'kpi-config-boxes-handled', kpiName: 'Warehouse BOXES handled', ruleVersionId: 'kpi-rule-version-boxes-1', metric: 'BOXES_HANDLED', category: 'PRODUCTIVITY', operation: 'WAREHOUSE', scope: 'TEAM',
    period: { kind: 'WEEKLY', start: '2026-09-07T00:00:00.000Z', end: '2026-09-13T23:59:59.999Z', displayLabel: '07 Sep – 13 Sep 2026' },
    target: { value: 500, unit: 'BOX' }, actual: { value: 462, unit: 'BOX' }, unit: 'BOX', direction: 'HIGHER_IS_BETTER', status: 'AVAILABLE',
    sourceReferences: [{ sourceRecordId: 'warehouse-operation-demo-002', sourceType: 'WAREHOUSE_OPERATION', taskId: 'task-479', operationType: 'WAREHOUSE', employeeId: 'emp-002', timestamp: '2026-09-13T11:18:00.000Z', rawMetricValue: 462, quantity: { value: 462, unit: 'BOX' }, warehouse: 'Receiving bay' }],
    calculatedAt: '2026-09-14T02:00:00.000Z', calculationVersion: 'demo-backend-v1', isMock: true,
  },
  {
    id: 'kpi-result-demo-time-emp-003', resultId: 'kpi-result-demo-time-emp-003', employeeId: 'emp-003', employee: { id: 'emp-003', name: 'Arjun Singh', code: 'RP-EMP-031' },
    kpiId: 'kpi-config-loading-time', kpiName: 'Loading time taken', ruleVersionId: 'kpi-rule-version-loading-time-1', metric: 'TIME_TAKEN', category: 'TIMELINESS', operation: 'LOADING', scope: 'OWN',
    period: { kind: 'CUSTOM', start: '2026-09-12T00:00:00.000Z', end: '2026-09-13T23:59:59.999Z', displayLabel: '12 Sep – 13 Sep 2026' },
    target: { value: 45, unit: 'DURATION' }, actual: { value: 39, unit: 'DURATION' }, unit: 'DURATION', direction: 'LOWER_IS_BETTER', status: 'AVAILABLE',
    sourceReferences: [{ sourceRecordId: 'loading-operation-demo-003', sourceType: 'LOADING_OPERATION', taskId: 'task-473', operationType: 'LOADING', employeeId: 'emp-003', timestamp: '2026-09-13T10:20:00.000Z', rawMetricValue: 39, durationSeconds: 2340, warehouse: 'Dock 05' }],
    calculatedAt: '2026-09-14T02:00:00.000Z', calculationVersion: 'demo-backend-v1', isMock: true,
  },
  {
    id: 'kpi-result-demo-sla-emp-001', resultId: 'kpi-result-demo-sla-emp-001', employeeId: 'emp-001', employee: { id: 'emp-001', name: 'Ravi Kumar', code: 'RP-EMP-018' },
    kpiId: 'kpi-config-loading-sla', kpiName: 'Loading SLA compliance', ruleVersionId: 'kpi-rule-version-loading-sla-1', metric: 'SLA_COMPLIANCE', category: 'TIMELINESS', operation: 'LOADING', scope: 'TEAM',
    period: { kind: 'WEEKLY', start: '2026-09-07T00:00:00.000Z', end: '2026-09-13T23:59:59.999Z', displayLabel: '07 Sep – 13 Sep 2026' },
    target: { value: 90, unit: 'PERCENTAGE' }, actual: { value: 94, unit: 'PERCENTAGE' }, unit: 'PERCENTAGE', direction: 'HIGHER_IS_BETTER', status: 'AVAILABLE',
    sourceReferences: [{ sourceRecordId: 'loading-operation-demo-001', sourceType: 'LOADING_OPERATION', taskId: 'task-473', operationType: 'LOADING', employeeId: 'emp-001', timestamp: '2026-09-13T10:20:00.000Z', rawMetricValue: 94, durationSeconds: 1980, slaStatus: 'MET', warehouse: 'Dock 05' }],
    calculatedAt: '2026-09-14T02:00:00.000Z', calculationVersion: 'demo-backend-v1', isMock: true,
  },
  {
    id: 'kpi-result-demo-boxes-emp-002-previous', resultId: 'kpi-result-demo-boxes-emp-002-previous', employeeId: 'emp-002', employee: { id: 'emp-002', name: 'Meera Nair', code: 'RP-EMP-024' },
    kpiId: 'kpi-config-boxes-handled', kpiName: 'Warehouse BOXES handled', ruleVersionId: 'kpi-rule-version-boxes-1', metric: 'BOXES_HANDLED', category: 'PRODUCTIVITY', operation: 'WAREHOUSE', scope: 'TEAM',
    period: { kind: 'WEEKLY', start: '2026-08-31T00:00:00.000Z', end: '2026-09-06T23:59:59.999Z', displayLabel: '31 Aug – 06 Sep 2026' },
    target: { value: 500, unit: 'BOX' }, actual: { value: 488, unit: 'BOX' }, unit: 'BOX', direction: 'HIGHER_IS_BETTER', status: 'AVAILABLE',
    sourceReferences: [{ sourceRecordId: 'warehouse-operation-demo-002-previous', sourceType: 'WAREHOUSE_OPERATION', taskId: 'task-472', operationType: 'WAREHOUSE', employeeId: 'emp-002', timestamp: '2026-09-06T11:18:00.000Z', rawMetricValue: 488, quantity: { value: 488, unit: 'BOX' }, warehouse: 'Receiving bay' }],
    calculatedAt: '2026-09-07T02:00:00.000Z', calculationVersion: 'demo-backend-v1', isMock: true,
  },
  {
    id: 'kpi-result-demo-boxes-emp-002-older', resultId: 'kpi-result-demo-boxes-emp-002-older', employeeId: 'emp-002', employee: { id: 'emp-002', name: 'Meera Nair', code: 'RP-EMP-024' },
    kpiId: 'kpi-config-boxes-handled', kpiName: 'Warehouse BOXES handled', ruleVersionId: 'kpi-rule-version-boxes-1', metric: 'BOXES_HANDLED', category: 'PRODUCTIVITY', operation: 'WAREHOUSE', scope: 'TEAM',
    period: { kind: 'WEEKLY', start: '2026-08-24T00:00:00.000Z', end: '2026-08-30T23:59:59.999Z', displayLabel: '24 Aug – 30 Aug 2026' },
    target: { value: 500, unit: 'BOX' }, actual: { value: 451, unit: 'BOX' }, unit: 'BOX', direction: 'HIGHER_IS_BETTER', status: 'AVAILABLE',
    sourceReferences: [{ sourceRecordId: 'warehouse-operation-demo-002-older', sourceType: 'WAREHOUSE_OPERATION', taskId: 'task-465', operationType: 'WAREHOUSE', employeeId: 'emp-002', timestamp: '2026-08-30T11:18:00.000Z', rawMetricValue: 451, quantity: { value: 451, unit: 'BOX' }, warehouse: 'Receiving bay' }],
    calculatedAt: '2026-08-31T02:00:00.000Z', calculationVersion: 'demo-backend-v1', isMock: true,
  },
  {
    id: 'kpi-result-demo-time-emp-003-previous', resultId: 'kpi-result-demo-time-emp-003-previous', employeeId: 'emp-003', employee: { id: 'emp-003', name: 'Arjun Singh', code: 'RP-EMP-031' },
    kpiId: 'kpi-config-loading-time', kpiName: 'Loading time taken', ruleVersionId: 'kpi-rule-version-loading-time-1', metric: 'TIME_TAKEN', category: 'TIMELINESS', operation: 'LOADING', scope: 'OWN',
    period: { kind: 'CUSTOM', start: '2026-09-05T00:00:00.000Z', end: '2026-09-06T23:59:59.999Z', displayLabel: '05 Sep – 06 Sep 2026' },
    target: { value: 45, unit: 'DURATION' }, actual: { value: 42, unit: 'DURATION' }, unit: 'DURATION', direction: 'LOWER_IS_BETTER', status: 'AVAILABLE',
    sourceReferences: [{ sourceRecordId: 'loading-operation-demo-003-previous', sourceType: 'LOADING_OPERATION', taskId: 'task-466', operationType: 'LOADING', employeeId: 'emp-003', timestamp: '2026-09-06T10:20:00.000Z', rawMetricValue: 42, durationSeconds: 2520, warehouse: 'Dock 05' }],
    calculatedAt: '2026-09-07T02:00:00.000Z', calculationVersion: 'demo-backend-v1', isMock: true,
  },
  {
    id: 'kpi-result-demo-sla-emp-001-previous', resultId: 'kpi-result-demo-sla-emp-001-previous', employeeId: 'emp-001', employee: { id: 'emp-001', name: 'Ravi Kumar', code: 'RP-EMP-018' },
    kpiId: 'kpi-config-loading-sla', kpiName: 'Loading SLA compliance', ruleVersionId: 'kpi-rule-version-loading-sla-1', metric: 'SLA_COMPLIANCE', category: 'TIMELINESS', operation: 'LOADING', scope: 'TEAM',
    period: { kind: 'WEEKLY', start: '2026-08-31T00:00:00.000Z', end: '2026-09-06T23:59:59.999Z', displayLabel: '31 Aug – 06 Sep 2026' },
    target: { value: 90, unit: 'PERCENTAGE' }, actual: { value: 92, unit: 'PERCENTAGE' }, unit: 'PERCENTAGE', direction: 'HIGHER_IS_BETTER', status: 'AVAILABLE',
    sourceReferences: [{ sourceRecordId: 'loading-operation-demo-001-previous', sourceType: 'LOADING_OPERATION', taskId: 'task-466', operationType: 'LOADING', employeeId: 'emp-001', timestamp: '2026-09-06T10:20:00.000Z', rawMetricValue: 92, durationSeconds: 1980, slaStatus: 'MET', warehouse: 'Dock 05' }],
    calculatedAt: '2026-09-07T02:00:00.000Z', calculationVersion: 'demo-backend-v1', isMock: true,
  },
];
