import { audits, clients, employees, incentives, inventory, kpis, orders, payroll, reports, tasks } from './data';
import { kpiResults } from '../kpi/kpi-result-data';
import { createMockKpiResultRepository } from '../kpi/kpi-result-repository';

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: Record<string, string | undefined>;
}

export interface ListResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  stale: boolean;
}

export interface Repository<T extends { id: string }> {
  peek(): T[];
  list(query?: ListQuery): Promise<ListResponse<T>>;
  getById(id: string): Promise<T | undefined>;
}

export interface MutableRepository<T extends { id: string }> extends Repository<T> {
  create(record: T): Promise<T>;
  update(id: string, changes: Partial<Omit<T, 'id'>>): Promise<T | undefined>;
}

function createRepository<T extends { id: string }>(records: T[]): Repository<T> {
  return {
    peek() { return structuredClone(records); },
    async list(query = {}) {
      const page = Math.max(1, query.page ?? 1);
      const pageSize = Math.max(1, query.pageSize ?? (records.length || 1));
      const search = query.search?.trim().toLowerCase();
      const filtered = search ? records.filter((record) => JSON.stringify(record).toLowerCase().includes(search)) : records;
      const start = (page - 1) * pageSize;
      return { items: structuredClone(filtered.slice(start, start + pageSize)), page, pageSize, total: filtered.length, stale: true };
    },
    async getById(id) {
      const record = records.find((item) => item.id === id);
      return record ? structuredClone(record) : undefined;
    },
  };
}

function createMutableRepository<T extends { id: string }>(records: T[]): MutableRepository<T> {
  const source = structuredClone(records);
  return {
    peek() { return structuredClone(source); },
    async list(query = {}) {
      const page = Math.max(1, query.page ?? 1);
      const pageSize = Math.max(1, query.pageSize ?? (source.length || 1));
      const search = query.search?.trim().toLowerCase();
      const filtered = search ? source.filter((record) => JSON.stringify(record).toLowerCase().includes(search)) : source;
      const start = (page - 1) * pageSize;
      return { items: structuredClone(filtered.slice(start, start + pageSize)), page, pageSize, total: filtered.length, stale: true };
    },
    async getById(id) {
      const record = source.find((item) => item.id === id);
      return record ? structuredClone(record) : undefined;
    },
    async create(record) {
      if (source.some((item) => item.id === record.id)) throw new Error(`Record ${record.id} already exists.`);
      source.push(structuredClone(record));
      return structuredClone(record);
    },
    async update(id, changes) {
      const index = source.findIndex((item) => item.id === id);
      if (index < 0) return undefined;
      source[index] = { ...source[index], ...structuredClone(changes) };
      return structuredClone(source[index]);
    },
  };
}

export const repositories = {
  clients: createMutableRepository(clients),
  orders: createMutableRepository(orders),
  inventory: createMutableRepository(inventory),
  employees: createMutableRepository(employees),
  tasks: createMutableRepository(tasks),
  kpis: createRepository(kpis),
  kpiResults: createMockKpiResultRepository(kpiResults),
  incentives: createRepository(incentives),
  payroll: createRepository(payroll),
  audits: createRepository(audits),
  reports: createRepository(reports),
};

export type CustomerRepository = MutableRepository<(typeof clients)[number]>;
export type OrderRepository = MutableRepository<(typeof orders)[number]>;
export type InventoryRepository = MutableRepository<(typeof inventory)[number]>;
export type WarehouseRepository = Repository<(typeof inventory)[number]>;
export type TaskRepository = MutableRepository<(typeof tasks)[number]>;
export type EmployeeRepository = MutableRepository<(typeof employees)[number]>;
export type KpiRepository = Repository<(typeof kpis)[number]>;
export type KpiResultRepository = Repository<(typeof kpiResults)[number]>;
export type IncentiveRepository = Repository<(typeof incentives)[number]>;
export type PayrollRepository = Repository<(typeof payroll)[number]>;
export type AuditRepository = Repository<(typeof audits)[number]>;
export type ReportRepository = Repository<(typeof reports)[number]>;
