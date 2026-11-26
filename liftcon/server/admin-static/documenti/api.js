// Заявки към API-то: CSRF токенът от /api/sessione (не се пази на устройството — след работа без връзка се
// взима наново преди първия запис), JSON, кодове → резултат (без изключения за 4xx).
let csrf = "";
export const impostaCsrf = (t) => (csrf = t ?? "");

async function rinnovaCsrf() {
  try {
    const r = await fetch("/admin/api/sessione", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
    if (r.ok) csrf = (await r.json()).csrf ?? "";
  } catch {
    /* без връзка — заявката по-долу ще го каже */
  }
}

async function invia(path, method, headers, body) {
  try {
    return await fetch(`/admin/api${path}`, { method, headers: method !== "GET" ? { ...headers, "x-csrf-token": csrf } : headers, body, credentials: "same-origin", cache: "no-store" });
  } catch {
    return null;
  }
}

export async function api(path, { method = "GET", json, body, tipo, intestazioni = {} } = {}) {
  const headers = { accept: "application/json", ...intestazioni };
  if (json !== undefined) headers["content-type"] = "application/json";
  if (tipo) headers["content-type"] = tipo;
  const dati = json !== undefined ? JSON.stringify(json) : body;
  if (method !== "GET" && !csrf) await rinnovaCsrf();
  let res = await invia(path, method, headers, dati);
  // 403 при запис: токенът може да е от предишна сесия (нов вход в друг раздел) — един нов опит с пресен токен.
  if (res?.status === 403 && method !== "GET") {
    await rinnovaCsrf();
    res = await invia(path, method, headers, dati);
  }
  if (!res) return { stato: 0, offline: true, dati: null };
  const ct = res.headers.get("content-type") ?? "";
  return { stato: res.status, dati: ct.includes("json") ? await res.json().catch(() => null) : null };
}

export const online = () => navigator.onLine !== false;
