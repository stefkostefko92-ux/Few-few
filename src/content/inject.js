/**
 * Page-world injector.
 *
 * Runs in the page's own JavaScript context (not the isolated content-script
 * world) so it can:
 *   1. Hook window.fetch and XMLHttpRequest to *observe* the game's real API
 *      traffic. From those observations it learns the gateway URL, the request
 *      shape (JSON / form / query), the field that carries the action name and
 *      the field that carries the session token. This adaptive approach means
 *      the bot keeps working when Tanoth tweaks parameter names, instead of
 *      relying on hard-coded endpoints.
 *   2. Replay requests on demand in the page context, so they carry the exact
 *      same cookies, headers and origin as the game itself.
 *
 * It talks to the isolated content world purely through window.postMessage
 * using a namespaced envelope, never exposing globals the game could read.
 */
(function () {
  'use strict';

  const SRC_PAGE = 'tanoth-bot-inject';
  const SRC_CONTENT = 'tanoth-bot-content';

  // Candidate field names for the action/method and session token. The first
  // match found in an observed request wins and is remembered.
  const ACTION_KEYS = ['action', 'method', 'do', 'cmd', 'fn', 'call', 'request'];
  const SESSION_KEYS = ['sid', 'session', 'sessionId', 'token', 'sessionToken', 'auth'];

  const learned = {
    url: null,            // gateway URL
    contentType: null,    // 'json' | 'form' | 'query'
    template: null,       // a parsed copy of the last successful request body/params
    actionKey: null,
    sessionKey: null,
    sessionValue: null,
    headers: {}
  };

  /* ----------------------------- observation ----------------------------- */

  function classifyBody(body, contentType) {
    if (body == null) return { kind: 'query', data: {} };
    if (typeof body === 'string') {
      const ct = (contentType || '').toLowerCase();
      if (ct.includes('json')) {
        try { return { kind: 'json', data: JSON.parse(body) }; } catch (_) {}
      }
      // try form-urlencoded
      if (body.includes('=')) {
        const data = {};
        new URLSearchParams(body).forEach((v, k) => { data[k] = v; });
        return { kind: 'form', data };
      }
      try { return { kind: 'json', data: JSON.parse(body) }; } catch (_) {}
    }
    return { kind: 'query', data: {} };
  }

  function rememberRequest(url, method, headers, body) {
    try {
      if (!/tanoth\.gameforge\.com/.test(url)) return;
      // Heuristic: gateway requests are POSTs or have query params with an action.
      const u = new URL(url, location.href);
      const ct = headers['content-type'] || headers['Content-Type'] || '';
      let parsed;
      if (method.toUpperCase() === 'GET' || !body) {
        const data = {};
        u.searchParams.forEach((v, k) => { data[k] = v; });
        parsed = { kind: 'query', data };
      } else {
        parsed = classifyBody(body, ct);
      }

      const keys = Object.keys(parsed.data || {});
      const actionKey = ACTION_KEYS.find((k) => keys.includes(k));
      const sessionKey = SESSION_KEYS.find((k) => keys.includes(k));

      // Only treat it as the gameplay gateway if it looks like an action call.
      if (!actionKey && !/ajax|gateway|api|game|rpc/i.test(u.pathname)) return;

      learned.url = u.origin + u.pathname + (parsed.kind === 'query' ? '' : u.search);
      learned.contentType = parsed.kind;
      learned.template = parsed.data;
      learned.headers = headers;
      if (actionKey) learned.actionKey = actionKey;
      if (sessionKey) {
        learned.sessionKey = sessionKey;
        learned.sessionValue = parsed.data[sessionKey];
      }

      post({ type: 'protocol-learned', payload: snapshot() });
    } catch (_) { /* never break the game */ }
  }

  function snapshot() {
    return {
      url: learned.url,
      contentType: learned.contentType,
      actionKey: learned.actionKey,
      sessionKey: learned.sessionKey,
      hasSession: !!learned.sessionValue,
      template: learned.template
    };
  }

  function observeResponse(url, status, text) {
    if (!/tanoth\.gameforge\.com/.test(url)) return;
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    post({ type: 'api-observed', payload: { url, status, json, text: json ? null : text?.slice(0, 2000) } });
  }

  /* ------------------------------- hooks --------------------------------- */

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = (init && init.method) || (input && input.method) || 'GET';
    const headers = headerObj((init && init.headers) || (input && input.headers));
    const body = init && init.body;
    rememberRequest(url, method, headers, typeof body === 'string' ? body : null);
    return origFetch.apply(this, arguments).then((resp) => {
      try {
        resp.clone().text().then((t) => observeResponse(url, resp.status, t)).catch(() => {});
      } catch (_) {}
      return resp;
    });
  };

  const OrigXHR = window.XMLHttpRequest;
  function HookedXHR() {
    const xhr = new OrigXHR();
    let _url = '', _method = 'GET';
    const headers = {};
    const open = xhr.open;
    xhr.open = function (m, u) { _method = m; _url = u; return open.apply(xhr, arguments); };
    const setH = xhr.setRequestHeader;
    xhr.setRequestHeader = function (k, v) { headers[k] = v; return setH.apply(xhr, arguments); };
    const send = xhr.send;
    xhr.send = function (body) {
      rememberRequest(_url, _method, headers, typeof body === 'string' ? body : null);
      xhr.addEventListener('load', () => {
        try { observeResponse(_url, xhr.status, xhr.responseText); } catch (_) {}
      });
      return send.apply(xhr, arguments);
    };
    return xhr;
  }
  HookedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = HookedXHR;

  function headerObj(h) {
    const out = {};
    if (!h) return out;
    if (h instanceof Headers) { h.forEach((v, k) => { out[k] = v; }); return out; }
    if (Array.isArray(h)) { h.forEach(([k, v]) => { out[k] = v; }); return out; }
    return Object.assign(out, h);
  }

  /* ------------------------------ replay --------------------------------- */

  async function replay(action, params) {
    if (!learned.url || !learned.actionKey) {
      throw new Error('PROTOCOL_NOT_LEARNED');
    }
    const data = Object.assign({}, learned.template, params || {});
    data[learned.actionKey] = action;
    if (learned.sessionKey && learned.sessionValue && !data[learned.sessionKey]) {
      data[learned.sessionKey] = learned.sessionValue;
    }

    const opts = { method: 'POST', headers: {}, credentials: 'include' };
    let url = learned.url;

    if (learned.contentType === 'json') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(data);
    } else if (learned.contentType === 'form') {
      opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      opts.body = new URLSearchParams(data).toString();
    } else {
      opts.method = 'GET';
      const u = new URL(url);
      Object.entries(data).forEach(([k, v]) => u.searchParams.set(k, v));
      url = u.toString();
    }

    const resp = await origFetch(url, opts);
    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { status: resp.status, json, text: json ? null : text };
  }

  /* ------------------------------ bridge --------------------------------- */

  function post(message) {
    window.postMessage(Object.assign({ source: SRC_PAGE }, message), location.origin);
  }

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window) return;
    const m = ev.data;
    if (!m || m.source !== SRC_CONTENT) return;

    if (m.type === 'api-request') {
      try {
        const result = await replay(m.action, m.params);
        post({ type: 'api-response', id: m.id, ok: true, result });
      } catch (e) {
        post({ type: 'api-response', id: m.id, ok: false, error: String(e && e.message || e) });
      }
    } else if (m.type === 'get-protocol') {
      post({ type: 'protocol-learned', payload: snapshot() });
    }
  });

  // Announce readiness so the content script knows the hooks are installed.
  post({ type: 'inject-ready' });
})();
