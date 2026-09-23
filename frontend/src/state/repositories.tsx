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
import {
  mapClientCreateBody,
  mapClientDtoToRecord,
  mapClientUpdateBody,
} from '../pages/client-data';
import {
  mapOrderCreateBody,
  mapOrderDtoToRecord,
  mapOrderUpdateBody,
} from '../pages/order-data';

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

export function resolveDataMode(
  value: unknown = import.meta.env.VITE_DATA_MODE,
  isProd: boolean = Boolean(import.meta.env.PROD)
): DataMode {
  if (isProd) {
    if (value === 'mock') {
      throw new Error("Production configuration error: VITE_DATA_MODE cannot be set to 'mock' in production.");
    }
    if (value === undefined || value === '') {
      throw new Error("Production configuration error: VITE_DATA_MODE must be explicitly set to 'api' in production.");
    }
    if (value === 'api') return 'api';
    throw new Error(`Invalid VITE_DATA_MODE "${String(value)}". Expected "api" in production.`);
  }

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

export const clientsApiRepositoryConfig: ApiMutableRepositoryConfig<ClientRecord> = {
  resourcePath: '/clients',
  decodeDetail: mapClientDtoToRecord,
  decodeItem: mapClientDtoToRecord,
  mapCreate: mapClientCreateBody,
  mapUpdate: mapClientUpdateBody,
};

export const ordersApiRepositoryConfig: ApiMutableRepositoryConfig<OrderRecord> = {
  resourcePath: '/orders',
  decodeDetail: mapOrderDtoToRecord,
  decodeItem: mapOrderDtoToRecord,
  mapCreate: mapOrderCreateBody,
  mapUpdate: mapOrderUpdateBody,
};

const decodePassthrough = <T,>(payload: unknown) => ((payload as { data?: T })?.data ?? (payload as T));

export function createDefaultApiRepositoryConfiguration(): ApiRepositoryConfiguration {
  return {
    clients: clientsApiRepositoryConfig,
    orders: ordersApiRepositoryConfig,
    inventory: { resourcePath: '/inventory', decodeDetail: decodePassthrough },
    employees: { resourcePath: '/employees', decodeDetail: decodePassthrough },
    tasks: { resourcePath: '/tasks', decodeDetail: decodePassthrough },
    kpis: { resourcePath: '/kpi/definitions', decodeDetail: decodePassthrough },
    incentives: { resourcePath: '/incentives', decodeDetail: decodePassthrough },
    payroll: { resourcePath: '/payroll', decodeDetail: decodePassthrough },
    audits: { resourcePath: '/audits', decodeDetail: decodePassthrough },
    reports: { resourcePath: '/reports', decodeDetail: decodePassthrough },
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
  const effectiveConfig = apiConfig ?? (mode === 'api' ? createDefaultApiRepositoryConfiguration() : undefined);
  const selection = useMemo(() => createRepositorySelection(mode, effectiveConfig), [effectiveConfig, mode]);
  return <RepositoryContext.Provider value={selection}>{children}</RepositoryContext.Provider>;
}

export function useRepositories(): RepositorySelection {
  const value = useContext(RepositoryContext);
  if (!value) throw new Error('useRepositories must be used inside RepositoryProvider');
  return value;
}
