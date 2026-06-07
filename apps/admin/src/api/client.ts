// Базов адрес на API-то. Празно = same-origin (dev прокси или reverse proxy).
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

/** Пълен адрес за ресурс на API-то (напр. за <img src>). */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * Глобална реакция при изтекла/невалидна сесия (401). Регистрира се веднъж от
 * main.tsx и нулира кеша за текущия админ, така че приложението се връща на
 * екрана за вход, вместо да остане заклещено в грешки.
 */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function toError(res: Response): Promise<ApiError> {
  let message = `Грешка (HTTP ${res.status}).`;
  try {
    const data: unknown = await res.json();
    if (
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof (data as { error: unknown }).error === 'string'
    ) {
      message = (data as { error: string }).error;
    }
  } catch {
    // Тялото не е JSON — оставяме общото съобщение.
  }
  return new ApiError(res.status, message);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { credentials: 'include' });
  if (!res.ok) {
    if (res.status === 401) {
      onUnauthorized?.();
    }
    throw await toError(res);
  }
  return (await res.json()) as T;
}

export async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    if (res.status === 401) {
      onUnauthorized?.();
    }
    throw await toError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
