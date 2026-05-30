/**
 * Content-world half of the page bridge.
 *
 * Injects inject.js into the page context, then exposes a promise-based
 * `call(action, params)` that round-trips through window.postMessage to the
 * injected replay function. It also surfaces observed responses and the learned
 * protocol so the API layer can keep State up to date.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Logger } = TB;

  const SRC_PAGE = 'tanoth-bot-inject';
  const SRC_CONTENT = 'tanoth-bot-content';

  const pending = new Map();
  let nextId = 1;
  let injectReady = false;
  let protocol = { url: null, actionKey: null, hasSession: false };

  const observeListeners = new Set();
  const protocolListeners = new Set();

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
        Logger.info(TB.I18n.t('logInjectReady'));
        post({ type: 'get-protocol' });
        break;
      case 'protocol-learned':
        protocol = m.payload;
        protocolListeners.forEach((fn) => { try { fn(protocol); } catch (_) {} });
        break;
      case 'api-observed':
        observeListeners.forEach((fn) => { try { fn(m.payload); } catch (_) {} });
        break;
      case 'api-response': {
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
    protocol: () => protocol,
    protocolReady: () => !!(protocol && protocol.url && protocol.actionKey),

    call(action, params, timeoutMs = 15000) {
      return new Promise((resolve, reject) => {
        if (!injectReady) return reject(new Error('INJECT_NOT_READY'));
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('API_TIMEOUT'));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        post({ type: 'api-request', id, action, params: params || {} });
      });
    },

    onObserve(fn) { observeListeners.add(fn); return () => observeListeners.delete(fn); },
    onProtocol(fn) { protocolListeners.add(fn); return () => protocolListeners.delete(fn); }
  };

  TB.Bridge = Bridge;
})();
