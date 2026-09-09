// Recording mock на chrome.* за тестове на service worker-а (background.js).
// Реализира само API-тата, които тестовете наблюдават; всичко друго е no-op.
// Storage е in-memory Map; поддържа и callback, и Promise стил (background ползва двата).
export function makeChrome(opts = {}) {
  const calls = { alarms: [], rulesets: [], registered: [], unregistered: [], badge: [] };
  const listeners = { message: [], alarm: [], installed: [], startup: [] };
  let dynamic = [];
  let enabledRulesets = new Set(opts.enabledRulesets || ["ad_rules", "youtube_rules", "easylist", "easyprivacy", "removeparam", "surrogates", "headers", "privacy"]);
  let registeredScripts = [];
  const store = new Map(Object.entries(opts.storage || {}));

  const storageArea = (map) => ({
    get(keys, cb) {
      const out = {};
      const list = keys == null ? [...map.keys()] : Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys);
      for (const k of list) if (map.has(k)) out[k] = structuredClone(map.get(k));
      if (typeof keys === "object" && !Array.isArray(keys) && keys) for (const [k, v] of Object.entries(keys)) if (!(k in out)) out[k] = v;
      if (cb) { setTimeout(() => cb(out), 0); return; }
      return Promise.resolve(out);
    },
    set(obj, cb) { for (const [k, v] of Object.entries(obj)) map.set(k, structuredClone(v)); if (cb) { setTimeout(cb, 0); return; } return Promise.resolve(); },
    remove(keys, cb) { for (const k of Array.isArray(keys) ? keys : [keys]) map.delete(k); if (cb) { setTimeout(cb, 0); return; } return Promise.resolve(); },
  });

  const chrome = {
    runtime: {
      id: "test-ext",
      getURL: (p) => "chrome-extension://test-ext/" + p,
      onInstalled: { addListener: (f) => listeners.installed.push(f) },
      onStartup: { addListener: (f) => listeners.startup.push(f) },
      onMessage: { addListener: (f) => listeners.message.push(f) },
      sendMessage: () => {},
    },
    storage: { local: storageArea(store), sync: storageArea(new Map()), onChanged: { addListener() {} } },
    alarms: {
      create: (name, info) => calls.alarms.push({ name, info }),
      clear: () => Promise.resolve(true),
      onAlarm: { addListener: (f) => listeners.alarm.push(f) },
    },
    declarativeNetRequest: {
      updateEnabledRulesets: async ({ enableRulesetIds = [], disableRulesetIds = [] }) => {
        calls.rulesets.push({ enable: [...enableRulesetIds], disable: [...disableRulesetIds] });
        for (const id of enableRulesetIds) enabledRulesets.add(id);
        for (const id of disableRulesetIds) enabledRulesets.delete(id);
      },
      getEnabledRulesets: async () => [...enabledRulesets],
      getDynamicRules: async () => structuredClone(dynamic),
      updateDynamicRules: async ({ removeRuleIds = [], addRules = [] }) => {
        dynamic = dynamic.filter((r) => !removeRuleIds.includes(r.id)).concat(structuredClone(addRules));
      },
      getMatchedRules: async () => ({ rulesMatchedInfo: [] }),
      // onRuleMatchedDebug is absent in a packed build
    },
    scripting: {
      getRegisteredContentScripts: async ({ ids } = {}) => registeredScripts.filter((s) => !ids || ids.includes(s.id)),
      registerContentScripts: async (arr) => {
        if (opts.registerThrows) throw new Error(opts.registerThrows);
        for (const s of arr) { calls.registered.push(structuredClone(s)); registeredScripts.push(structuredClone(s)); }
      },
      unregisterContentScripts: async ({ ids }) => { calls.unregistered.push([...ids]); registeredScripts = registeredScripts.filter((s) => !ids.includes(s.id)); },
    },
    contextMenus: { removeAll: (cb) => cb && cb(), create() {}, onClicked: { addListener() {} } },
    tabs: { onUpdated: { addListener() {} }, onActivated: { addListener() {} }, onRemoved: { addListener() {} }, query: (q, cb) => cb && cb([]), sendMessage() {} },
    action: { setBadgeText: (o) => calls.badge.push(o), setBadgeBackgroundColor: (o) => calls.badge.push(o) },
  };
  return { chrome, calls, listeners, store, dynamic: () => dynamic, registered: () => registeredScripts, enabled: () => [...enabledRulesets] };
}

// Изпраща съобщение през записания onMessage listener както popup/options го правят.
export function sendMessage(listeners, msg, sender = { id: "test-ext" }) {
  return new Promise((resolve) => {
    for (const fn of listeners.message) {
      const keep = fn(msg, sender, resolve);
      if (keep !== true) { /* синхронен отговор или игнорирано */ }
    }
    setTimeout(() => resolve(undefined), 200); // не се блокира, ако никой не отговори
  });
}
