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
  var nativeIsArray = Array.isArray;
  var nativeHasOwn = Object.prototype.hasOwnProperty;

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
    var m = /^\/(.+)\/([a-z]*)$/.exec(s);
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

  function findPath(obj, path) {
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || typeof cur !== "object") return false;
      cur = cur[parts[i]];
      if (cur === undefined) return false;
    }
    return true;
  }

  function deletePath(obj, path) {
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur === null || typeof cur !== "object") return;
      cur = cur[parts[i]];
    }
    if (cur && typeof cur === "object") { try { delete cur[parts[parts.length - 1]]; } catch (e) {} }
  }

  // Run fn now and on every DOM mutation (for DOM-touching scriptlets).
  function onEachMutation(fn) {
    var run = function () { try { fn(); } catch (e) {} };
    run();
    try {
      var mo = new MutationObserver(run);
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

  // ---- scriptlet implementations -----------------------------------------
  // Each is keyed by its canonical name (the build maps uBO aliases to these).

  var IMPL = {
    // set-constant(chain, value): pin window.<chain> to a constant from the
    // value dictionary; later writes are ignored (or preserved if identical).
    "set-constant": function (chain, rawValue) {
      var t = SA_POLICY.tokenValue(rawValue);
      if (!t.ok) return;
      var value = t.v;
      var parts = chain.split(".");
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
    "no-setTimeout-if": function (search, delay) {
      var match = needleMatcher(search);
      var wanted = delay !== undefined && delay !== "" ? parseInt(delay, 10) : NaN;
      var orig = window.setTimeout;
      if (typeof orig !== "function") return;
      window.setTimeout = function (fn, t) {
        try {
          var src = typeof fn === "function" ? fn.toString() : String(fn);
          var mDelay = isNaN(wanted) || wanted === t;
          if (match(src) && mDelay) return 0;
        } catch (e) {}
        return orig.apply(this, arguments);
      };
    },

    // no-setInterval-if(search, delay): same as above for setInterval.
    "no-setInterval-if": function (search, delay) {
      var match = needleMatcher(search);
      var wanted = delay !== undefined && delay !== "" ? parseInt(delay, 10) : NaN;
      var orig = window.setInterval;
      if (typeof orig !== "function") return;
      window.setInterval = function (fn, t) {
        try {
          var src = typeof fn === "function" ? fn.toString() : String(fn);
          var mDelay = isNaN(wanted) || wanted === t;
          if (match(src) && mDelay) return 0;
        } catch (e) {}
        return orig.apply(this, arguments);
      };
    },

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
    },

    // json-prune(props, needle): delete dotted `props` from every JSON.parse /
    // Response.json result, but only when all `needle` paths are present.
    "json-prune": function (rawProps, rawNeedle) {
      var props = rawProps ? String(rawProps).split(/\s+/).filter(Boolean) : [];
      var needles = rawNeedle ? String(rawNeedle).split(/\s+/).filter(Boolean) : [];
      if (!props.length) return;
      var prune = function (obj) {
        try {
          if (!obj || typeof obj !== "object") return obj;
          var ok = needles.length === 0 || needles.every(function (n) { return findPath(obj, n); });
          if (ok) props.forEach(function (p) { deletePath(obj, p); });
        } catch (e) {}
        return obj;
      };
      var origParse = JSON.parse;
      JSON.parse = function () { return prune(origParse.apply(this, arguments)); };
      try {
        var origJson = Response.prototype.json;
        Response.prototype.json = function () {
          return origJson.apply(this, arguments).then(prune);
        };
      } catch (e) {}
    },

    // no-fetch-if(conditions): resolve matching fetch() calls with an empty 200
    // instead of hitting the network. Conditions are space-separated URL
    // needles; `method:GET` matches the verb; `*` matches everything.
    "no-fetch-if": function (rawCond) {
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
          if (match) return Promise.resolve(new Response("", { status: 200, statusText: "OK" }));
        } catch (e) {}
        return origFetch.apply(this, arguments);
      };
    },

    // no-window-open-if(search): block window.open() for matching URLs (leading
    // "!" inverts). Neutralises pop-under / pop-up ad launchers.
    "no-window-open-if": function (rawSearch) {
      // needleMatcher, not a hand-rolled copy: a needle REJECTED by the ReDoS
      // guard must match nothing — a copy that mapped null→"match all" would
      // block every window.open on the host.
      var match = needleMatcher(rawSearch);
      var orig = window.open;
      if (typeof orig !== "function") return;
      window.open = function (url) {
        try {
          if (match(String(url || ""))) return null;
        } catch (e) {}
        return orig.apply(this, arguments);
      };
    },

    // remove-attr(attrs, selector): strip the given attributes (space/comma/pipe
    // separated) from matching elements, now and on mutation.
    "remove-attr": function (rawAttrs, selector) {
      var attrs = String(rawAttrs || "").split(/[\s,|]+/).filter(Boolean);
      if (!attrs.length) return;
      var sel = selector || "[" + attrs.join("],[") + "]";
      onEachMutation(function () {
        document.querySelectorAll(sel).forEach(function (el) {
          attrs.forEach(function (a) { try { el.removeAttribute(a); } catch (e) {} });
        });
      });
    },

    // remove-class(classes, selector): strip the given classes from matching
    // elements, now and on mutation.
    "remove-class": function (rawClasses, selector) {
      var classes = String(rawClasses || "").split(/[\s,|]+/).filter(Boolean);
      if (!classes.length) return;
      var sel = selector || "." + classes.map(function (c) { return CSS.escape(c); }).join(",.");
      onEachMutation(function () {
        document.querySelectorAll(sel).forEach(function (el) {
          classes.forEach(function (c) { try { el.classList.remove(c); } catch (e) {} });
        });
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
      onEachMutation(function () {
        document.querySelectorAll(selector).forEach(function (a) {
          try {
            var href = a.getAttribute("href") || "";
            var target = "";
            if (src === "text") target = (a.textContent || "").trim();
            else if (src.charAt(0) === "?") target = new URL(href, location.href).searchParams.get(src.slice(1)) || "";
            else if (src.charAt(0) === "[" && src.slice(-1) === "]") target = a.getAttribute(src.slice(1, -1)) || "";
            if (/^https?:\/\/[^\s"'<>]+$/.test(target) && target !== href) a.setAttribute("href", target);
          } catch (e) {}
        });
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
      onEachMutation(function () {
        document.querySelectorAll(tag).forEach(function (n) {
          try {
            if (n.nodeType !== 1 || String(n.tagName).toLowerCase() !== tag) return;
            if (n.textContent && match(n.textContent)) n.textContent = "";
          } catch (e) {}
        });
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
    "remove-cookie": function (needle) {
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
    },
  };

  // ---- per-site directive map (baked at build time) -----------------------
  // Shape: { "": [[name, ...args]], "host.tld": [[name, ...args]] }. The ""
  // key holds global directives that run on every page.
  var MAP = /*__SCRIPTLET_MAP__*/{};

  // ---- bootstrap ----------------------------------------------------------

  function hostChain() {
    var host = "";
    try { host = location.hostname.replace(/^www\./, ""); } catch (e) {}
    var chain = [""]; // global bucket always runs
    if (host) {
      var parts = host.split(".");
      // nativeSlice: a page-replaced Array.prototype.slice must not corrupt the
      // host chain (it would silently drop every live directive for this frame).
      for (var i = 0; i < parts.length - 1; i++) chain.push(nativeSlice.call(parts, i).join("."));
    }
    return chain;
  }

  function runDirective(d) {
    if (!nativeIsArray(d) || !d.length) return;
    var name = d[0];
    if (typeof name !== "string" || !nativeHasOwn.call(IMPL, name)) return;
    var fn = IMPL[name];
    if (typeof fn !== "function") return;
    try { fn.apply(null, nativeSlice.call(d, 1)); } catch (e) {}
  }

  // ---- live directives (Level 2) -----------------------------------------
  // Delivered by our ISOLATED content script from the Ed25519-signed,
  // anti-rollback filters.json as a JSON STRING on a DOM event (objects don't
  // cross worlds). Re-validated HERE against the same rules as the service
  // worker (name allowlist = IMPL keys, argument safety, set-constant
  // dictionary, selector/attribute/tag policy) — the engine never trusts a
  // DOM message blindly. Threat model, stated honestly: a page can dispatch
  // the same event, but only with directives we already allow, only against
  // ITSELF in its own frame — no privilege escalation, no code/network sink.
  // A cooperating page CAN opt itself out (pre-apply + restore its own APIs);
  // it cannot reach other frames or other sites. The channel is therefore for
  // non-timing-critical directives; timing-critical ones are baked into MAP.
  // Live directives always carry an explicit host and never run on core
  // video/CDN hosts (YouTube has dedicated handling).
  // Live profile of the single policy (see SA_POLICY above): selector/attr/tag
  // rules, cookie-name denylist, remove-cookie refused. IMPL membership is
  // re-checked here as belt and braces (IMPL keys == policy CANON, gated by tests).
  function directiveOk(d) {
    if (!nativeIsArray(d) || d.length < 1) return false;
    var name = d[0];
    if (typeof name !== "string" || !nativeHasOwn.call(IMPL, name)) return false;
    return SA_POLICY.validateDirective(name, nativeSlice.call(d, 1), true);
  }
  var liveSeen = Object.create(null);
  function applyLive(raw) {
    var items;
    try { items = nativeParse(String(raw)); } catch (e) { return; }
    if (!nativeIsArray(items)) return;
    var chain = hostChain();
    for (var p = 0; p < chain.length; p++) if (SA_POLICY.NEVER_LIVE.indexOf(chain[p]) >= 0) return;
    for (var i = 0; i < items.length && i < 500; i++) {
      var it = items[i];
      if (!it || typeof it !== "object") continue;
      // Read once and materialise: a poisoned getter can't swap values between
      // validation and execution.
      var h = it.h, d = it.d;
      if (typeof h !== "string" || h === "" || chain.indexOf(h) < 0) continue; // explicit host only
      if (!nativeIsArray(d)) continue;
      d = nativeSlice.call(d);   // native, so a page-replaced slice cannot split validate/execute
      if (!directiveOk(d)) continue;
      var key = nativeStringify(d);
      if (liveSeen[key]) continue;                 // dedupe: re-delivery / replay
      liveSeen[key] = true;
      runDirective(d);
    }
  }
  try {
    // Capture listener on window: registered at document_start (before any
    // page script), it fires before any document-level listener, and the page
    // holds no reference to remove it. content.js dispatches on document; the
    // capture phase runs regardless of `bubbles`.
    window.addEventListener("sa-scriptlets", function (ev) {
      try { applyLive(ev && ev.detail); } catch (e) {}
    }, true);
  } catch (e) {}

  // ---- bootstrap: baked directives — LAST, once every helper above is
  // initialised (var hoisting only hoists declarations; a helper used by an
  // IMPL but assigned later would be undefined here). Same synchronous tick.
  try {
    var chain = hostChain();
    for (var i = 0; i < chain.length; i++) {
      var list = MAP[chain[i]];
      if (list) for (var j = 0; j < list.length; j++) runDirective(list[j]);
    }
  } catch (e) {}
})();
