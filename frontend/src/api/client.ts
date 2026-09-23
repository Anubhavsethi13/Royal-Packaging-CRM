import { apiErrorBodySchema, type ApiErrorBody } from './contracts';

export function resolveApiBaseUrl(
  rawUrl: unknown = import.meta.env.VITE_API_URL,
  isProd: boolean = Boolean(import.meta.env.PROD)
): string {
  const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : '';

  if (isProd) {
    if (!trimmed) {
      throw new Error(
        'Production configuration error: VITE_API_URL must be explicitly configured in production.'
      );
    }
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(trimmed)) {
      throw new Error(
        'Production configuration error: VITE_API_URL cannot point to localhost in production.'
      );
    }
    return trimmed;
  }

  return trimmed || 'http://localhost:3000/api';
}

const apiBaseUrl = resolveApiBaseUrl();
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
    try {
      const json = await response.json();
      payload = apiErrorSchema.parse(json);
      if (!payload.code && json?.error?.code) payload.code = json.error.code;
      if (!payload.message && json?.error?.message) payload.message = json.error.message;
    } catch { payload = undefined; }
    throw new ApiError(response.status, payload);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
