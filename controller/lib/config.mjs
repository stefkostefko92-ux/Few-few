/**
 * Multi-account controller — config validation (pure, unit-tested).
 *
 * No filesystem or browser here; just normalises and validates the accounts.json
 * structure so controller.mjs can rely on clean data.
 */

export function normalizeAccount(acc, defaults = {}) {
  return {
    id: String(acc.id),
    label: acc.label || String(acc.id),
    world: acc.world || '',
    profileDir: acc.profileDir || ('./profiles/' + acc.id),
    proxy: acc.proxy || defaults.proxyDefault || '',
    settingsFile: acc.settingsFile || '',
    enabled: acc.enabled !== false
  };
}

export function validateConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== 'object') return { ok: false, errors: ['config is not an object'], accounts: [] };

  const browser = cfg.browser || {};
  const accountsIn = Array.isArray(cfg.accounts) ? cfg.accounts : [];
  if (!accountsIn.length) errors.push('no accounts defined');

  const seen = new Set();
  const accounts = [];
  for (const a of accountsIn) {
    if (!a || a.id == null || a.id === '') { errors.push('an account is missing "id"'); continue; }
    const id = String(a.id);
    if (seen.has(id)) errors.push(`duplicate account id: ${id}`);
    seen.add(id);
    if (!a.world) errors.push(`account ${id}: missing "world" URL`);
    if (a.proxy && !/^(https?|socks5h?):\/\//.test(a.proxy)) errors.push(`account ${id}: proxy must start with http(s):// or socks5(h):// `);
    accounts.push(normalizeAccount(a, browser));
  }
  return { ok: errors.length === 0, errors, accounts };
}

export function enabledAccounts(parsed, onlyId) {
  return parsed.accounts.filter((a) => a.enabled && (!onlyId || a.id === onlyId));
}
