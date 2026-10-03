import { describe, expect, it, vi } from 'vitest';
import { ContractValidationError } from '../api/contract-validation';
import { loadDashboardOverview, mapDashboardSummary } from './dashboard-api';

// A real GET /dashboard payload (Super Admin, populated local backend), including fields the dashboard must ignore.
const payload = {
  success: true,
  data: {
    tasksByStatus: { CANCELLED: 1, COMPLETED: 3, IN_PROGRESS: 1, PENDING: 2, ASSIGNED: 1 },
    boxesHandled: '255',
    qualitySummary: { totalInspections: 2, passCount: 1, failCount: 1, averageDamageRate: 7 },
    incentiveTotalsByStatus: { APPROVED: '450.00', PENDING: '450.00' },
    inventoryStatusCounts: {},
    employeeCountsByDepartment: { 'Warehouse Operations': 7 },
    slaCompliance: null,
    payrollStatus: null,
  },
};

describe('dashboard API overview', () => {
  it('reads only task counts and completed BOX, in backend status order', () => {
    const overview = mapDashboardSummary(payload);
    expect(overview).toEqual({
      taskCounts: [{ status: 'PENDING', count: 2 }, { status: 'ASSIGNED', count: 1 }, { status: 'IN_PROGRESS', count: 1 }, { status: 'COMPLETED', count: 3 }, { status: 'CANCELLED', count: 1 }],
      totalTasks: 8,
      completedTasks: 3,
      boxesHandled: 255,
    });
    // Incentive, payroll, quality and SLA fields never reach the dashboard model.
    expect(JSON.stringify(overview)).not.toMatch(/450|incentive|payroll|quality|sla/i);
  });

  it('handles an empty scope without inventing counts', () => {
    expect(mapDashboardSummary({ data: { tasksByStatus: {}, boxesHandled: '0' } })).toEqual({ taskCounts: [], totalTasks: 0, completedTasks: 0, boxesHandled: 0 });
  });

  it('rejects a response that does not match the contract', () => {
    expect(() => mapDashboardSummary({ data: { tasksByStatus: { COMPLETED: 'three' }, boxesHandled: '1' } })).toThrow(ContractValidationError);
    expect(() => mapDashboardSummary({ data: {} })).toThrow(ContractValidationError);
  });

  it('requests GET /dashboard', async () => {
    const request = vi.fn().mockResolvedValue(payload);
    await expect(loadDashboardOverview(request)).resolves.toMatchObject({ totalTasks: 8 });
    expect(request).toHaveBeenCalledWith('/dashboard');
  });
});
