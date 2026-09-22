import { dashboardSummary } from './data';
import { repositories } from './repositories';

// The UI reads through this adapter, leaving the repository interface as the replacement point for future queries.
export const preview = {
  dashboard: dashboardSummary,
  clients: repositories.clients.peek(),
  orders: repositories.orders.peek(),
  inventory: repositories.inventory.peek(),
  employees: repositories.employees.peek(),
  tasks: repositories.tasks.peek(),
  kpis: repositories.kpis.peek(),
  incentives: repositories.incentives.peek(),
  payroll: repositories.payroll.peek(),
  audits: repositories.audits.peek(),
  reports: repositories.reports.peek(),
};
