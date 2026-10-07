"use strict";
// Ограничение на опитите за вход — в паметта (бекендът е един процес).
// ПИН-ът е кратък, затова истинската защита е заключването на акаунта: 5 грешни опита → заключен, и всяко
// следващо заключване е двойно по-дълго (15 мин → 30 → 60 … до 24 ч), докато човекът не влезе успешно.
// Отделно всеки адрес има таван на грешните опити, за да не се пробват много акаунти от едно място.
function createLoginLimiter({
  maxFails = 5,
  baseLockMs = 15 * 60 * 1000,
  maxLockMs = 24 * 60 * 60 * 1000,
  ipMaxFails = 30,
  ipWindowMs = 15 * 60 * 1000,
  now = () => Date.now(),
} = {}) {
  const accounts = new Map(); // имейл → { fails, locks, lockedUntil }
  const addresses = new Map(); // адрес → { fails, windowStart }

  function prune(t) {
    if (accounts.size + addresses.size < 10000) return;
    for (const [k, a] of accounts) if (a.fails === 0 && a.lockedUntil <= t) accounts.delete(k);
    for (const [k, a] of addresses) if (t - a.windowStart >= ipWindowMs) addresses.delete(k);
  }

  return {
    /** { ok: true } или { ok: false, retryAfterSec } — преди да се гледа ПИН-ът. */
    check(email, ip) {
      const t = now();
      const acc = accounts.get(email);
      if (acc && acc.lockedUntil > t) return { ok: false, retryAfterSec: Math.ceil((acc.lockedUntil - t) / 1000) };
      const adr = addresses.get(ip);
      if (adr && t - adr.windowStart < ipWindowMs && adr.fails >= ipMaxFails) {
        return { ok: false, retryAfterSec: Math.ceil((adr.windowStart + ipWindowMs - t) / 1000) };
      }
      return { ok: true };
    },
    fail(email, ip) {
      const t = now();
      prune(t);
      const acc = accounts.get(email) || { fails: 0, locks: 0, lockedUntil: 0 };
      acc.fails += 1;
      if (acc.fails >= maxFails) {
        acc.lockedUntil = t + Math.min(baseLockMs * 2 ** acc.locks, maxLockMs);
        acc.locks += 1;
        acc.fails = 0;
      }
      accounts.set(email, acc);
      const adr = addresses.get(ip);
      if (!adr || t - adr.windowStart >= ipWindowMs) addresses.set(ip, { fails: 1, windowStart: t });
      else adr.fails += 1;
    },
    succeed(email) {
      accounts.delete(email);
    },
  };
}

module.exports = { createLoginLimiter };
