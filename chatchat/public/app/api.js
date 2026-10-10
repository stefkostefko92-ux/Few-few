import { emit, state } from './store.js';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code || `HTTP ${status}`);
    this.status = status;
    this.code = code || null;
  }
}

/**
 * JSON към /api/v1. Бисквитката е httpOnly (JS не я вижда) — при не-GET пращаме
 * x-csrf-token от login/me.
 */
export async function api(method, path, body, { timeoutMs = 30000 } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && state.csrf) headers['x-csrf-token'] = state.csrf;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'network');
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    // Вторият фактор е отделно състояние: сесията е жива, но иска код (или настройка).
    if (data?.code === 'mfa_required') emit('auth:mfa', 'verify');
    else if (data?.code === 'mfa_setup_required') emit('auth:mfa', 'setup');
    // Задължителен единен вход, а акаунтът още не е свързан от собственика (auth/sso-link.js).
    else if (data?.code === 'sso_link_required') emit('auth:link');
    else if (res.status === 401 && !path.startsWith('/auth/')) emit('auth:expired');
    throw new ApiError(res.status, data?.code, data?.error);
  }
  return data;
}
