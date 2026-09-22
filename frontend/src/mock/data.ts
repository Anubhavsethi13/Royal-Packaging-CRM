import type { AuditRecord, ClientRecord, EmployeeRecord, IncentiveRecord, InventoryRecord, KpiRecord, OrderRecord, PayrollRecord, ReportRecord, TaskRecord } from '../types/domain';

export const dashboardSummary = {
  dateRange: 'Today · 10 Sep 2026',
  ordersInMotion: '24', ordersDelta: '+8.3% vs last shift',
  inventoryPosition: '42.8k', inventoryDetail: '6 zones · 78% occupied',
  tasksToday: '18 / 31', tasksDetail: '4 need assignment',
  onTimeDispatch: '91.6%', onTimeDetail: '3.4 pts below target',
  incentivePreview: '₹ 950', incentiveDetail: '3 recognition events',
};

export const clients: ClientRecord[] = [
  { id: 'cl-kaveri', accountCode: 'CL-0018', name: 'Kaveri Foods', contactName: 'Priya Menon', phone: '+91 80 4412 2080', status: 'Active', orderCount: 18, openOrders: 4, lastActivity: '12 min ago', segment: 'Food & beverage' },
  { id: 'cl-nexon', accountCode: 'CL-0023', name: 'Nexon Retail', contactName: 'Arun Mehta', phone: '+91 22 6108 7200', status: 'Active', orderCount: 11, openOrders: 2, lastActivity: '44 min ago', segment: 'Retail' },
  { id: 'cl-meridian', accountCode: 'CL-0031', name: 'Meridian Home', contactName: 'Leena Shah', phone: '+91 11 4021 6541', status: 'Active', orderCount: 8, openOrders: 1, lastActivity: '2 hr ago', segment: 'Home goods' },
  { id: 'cl-aster', accountCode: 'CL-0044', name: 'Aster Appliances', contactName: 'Vikram Rao', phone: '+91 44 2980 0312', status: 'On hold', orderCount: 6, openOrders: 0, lastActivity: 'Yesterday', segment: 'Manufacturing' },
  { id: 'cl-zenith', accountCode: 'CL-0052', name: 'Zenith Pharma', contactName: 'Ritika Das', phone: '+91 33 3180 4200', status: 'Active', orderCount: 14, openOrders: 3, lastActivity: 'Yesterday', segment: 'Pharma' },
  { id: 'cl-northstar', accountCode: 'CL-0060', name: 'Northstar Export', contactName: 'Sanjay Iyer', phone: '+91 40 4811 0067', status: 'Prospect', orderCount: 0, openOrders: 0, lastActivity: '3 days ago', segment: 'Export' },
];

export const orders: OrderRecord[] = [
  { id: 'ord-10482', orderCode: 'RP-10482', clientId: 'cl-kaveri', clientName: 'Kaveri Foods', materialName: 'Corrugated board 5-ply', quantity: '124', unit: 'BOX', status: 'Ready', priority: 'High', dueAt: 'Today · 14:30', fulfillment: 100, sla: 'On track', items: [{ id: 'line-10482-1', sku: 'CB-5P-1200', materialName: 'Corrugated board 5-ply', quantity: '124', unit: 'BOX' }], activity: [{ id: 'act-10482-1', actor: 'Admin preview', action: 'Status changed', description: 'Order moved to ready for dispatch.', timestamp: 'Today · 12 min ago', status: 'success' }] },
  { id: 'ord-10477', orderCode: 'RP-10477', clientId: 'cl-nexon', clientName: 'Nexon Retail', materialName: 'Kraft wrap 120 GSM', quantity: '82', unit: 'BOX', status: 'In production', priority: 'Normal', dueAt: 'Today · 17:00', fulfillment: 64, sla: 'On track' },
  { id: 'ord-10469', orderCode: 'RP-10469', clientId: 'cl-meridian', clientName: 'Meridian Home', materialName: 'Edge protector 60 mm', quantity: '21', unit: 'BOX', status: 'Confirmed', priority: 'Normal', dueAt: 'Tomorrow · 09:15', fulfillment: 18, sla: 'On track' },
  { id: 'ord-10461', orderCode: 'RP-10461', clientId: 'cl-zenith', clientName: 'Zenith Pharma', materialName: 'Barrier laminate', quantity: '48', unit: 'BOX', status: 'In production', priority: 'Urgent', dueAt: 'Today · 12:00', fulfillment: 42, sla: 'At risk' },
  { id: 'ord-10454', orderCode: 'RP-10454', clientId: 'cl-kaveri', clientName: 'Kaveri Foods', materialName: 'Die-cut tray blank', quantity: '180', unit: 'BOX', status: 'Dispatched', priority: 'High', dueAt: 'Completed · 08:10', fulfillment: 100, sla: 'On track' },
  { id: 'ord-10440', orderCode: 'RP-10440', clientId: 'cl-aster', clientName: 'Aster Appliances', materialName: 'Pallet corner board', quantity: '36', unit: 'BOX', status: 'Draft', priority: 'Low', dueAt: '18 Sep · 16:00', fulfillment: 0, sla: 'On track' },
];

