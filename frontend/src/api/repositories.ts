import { z } from 'zod';
import { ApiError, apiRequest } from './client';
import { parseContract } from './contract-validation';
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
  decodeItem?: (item: unknown) => T;
  /**
   * Translates the page's list query into the resource's query vocabulary. Returning null means
   * no record of this resource can match (for example a filter value the backend has no state for),
   * so an empty page is returned without a request.
   */
  mapListQuery?: (query: ListQuery | undefined) => ListQuery | undefined | null;
  /**
   * `paged` (default): the documented `{ data, meta }` envelope. `unpaged`: the resource returns its
   * whole list as `{ data: [] }` with no paging parameters or `meta` (payroll, incentive ledger), so
   * the requested page is sliced here and the total is the length of what the server returned.
   */
  listEnvelope?: 'paged' | 'unpaged';
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

export function toListResponse<T>(payload: ApiListEnvelope<unknown>, decodeItem?: (item: unknown) => T): ListResponse<T> {
  const items = decodeItem
    ? (payload.data as unknown[]).map((item) => decodeItem(item))
    : (payload.data as T[]);

  return {
    items,
    page: payload.meta.page,
    pageSize: payload.meta.pageSize,
    total: payload.meta.total,
    stale: false,
  };
}

export async function apiListRequest<T>(resourcePath: string, query?: ListQuery, decodeItem?: (item: unknown) => T): Promise<ListResponse<T>> {
  const payload = await apiRequest<ApiListEnvelope<unknown>>(appendQueryString(resourcePath, query));
  return toListResponse(payload, decodeItem);
}

const unpagedListEnvelopeSchema = z.object({ data: z.array(z.unknown()) });

export async function apiUnpagedListRequest<T>(resourcePath: string, query?: ListQuery, decodeItem?: (item: unknown) => T): Promise<ListResponse<T>> {
  const { data } = parseContract(unpagedListEnvelopeSchema, await apiRequest<unknown>(resourcePath), resourcePath);
  const all = decodeItem ? data.map((item) => decodeItem(item)) : (data as T[]);
  const pageSize = query?.pageSize && query.pageSize > 0 ? query.pageSize : Math.max(all.length, 1);
  const page = Math.min(Math.max(query?.page ?? 1, 1), Math.max(1, Math.ceil(all.length / pageSize)));
  return { items: all.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: all.length, stale: false };
}

function listRequest<T>(config: ApiRepositoryConfig<T & { id: string }>, query?: ListQuery): Promise<ListResponse<T>> {
  return config.listEnvelope === 'unpaged'
    ? apiUnpagedListRequest<T>(config.resourcePath, query, config.decodeItem)
    : apiListRequest<T>(config.resourcePath, query, config.decodeItem);
}

export async function apiDetailRequest<T>(path: string, decode: DetailDecoder<T>): Promise<T> {
  const payload = await apiRequest<unknown>(path);
  return decode(payload);
}

export async function apiMutationRequest<T, TBody>(
  path: string,
  method: 'POST' | 'PATCH',
  body: TBody,
  decode?: DetailDecoder<T>
): Promise<T> {
  const payload = await apiRequest<unknown>(path, {
    method,
    body: JSON.stringify(body),
  });
  if (decode) {
    return decode(payload);
  }
  return (payload as ApiMutationEnvelope<T>).data;
}

function resourceDetailPath(resourcePath: string, id: string): string {
  return `${resourcePath.replace(/\/$/, '')}/${encodeURIComponent(id)}`;
}

export function createApiRepository<T extends { id: string }>(config: ApiRepositoryConfig<T>): ApiRepository<T> {
  return {
    async list(query) {
      const mapped = config.mapListQuery ? config.mapListQuery(query) : query;
      if (mapped === null) return { items: [], page: 1, pageSize: query?.pageSize ?? 0, total: 0, stale: false };
      return listRequest<T>(config, mapped);
    },
    async getById(id) {
      try {
        return await apiDetailRequest(resourceDetailPath(config.resourcePath, id), config.decodeDetail);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return undefined as unknown as T;
        }
        throw err;
      }
    },
  };
}

export function createApiMutableRepository<T extends { id: string }, TCreateBody = T, TUpdateBody = Partial<Omit<T, 'id'>>>(config: ApiMutableRepositoryConfig<T, TCreateBody, TUpdateBody>): ApiMutableRepository<T> {
  return {
    async list(query) {
      const mapped = config.mapListQuery ? config.mapListQuery(query) : query;
      if (mapped === null) return { items: [], page: 1, pageSize: query?.pageSize ?? 0, total: 0, stale: false };
      return listRequest<T>(config, mapped);
    },
    async getById(id) {
      try {
        return await apiDetailRequest(resourceDetailPath(config.resourcePath, id), config.decodeDetail);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return undefined as unknown as T;
        }
        throw err;
      }
    },
    async create(record) {
      const body = config.mapCreate ? config.mapCreate(record) : record as unknown as TCreateBody;
      return apiMutationRequest<T, TCreateBody>(config.resourcePath, 'POST', body, config.decodeDetail);
    },
    async update(id, changes) {
      const body = config.mapUpdate ? config.mapUpdate(changes) : changes as unknown as TUpdateBody;
      return apiMutationRequest<T, TUpdateBody>(resourceDetailPath(config.resourcePath, id), 'PATCH', body, config.decodeDetail);
    },
  };
}
