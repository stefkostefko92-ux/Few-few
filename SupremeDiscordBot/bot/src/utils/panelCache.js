// bot/src/utils/panelCache.js
// Т13: нито един път не прави мрежова заявка БЕЗ ТАВАН преди първия отговор.
//
// Discord дава 3 s за първия отговор, а axios таймаутът е 10 s. Затова:
//   * панелът се кешира за кратко (горещ път: клик на бутон) и се дедуплицира;
//   * заявките пред първия отговор са с таван (CAP_MS) и пропадат „отворено“
//     (черен списък) или се отлагат (defer), вместо да висят.
import api from "./api.js";

export const PRE_ACK_CAP_MS = 2000;
const PANEL_TTL_MS = 30_000;

const panelCache = new Map(); // panelId → { panel, serverId, expiresAt }
const inflight = new Map();   // `${serverId}:${panelId}` → Promise<panel>

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of panelCache) if (v.expiresAt <= now) panelCache.delete(k);
}, PANEL_TTL_MS).unref();

/** Чисти кеширан панел (викай при PANEL_UPDATE от таблото). */
export function invalidatePanel(panelId) {
  if (panelId) panelCache.delete(String(panelId));
}

/** Promise.race с таван: при изтичане връща `fallback` (заявката продължава сама). */
export function capped(promise, ms, fallback) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export const TIMED_OUT = Symbol("timed-out");

/**
 * Зарежда панела: кеш → иначе заявка (дедуплицирана). Връща САМО обещанието;
 * викащият го ограничава с `capped(...)` според това какво му е позволено.
 */
export function loadPanel(panelId, serverId) {
  const hit = panelCache.get(panelId);
  if (hit && hit.serverId === serverId && hit.expiresAt > Date.now()) return Promise.resolve(hit.panel);

  const key = `${serverId}:${panelId}`;
  if (inflight.has(key)) return inflight.get(key);
  const p = api
    .get(`/bot/panel/${panelId}`, { params: { serverId } })
    .then((r) => {
      panelCache.set(panelId, { panel: r.data, serverId, expiresAt: Date.now() + PANEL_TTL_MS });
      return r.data;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export const __testing = { panelCache, inflight };