export const inventory: InventoryRecord[] = [
  { id: 'inv-001', barcode: '890700104821', sku: 'CB-5P-1200', materialName: 'Corrugated board 5-ply', quantity: '124', unit: 'BOX', location: 'D1 · A03 · R02', status: 'Staged', clientName: 'Kaveri Foods', lastMovement: '8 min ago', reservation: 'Reserved for RP-10482', movements: [{ id: 'mov-001', actor: 'Meera Nair', action: 'Staged', description: 'Moved from receiving bay to D1 · A03 · R02.', timestamp: 'Today · 08:42', status: 'info' }] },
  { id: 'inv-002', barcode: '890700104775', sku: 'KW-120-0800', materialName: 'Kraft wrap 120 GSM', quantity: '82', unit: 'BOX', location: 'D1 · A01 · R08', status: 'Reserved', clientName: 'Nexon Retail', lastMovement: '21 min ago' },
  { id: 'inv-003', barcode: '890700104690', sku: 'EP-060-0021', materialName: 'Edge protector 60 mm', quantity: '21', unit: 'BOX', location: 'D1 · A04 · R01', status: 'Available', clientName: 'Meridian Home', lastMovement: '1 hr ago' },
  { id: 'inv-004', barcode: '890700104612', sku: 'BL-040-0092', materialName: 'Barrier laminate', quantity: '48', unit: 'BOX', location: 'D2 · B02 · R04', status: 'Available', clientName: 'Zenith Pharma', lastMovement: '2 hr ago' },
  { id: 'inv-005', barcode: '890700104544', sku: 'CTB-018-0020', materialName: 'Die-cut tray blank', quantity: '180', unit: 'BOX', location: 'D1 · A02 · R11', status: 'Reserved', clientName: 'Kaveri Foods', lastMovement: 'Yesterday' },
  { id: 'inv-006', barcode: '890700104401', sku: 'PCB-045-0036', materialName: 'Pallet corner board', quantity: '36', unit: 'BOX', location: 'D2 · C01 · R03', status: 'Damaged', clientName: 'Aster Appliances', lastMovement: 'Yesterday' },
];

export const employees: EmployeeRecord[] = [
  { id: 'emp-001', code: 'RP-EMP-018', name: 'Ravi Kumar', role: 'Supervisor', depot: 'Bengaluru · D1', status: 'Active', productivity: '96%', kpi: '112%', shift: 'Morning · 06:00–14:00', tasks: 18 },
  { id: 'emp-002', code: 'RP-EMP-024', name: 'Meera Nair', role: 'Picker', depot: 'Bengaluru · D1', status: 'Active', productivity: '91%', kpi: '104%', shift: 'Morning · 06:00–14:00', tasks: 24 },
  { id: 'emp-003', code: 'RP-EMP-031', name: 'Arjun Singh', role: 'Loader', depot: 'Bengaluru · D1', status: 'Active', productivity: '87%', kpi: '98%', shift: 'Morning · 06:00–14:00', tasks: 21 },
  { id: 'emp-004', code: 'RP-EMP-044', name: 'Fatima Khan', role: 'Operator', depot: 'Bengaluru · D2', status: 'On leave', productivity: '89%', kpi: '101%', shift: 'Evening · 14:00–22:00', tasks: 16 },
  { id: 'emp-005', code: 'RP-EMP-051', name: 'Dev Patel', role: 'Loader', depot: 'Bengaluru · D2', status: 'Active', productivity: '82%', kpi: '94%', shift: 'Evening · 14:00–22:00', tasks: 14 },
];

