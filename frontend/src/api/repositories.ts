import { apiRequest } from './client';
import type { ApiListEnvelope, ApiMutationEnvelope } from './contracts';
import { appendQueryString } from './query-string';
import type { ListQuery, ListResponse, MutableRepository, Repository } from '../mock/repositories';

export type ApiRepository<T extends { id: string }> = Omit<Repository<T>, 'peek'>;
export type ApiMutableRepository<T extends { id: string }> = Omit<MutableRepository<T>, 'peek'>;

export type DetailDecoder<T> = (payload: unknown) => T;
export type MutationBodyMapper<T, TBody = unknown> = (value: T) => TBody;
export type UpdateBodyMapper<T, TBody = unknown> = (value: Partial<Omit<T, 'id'>>) => TBody;

export interface ApiRepositoryConfig<T extends { id: string }> {
  resourcePath: string;
  decodeDetail: DetailDecoder<T>;
}

export function createUnavailableRepository<T extends { id: string }>(message: string): ApiRepository<T> {
  return {
    async list() { throw new Error(message); },
    async getById() { throw new Error(message); },
  };
}

export interface ApiMutableRepositoryConfig<T extends { id: string }, TCreateBody = unknown, TUpdateBody = unknown> extends ApiRepositoryConfig<T> {
  mapCreate?: MutationBodyMapper<T, TCreateBody>;
  mapUpdate?: UpdateBodyMapper<T, TUpdateBody>;
}

export function toListResponse<T>(payload: ApiListEnvelope<T>): ListResponse<T> {
  return {
    items: payload.data,
    page: payload.meta.page,
    pageSize: payload.meta.pageSize,
    total: payload.meta.total,
    stale: false,
  };
}

export async function apiListRequest<T>(resourcePath: string, query?: ListQuery): Promise<ListResponse<T>> {
  const payload = await apiRequest<ApiListEnvelope<T>>(appendQueryString(resourcePath, query));
  return toListResponse(payload);
}

export async function apiDetailRequest<T>(path: string, decode: DetailDecoder<T>): Promise<T> {
  const payload = await apiRequest<unknown>(path);
  return decode(payload);
}

export async function apiMutationRequest<T, TBody>(path: string, method: 'POST' | 'PATCH', body: TBody): Promise<T> {
  const payload = await apiRequest<ApiMutationEnvelope<T>>(path, {
    method,
    body: JSON.stringify(body),
  });
  return payload.data;
}

function resourceDetailPath(resourcePath: string, id: string): string {
  return `${resourcePath.replace(/\/$/, '')}/${encodeURIComponent(id)}`;
}

export function createApiRepository<T extends { id: string }>(config: ApiRepositoryConfig<T>): ApiRepository<T> {
  return {
    async list(query) {
      return apiListRequest<T>(config.resourcePath, query);
    },
    async getById(id) {
      return apiDetailRequest(resourceDetailPath(config.resourcePath, id), config.decodeDetail);
    },
  };
}

export function createApiMutableRepository<T extends { id: string }, TCreateBody = T, TUpdateBody = Partial<Omit<T, 'id'>>>(config: ApiMutableRepositoryConfig<T, TCreateBody, TUpdateBody>): ApiMutableRepository<T> {
  return {
    async list(query) {
      return apiListRequest<T>(config.resourcePath, query);
    },
    async getById(id) {
      return apiDetailRequest(resourceDetailPath(config.resourcePath, id), config.decodeDetail);
    },
    async create(record) {
      const body = config.mapCreate ? config.mapCreate(record) : record as unknown as TCreateBody;
      return apiMutationRequest<T, TCreateBody>(config.resourcePath, 'POST', body);
    },
    async update(id, changes) {
      const body = config.mapUpdate ? config.mapUpdate(changes) : changes as unknown as TUpdateBody;
      return apiMutationRequest<T, TUpdateBody>(resourceDetailPath(config.resourcePath, id), 'PATCH', body);
    },
  };
}
