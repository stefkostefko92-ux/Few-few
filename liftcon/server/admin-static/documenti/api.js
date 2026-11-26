// Заявки към API-то: CSRF токенът от /api/sessione, JSON, кодове → резултат (без изключения за 4xx).
let csrf = "";
export const impostaCsrf = (t) => (csrf = t);

export async function api(path, { method = "GET", json, body, tipo } = {}) {
  const headers = { accept: "application/json" };
  if (method !== "GET") headers["x-csrf-token"] = csrf;
  if (json !== undefined) headers["content-type"] = "application/json";
  if (tipo) headers["content-type"] = tipo;
  let res;
  try {
    res = await fetch(`/admin/api${path}`, { method, headers, body: json !== undefined ? JSON.stringify(json) : body, credentials: "same-origin", cache: "no-store" });
  } catch {
    return { stato: 0, offline: true, dati: null };
  }
  const ct = res.headers.get("content-type") ?? "";
  const dati = ct.includes("json") ? await res.json().catch(() => null) : null;
  return { stato: res.status, dati };
}

export const online = () => navigator.onLine !== false;