export const tasks: TaskRecord[] = [
  { id: 'task-481', taskCode: 'TSK-481', type: 'Loading', priority: 'Urgent', source: 'D1 · A03 · R02', destination: 'Dock 04', material: 'Corrugated board 5-ply', barcode: '890700104821', quantity: '124 BOX', timer: '00:18:42', employee: 'Arjun Singh', employeeId: 'emp-003', status: 'In progress', v1Status: 'STARTED', supervisor: 'Ravi Kumar', boxesPlanned: 124, boxesCompleted: 74, qualityStatus: 'PENDING', slaTargetSeconds: 2700, sla: 'On track' },
  { id: 'task-479', taskCode: 'TSK-479', type: 'Putaway', priority: 'High', source: 'Receiving bay', destination: 'D2 · B02 · R04', material: 'Barrier laminate', barcode: '890700104612', quantity: '48 BOX', timer: '00:09:18', employee: 'Meera Nair', employeeId: 'emp-002', status: 'In progress', v1Status: 'PAUSED', supervisor: 'Ravi Kumar', boxesPlanned: 48, boxesCompleted: 26, qualityStatus: 'PENDING', sla: 'At risk' },
  { id: 'task-477', taskCode: 'TSK-477', type: 'Picking', priority: 'Normal', source: 'D1 · A01 · R08', destination: 'Pack lane 02', material: 'Kraft wrap 120 GSM', barcode: '890700104775', quantity: '82 BOX', timer: '--', employee: 'Unassigned', status: 'Queued', v1Status: 'ASSIGNED', supervisor: 'Ravi Kumar', boxesPlanned: 82, qualityStatus: 'PENDING', sla: 'On track' },
  { id: 'task-474', taskCode: 'TSK-474', type: 'Unloading', priority: 'Normal', source: 'Dock 02', destination: 'D1 · A04 · R01', material: 'Edge protector 60 mm', barcode: '890700104690', quantity: '21 BOX', timer: 'Complete', employee: 'Dev Patel', employeeId: 'emp-005', status: 'Completed', v1Status: 'VERIFIED', supervisor: 'Ravi Kumar', boxesPlanned: 21, boxesCompleted: 21, acceptedBoxes: 21, qualityStatus: 'PASS', slaTargetSeconds: 1800, sla: 'On track' },
  { id: 'task-478', taskCode: 'TSK-478', type: 'Loading', priority: 'High', source: 'D2 · B01 · R03', destination: 'Dock 01', material: 'Barrier laminate', barcode: '890700104613', quantity: '150 BOX', timer: '00:24:00', employee: 'Meera Nair', employeeId: 'emp-002', status: 'In progress', v1Status: 'PAUSED', supervisor: 'Ravi Kumar', boxesPlanned: 150, boxesCompleted: 80, qualityStatus: 'PENDING', slaTargetSeconds: 2400, sla: 'At risk' },
  { id: 'task-476', taskCode: 'TSK-476', type: 'Loading', priority: 'Normal', source: 'D1 · A04 · R01', destination: 'Dock 03', material: 'Edge protector 60 mm', barcode: '890700104691', quantity: '100 BOX', timer: 'Complete', employee: 'Dev Patel', employeeId: 'emp-005', status: 'Completed', v1Status: 'COMPLETED', supervisor: 'Ravi Kumar', boxesPlanned: 100, boxesCompleted: 100, qualityStatus: 'PASS', startedAt: '2026-09-10T08:00:00.000Z', completedAt: '2026-09-10T08:32:00.000Z', timerEvents: [{ id: 'timer-476-start', eventType: 'START', timestamp: '2026-09-10T08:00:00.000Z' }, { id: 'timer-476-end', eventType: 'END', timestamp: '2026-09-10T08:32:00.000Z' }], slaTargetSeconds: 2400, sla: 'On track' },
  { id: 'task-475', taskCode: 'TSK-475', type: 'Loading', priority: 'Normal', source: 'D1 · A02 · R08', destination: 'Dock 02', material: 'Kraft wrap 120 GSM', barcode: '890700104776', quantity: '55 BOX', timer: '--', employee: 'Fatima Khan', employeeId: 'emp-004', status: 'Queued', v1Status: 'ACCEPTED', supervisor: 'Ravi Kumar', boxesPlanned: 55, boxesCompleted: 0, qualityStatus: 'PENDING', slaTargetSeconds: 2100, sla: 'On track' },
  { id: 'task-473', taskCode: 'TSK-473', type: 'Loading', priority: 'Low', source: 'D2 · C01 · R03', destination: 'Dock 05', material: 'Pallet corner board', barcode: '890700104402', quantity: '80 BOX', timer: 'Complete', employee: 'Ravi Kumar', employeeId: 'emp-001', status: 'Completed', v1Status: 'VERIFIED', supervisor: 'Ananya Rao', boxesPlanned: 80, boxesCompleted: 80, acceptedBoxes: 80, qualityStatus: 'PASS', slaTargetSeconds: 2700, sla: 'On track' },
  { id: 'task-470', taskCode: 'TSK-470', type: 'Unloading', priority: 'High', source: 'Dock 06', destination: 'D2 · B03 · R02', material: 'Die-cut tray blank', barcode: '890700104545', quantity: '120 BOX', timer: '--', employee: 'Unassigned', status: 'Queued', v1Status: 'ASSIGNED', supervisor: 'Ravi Kumar', boxesPlanned: 120, boxesCompleted: 0, qualityStatus: 'PENDING', slaTargetSeconds: 3000, sla: 'On track' },
  { id: 'task-469', taskCode: 'TSK-469', type: 'Unloading', priority: 'Urgent', source: 'Dock 07', destination: 'D1 · A01 · R06', material: 'Corrugated board 5-ply', barcode: '890700104822', quantity: '200 BOX', timer: '00:41:00', employee: 'Arjun Singh', employeeId: 'emp-003', status: 'In progress', v1Status: 'STARTED', supervisor: 'Ravi Kumar', boxesPlanned: 200, boxesCompleted: 90, qualityStatus: 'PENDING', slaTargetSeconds: 1800, sla: 'Breach risk' },
  { id: 'task-472', taskCode: 'TSK-472', type: 'Wrapping', priority: 'High', source: 'Pack lane 01', destination: 'Dispatch hold', material: 'Die-cut tray blank', barcode: '890700104544', quantity: '180 BOX', timer: '--', employee: 'Ravi Kumar', status: 'Exception', v1Status: 'FAILED', supervisor: 'Ananya Rao', boxesPlanned: 180, qualityStatus: 'FAIL', rejectedBoxes: 12, sla: 'Breach risk' },
];

