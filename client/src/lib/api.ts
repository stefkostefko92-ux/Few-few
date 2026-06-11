const BASE = '/api';

let token: string | null = null;
try {
  token = localStorage.getItem('nexus-dominion.token');
} catch {
  /* no-op */
}

export function setToken(t: string | null): void {
  token = t;
  try {
    if (t) localStorage.setItem('nexus-dominion.token', t);
    else localStorage.removeItem('nexus-dominion.token');
  } catch {
    /* no-op */
  }
}

export function getToken(): string | null {
  return token;
}

async function request<T = any>(method: string, path: string, body?: any): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message =
      typeof data?.error === 'string'
        ? data.error
        : data?.error?.formErrors?.[0] ||
          data?.error?.fieldErrors
            ? Object.values<string[]>(data.error.fieldErrors).flat()[0]
            : `Request failed (${res.status})`;
    throw new Error(message || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  get: <T = any>(path: string) => request<T>('GET', path),
  post: <T = any>(path: string, body?: any) => request<T>('POST', path, body),
  put: <T = any>(path: string, body?: any) => request<T>('PUT', path, body),
  patch: <T = any>(path: string, body?: any) => request<T>('PATCH', path, body),
  delete: <T = any>(path: string) => request<T>('DELETE', path),
};
