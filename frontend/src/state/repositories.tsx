/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  createApiMutableRepository,
  createApiRepository,
  createUnavailableRepository,
  type ApiMutableRepository,
  type ApiMutableRepositoryConfig,
  type ApiRepository,
  type ApiRepositoryConfig,
} from '../api/repositories';
import { repositories as mockRepositories } from '../mock/repositories';
import type { AuditRecord, ClientRecord, EmployeeRecord, IncentiveRecord, InventoryRecord, KpiRecord, OrderRecord, PayrollRecord, ReportRecord, TaskRecord } from '../types/domain';
import type { KpiResultReadModel } from '../kpi/kpi-result-domain';

export type DataMode = 'mock' | 'api';

export interface ApiRepositoryConfiguration {
  clients: ApiMutableRepositoryConfig<ClientRecord>;
  orders: ApiMutableRepositoryConfig<OrderRecord>;
  inventory: ApiMutableRepositoryConfig<InventoryRecord>;
  employees: ApiMutableRepositoryConfig<EmployeeRecord>;
  tasks: ApiMutableRepositoryConfig<TaskRecord>;
  kpis: ApiRepositoryConfig<KpiRecord>;
  kpiResults?: ApiRepositoryConfig<KpiResultReadModel>;
  incentives: ApiRepositoryConfig<IncentiveRecord>;
  payroll: ApiRepositoryConfig<PayrollRecord>;
  audits: ApiRepositoryConfig<AuditRecord>;
  reports: ApiRepositoryConfig<ReportRecord>;
}

export interface ApiRepositoryCollection {
  clients: ApiMutableRepository<ClientRecord>;
  orders: ApiMutableRepository<OrderRecord>;
  inventory: ApiMutableRepository<InventoryRecord>;
  employees: ApiMutableRepository<EmployeeRecord>;
  tasks: ApiMutableRepository<TaskRecord>;
  kpis: ApiRepository<KpiRecord>;
  kpiResults: ApiRepository<KpiResultReadModel>;
  incentives: ApiRepository<IncentiveRecord>;
  payroll: ApiRepository<PayrollRecord>;
  audits: ApiRepository<AuditRecord>;
  reports: ApiRepository<ReportRecord>;
}

export type MockRepositoryCollection = typeof mockRepositories;

export type RepositorySelection =
  | { mode: 'mock'; repositories: MockRepositoryCollection }
  | { mode: 'api'; repositories: ApiRepositoryCollection };

export function resolveDataMode(value: unknown = import.meta.env.VITE_DATA_MODE): DataMode {
  if (value === undefined || value === '') return 'mock';
  if (value === 'mock' || value === 'api') return value;
  throw new Error(`Invalid VITE_DATA_MODE "${String(value)}". Expected "mock" or "api".`);
}

export function createApiRepositoryCollection(config: ApiRepositoryConfiguration): ApiRepositoryCollection {
  if (!config || typeof config !== 'object') {
    throw new Error('API mode requires a complete API repository configuration.');
  }

  return {
    clients: createApiMutableRepository(config.clients),
    orders: createApiMutableRepository(config.orders),
    inventory: createApiMutableRepository(config.inventory),
    employees: createApiMutableRepository(config.employees),
    tasks: createApiMutableRepository(config.tasks),
    kpis: createApiRepository(config.kpis),
    kpiResults: config.kpiResults ? createApiRepository(config.kpiResults) : createUnavailableRepository<KpiResultReadModel>('KPI result API contract is not available; no mock fallback is used.'),
    incentives: createApiRepository(config.incentives),
    payroll: createApiRepository(config.payroll),
    audits: createApiRepository(config.audits),
    reports: createApiRepository(config.reports),
  };
}

export function createRepositorySelection(mode: DataMode, apiConfig?: ApiRepositoryConfiguration): RepositorySelection {
  if (mode === 'mock') return { mode, repositories: mockRepositories };
  if (!apiConfig) throw new Error('API mode requires an explicit API repository configuration; no mock fallback is available.');
  return { mode, repositories: createApiRepositoryCollection(apiConfig) };
}

const RepositoryContext = createContext<RepositorySelection | null>(null);

export interface RepositoryProviderProps {
  children: ReactNode;
  mode?: DataMode;
  apiConfig?: ApiRepositoryConfiguration;
}

export function RepositoryProvider({ children, mode = resolveDataMode(), apiConfig }: RepositoryProviderProps) {
  const selection = useMemo(() => createRepositorySelection(mode, apiConfig), [apiConfig, mode]);
  return <RepositoryContext.Provider value={selection}>{children}</RepositoryContext.Provider>;
}

export function useRepositories(): RepositorySelection {
  const value = useContext(RepositoryContext);
  if (!value) throw new Error('useRepositories must be used inside RepositoryProvider');
  return value;
}