export const kpis: KpiRecord[] = [
  { id: 'kpi-throughput', name: 'Warehouse throughput', owner: 'Operations', actual: '84.2%', target: '80.0%', variance: '+4.2 pts', trend: 'Up', period: 'This shift', tone: 'success', source: 'mock' },
  { id: 'kpi-on-time', name: 'On-time dispatch', owner: 'Logistics', actual: '91.6%', target: '95.0%', variance: '-3.4 pts', trend: 'Down', period: 'Last 30 days', tone: 'warning', source: 'mock' },
  { id: 'kpi-quality', name: 'Quality pass rate', owner: 'Supervisors', actual: '98.2%', target: '97.0%', variance: '+1.2 pts', trend: 'Flat', period: 'This month', tone: 'success', source: 'mock' },
  { id: 'kpi-task-time', name: 'Average task time', owner: 'Warehouse', actual: '18m 42s', target: '20m 00s', variance: '-1m 18s', trend: 'Up', period: 'This shift', tone: 'info', source: 'mock' },
];

export const incentives: IncentiveRecord[] = [
  { id: 'inc-01', employee: 'Meera Nair', task: 'TSK-468', event: 'Quality checkpoint', points: '+18 pts', amount: '₹ 450', status: 'Pending review', createdAt: 'Today · 11:18' },
  { id: 'inc-02', employee: 'Ravi Kumar', task: 'TSK-461', event: 'Spot recognition', points: '+12 pts', amount: '₹ 300', status: 'Approved', createdAt: 'Today · 09:42' },
  { id: 'inc-03', employee: 'Arjun Singh', task: 'TSK-455', event: 'Throughput milestone', points: '+9 pts', amount: '₹ 225', status: 'Preview', createdAt: 'Yesterday · 17:05' },
];

