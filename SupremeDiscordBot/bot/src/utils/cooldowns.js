// bot/src/utils/cooldowns.js
// Лек in-memory per-user cooldown за spam-prone slash команди (/poll, /giveaway
// start, /new). Не е разпределен (по инстанция на бота) — достатъчно е за
// анти-spam, не е предназначен като лимит за сигурност (това си остава на
// backend-а, скоупнато по serverId).
const buckets = new Map(); // `${command}:${userId}` → expiresAt (ms)

/**
 * @param {string} command - уникален ключ на командата (напр. "poll")
 * @param {string} userId
 * @param {number} seconds - продължителност на cooldown-а
 * @returns {number} оставащи секунди (0 = не е на cooldown)
 */
export function checkCooldown(command, userId, seconds) {
  const key = `${command}:${userId}`;
  const now = Date.now();
  const expiresAt = buckets.get(key);
  if (expiresAt && expiresAt > now) {
    return Math.ceil((expiresAt - now) / 1000);
  }
  buckets.set(key, now + seconds * 1000);
  return 0;
}

// Периодично почистване, за да не расте Map-ът безкрайно.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v <= now) buckets.delete(k);
}, 60_000).unref();
