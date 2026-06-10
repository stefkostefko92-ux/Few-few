// Connects the page-world inject.js to the isolated content world.
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Logger, I18n } = TB;

  const SRC_PAGE = 'tanoth-bot-inject';
  const SRC_CONTENT = 'tanoth-bot-content';

  const pending = new Map();
  let nextId = 1;
  let injectReady = false;
  let context = { url: null, hasSession: false, methods: [] };

  const contextListeners = new Set();

  function injectScript() {
    const url = chrome.runtime.getURL('src/content/inject.js');
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const m = ev.data;
    if (!m || m.source !== SRC_PAGE) return;

    switch (m.type) {
      case 'inject-ready':
        injectReady = true;
        Logger.info(I18n.t('logInjectReady'));
        post({ type: 'get-context' });
        break;
      case 'context':
        injectReady = true; // context can only come from a live injector
        context = m.payload;
        contextListeners.forEach((fn) => { try { fn(context); } catch (_) {} });
        break;
      case 'xmlrpc-response': {
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        clearTimeout(p.timer);
        if (m.ok) p.resolve(m.result);
        else p.reject(new Error(m.error));
        break;
      }
    }
  });

  function post(message) {
    window.postMessage(Object.assign({ source: SRC_CONTENT }, message), location.origin);
  }

  const Bridge = {
    init() { injectScript(); },

    isReady: () => injectReady,
    context: () => context,
    ready: () => !!(context && context.url && context.hasSession),
    hasMethod: (name) => !!(context.methods || []).includes(name),
    findMethod(regex) { return (context.methods || []).find((m) => regex.test(m)) || null; },

    callXmlRpc(method, params, timeoutMs = 20000) {
      return new Promise((resolve, reject) => {
        if (!injectReady) return reject(new Error('INJECT_NOT_READY'));
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('API_TIMEOUT'));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        post({ type: 'xmlrpc', id, method, params: params || [] });
      });
    },

    onContext(fn) { contextListeners.add(fn); return () => contextListeners.delete(fn); }
  };

  TB.Bridge = Bridge;
})();
