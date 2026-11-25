// lib/managed.js — управлявани политики (6.1, docs/ENTERPRISE.md): какво администраторът налага през
// chrome.storage.managed (схемата е managed_schema.json). Чисти функции; класически скрипт →
// globalThis.SA_MANAGED (importScripts в SW, background.scripts във Firefox, <script> в Настройки,
// vm в tests/managed.test.mjs). Невалидна стойност се пропуска — никога не проваля цялата политика.
(function (root) {
  const MODES = ["basic", "standard", "strict"];
  const FEATURES = ["cookies", "antiAdblock", "meta", "youtube", "smart", "removeparam", "malware", "topics", "privacy", "gpc", "twitch"];
  const BOOLS = ["autoUpdate", "reviewAsk", "sync", "disablePause", "disableUserExceptions"];
  const MAX_SITES = 2000;
  const MAX_ALLOW = 5000;
  const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$|^(?:\d{1,3}\.){3}\d{1,3}$/;
  const LIST_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

  const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const host = (h) => (typeof h === "string" ? h.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "") : "");

  /** Валидирана политика: само познати ключове с верен тип; хостове — нормализирани, с тавани. */
  function clean(raw, listIds) {
    const out = {};
    if (!isObj(raw)) return out;
    if (MODES.includes(raw.mode)) out.mode = raw.mode;
    if (isObj(raw.siteModes)) {
      const sm = {};
      for (const [h0, m] of Object.entries(raw.siteModes)) {
        const h = host(h0);
        if (HOST_RE.test(h) && MODES.includes(m) && Object.keys(sm).length < MAX_SITES) sm[h] = m;
      }
      if (Object.keys(sm).length) out.siteModes = sm;
    }
    if (Array.isArray(raw.allowlist)) {
      const al = [...new Set(raw.allowlist.map(host).filter((h) => HOST_RE.test(h)))].slice(0, MAX_ALLOW);
      if (al.length) out.allowlist = al;
    }
    if (isObj(raw.features)) {
      const f = {};
      for (const k of FEATURES) if (typeof raw.features[k] === "boolean") f[k] = raw.features[k];
      if (Object.keys(f).length) out.features = f;
    }
    if (isObj(raw.lists)) {
      const known = Array.isArray(listIds) ? new Set(listIds) : null;
      const l = {};
      for (const [id, on] of Object.entries(raw.lists)) {
        if (typeof on === "boolean" && LIST_RE.test(id) && (!known || known.has(id))) l[id] = on;
      }
      if (Object.keys(l).length) out.lists = l;
    }
    for (const k of BOOLS) if (typeof raw[k] === "boolean") out[k] = raw[k];
    return out;
  }

  const has = (p) => isObj(p) && Object.keys(p).length > 0;

  /** Какво да се запише в storage.local, за да важи политиката. Разрешените сайтове и нивата по сайт се
   *  СЛИВАТ с потребителските; функциите и листите — наложените ключове върху потребителските; другото —
   *  заменено. Връща само промените (празен обект = нищо за писане). */
  function apply(state, policy) {
    const patch = {};
    if (!has(policy)) return patch;
    const s = isObj(state) ? state : {};
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (policy.mode && s.mode !== policy.mode) patch.mode = policy.mode;
    if (policy.siteModes) {
      const next = { ...(isObj(s.siteModes) ? s.siteModes : {}), ...policy.siteModes };
      if (!same(next, s.siteModes)) patch.siteModes = next;
    }
    if (policy.allowlist) {
      const cur = Array.isArray(s.allowlist) ? s.allowlist : [];
      const next = [...new Set(cur.concat(policy.allowlist))];
      if (next.length !== cur.length) patch.allowlist = next;
    }
    if (policy.features) {
      const next = { ...(isObj(s.features) ? s.features : {}), ...policy.features };
      if (!same(next, s.features)) patch.features = next;
    }
    if (policy.lists) {
      const next = { ...(isObj(s.lists) ? s.lists : {}), ...policy.lists };
      if (!same(next, s.lists)) patch.lists = next;
    }
    for (const k of ["autoUpdate", "reviewAsk", "sync"]) if (k in policy && s[k] !== policy[k]) patch[k] = policy[k];
    if (policy.disablePause && (s.enabled === false || Number(s.pausedUntil) > 0)) {
      patch.enabled = true;
      patch.pausedUntil = 0;
    }
    return patch;
  }

  /** Какво е заключено — за popup-а и Настройки (рисуват контролите изключени). */
  function locks(policy) {
    const p = isObj(policy) ? policy : {};
    return {
      any: has(p),
      mode: !!p.mode,
      siteModes: Object.keys(p.siteModes || {}),
      allowlist: p.allowlist || [],
      features: Object.keys(p.features || {}),
      lists: Object.keys(p.lists || {}),
      autoUpdate: "autoUpdate" in p,
      reviewAsk: "reviewAsk" in p,
      sync: "sync" in p,
      pause: !!p.disablePause,
      exceptions: !!p.disableUserExceptions,
    };
  }

  // the most specific locked entry for a host (a.b.example.com → b.example.com → example.com)
  function lockedSite(policy, h) {
    const sm = (policy && policy.siteModes) || {};
    let x = host(h);
    while (x) {
      if (Object.prototype.hasOwnProperty.call(sm, x)) return x;
      const i = x.indexOf(".");
      if (i < 0) break;
      x = x.slice(i + 1);
    }
    return "";
  }
  const coveredByAllow = (policy, h) => {
    const x = host(h);
    return ((policy && policy.allowlist) || []).some((d) => x === d || x.endsWith("." + d));
  };

  /** Позволява ли политиката една промяна от потребителя. change = { kind, … }:
   *  mode · siteMode {host} · allow {host, allow} · feature {key, value} · list {id, value} ·
   *  autoUpdate/reviewAsk/sync {value} · pause / disable (изключване на защитата). */
  function allows(policy, change) {
    const p = isObj(policy) ? policy : {};
    if (!has(p) || !isObj(change)) return true;
    switch (change.kind) {
      case "mode": return !p.mode;
      case "siteMode": return !p.disableUserExceptions && !lockedSite(p, change.host);
      case "allow":
        if (change.allow) return !p.disableUserExceptions;
        return !coveredByAllow(p, change.host); // removing a host the policy allows
      case "feature": return !(p.features && change.key in p.features) || p.features[change.key] === change.value;
      case "list": return !(p.lists && change.id in p.lists) || p.lists[change.id] === change.value;
      case "autoUpdate": case "reviewAsk": case "sync":
        return !(change.kind in p) || p[change.kind] === change.value;
      case "pause": case "disable": return !p.disablePause;
      default: return true;
    }
  }

  root.SA_MANAGED = { FEATURES, MODES, clean, apply, locks, allows, lockedSite };
})(typeof globalThis !== "undefined" ? globalThis : this);
