import { apiErrorBodySchema, type ApiErrorBody } from './contracts';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
const relativePath = /^\/[A-Za-z0-9_./?&=%:+-]*$/;

export const apiErrorSchema = apiErrorBodySchema;
export type ApiErrorPayload = ApiErrorBody;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string[]>;
  readonly validationErrors: ApiErrorBody['errors'];

  constructor(status: number, payload?: ApiErrorPayload) {
    super(payload?.message ?? 'The request could not be completed.');
    this.name = 'ApiError';
    this.status = status;
    this.code = payload?.code ?? 'REQUEST_FAILED';
    this.fieldErrors = payload?.fieldErrors ?? {};
    this.validationErrors = payload?.errors;
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!relativePath.test(path)) throw new ApiError(400, { code: 'INVALID_PATH' });
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: 'include',
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    let payload: ApiErrorPayload | undefined;
    try { payload = apiErrorSchema.parse(await response.json()); } catch { payload = undefined; }
    throw new ApiError(response.status, payload);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
