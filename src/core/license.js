// Content-side view of the subscription state owned by the service worker.
(function () {
  'use strict';
  const TB = window.TanothBot;

  let state = { status: 'unknown', entitled: false, daysLeft: 0, expISO: null, payment: null };
  const listeners = new Set();

  function emit() { listeners.forEach((fn) => { try { fn(state); } catch (_) {} }); }

  const License = {
    async load() {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'GET_LICENSE' });
        if (res && res.status) { state = res; emit(); }
      } catch (_) {}
      return state;
    },

    _set(s) { if (s && s.status) { state = s; emit(); } },

    get: () => state,
    entitled: () => !!state.entitled,
    status: () => state.status,
    daysLeft: () => state.daysLeft,
    payment: () => state.payment,

    async activate(key) {
      const res = await chrome.runtime.sendMessage({ type: 'ACTIVATE_LICENSE', key });
      if (res && res.status) { state = res; emit(); }
      return res;
    },

    openPayment() {
      chrome.runtime.sendMessage({ type: 'OPEN_PAYMENT' }).catch(() => {});
    },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };

  TB.License = License;
})();
