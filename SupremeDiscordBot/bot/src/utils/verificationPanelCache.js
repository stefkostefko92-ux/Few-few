// bot/src/utils/verificationPanelCache.js
// В3: `showModal` трябва да е ПЪРВИЯТ отговор (3 s). Панелът за верификация се взима от
// кратък кеш (30 s, дедуплициран) и пред първия отговор се чака най-много PRE_ACK_CAP_MS —
// същата дисциплина като `panelCache.js` за тикет панелите.
import api from "./api.js";
import { capped, TIMED_OUT, PRE_ACK_CAP_MS } from "./panelCache.js";

const TTL_MS = 30_000;
const cache = new Map();    // panelId → { panel, expiresAt }
const inflight = new Map(); // panelId → Promise<panel>

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
}, TTL_MS).unref();

export function invalidateVerificationPanel(panelId) {
  if (panelId) cache.delete(String(panelId));
}

export function loadVerificationPanel(panelId) {
  const hit = cache.get(panelId);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.panel);
  if (inflight.has(panelId)) return inflight.get(panelId);
  const p = api.get(`/verification/bot/${panelId}`)
    .then((r) => { cache.set(panelId, { panel: r.data, expiresAt: Date.now() + TTL_MS }); return r.data; })
    .finally(() => inflight.delete(panelId));
  p.catch(() => {}); // късен отказ след тавана не бива да е unhandled
  inflight.set(panelId, p);
  return p;
}

/**
 * Панелът с таван. Връща панела, или `null` при изтичане/срив, или `false` ако панелът не съществува (404).
 * Викащият казва „не е намерен“ само при false, иначе честно „опитай пак“.
 */
export async function loadVerificationPanelCapped(panelId, ms = PRE_ACK_CAP_MS) {
  try {
    const r = await capped(loadVerificationPanel(panelId), ms, TIMED_OUT);
    return r === TIMED_OUT ? null : r;
  } catch (err) {
    return err?.response?.status === 404 ? false : null;
  }
}

export const __testing = { cache, inflight };