export const payroll: PayrollRecord[] = [
  { id: 'pay-aug', period: '01 Aug – 15 Aug 2026', employees: 28, baseAmount: '₹ 4,82,400', incentiveAmount: '₹ 18,620', status: 'Approved', updatedAt: '18 Aug 2026' },
  { id: 'pay-sep-1', period: '01 Sep – 15 Sep 2026', employees: 31, baseAmount: '₹ 5,14,880', incentiveAmount: '₹ 21,340', status: 'Pending approval', updatedAt: 'Today · 10:05' },
  { id: 'pay-sep-2', period: '16 Sep – 30 Sep 2026', employees: 0, baseAmount: '—', incentiveAmount: '—', status: 'Draft preview', updatedAt: 'Not started' },
];

export const audits: AuditRecord[] = [
  { id: 'aud-01', actor: 'Admin preview', action: 'Viewed record', entity: 'Order', entityId: 'RP-10482', timestamp: 'Today · 11:42', result: 'Preview', before: '—', after: 'Viewed details' },
  { id: 'aud-02', actor: 'Ravi Kumar', action: 'Attempted assignment', entity: 'Task', entityId: 'TSK-481', timestamp: 'Today · 11:31', result: 'Blocked', before: 'Unassigned', after: 'Permission required' },
  { id: 'aud-03', actor: 'Admin preview', action: 'Opened dashboard', entity: 'Dashboard', entityId: 'Overview', timestamp: 'Today · 11:20', result: 'Success', before: '—', after: 'Loaded' },
  { id: 'aud-04', actor: 'Meera Nair', action: 'Completed task', entity: 'Task', entityId: 'TSK-474', timestamp: 'Today · 10:54', result: 'Preview', before: 'In progress', after: 'Completed' },
  { id: 'aud-05', actor: 'System preview', action: 'Marked stale', entity: 'Inventory', entityId: 'INV-006', timestamp: 'Yesterday · 18:02', result: 'Success', before: 'Available', after: 'Damaged' },
];

export const reports: ReportRecord[] = [
  { id: 'rep-01', name: 'Daily operations summary', category: 'Operations', cadence: 'Daily · 18:00', lastRun: 'Yesterday · 18:00', owner: 'Operations', status: 'Ready' },
  { id: 'rep-02', name: 'Inventory position', category: 'Inventory', cadence: 'On demand', lastRun: 'Today · 09:05', owner: 'Warehouse', status: 'Ready' },
  { id: 'rep-03', name: 'Employee performance review', category: 'People', cadence: 'Weekly · Monday', lastRun: '08 Sep 2026', owner: 'HR Operations', status: 'Scheduled' },
  { id: 'rep-04', name: 'Payroll contribution preview', category: 'Payroll', cadence: 'Biweekly', lastRun: '15 Aug 2026', owner: 'Finance', status: 'Preview' },
];
