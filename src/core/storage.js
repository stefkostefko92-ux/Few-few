// Settings cache for the content side, synced via chrome.storage.
(function () {
  'use strict';
  const TB = window.TanothBot;
  const KEY = 'tanothBotSettings';

  let cache = null;
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
      try { await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }); } catch (_) {}
      return cache;
    },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    _set(settings) {
      cache = settings;
      listeners.forEach((fn) => { try { fn(cache); } catch (_) {} });
    }
  };

  // Keep the cache in sync when the options page or popup writes settings.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) {
      Storage._set(changes[KEY].newValue);
    }
  });

  TB.Storage = Storage;
})();
