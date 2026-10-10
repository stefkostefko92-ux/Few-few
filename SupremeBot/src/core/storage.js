// Settings cache for the content side, synced via chrome.storage.
(function () {
  'use strict';
  const TB = window.TanothBot;
  const KEY = 'tanothBotSettings';

  let cache = null;
  let heroKey = null;     // "<server>:<name>" once the hero in this tab is known
  const listeners = new Set();

  const Storage = {
    async load() {
      try {
        const res = await chrome.storage.local.get(KEY);
        cache = res[KEY] || null;
        if (!cache) {
          // Service worker not yet initialised; ask it directly.
          cache = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
        }
      } catch (_) { /* worker asleep / storage unavailable */ }
      if (!cache || typeof cache !== 'object') cache = {};
      return cache;
    },

    get() { return cache; },

    section(name) { return cache ? cache[name] : undefined; },

    async save(settings) {
      cache = settings;
      // Saved for THIS tab's hero (or the shared defaults while unknown).
      try { await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings, heroKey }); } catch (_) {}
      return cache;
    },

    // The hero in this tab is now known: switch to his own saved settings
    // (created from the defaults on his first visit). From here on the panel
    // saves into them and only changes made for this hero are applied.
    async bindHero(key, name, server) {
      try {
        const r = await chrome.runtime.sendMessage({ type: 'BIND_HERO', heroKey: key, name, server });
        if (r && r.ok) { heroKey = key; Storage._set(r.settings); return r; }
      } catch (_) {}
      return null;
    },
    heroKey() { return heroKey; },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    _set(settings) {
      cache = settings;
      listeners.forEach((fn) => { try { fn(cache); } catch (_) {} });
    }
  };

  // Keep the cache in sync when the options page or popup writes settings:
  // the shared defaults only matter to a tab whose hero is not known yet; a
  // bound tab follows its own hero's entry.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!heroKey && changes[KEY]) Storage._set(changes[KEY].newValue);
    const h = changes.tanothBotHeroes;
    if (heroKey && h && h.newValue && h.newValue[heroKey] && h.newValue[heroKey].settings) {
      const before = h.oldValue && h.oldValue[heroKey] && h.oldValue[heroKey].settings;
      if (JSON.stringify(before) !== JSON.stringify(h.newValue[heroKey].settings)) Storage._set(h.newValue[heroKey].settings);
    }
  });

  TB.Storage = Storage;
})();
