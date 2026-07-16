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
      var q = (body.match(/[*+]|\{\d/g) || []).length;
      if (body.length > 200 || q > 2) return null;
      // Reject a quantified group that also contains a quantifier — the classic
      // catastrophic-backtracking shape like (a+)+ or (a*)* (q can be ≤2).
      if (/\([^)]*[*+][^)]*\)[*+?]/.test(body)) return null;
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

  // Resolve a uBO set-constant token to a concrete value. Only tokens from this
  // fixed dictionary (plus plain integers) are ever produced by the build's
  // validator, so a directive can never smuggle arbitrary code in as a "value".
  function tokenValue(raw) {
    switch (raw) {
      case "false": return { ok: true, v: false };
      case "true": return { ok: true, v: true };
      case "null": return { ok: true, v: null };
      case "undefined": return { ok: true, v: undefined };
      case "noopFunc": return { ok: true, v: function () {} };
      case "trueFunc": return { ok: true, v: function () { return true; } };
      case "falseFunc": return { ok: true, v: function () { return false; } };
      case "":
      case "emptyStr": return { ok: true, v: "" };
      case "emptyArr": return { ok: true, v: [] };
      case "emptyObj": return { ok: true, v: {} };
      case "''": return { ok: true, v: "" };
      default:
        if (/^-?\d+$/.test(raw)) return { ok: true, v: parseInt(raw, 10) };
        return { ok: false };
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

  // ---- scriptlet implementations -----------------------------------------
  // Each is keyed by its canonical name (the build maps uBO aliases to these).

  var IMPL = {
    // set-constant(chain, value): pin window.<chain> to a constant from the
    // value dictionary; later writes are ignored (or preserved if identical).
    "set-constant": function (chain, rawValue) {
      var t = tokenValue(rawValue);
      if (!t.ok) return;
      var value = t.v;
      var parts = chain.split(".");
      (function define(owner, i) {
        var prop = parts[i];
        if (i === parts.length - 1) {
          var cur;
          try { cur = owner[prop]; } catch (e) {}
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
      var re = toReg(search);
      var val;
      try { val = r.owner[r.prop]; } catch (e) {}
      var msg = noise();
      try {
        Object.defineProperty(r.owner, r.prop, {
          get: function () {
            var s = document.currentScript;
            if (s && s.tagName === "SCRIPT" && (!re || re.test(s.textContent || ""))) {
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
      var neg = typeof search === "string" && search.charAt(0) === "!";
      var re = toReg(neg ? search.slice(1) : search);
      var wanted = delay !== undefined && delay !== "" ? parseInt(delay, 10) : NaN;
      var orig = window.setTimeout;
      if (typeof orig !== "function") return;
      window.setTimeout = function (fn, t) {
        try {
          var src = typeof fn === "function" ? fn.toString() : String(fn);
          var mStr = re ? re.test(src) : true;
          if (neg) mStr = !mStr;
          var mDelay = isNaN(wanted) || wanted === t;
          if (mStr && mDelay) return 0;
        } catch (e) {}
        return orig.apply(this, arguments);
      };
    },

    // no-setInterval-if(search, delay): same as above for setInterval.
    "no-setInterval-if": function (search, delay) {
      var neg = typeof search === "string" && search.charAt(0) === "!";
      var re = toReg(neg ? search.slice(1) : search);
      var wanted = delay !== undefined && delay !== "" ? parseInt(delay, 10) : NaN;
      var orig = window.setInterval;
      if (typeof orig !== "function") return;
      window.setInterval = function (fn, t) {
        try {
          var src = typeof fn === "function" ? fn.toString() : String(fn);
          var mStr = re ? re.test(src) : true;
          if (neg) mStr = !mStr;
          var mDelay = isNaN(wanted) || wanted === t;
          if (mStr && mDelay) return 0;
        } catch (e) {}
        return orig.apply(this, arguments);
      };
    },

    // addEventListener-defuser(typeSearch, funcSearch): swallow addEventListener
    // registrations whose type and/or listener source match.
    "addEventListener-defuser": function (typeSearch, funcSearch) {
      var reType = toReg(typeSearch);
      var reFunc = toReg(funcSearch);
      var proto = window.EventTarget && EventTarget.prototype;
      if (!proto || typeof proto.addEventListener !== "function") return;
      var orig = proto.addEventListener;
      proto.addEventListener = function (type, listener) {
        try {
          var ls = typeof listener === "function" ? listener.toString()
            : listener && typeof listener.handleEvent === "function" ? listener.handleEvent.toString()
            : String(listener);
          if ((!reType || reType.test(String(type))) && (!reFunc || reFunc.test(ls))) return;
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
      var neg = typeof rawSearch === "string" && rawSearch.charAt(0) === "!";
      var re = toReg(neg ? rawSearch.slice(1) : rawSearch);
      var orig = window.open;
      if (typeof orig !== "function") return;
      window.open = function (url) {
        try {
          var u = String(url || "");
          var m = re ? re.test(u) : true;
          if (neg) m = !m;
          if (m) return null;
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
      for (var i = 0; i < parts.length - 1; i++) chain.push(parts.slice(i).join("."));
    }
    return chain;
  }

  function runDirective(d) {
    if (!Array.isArray(d) || !d.length) return;
    var name = d[0];
    var fn = IMPL[name];
    if (typeof fn !== "function") return;
    try { fn.apply(null, d.slice(1)); } catch (e) {}
  }

  try {
    var chain = hostChain();
    for (var i = 0; i < chain.length; i++) {
      var list = MAP[chain[i]];
      if (list) for (var j = 0; j < list.length; j++) runDirective(list[j]);
    }
  } catch (e) {}
})();
