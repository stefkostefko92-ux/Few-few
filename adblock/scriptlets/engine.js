// Supreme AdBlock — scriptlet engine (clean-room, MIT).
//
// Runs in the page's MAIN world at document_start, BEFORE the site's own
// scripts, so it can neutralise anti-adblock detectors and ad-tech APIs that
// DNR + cosmetic filtering cannot reach (property traps, timer/event defusers,
// JSON pruning). This is the same mechanism as uBlock Origin's `##+js(...)`
// scriptlets, but the implementations here are our own and the per-site
// directive MAP is BAKED AT BUILD TIME (tools/build_scriptlets.mjs) — never
// fetched or evaluated at runtime. MV3 forbids remote code; this is code that
// ships inside the package, parameterised only by inert data.
//
// This source file is the template: the MAP injection marker below is replaced
// by the build with the compiled directive map to produce scriptlets/main.js (the file
// actually registered). Everything is wrapped in try/catch and fails OPEN — a
// broken scriptlet must never break the page.
(function () {
  "use strict";

  // Captured before any page script or IMPL (json-prune) can wrap them.
  var nativeParse = JSON.parse;
  var nativeStringify = JSON.stringify;
  var nativeSlice = Array.prototype.slice;
  var nativeSplice = Array.prototype.splice;
  var nativeIsArray = Array.isArray;
  var nativeHasOwn = Object.prototype.hasOwnProperty;
  var nativeRAF = typeof requestAnimationFrame === "function" ? requestAnimationFrame : null;
  var nativeTimer = typeof setTimeout === "function" ? setTimeout : null;

  // ---- policy: the single source of truth (scriptlets/policy.js) -----------
  // The build inlines policy.js here; the same file is loaded by the service
  // worker (importScripts) and by the build/tests (node:vm). Names, argument
  // grammar, dictionaries, selector/attr/tag/cookie rules, protected hosts.
  /*__SCRIPTLET_POLICY__*/

  // ---- shared helpers -----------------------------------------------------

  // Turn a uBO-style needle into a RegExp. `/re/flags` → that regexp; a plain
  // string → a literal (escaped) contains-match. A leading "!" inverts and is
  // handled by callers, not here. Guarded against ReDoS: reject stacked
  // quantifiers and over-long patterns (same policy as content.js).
  function toReg(s) {
    if (s === undefined || s === null || s === "") return null;
    s = String(s);
    // Only real flags make a regex: "/api/feed" is a path, not /api/ with flags "feed".
    var m = /^\/(.+)\/([dgimsuy]*)$/.exec(s);
    if (m) {
      var body = m[1];
      // ReDoS guard: cap length, cap quantifiers (INCLUDING "?") and reject ANY
      // quantified group — (a+)+, (a|a)+, ((.)|(.))+, ((a|a)?)+, (.?){30} are
      // all catastrophic and all end a group with a quantifier. Structural
      // scans like /\([^)]*…\)/ are blind across nested ")" so we don't rely
      // on them. Rejected patterns match NOTHING (see needleMatcher).
      var q = (body.match(/[*+?]|\{\d/g) || []).length;
      // q ≤ 1: two quantifiers already allow polynomial blowup (/.*.*=/ ≈ 4s
      // on a 5k string) — parity with content.js.
      if (body.length > 200 || q > 1) return null;
      if (/\)[*+?{]/.test(body)) return null;
      try {
        return new RegExp(body, m[2].replace(/[^gimsuy]/g, ""));
      } catch (e) {
        return null;
      }
    }
    try {
      return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    } catch (e) {
      return null;
    }
  }

  // A random ReferenceError message, so page error handlers can't fingerprint us.
  function noise() {
    return "b" + (Date.now() % 1e6) + (performance.now() | 0).toString(36);
  }

  // Walk a dotted property chain to the owner of the final segment. Returns
  // { owner, prop } or null if an intermediate is missing.
  function resolve(chain) {
    var parts = chain.split(".");
    var owner = window;
    for (var i = 0; i < parts.length - 1; i++) {
      owner = owner[parts[i]];
      if (owner === null || (typeof owner !== "object" && typeof owner !== "function")) return null;
    }
    return { owner: owner, prop: parts[parts.length - 1] };
  }

  // Property paths in the uBO grammar: "a.b.0.c", plus four tokens —
  //   []   every item of an array        *    every own property of an object
  //   [-]  remove the array item whose remaining path exists
  //   {-}  remove the property whose remaining path exists
  // (`feed.edges.[-].node.sponsored_data` drops each ad edge, keeps the rest.)
  // Own properties only: a path can never walk into __proto__ or the prototype chain.
  function hasPathAt(o, parts, i) {
    if (i === parts.length) return true;
    if (o === null || typeof o !== "object") return false;
    var t = parts[i], k;
    if (t === "[]" || t === "[-]") {
      if (!nativeIsArray(o)) return false;
      for (k = 0; k < o.length; k++) if (hasPathAt(o[k], parts, i + 1)) return true;
      return false;
    }
    if (t === "*" || t === "{-}") {
      for (k in o) if (nativeHasOwn.call(o, k) && hasPathAt(o[k], parts, i + 1)) return true;
      return false;
    }
    return nativeHasOwn.call(o, t) && hasPathAt(o[t], parts, i + 1);
  }
  function findPath(obj, path) { return hasPathAt(obj, String(path).split("."), 0); }

  // Returns true when something was removed.
  function prunePathAt(o, parts, i) {
    if (o === null || typeof o !== "object") return false;
    var t = parts[i], last = i === parts.length - 1, k, hit = false;
    if (t === "[-]") {
      if (!nativeIsArray(o)) return false;
      for (k = o.length - 1; k >= 0; k--) if (hasPathAt(o[k], parts, i + 1)) { nativeSplice.call(o, k, 1); hit = true; }
      return hit;
    }
    if (t === "{-}") {
      for (k in o) if (nativeHasOwn.call(o, k) && hasPathAt(o[k], parts, i + 1)) { try { delete o[k]; hit = true; } catch (e) {} }
      return hit;
    }
    if (t === "[]") {
      if (!nativeIsArray(o)) return false;
      if (last) { hit = o.length > 0; o.length = 0; return hit; }
      for (k = 0; k < o.length; k++) if (prunePathAt(o[k], parts, i + 1)) hit = true;
      return hit;
    }
    if (t === "*") {
      for (k in o) {
        if (!nativeHasOwn.call(o, k)) continue;
        if (last) { try { delete o[k]; hit = true; } catch (e) {} } else if (prunePathAt(o[k], parts, i + 1)) hit = true;
      }
      return hit;
    }
    if (!nativeHasOwn.call(o, t)) return false;
    if (last) { try { delete o[t]; return true; } catch (e) { return false; } }
    return prunePathAt(o[t], parts, i + 1);
  }
  function deletePath(obj, path) { return prunePathAt(obj, String(path).split("."), 0); }

  // json-prune and its fetch/XHR twins share one pass: every `needle` path must be
  // present, then every `prop` path is removed. Returns true if the object changed.
  function pruneObject(obj, props, needles) {
    if (!obj || typeof obj !== "object") return false;
    for (var i = 0; i < needles.length; i++) if (!findPath(obj, needles[i])) return false;
    var hit = false;
    for (var j = 0; j < props.length; j++) if (deletePath(obj, props[j])) hit = true;
    return hit;
  }
  function words(raw) { return raw ? String(raw).split(/\s+/).filter(Boolean) : []; }

  // The call stack without our own frames (chrome-extension://…), for stack needles.
  function pageStack() {
    try {
      return String(new Error().stack || "").split("\n").filter(function (l) {
        return l.indexOf("chrome-extension://") < 0;
      }).join("\n");
    } catch (e) { return ""; }
  }

  // uBO varargs ("propsToMatch", "url:/api method:POST", "stackToMatch", "x") → object.
  function varargs(list) {
    var o = {};
    for (var i = 0; i + 1 < list.length; i += 2) o[list[i]] = list[i + 1];
    return o;
  }
  // propsToMatch for a request: bare tokens / "url:" match the URL, "name:value" an
  // init option (method:POST). Every token must match; none given = every request.
  function requestMatcher(raw) {
    var conds = words(raw).map(function (c) {
      var m = /^([a-zA-Z]+):(.*)$/.exec(c);
      if (m && m[1] !== "url" && !/^https?$/.test(m[1])) return { key: m[1], test: needleMatcher(m[2]) };
      return { key: "url", test: needleMatcher(m && m[1] === "url" ? m[2] : c) };
    });
    return function (props) {
      for (var i = 0; i < conds.length; i++) {
        var v = props[conds[i].key];
        if (v === undefined || !conds[i].test(String(v))) return false;
      }
      return true;
    };
  }
  function fetchProps(input, init) {
    var o = { url: "", method: "GET" };
    try {
      if (typeof input === "string") o.url = input;
      else if (input && typeof input === "object") { o.url = String(input.url || input.href || input); if (input.method) o.method = input.method; }
      else o.url = String(input);
      if (init && typeof init === "object") for (var k in init) if (nativeHasOwn.call(init, k) && typeof init[k] !== "object") o[k] = init[k];
    } catch (e) {}
    return o;
  }
  // A Response that looks like the original (status, headers, url, type) with a new body.
  function rebuildResponse(resp, body) {
    var out = new Response(body, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
    try {
      Object.defineProperties(out, {
        url: { value: resp.url }, redirected: { value: resp.redirected }, type: { value: resp.type },
      });
    } catch (e) {}
    return out;
  }
  // fetch() responses we may rewrite: same-origin/CORS bodies we can read (not opaque).
  function wrapFetchResponse(match, transform) {
    var origFetch = window.fetch;
    if (typeof origFetch !== "function" || typeof Response !== "function") return;
    window.fetch = cloak(function (input, init) {
      var pending = nativeReflectApply(origFetch, this, arguments);
      var wanted = false;
      try { wanted = match(fetchProps(input, init)); } catch (e) {}
      if (!wanted) return pending;
      return pending.then(function (resp) {
        if (!resp || resp.type === "opaque" || resp.bodyUsed) return resp;
        return resp.clone().text().then(function (text) {
          var out;
          try { out = transform(text, resp); } catch (e) { out = null; }
          return typeof out === "string" && out !== text ? rebuildResponse(resp, out) : resp;
        }, function () { return resp; });
      });
    }, origFetch);
  }
  // XMLHttpRequest responses we may rewrite: the page reads response/responseText
  // through our getters, which run the transform once per finished request.
  function wrapXhrResponse(match, transform) {
    var X = window.XMLHttpRequest;
    if (typeof X !== "function" || !X.prototype) return;
    var P = X.prototype, origOpen = P.open;
    var dRespText = Object.getOwnPropertyDescriptor(P, "responseText");
    var dResp = Object.getOwnPropertyDescriptor(P, "response");
    if (!dRespText || !dRespText.get || !dResp || !dResp.get) return;
    var wanted = new WeakMap(), done = new WeakMap();
    P.open = cloak(function (method, url) {
      try { if (match({ url: String(url), method: String(method || "GET") })) wanted.set(this, 1); else wanted.delete(this); } catch (e) {}
      return nativeReflectApply(origOpen, this, arguments);
    }, origOpen);
    var result = function (xhr) {
      if (done.has(xhr)) return done.get(xhr);
      var text = null;
      try {
        var type = xhr.responseType;
        if (type === "" || type === "text") text = nativeReflectApply(dRespText.get, xhr, []);
        else if (type === "json") { var obj = nativeReflectApply(dResp.get, xhr, []); text = obj == null ? null : nativeStringify(obj); }
      } catch (e) {}
      if (text === null) return null;
      var out = null;
      try { out = transform(text); } catch (e) {}
      var r = typeof out === "string" && out !== text ? { text: out, type: xhr.responseType } : null;
      done.set(xhr, r);
      return r;
    };
    var ready = function (xhr) { try { return wanted.has(xhr) && xhr.readyState === 4; } catch (e) { return false; } };
    Object.defineProperty(P, "responseText", { configurable: true, enumerable: dRespText.enumerable, get: cloak(function () {
      if (ready(this)) { var r = result(this); if (r) return r.text; }
      return nativeReflectApply(dRespText.get, this, []);
    }, dRespText.get) });
    Object.defineProperty(P, "response", { configurable: true, enumerable: dResp.enumerable, get: cloak(function () {
      if (ready(this)) { var r = result(this); if (r) { if (r.type === "json") { try { return nativeParse(r.text); } catch (e) {} } else return r.text; } }
      return nativeReflectApply(dResp.get, this, []);
    }, dResp.get) });
  }
  // A JSON text → pruned JSON text (null when it is not JSON or nothing changed).
  function pruneText(props, needles) {
    return function (text) {
      var obj;
      try { obj = nativeParse(text); } catch (e) { return null; }
      return pruneObject(obj, props, needles) ? nativeStringify(obj) : null;
    };
  }

  // Run fn now and on DOM mutations (for DOM-touching scriptlets). Mutation
  // bursts are coalesced into one pass per animation frame (setTimeout when the
  // tab is hidden and rAF is paused) using natives captured at start, so neither
  // the page nor our own timer defusers can swallow the callback.
  function onEachMutation(fn) {
    var run = function () { try { fn(); } catch (e) {} };
    var pending = false;
    var go = function () { pending = false; run(); };
    var schedule = function () {
      if (pending) return;
      pending = true;
      try {
        if (nativeRAF && document.visibilityState !== "hidden") nativeRAF.call(window, go);
        else if (nativeTimer) nativeTimer.call(window, go, 50);
        else go();
      } catch (e) { go(); }
    };
    run();
    try {
      var mo = new MutationObserver(schedule);
      var start = function () {
        if (document.documentElement) {
          mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
        }
      };
      if (document.documentElement) start();
      else document.addEventListener("DOMContentLoaded", start, { once: true });
    } catch (e) {}
  }

  // Compile a uBO needle with optional leading "!" negation into a matcher.
  // A missing/empty needle matches everything; "!" inverts the result.
  // Every native we replace is a Proxy of the native, and Function.prototype.toString
  // answers for the native: fn.toString() stays "function fetch() { [native code] }".
  // Anti-adblock scripts (YouTube's included) compare exactly that; a plain
  // replacement function gave us away on every site that checks.
  var NativeProxy = typeof Proxy === "function" ? Proxy : null;
  var nativeReflectApply = typeof Reflect === "object" && Reflect ? Reflect.apply : null;
  var cloakMap = typeof WeakMap === "function" ? new WeakMap() : null;
  var cloakedToString = false;
  function cloak(impl, orig) {
    if (!NativeProxy || !nativeReflectApply || !cloakMap || typeof orig !== "function" || typeof impl !== "function") return impl;
    try {
      if (!cloakedToString) {
        cloakedToString = true;
        var ts = Function.prototype.toString;
        var tsP = new NativeProxy(ts, { apply: function (t, self, args) {
          var o = self, n = 0;
          while (n++ < 8 && cloakMap.has(o)) o = cloakMap.get(o); // a native wrapped twice (two scriptlets) still answers as itself
          return nativeReflectApply(t, o, args);
        } });
        cloakMap.set(tsP, ts);
        Function.prototype.toString = tsP;
      }
      var p = new NativeProxy(orig, { apply: function (t, self, args) { return nativeReflectApply(impl, self, args); } });
      cloakMap.set(p, orig);
      return p;
    } catch (e) { return impl; }
  }

  function needleMatcher(raw) {
    var neg = typeof raw === "string" && raw.charAt(0) === "!";
    var body = neg ? raw.slice(1) : raw;
    var re = toReg(body);
    // A needle that was REJECTED by the ReDoS guard must match nothing —
    // never "everything" — or a bad regex would defuse every timer/listener.
    if (body && !re) return function () { return false; };
    return function (str) {
      var m = re ? re.test(str) : true;
      return neg ? !m : m;
    };
  }

  // no-setTimeout-if / no-setInterval-if share one defuser: drop calls whose
  // callback source matches `search` (and, if given, whose delay equals `delay`).
  function defuseTimer(prop, search, delay) {
    var match = needleMatcher(search);
    var range = /^(\d+)-(\d+)$/.exec(String(delay || ""));
    var wanted = !range && delay !== undefined && delay !== "" ? parseInt(delay, 10) : NaN;
    var orig = window[prop];
    if (typeof orig !== "function") return;
    window[prop] = function (fn, t) {
      try {
        var src = typeof fn === "function" ? fn.toString() : String(fn);
        var mDelay = range ? (+t >= +range[1] && +t <= +range[2]) : isNaN(wanted) || wanted === t;
        if (match(src) && mDelay) return 0;
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    window[prop] = cloak(window[prop], orig);
  }
  // DOM-touching scriptlets: apply fn to every element matching sel, now and on mutation.
  function forEachMatch(sel, fn) {
    onEachMutation(function () {
      document.querySelectorAll(sel).forEach(function (el) { try { fn(el); } catch (e) {} });
    });
  }

  // What a refused fetch()/XHR answers with: "" (default), "true" (10 random
  // characters), emptyObj/emptyArr/emptyStr, "length:a-b" (random text of that
  // length) or "war:<resource>" (a small stand-in for that resource).
  var WAR_TEXT = { "noop.json": "{}", "noop.txt": "", "noop.js": "(function(){})();", "noop.css": "", "noop.html": "<!DOCTYPE html>",
    "noop-vast2.xml": '<VAST version="2.0"></VAST>', "noop-vast3.xml": '<VAST version="3.0"></VAST>', "noop-vast4.xml": '<VAST version="4.0"></VAST>',
    "noop-vmap1.xml": '<vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap" version="1.0"></vmap:VMAP>' };
  function randomText(n) {
    var abc = "abcdefghijklmnopqrstuvwxyz0123456789", out = "";
    n = Math.min(500000, Math.max(0, n | 0));
    for (var i = 0; i < n; i++) out += abc.charAt((Math.random() * abc.length) | 0);
    return out;
  }
  function fakeBody(raw) {
    if (raw === undefined || raw === "" || raw === "emptyStr") return "";
    if (raw === "true") return randomText(10);
    if (raw === "emptyObj") return "{}";
    if (raw === "emptyArr") return "[]";
    var m = /^length:(\d+)(?:-(\d+))?$/.exec(raw);
    if (m) { var lo = +m[1], hi = m[2] ? +m[2] : lo; return randomText(lo + Math.floor(Math.random() * (Math.max(lo, hi) - lo + 1))); }
    m = /^war:([\w.-]+)$/.exec(raw);
    if (m) return nativeHasOwn.call(WAR_TEXT, m[1]) ? WAR_TEXT[m[1]] : /\.js$/.test(m[1]) ? "(function(){})();" : "";
    return "";
  }
  function fakeResponse(url, rawBody, rawType) {
    var props = {};
    if (rawType) {
      if (rawType.charAt(0) === "{") { try { props = nativeParse(rawType) || {}; } catch (e) { props = {}; } }
      else props = { type: rawType };
    }
    var r = new Response(fakeBody(rawBody), { status: 200, statusText: typeof props.statusText === "string" ? props.statusText : "OK" });
    try {
      var def = { url: { value: String(url || "") }, redirected: { value: false } };
      if (props.type) def.type = { value: String(props.type) };
      if (typeof props.ok === "boolean") def.ok = { value: props.ok };
      if (props.type === "opaque") { def.status = { value: 0 }; def.ok = { value: false }; def.statusText = { value: "" }; }
      Object.defineProperties(r, def);
    } catch (e) {}
    return r;
  }
  // nano-stb / nano-sib share one booster (see IMPL).
  function boostTimer(prop, needle, rawDelay, rawBoost) {
    var match = needleMatcher(needle || "");
    var any = rawDelay === "*";
    var wanted = any ? NaN : rawDelay === undefined || rawDelay === "" ? 1000 : parseInt(rawDelay, 10);
    var boost = parseFloat(rawBoost);
    if (!(boost > 0)) boost = 0.05;
    boost = Math.min(50, Math.max(0.02, boost));
    var orig = window[prop];
    if (typeof orig !== "function") return;
    window[prop] = cloak(function (fn, t) {
      try {
        if ((any || +t === wanted) && match(typeof fn === "function" ? fn.toString() : String(fn))) {
          var args = nativeSlice.call(arguments);
          args[1] = (+t || 0) * boost;
          return nativeReflectApply(orig, this, args);
        }
      } catch (e) {}
      return nativeReflectApply(orig, this, arguments);
    }, orig);
  }
  function setStorageItem(name, rawKey, rawValue) {
    var store = null;
    try { store = window[name]; } catch (e) { return; }
    if (!store) return;
    var key = String(rawKey).replace(/^"([\s\S]*)"$/, "$1");
    try {
      if (rawValue === "$remove$") { store.removeItem(key); return; }
      var map = { "''": "", '""': "", "emptyStr": "", "emptyObj": "{}", "emptyArr": "[]" };
      store.setItem(key, nativeHasOwn.call(map, rawValue) ? map[rawValue] : String(rawValue));
    } catch (e) {}
  }
  // The FuckAdBlock / BlockAdBlock API, answering "not detected" (nofab / nobab).
  function stubDetectors(names) {
    var Stub = function () {};
    var p = Stub.prototype;
    var later = function (fn) { if (typeof fn === "function") setTimeout(function () { try { fn(); } catch (e) {} }, 1); };
    p.setOption = function () { return this; };
    p.check = function () { return false; };
    p.emitEvent = function () { return this; };
    p.clearEvent = function () {};
    p.on = function (detected, fn) { if (!detected) later(fn); return this; };
    p.onDetected = function () { return this; };
    p.onNotDetected = function (fn) { later(fn); return this; };
    var inst = new Stub();
    names.forEach(function (n) {
      var lower = n.charAt(0).toLowerCase() + n.slice(1);
      [[n, Stub], [lower, inst]].forEach(function (pair) {
        try {
          Object.defineProperty(window, pair[0], { get: function () { return pair[1]; }, set: function () {}, configurable: false });
        } catch (e) {}
      });
    });
  }
  // xml-prune: CSS selector, or xpath(expression) (attributes included).
  function xmlSelect(doc, sel) {
    var m = /^xpath\(([\s\S]+)\)$/.exec(String(sel).trim());
    if (!m) { try { return nativeSlice.call(doc.querySelectorAll(sel)); } catch (e) { return []; } }
    var out = [];
    try {
      var r = doc.evaluate(m[1], doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (var i = 0; i < r.snapshotLength; i++) out.push(r.snapshotItem(i));
    } catch (e) {}
    return out;
  }

  // ---- scriptlet implementations -----------------------------------------
  // Each is keyed by its canonical name (the build maps uBO aliases to these).

  var IMPL = {
    // set-constant(chain, value): pin window.<chain> to a constant from the
    // value dictionary; later writes are ignored (or preserved if identical).
    "set-constant": function (chain, rawValue, runAtKey, runAt) {
      var t = rawValue === undefined ? { ok: true, v: undefined } : SA_POLICY.tokenValue(rawValue);
      if (!t.ok) return;
      var value = t.v;
      var parts = chain.split(".");
      // "runAt, interactive|complete": pin it once the document has got that far.
      if (runAtKey === "runAt" && (runAt === "interactive" || runAt === "complete" || runAt === "end")) {
        var later = function () { IMPL["set-constant"](chain, rawValue); };
        if (document.readyState === "loading" || (runAt === "complete" && document.readyState !== "complete")) {
          try { (runAt === "complete" ? window : document).addEventListener(runAt === "complete" ? "load" : "DOMContentLoaded", later, { once: true }); } catch (e) {}
          return;
        }
      }
      (function define(owner, i) {
        var prop = parts[i];
        if (i === parts.length - 1) {
          try {
            Object.defineProperty(owner, prop, {
              get: function () { return value; },
              set: function (v) { if (v === value) value = v; },
              configurable: false,
            });
          } catch (e) {}
          return;
        }
        var next;
        try { next = owner[prop]; } catch (e) {}
        if (next && (typeof next === "object" || typeof next === "function")) {
          define(next, i + 1);
          return;
        }
        var proxy = {};
        try {
          Object.defineProperty(owner, prop, {
            get: function () { return proxy; },
            set: function (v) { if (v && typeof v === "object") proxy = v; },
            configurable: true,
          });
        } catch (e) { return; }
        define(proxy, i + 1);
      })(window, 0);
    },

    // abort-on-property-read(chain): throw when the property is read.
    "abort-on-property-read": function (chain) {
      var r = resolve(chain);
      if (!r) return;
      var msg = noise();
      try {
        Object.defineProperty(r.owner, r.prop, {
          get: function () { throw new ReferenceError(msg); },
          set: function () {},
          configurable: false,
        });
      } catch (e) {}
    },

    // abort-on-property-write(chain): throw when the property is written.
    "abort-on-property-write": function (chain) {
      var r = resolve(chain);
      if (!r) return;
      var msg = noise();
      var val;
      try { val = r.owner[r.prop]; } catch (e) {}
      try {
        Object.defineProperty(r.owner, r.prop, {
          get: function () { return val; },
          set: function () { throw new ReferenceError(msg); },
          configurable: false,
        });
      } catch (e) {}
    },

    // abort-current-script(chain, search): throw when a script that reads
    // window.<chain> has inline text matching `search` — kills the exact inline
    // detector without touching legitimate readers.
    "abort-current-script": function (chain, search) {
      var r = resolve(chain);
      if (!r) return;
      var match = needleMatcher(search);
      var val;
      try { val = r.owner[r.prop]; } catch (e) {}
      var msg = noise();
      try {
        Object.defineProperty(r.owner, r.prop, {
          get: function () {
            var s = document.currentScript;
            if (s && s.tagName === "SCRIPT" && match(s.textContent || "")) {
              throw new ReferenceError(msg);
            }
            return val;
          },
          set: function (v) { val = v; },
          configurable: true,
        });
      } catch (e) {}
    },

    // no-setTimeout-if(search, delay): drop setTimeout calls whose callback
    // source matches `search` (and, if given, whose delay equals `delay`).
    // Leading "!" on search inverts the match.
    "no-setTimeout-if": function (search, delay) { defuseTimer("setTimeout", search, delay); },

    // no-setInterval-if(search, delay): same as above for setInterval.
    "no-setInterval-if": function (search, delay) { defuseTimer("setInterval", search, delay); },

    // addEventListener-defuser(typeSearch, funcSearch): swallow addEventListener
    // registrations whose type and/or listener source match.
    "addEventListener-defuser": function (typeSearch, funcSearch) {
      var mType = needleMatcher(typeSearch);
      var mFunc = needleMatcher(funcSearch);
      var proto = window.EventTarget && EventTarget.prototype;
      if (!proto || typeof proto.addEventListener !== "function") return;
      var orig = proto.addEventListener;
      proto.addEventListener = function (type, listener) {
        try {
          var ls = typeof listener === "function" ? listener.toString()
            : listener && typeof listener.handleEvent === "function" ? listener.handleEvent.toString()
            : String(listener);
          if (mType(String(type)) && mFunc(ls)) return;
        } catch (e) {}
        return orig.apply(this, arguments);
      };
      proto.addEventListener = cloak(proto.addEventListener, orig);
    },

    // json-prune(props, needle, stack): delete `props` (uBO path grammar, see
    // prunePathAt) from every JSON.parse / Response.json result, but only when all
    // `needle` paths are present and, if given, the caller's stack matches `stack`.
    "json-prune": function (rawProps, rawNeedle, rawStack) {
      var props = words(rawProps);
      var needles = words(rawNeedle);
      if (!props.length) return;
      var stackOk = rawStack ? needleMatcher(rawStack) : null;
      var prune = function (obj) {
        try {
          if (obj && typeof obj === "object" && (!stackOk || stackOk(pageStack()))) pruneObject(obj, props, needles);
        } catch (e) {}
        return obj;
      };
      var origParse = JSON.parse;
      JSON.parse = cloak(function () { return prune(origParse.apply(this, arguments)); }, origParse);
      try {
        var origJson = Response.prototype.json;
        Response.prototype.json = cloak(function () {
          return origJson.apply(this, arguments).then(prune);
        }, origJson);
      } catch (e) {}
    },

    // no-fetch-if(conditions): resolve matching fetch() calls with an empty 200
    // instead of hitting the network. Conditions are space-separated URL
    // needles; `method:GET` matches the verb; `*` matches everything.
    "no-fetch-if": function (rawCond, rawBody, rawType) {
      var conds = rawCond ? String(rawCond).split(/\s+/).filter(Boolean) : [];
      var origFetch = window.fetch;
      if (typeof origFetch !== "function" || typeof Response !== "function") return;
      window.fetch = function (input, init) {
        try {
          var url = typeof input === "string" ? input : input && input.url ? input.url : "";
          var method = (init && init.method) || (input && input.method) || "GET";
          var match = conds.length === 0 || conds.every(function (c) {
            if (c === "*") return true;
            if (c.indexOf("method:") === 0) return String(method).toLowerCase() === c.slice(7).toLowerCase();
            var re = toReg(c);
            return re ? re.test(url) : String(url).indexOf(c) >= 0;
          });
          if (match) return Promise.resolve(fakeResponse(url, rawBody, rawType));
        } catch (e) {}
        return origFetch.apply(this, arguments);
      };
      window.fetch = cloak(window.fetch, origFetch);
    },

    // no-xhr-if(cond): the XMLHttpRequest twin of no-fetch-if — a matching request
    // (URL needle / "method:X" / "*") is never sent and completes as an empty 200,
    // which is what anti-adblock probes ("can I load ads.js?") are told.
    "no-xhr-if": function (rawCond, rawBody) {
      var conds = rawCond ? String(rawCond).split(/\s+/).filter(Boolean) : [];
      var X = window.XMLHttpRequest;
      if (typeof X !== "function" || !X.prototype) return;
      var P = X.prototype, origOpen = P.open, origSend = P.send;
      var held = new WeakMap();
      P.open = function (method, url) {
        try {
          var u = String(url);
          var match = conds.length === 0 || conds.every(function (c) {
            if (c === "*") return true;
            if (c.indexOf("method:") === 0) return String(method).toLowerCase() === c.slice(7).toLowerCase();
            var re = toReg(c);
            return re ? re.test(u) : u.indexOf(c) >= 0;
          });
          if (match) held.set(this, u); else held.delete(this);
        } catch (e) {}
        return origOpen.apply(this, arguments);
      };
      P.open = cloak(P.open, origOpen);
      P.send = function () {
        if (!held.has(this)) return origSend.apply(this, arguments);
        var xhr = this, u = held.get(this);
        try {
          var body = fakeBody(rawBody);
          var fixed = { readyState: 4, status: 200, statusText: "OK", response: body, responseText: body, responseURL: u };
          for (var k in fixed) Object.defineProperty(xhr, k, { value: fixed[k], configurable: true });
          setTimeout(function () {
            try {
              xhr.dispatchEvent(new Event("readystatechange"));
              xhr.dispatchEvent(new ProgressEvent("load"));
              xhr.dispatchEvent(new ProgressEvent("loadend"));
            } catch (e) {}
          }, 1);
        } catch (e) {
          return origSend.apply(this, arguments);
        }
      };
      P.send = cloak(P.send, origSend);
    },

    // no-window-open-if(search): block window.open() for matching URLs (leading
    // "!" inverts). Neutralises pop-under / pop-up ad launchers.
    "no-window-open-if": function (rawSearch, rawDelay, rawDecoy) {
      // needleMatcher, not a hand-rolled copy: a needle REJECTED by the ReDoS
      // guard must match nothing — a copy that mapped null→"match all" would
      // block every window.open on the host.
      var match = needleMatcher(rawSearch);
      var orig = window.open;
      if (typeof orig !== "function") return;
      // (needle, seconds[, "obj"]): some launchers treat `null` as "a blocker is here"
      // and retry or nag; hand them an invisible blank frame's window that goes away
      // after `seconds` — a window that never shows anything.
      var decoySeconds = rawDelay !== undefined && rawDelay !== "" ? parseInt(rawDelay, 10) : NaN;
      var decoy = function () {
        if (isNaN(decoySeconds)) return null;
        try {
          var el = document.createElement(rawDecoy === "obj" ? "object" : "iframe");
          if (rawDecoy === "obj") el.setAttribute("data", "about:blank"); else el.setAttribute("src", "about:blank");
          el.style.setProperty("display", "none", "important");
          (document.body || document.documentElement).appendChild(el);
          var w = el.contentWindow;
          if (decoySeconds > 0) setTimeout(function () { try { el.remove(); } catch (e) {} }, decoySeconds * 1000);
          return w || null;
        } catch (e) { return null; }
      };
      window.open = function (url) {
        try {
          var all = nativeSlice.call(arguments).map(String).join(" ");
          if (match(all) || match(String(url || ""))) return decoy();
        } catch (e) {}
        return orig.apply(this, arguments);
      };
      window.open = cloak(window.open, orig);
    },

    // remove-attr(attrs, selector): strip the given attributes (space/comma/pipe
    // separated) from matching elements, now and on mutation.
    "remove-attr": function (rawAttrs, selector) {
      var attrs = String(rawAttrs || "").split(/[\s,|]+/).filter(Boolean);
      if (!attrs.length) return;
      forEachMatch(selector || "[" + attrs.join("],[") + "]", function (el) {
        attrs.forEach(function (a) { el.removeAttribute(a); });
      });
    },

    // remove-class(classes, selector): strip the given classes from matching
    // elements, now and on mutation.
    "remove-class": function (rawClasses, selector) {
      var classes = String(rawClasses || "").split(/[\s,|]+/).filter(Boolean);
      if (!classes.length) return;
      forEachMatch(selector || "." + classes.map(function (c) { return CSS.escape(c); }).join(",."), function (el) {
        classes.forEach(function (c) { el.classList.remove(c); });
      });
    },

    // href-sanitizer(selector, source): rewrite tracking/redirect links to
    // their real destination. source = "text" (default: the link's visible URL
    // text), "?param" (a query parameter of the href) or "[attr]" (another
    // attribute). Only http(s) targets are accepted, so a link can never be
    // pointed at javascript:/data: — this cleans links, it cannot inject them.
    "href-sanitizer": function (selector, source) {
      if (!selector) return;
      var src = source || "text";
      forEachMatch(selector, function (a) {
        var href = a.getAttribute("href") || "";
        var target = "";
        if (src === "text") target = (a.textContent || "").trim();
        else if (src.charAt(0) === "?") target = new URL(href, location.href).searchParams.get(src.slice(1)) || "";
        else if (src.charAt(0) === "[" && src.slice(-1) === "]") target = a.getAttribute(src.slice(1, -1)) || "";
        if (/^https?:\/\/[^\s"'<>]+$/.test(target) && target !== href) a.setAttribute("href", target);
      });
    },

    // remove-node-text(nodeName, search): blank the text of matching nodes
    // (e.g. "script" + a needle) as they appear. Best-effort in Chromium:
    // parser-inserted inline scripts run before mutation records are
    // delivered, so it is most effective for dynamically inserted nodes and
    // non-script text. `search` is required (an empty needle would blank all).
    "remove-node-text": function (nodeName, search) {
      if (!nodeName || !search) return;
      var tag = String(nodeName).toLowerCase();
      var match = needleMatcher(search);
      forEachMatch(tag, function (n) {
        if (n.nodeType !== 1 || String(n.tagName).toLowerCase() !== tag) return;
        if (n.textContent && match(n.textContent)) n.textContent = "";
      });
    },

    // nowebrtc(): block RTCPeerConnection in this frame (stops WebRTC-based
    // local-IP leaks / fingerprinting). Directive-scoped — only where listed,
    // since it also disables legitimate calls on that page.
    "nowebrtc": function () {
      ["RTCPeerConnection", "webkitRTCPeerConnection"].forEach(function (n) {
        try {
          if (!(n in window)) return;
          var blocked = function () { throw new Error("RTCPeerConnection is blocked"); };
          Object.defineProperty(window, n, {
            get: function () { return blocked; },
            set: function () {},
            configurable: false,
          });
        } catch (e) {}
      });
    },

    // abort-on-stack-trace(chain, needle): throw when window.<chain> is read or
    // written from a call stack matching `needle` (the caller's script URL /
    // function name) — targets one detector script without touching others.
    "abort-on-stack-trace": function (chain, needle) {
      var r = resolve(chain);
      if (!r || !needle) return;
      var match = needleMatcher(needle);
      var val;
      try { val = r.owner[r.prop]; } catch (e) {}
      var msg = noise();
      var check = function () {
        var st = "";
        try {
          // Drop our own frames (chrome-extension://…) so a needle can never
          // match the engine itself and fire on every access.
          st = String(new Error().stack || "").split("\n").filter(function (l) {
            return l.indexOf("chrome-extension://") < 0;
          }).join("\n");
        } catch (e) {}
        if (match(st)) throw new ReferenceError(msg);
      };
      try {
        Object.defineProperty(r.owner, r.prop, {
          get: function () { check(); return val; },
          set: function (v) { check(); val = v; },
          configurable: true,
        });
      } catch (e) {}
    },

    // set-cookie(name, value): set a first-party cookie ONLY if absent, with the
    // value restricted to a fixed consent-style dictionary (true/false/accept/
    // dismiss/…) or a small integer — used to pre-answer consent walls. Never
    // overwrites an existing cookie (no session clobbering), path=/ only.
    "set-cookie": function (name, value) {
      if (!name || !SA_POLICY.COOKIE_NAME.test(String(name)) || SA_POLICY.COOKIE_NAME_DENY.test(String(name)) || !SA_POLICY.cookieValueOk(value)) return;
      try {
        var present = String(document.cookie).split(/;\s*/).some(function (c) {
          return c.indexOf(name + "=") === 0;
        });
        if (present) return;
        document.cookie = name + "=" + encodeURIComponent(String(value)) +
          "; path=/; max-age=31536000; SameSite=Lax";
      } catch (e) {}
    },

    // remove-cookie(needle): expire first-party cookies whose NAME matches the
    // needle (now + at DOMContentLoaded), on every domain level. Baked-list
    // only — the live channel refuses it (it can log a user out of a site).
    "remove-cookie": function (needle, whenKey, whenList) {
      if (!needle) return;
      var match = needleMatcher(needle);
      var run = function () {
        try {
          var host = location.hostname;
          var parts = host.split(".");
          var exp = "; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; path=/";
          String(document.cookie).split(/;\s*/).forEach(function (c) {
            var i = c.indexOf("=");
            var n = i < 0 ? c : c.slice(0, i);
            if (!n || !match(n)) return;
            document.cookie = n + "=" + exp;
            for (var k = 0; k < parts.length - 1; k++) {
              var d = nativeSlice.call(parts, k).join(".");
              document.cookie = n + "=" + exp + "; domain=" + d;
              document.cookie = n + "=" + exp + "; domain=." + d;
            }
          });
        } catch (e) {}
      };
      run();
      try { document.addEventListener("DOMContentLoaded", run, { once: true }); } catch (e) {}
      // ("when", "scroll keydown"): also shortly after the visitor scrolls / types / clicks.
      if (whenKey === "when" && whenList) {
        var t = 0, later = function () { if (t) return; t = setTimeout(function () { t = 0; run(); }, 500); };
        String(whenList).split(/\s+/).forEach(function (ev) {
          try {
            if (ev === "load") window.addEventListener("load", run, { once: true });
            else if (/^(scroll|keydown|click)$/.test(ev)) window.addEventListener(ev, later, { passive: true, capture: true });
          } catch (e) {}
        });
      }
    },

    // ---- 5.5.0: the uBO routines the bundled lists use most ------------------

    // json-prune-fetch-response(props, needles, "propsToMatch", "url:/api …",
    // "stackToMatch", "needle"): json-prune for the JSON body of matching fetch()
    // responses — before the page reads it, without touching anything else.
    "json-prune-fetch-response": function (rawProps, rawNeedle) {
      var o = varargs(nativeSlice.call(arguments, 2));
      var props = words(rawProps), needles = words(rawNeedle);
      if (!props.length) return;
      var req = requestMatcher(o.propsToMatch), st = o.stackToMatch ? needleMatcher(o.stackToMatch) : null;
      wrapFetchResponse(function (p) { return req(p) && (!st || st(pageStack())); }, pruneText(props, needles));
    },

    // json-prune-xhr-response(...): the same for XMLHttpRequest responses.
    "json-prune-xhr-response": function (rawProps, rawNeedle) {
      var o = varargs(nativeSlice.call(arguments, 2));
      var props = words(rawProps), needles = words(rawNeedle);
      if (!props.length) return;
      var req = requestMatcher(o.propsToMatch), st = o.stackToMatch ? needleMatcher(o.stackToMatch) : null;
      wrapXhrResponse(function (p) { return req(p) && (!st || st(pageStack())); }, pruneText(props, needles));
    },

    // noeval-if(needle): code strings handed to window.eval that match the needle
    // are not run (anti-adblock and pop-up loaders that unpack themselves that way).
    "noeval-if": function (needle) {
      var match = needleMatcher(needle);
      var orig = window.eval;
      if (typeof orig !== "function") return;
      window.eval = cloak(function (code) {
        try { if (match(String(code))) return undefined; } catch (e) {}
        return nativeReflectApply(orig, this, arguments);
      }, orig);
    },

    // noeval(): nothing handed to window.eval runs on this site (listed sites only).
    "noeval": function () {
      var orig = window.eval;
      if (typeof orig !== "function") return;
      window.eval = cloak(function () { return undefined; }, orig);
    },

    // nano-stb(needle, delay, boost) / nano-sib(...): matching timers (callback
    // source ~ needle, delay = `delay` ms, default 1000, "*" = any) fire `boost`
    // times their delay (default 0.05 = 20× sooner; 0.02–50) — the "wait 30
    // seconds" countdowns in front of a download.
    "nano-stb": function (needle, delay, boost) { boostTimer("setTimeout", needle, delay, boost); },
    "nano-sib": function (needle, delay, boost) { boostTimer("setInterval", needle, delay, boost); },

    // set-local-storage-item(key, value) / set-session-storage-item(…): write an
    // inert value from the policy dictionary ("$remove$" deletes the key) — e.g. the
    // "ad blocker warning already shown" flag a site keeps for itself.
    "set-local-storage-item": function (key, value) { setStorageItem("localStorage", key, value); },
    "set-session-storage-item": function (key, value) { setStorageItem("sessionStorage", key, value); },

    // nofab(): FuckAdBlock / BlockAdBlock / SniffAdBlock (the open-source detector
    // libraries, both capitalisations) answer "no ad blocker" — their onNotDetected
    // callbacks run, onDetected ones never do.
    "nofab": function () { stubDetectors(["FuckAdBlock", "BlockAdBlock", "SniffAdBlock"]); },

    // nobab(): the obfuscated BlockAdBlock service — the same stubs, plus its
    // payload (recognisable by the library's bait classes) is never unpacked.
    "nobab": function () {
      stubDetectors(["BlockAdBlock"]);
      IMPL["noeval-if"]("/pub_300x250|text-ad-links|BlockAdBlock|blockAdBlock/");
    },

    // popads-dummy(): the PopAds launcher finds its globals already taken (inert objects).
    "popads-dummy": function () {
      ["PopAds", "popns"].forEach(function (n) {
        try { delete window[n]; Object.defineProperty(window, n, { value: {}, writable: false, configurable: false }); } catch (e) {}
      });
    },

    // popads.net(): the launcher's own assignment throws (abort-on-property-write).
    "popads.net": function () {
      IMPL["abort-on-property-write"]("PopAds");
      IMPL["abort-on-property-write"]("popns");
    },

    // xml-prune(selector, documentSelector, url): remove XML nodes (CSS selector, or
    // xpath(…), attributes included) from matching fetch/XHR responses — the ad
    // periods of a DASH manifest, the ad of a VAST answer — before the player reads them.
    "xml-prune": function (selector, docSel, url) {
      if (!selector || typeof DOMParser !== "function" || typeof XMLSerializer !== "function") return;
      var urlOk = url ? needleMatcher(url) : function () { return true; };
      var transform = function (text) {
        if (!/^\s*</.test(text)) return null;
        var doc = new DOMParser().parseFromString(text, "text/xml");
        if (!doc || doc.getElementsByTagName("parsererror").length) return null;
        if (docSel && !xmlSelect(doc, docSel).length) return null;
        var nodes = xmlSelect(doc, selector);
        if (!nodes.length) return null;
        nodes.forEach(function (n) {
          try {
            if (n.nodeType === 2) { if (n.ownerElement) n.ownerElement.removeAttributeNode(n); }
            else if (n.parentNode) n.parentNode.removeChild(n);
          } catch (e) {}
        });
        return new XMLSerializer().serializeToString(doc);
      };
      var m = function (p) { return urlOk(p.url); };
      wrapFetchResponse(m, transform);
      wrapXhrResponse(m, transform);
    },

    // m3u-prune(pattern, url): drop ad segments from matching HLS playlists (.m3u8):
    // a line that matches goes, with the #EXTINF that describes it. A /…/m regex is
    // run over the whole text instead (blocks between two #EXT-X-DISCONTINUITY).
    "m3u-prune": function (pattern, url) {
      if (!pattern) return;
      var urlOk = url ? needleMatcher(url) : function () { return true; };
      var m = /^\/([\s\S]+)\/([dgimsuy]*)$/.exec(pattern), re = null, whole = false;
      if (m) {
        try { re = new RegExp(m[1], m[2].replace(/[^gimsuy]/g, "")); } catch (e) { return; }
        whole = m[2].indexOf("m") >= 0;
      }
      var transform = function (text) {
        if (!/^\s*#EXTM3U/.test(text)) return null;
        if (re && whole) return text.replace(re.global ? re : new RegExp(re.source, re.flags + "g"), "");
        var lines = text.split("\n"), out = [];
        for (var i = 0; i < lines.length; i++) {
          var l = lines[i];
          if (!(re ? re.test(l) : l.indexOf(pattern) >= 0)) { out.push(l); continue; }
          if (l.charAt(0) === "#") {
            if (/^#EXTINF/.test(l) && i + 1 < lines.length && lines[i + 1].charAt(0) !== "#") i++;
          } else if (out.length && /^#EXTINF/.test(out[out.length - 1])) out.pop();
        }
        return out.join("\n");
      };
      var mm = function (p) { return urlOk(p.url); };
      wrapFetchResponse(mm, transform);
      wrapXhrResponse(mm, transform);
    },

    // refresh-defuser(seconds): a <meta http-equiv="refresh"> (to an ad, a pop-under
    // or a "please disable your blocker" page) is stopped just before it fires.
    "refresh-defuser": function (rawSec) {
      var go = function () {
        var meta = document.querySelector('meta[http-equiv="refresh" i][content]');
        if (!meta) return;
        var sec = rawSec !== undefined && rawSec !== "" ? parseFloat(rawSec) : parseFloat(meta.getAttribute("content"));
        if (!(sec >= 0)) sec = 0;
        setTimeout(function () { try { window.stop(); } catch (e) {} }, Math.max(0, sec * 1000 - 1));
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
      else go();
    },

    // set-attr(selector, attribute, value): set an attribute to an inert value from
    // the policy dictionary, or to a copy of another of its attributes ("[data-src]"
    // — what a lazy loader left out). Never an event handler, never srcdoc.
    "set-attr": function (selector, attr, rawValue) {
      if (!selector || !attr) return;
      var v = rawValue === undefined || rawValue === "''" ? "" : String(rawValue);
      var copy = /^\[([a-zA-Z][\w:-]*)\]$/.exec(v);
      forEachMatch(selector, function (el) {
        var nv = copy ? el.getAttribute(copy[1]) : v;
        if (nv !== null && el.getAttribute(attr) !== nv) el.setAttribute(attr, nv);
      });
    },

    // no-requestAnimationFrame-if(needle): drop animation-frame callbacks whose
    // source matches (a leading "!" inverts) — loops that rebuild an ad or a wall.
    "no-requestAnimationFrame-if": function (needle) {
      var match = needleMatcher(needle);
      var orig = window.requestAnimationFrame;
      if (typeof orig !== "function") return;
      window.requestAnimationFrame = cloak(function (fn) {
        try { if (match(typeof fn === "function" ? fn.toString() : String(fn))) return 0; } catch (e) {}
        return nativeReflectApply(orig, this, arguments);
      }, orig);
    },

    // prevent-innerHTML(selector, pattern): an innerHTML assignment to a matching
    // element (e.g. a <script> an ad loader fills in) whose value matches is ignored.
    "prevent-innerHTML": function (selector, pattern) {
      var match = needleMatcher(pattern || "");
      var d = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
      if (!d || !d.set) return;
      var origSet = d.set;
      try {
        Object.defineProperty(Element.prototype, "innerHTML", {
          configurable: true, enumerable: d.enumerable, get: d.get,
          set: cloak(function (v) {
            try { if ((!selector || this.matches(selector)) && match(String(v))) return; } catch (e) {}
            return nativeReflectApply(origSet, this, arguments);
          }, origSet),
        });
      } catch (e) {}
    },

    // window.name-defuser(): a top page starts with an empty window.name (some
    // pop-under scripts pass state through it between pages).
    "window.name-defuser": function () {
      try { if (window === window.top) window.name = ""; } catch (e) {}
    },

    // alert-buster(): alert() boxes ("disable your ad blocker!") go to the console.
    "alert-buster": function () {
      var orig = window.alert;
      if (typeof orig !== "function") return;
      window.alert = cloak(function (msg) { try { console.info(String(msg)); } catch (e) {} }, orig);
    },
  };

  // ---- per-site directive map (baked at build time) -----------------------
  // Shape: { "": [[name, ...args]], "host.tld": [[name, ...args]] }. The ""
  // key holds global directives that run on every page.
  var MAP = /*__SCRIPTLET_MAP__*/{};
  // uBlock Origin directives for THIS site come from a chunk script (scriptlets/
  // ubo/cNN.js, DATA baked and validated at build time) that the service worker
  // registers just before this file for that chunk's hosts — same registration,
  // guaranteed order. Picked up and removed in this tick, before any page script
  // exists; each entry is re-checked against the build profile of the policy.
  var EXTRA = null;
  // uBO "entity" directives (example.* = example on any public suffix) come from
  // scriptlets/ubo/entities.js, which the manifest injects before this file only
  // where its globs match; the real hostname decides below (entityKeys).
  var ENT = null;
  try {
    var chunkKey = "__tbabScriptletChunk";
    var chunkDesc = Object.getOwnPropertyDescriptor(document, chunkKey);
    if (chunkDesc && chunkDesc.value && typeof chunkDesc.value === "object") EXTRA = chunkDesc.value;
    delete document[chunkKey];
    var entKey = "__tbabScriptletEntities";
    var entDesc = Object.getOwnPropertyDescriptor(document, entKey);
    if (entDesc && entDesc.value && typeof entDesc.value === "object") ENT = entDesc.value;
    delete document[entKey];
  } catch (e) {}
  // EasyList $popup domains (baked by the build): popunder/popup launchers.
  var POPUP_HOSTS = /*__POPUP_HOSTS__*/[];

  // ---- bootstrap ----------------------------------------------------------

  function hostChain() {
    var host = "";
    try { host = location.hostname.replace(/^www\./, ""); } catch (e) {}
    var chain = [""]; // global bucket always runs
    if (host) {
      var parts = host.split(".");
      // nativeSlice: a page-replaced Array.prototype.slice must not corrupt the
      // host chain (it would silently drop every baked directive for this frame).
      for (var i = 0; i < parts.length - 1; i++) chain.push(nativeSlice.call(parts, i).join("."));
    }
    return chain;
  }

  // "www.example.co.uk" → example.*, www.example.*, example.co.* … — every way to
  // split off a public suffix, without a suffix list (a key that is not a real
  // entity simply never exists in the data).
  function entityKeys() {
    var host = "";
    try { host = location.hostname; } catch (e) {}
    var parts = host ? host.split(".") : [], out = [];
    for (var i = 0; i < parts.length - 1; i++) {
      for (var j = i; j < parts.length - 1; j++) out.push(nativeSlice.call(parts, i, j + 1).join(".") + ".*");
    }
    return out;
  }

  function runDirective(d) {
    if (!nativeIsArray(d) || !d.length) return;
    var name = d[0];
    if (typeof name !== "string" || !nativeHasOwn.call(IMPL, name)) return;
    var fn = IMPL[name];
    if (typeof fn !== "function") return;
    try { fn.apply(null, nativeSlice.call(d, 1)); } catch (e) {}
  }

  // ---- bootstrap: baked directives — LAST, once every helper above is
  // initialised (var hoisting only hoists declarations; a helper used by an
  // IMPL but assigned later would be undefined here). Same synchronous tick.
  try {
    var chain = hostChain();
    var ekeys = entityKeys();
    // uBO exceptions (["#@", name, …args]) anywhere on the host chain (or under one
    // of this host's entity keys) cancel that directive for this page, including one
    // inherited from a parent domain or an entity.
    var skip = Object.create(null);
    var collect = function (src, keys) {
      for (var k = 0; src && k < keys.length; k++) {
        var ex = keys[k] && src[keys[k]];
        if (ex && nativeIsArray(ex)) for (var y = 0; y < ex.length; y++) {
          if (nativeIsArray(ex[y]) && ex[y][0] === "#@") skip[nativeSlice.call(ex[y], 1).join("\u0001")] = 1;
        }
      }
    };
    collect(MAP, chain);
    collect(MAP, ekeys);
    collect(EXTRA, chain);
    collect(ENT, ekeys);
    var runData = function (list) {
      if (!list || !nativeIsArray(list)) return;
      for (var x = 0; x < list.length; x++) {
        var ed = list[x];
        if (!nativeIsArray(ed) || !ed.length || ed[0] === "#@" || skip[ed.join("\u0001")]) continue;
        if (SA_POLICY.validateDirective(ed[0], nativeSlice.call(ed, 1), false)) runDirective(ed);
      }
    };
    for (var i = 0; i < chain.length; i++) {
      runData(MAP[chain[i]]);
      if (EXTRA && chain[i]) runData(EXTRA[chain[i]]);
    }
    for (var e2 = 0; e2 < ekeys.length; e2++) {
      runData(MAP[ekeys[e2]]);
      if (ENT) runData(ENT[ekeys[e2]]);
    }
  } catch (e) {}
  // ---- popup / popunder blocker ------------------------------------------
  // window.open() to a known popup-ad host (EasyList $popup — the one class DNR
  // cannot see) is refused. Same-host opens are always allowed (a site's own
  // flows), only http(s) targets are judged, and any parse error falls through.
  // Runs in the page's own frame with the page's privileges: no escalation.
  try {
    if (POPUP_HOSTS.length && typeof window.open === "function") {
      var popupSet = Object.create(null);
      for (var q = 0; q < POPUP_HOSTS.length; q++) popupSet[POPUP_HOSTS[q]] = 1;
      var isPopupHost = function (h) {
        var parts = h.split(".");
        for (var s = 0; s < parts.length - 1; s++) if (popupSet[nativeSlice.call(parts, s).join(".")]) return true;
        return false;
      };
      var nativeOpen = window.open;
      window.open = function (url) {
        try {
          var u = new URL(String(url || ""), location.href);
          if ((u.protocol === "http:" || u.protocol === "https:") && u.hostname !== location.hostname &&
              isPopupHost(u.hostname.toLowerCase())) return null;
        } catch (e) {}
        return nativeOpen.apply(this, arguments);
      };
      window.open = cloak(window.open, nativeOpen);
    }
  } catch (e) {}
})();
