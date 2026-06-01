/**
 * Page-world XML-RPC client for Tanoth.
 *
 * Runs in the page's own context so it can read `window.flashvars.sessionID`
 * (the game's session token, not reachable from the isolated content world)
 * and POST to the game's gateway with the right cookies and origin.
 *
 * Tanoth's HTML5 client talks to the server over **XML-RPC**: an HTTP POST of a
 * `<methodCall>` document to `<gameUrl>/xmlrpc`, where the game client lives at
 * `<gameUrl>/main/client`. Every call's first parameter is the session id as a
 * string. (Verified against the open-source BoTanoth client.)
 *
 * Responsibilities:
 *   1. Discover the gateway URL and session id (from flashvars, with a sniffing
 *      fallback for client variants that don't expose flashvars).
 *   2. Execute `callXmlRpc(method, params)` on request from the content world,
 *      prepending the session id, and return the raw XML response text (parsed
 *      in the content world, which also has DOMParser).
 *   3. Passively sniff the game's own XML-RPC traffic to learn the full set of
 *      method names available — so optional modules can use methods this file
 *      doesn't hard-code.
 */
(function () {
  'use strict';

  const SRC_PAGE = 'tanoth-bot-inject';
  const SRC_CONTENT = 'tanoth-bot-content';

  const ctx = {
    url: null,            // resolved /xmlrpc gateway
    sessionId: null,      // flashvars.sessionID (or sniffed)
    methods: {}           // learned methodName -> last param template (xml)
  };

  /* --------------------------- context discovery -------------------------- */

  function deriveGatewayFromLocation() {
    const href = location.href;
    if (href.includes('/main/client')) return href.split('#')[0].split('?')[0].replace('/main/client', '/xmlrpc');
    return location.origin + '/xmlrpc';
  }

  function readSession() {
    try {
      if (window.flashvars && window.flashvars.sessionID) return String(window.flashvars.sessionID);
    } catch (_) {}
    return ctx.sessionId; // possibly sniffed earlier
  }

  function refreshContext() {
    const before = JSON.stringify({ u: ctx.url, s: !!ctx.sessionId });
    if (!ctx.url) ctx.url = deriveGatewayFromLocation();
    const sid = readSession();
    if (sid) ctx.sessionId = sid;
    if (JSON.stringify({ u: ctx.url, s: !!ctx.sessionId }) !== before) postContext();
  }

  function postContext() {
    post({
      type: 'context',
      payload: { url: ctx.url, hasSession: !!ctx.sessionId, methods: Object.keys(ctx.methods) }
    });
  }

  /* ------------------------------ XML-RPC -------------------------------- */

  function escapeXml(s) {
    return String(s).replace(/[<>&'"]/g, (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
  }

  // params: array of { type: 'string'|'int'|'i4'|'double'|'boolean', value }
  function buildMethodCall(method, params) {
    const sid = readSession();
    const all = [{ type: 'string', value: sid != null ? sid : '' }].concat(params || []);
    const body = all.map((p) => {
      const t = p.type === 'int' ? 'i4' : p.type;
      return `<param><value><${t}>${escapeXml(p.value)}</${t}></value></param>`;
    }).join('');
    return `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${body}</params></methodCall>`;
  }

  async function callXmlRpc(method, params) {
    refreshContext();
    if (!ctx.url) throw new Error('NO_GATEWAY');
    if (!ctx.sessionId) throw new Error('NO_SESSION');
    const xml = buildMethodCall(method, params);
    const resp = await origFetch(ctx.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      credentials: 'include',
      body: xml
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error('HTTP_' + resp.status);
    return { status: resp.status, xml: sanitizeXml(text) };
  }

  function sanitizeXml(s) {
    // Strip control chars that break DOMParser (matches the reference client).
    return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F]/g, '');
  }

  /* ------------------------------ sniffing ------------------------------- */

  function observe(url, body) {
    try {
      if (typeof body !== 'string') return;
      const m = body.match(/<methodName>\s*([\w.:_]+)\s*<\/methodName>/);
      if (!m) return;
      const method = m[1];
      ctx.methods[method] = true;
      if (!ctx.url && /xmlrpc/i.test(url)) ctx.url = url.split('#')[0];
      if (!ctx.sessionId) {
        // First string param of a methodCall is the session id.
        const sm = body.match(/<params>\s*<param>\s*<value>\s*<string>([^<]+)<\/string>/);
        if (sm) ctx.sessionId = sm[1];
      }
      postContext();
    } catch (_) {}
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const body = init && init.body;
      if (/xmlrpc/i.test(url)) observe(url, typeof body === 'string' ? body : null);
    } catch (_) {}
    return origFetch.apply(this, arguments);
  };

  const OrigXHR = window.XMLHttpRequest;
  function HookedXHR() {
    const xhr = new OrigXHR();
    let _url = '';
    const open = xhr.open;
    xhr.open = function (m, u) { _url = u; return open.apply(xhr, arguments); };
    const send = xhr.send;
    xhr.send = function (body) {
      try { if (/xmlrpc/i.test(_url)) observe(_url, typeof body === 'string' ? body : null); } catch (_) {}
      return send.apply(xhr, arguments);
    };
    return xhr;
  }
  HookedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = HookedXHR;

  /* ------------------------------- bridge -------------------------------- */

  function post(message) {
    window.postMessage(Object.assign({ source: SRC_PAGE }, message), location.origin);
  }

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window) return;
    const m = ev.data;
    if (!m || m.source !== SRC_CONTENT) return;

    if (m.type === 'xmlrpc') {
      try {
        const result = await callXmlRpc(m.method, m.params);
        post({ type: 'xmlrpc-response', id: m.id, ok: true, result });
      } catch (e) {
        post({ type: 'xmlrpc-response', id: m.id, ok: false, error: String(e && e.message || e) });
      }
    } else if (m.type === 'get-context') {
      refreshContext();
      postContext();
    }
  });

  // Keep trying to read flashvars — it may be set slightly after load.
  refreshContext();
  let tries = 0;
  const iv = setInterval(() => {
    refreshContext();
    if ((ctx.sessionId && ctx.url) || ++tries > 40) clearInterval(iv);
  }, 500);

  post({ type: 'inject-ready' });
})();
