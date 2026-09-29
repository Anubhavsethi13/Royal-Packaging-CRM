import { useMemo } from 'react';
import { apiRequest, ApiError } from '../api/client';
import { describeApiError } from '../api/contract-validation';
import { useRepositories } from '../state/repositories';
import type { TaskRecord } from '../types/domain';
import {
  locationListEnvelopeSchema,
  mapLocationDto,
  mapWarehouseOperationToTask,
  parseContract,
  warehouseOperationDetailEnvelopeSchema,
  warehouseOperationListEnvelopeSchema,
  type LocationRecord,
} from './warehouse-api';

export interface WarehouseTaskList {
  tasks: TaskRecord[];
  total: number;
  /** True when more tasks exist than were loaded (the directory stops at MAX_WAREHOUSE_PAGES pages). */
  truncated: boolean;
}

export interface LocationQuery {
  page: number;
  pageSize: number;
  search?: string;
  active?: 'true' | 'false';
}

export interface LocationPage {
  items: LocationRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface WarehouseTaskFilter {
  /** Backend operation types, e.g. ['LOADING', 'UNLOADING']. Applied server-side in API mode. */
  operationTypes?: readonly ('LOADING' | 'UNLOADING' | 'PUTAWAY' | 'PICKING' | 'PACKING' | 'OTHER')[];
}

export interface WarehouseGateway {
  listTasks(filter?: WarehouseTaskFilter): Promise<WarehouseTaskList>;
  getTask(id: string): Promise<TaskRecord | undefined>;
}

type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;

export const WAREHOUSE_PAGE_SIZE = 200;
export const MAX_WAREHOUSE_PAGES = 10;

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value));
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** Backend read model. The page's filters and totals run over the loaded directory, so every page (up to a cap) is loaded. */
export function createApiWarehouseGateway(request: RequestFn = apiRequest): WarehouseGateway {
  return {
    async listTasks(filter = {}) {
      const tasks: TaskRecord[] = [];
      let total = 0;
      const operationType = filter.operationTypes?.length ? filter.operationTypes.join(',') : undefined;
      for (let page = 1; page <= MAX_WAREHOUSE_PAGES; page++) {
        const envelope = parseContract(warehouseOperationListEnvelopeSchema, await request<unknown>(withQuery('/warehouse/operations', { page, pageSize: WAREHOUSE_PAGE_SIZE, operation_type: operationType })), 'warehouse operations');
        tasks.push(...envelope.data.map(mapWarehouseOperationToTask));
        total = envelope.meta.total;
        if (!envelope.meta.hasNext) break;
      }
      return { tasks, total, truncated: tasks.length < total };
    },
    async getTask(id) {
      try {
        const envelope = parseContract(warehouseOperationDetailEnvelopeSchema, await request<unknown>(`/warehouse/operations/${encodeURIComponent(id)}`), 'warehouse operation');
        return mapWarehouseOperationToTask(envelope.data);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return undefined;
        throw error;
      }
    },
  };
}

export async function fetchLocations(query: LocationQuery, request: RequestFn = apiRequest): Promise<LocationPage> {
  const envelope = parseContract(locationListEnvelopeSchema, await request<unknown>(withQuery('/locations', { page: query.page, pageSize: query.pageSize, search: query.search?.trim(), active: query.active })), 'locations');
  return { items: envelope.data.map(mapLocationDto), page: envelope.meta.page, pageSize: envelope.meta.pageSize, total: envelope.meta.total, totalPages: envelope.meta.totalPages };
}

type TaskRepository = { list(query?: { page?: number; pageSize?: number }): Promise<{ items: TaskRecord[]; total: number }>; getById(id: string): Promise<TaskRecord | undefined> };

/** Preview mode keeps using the in-memory task repository (pages classify operations client-side). */
export function createMockWarehouseGateway(tasks: TaskRepository): WarehouseGateway {
  return {
    async listTasks() {
      const result = await tasks.list({ page: 1, pageSize: Number.MAX_SAFE_INTEGER });
      return { tasks: result.items, total: result.total, truncated: false };
    },
    getTask: (id) => tasks.getById(id),
  };
}

export function useWarehouseGateway(): WarehouseGateway {
  const { mode, repositories } = useRepositories();
  return useMemo(() => (mode === 'api' ? createApiWarehouseGateway() : createMockWarehouseGateway(repositories.tasks)), [mode, repositories.tasks]);
}

/** Human-readable failure text for the warehouse and location screens. */
export const describeWarehouseError = describeApiError;
