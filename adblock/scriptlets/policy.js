// Supreme AdBlock — scriptlet POLICY: the single source of truth for what a
// scriptlet directive may look like (names, per-name argument grammar, value
// dictionaries, selector/attribute/tag/cookie rules, protected hosts).
//
// Classic script on purpose (no import/export): it is loaded three ways —
//   1. inlined into scriptlets/engine.js at its SCRIPTLET_POLICY marker line
//      by tools/build_scriptlets.mjs (MAIN world, no module loader);
//   2. importScripts("scriptlets/policy.js") at the top of background.js
//      (classic service worker);
//   3. node:vm in tools/build_scriptlets.mjs and tests/ (dev).
// Pure data + pure functions; nothing here touches the DOM or the network.
//
// Two profiles of ONE validator:
//   validateDirective(name, args, false) — the baked list (trusted dev input);
//   validateDirective(name, args, true)  — the live channel (signed filters.json,
//   re-validated in the service worker AND in the engine): strict superset —
//   selector/attribute/tag policy, cookie-name denylist, remove-cookie refused.
// Invariant: live accepts ⇒ build accepts; never the reverse.
var SA_POLICY = (function () {
  "use strict";
  var hasOwn = Object.prototype.hasOwnProperty;

  // uBO alias → canonical routine name. ONLY these are accepted. NO trusted-*.
  var ALIASES = {
    "set-constant": "set-constant", "set": "set-constant",
    "abort-on-property-read": "abort-on-property-read", "aopr": "abort-on-property-read",
    "abort-on-property-write": "abort-on-property-write", "aopw": "abort-on-property-write",
    "abort-current-script": "abort-current-script", "acs": "abort-current-script",
    "abort-current-inline-script": "abort-current-script", "acis": "abort-current-script",
    "abort-on-stack-trace": "abort-on-stack-trace", "aost": "abort-on-stack-trace",
    "no-setTimeout-if": "no-setTimeout-if", "nostif": "no-setTimeout-if", "setTimeout-defuser": "no-setTimeout-if",
    "no-setInterval-if": "no-setInterval-if", "nosiif": "no-setInterval-if", "setInterval-defuser": "no-setInterval-if",
    "addEventListener-defuser": "addEventListener-defuser", "aeld": "addEventListener-defuser",
    "json-prune": "json-prune",
    "no-fetch-if": "no-fetch-if",
    "no-window-open-if": "no-window-open-if", "nowoif": "no-window-open-if", "window.open-defuser": "no-window-open-if",
    "remove-attr": "remove-attr", "ra": "remove-attr",
    "remove-class": "remove-class", "rc": "remove-class",
    "href-sanitizer": "href-sanitizer",
    "remove-node-text": "remove-node-text", "rmnt": "remove-node-text",
    "nowebrtc": "nowebrtc",
    "no-xhr-if": "no-xhr-if", "prevent-xhr": "no-xhr-if",
    "set-cookie": "set-cookie",
    "remove-cookie": "remove-cookie", "cookie-remover": "remove-cookie",
    // 5.2.0 — the uBO routines the bundled lists use most that we did not run yet.
    // Same rule as above: our own implementations, baked data only, never trusted-*.
    "prevent-fetch": "no-fetch-if", "prevent-window-open": "no-window-open-if",
    "prevent-setTimeout": "no-setTimeout-if", "prevent-setInterval": "no-setInterval-if",
    "prevent-addEventListener": "addEventListener-defuser",
    "json-prune-fetch-response": "json-prune-fetch-response",
    "json-prune-xhr-response": "json-prune-xhr-response",
    "noeval-if": "noeval-if", "prevent-eval-if": "noeval-if",
    "noeval": "noeval", "noeval-silent": "noeval", "silent-noeval": "noeval",
    "nano-setTimeout-booster": "nano-stb", "nano-stb": "nano-stb", "adjust-setTimeout": "nano-stb",
    "nano-setInterval-booster": "nano-sib", "nano-sib": "nano-sib", "adjust-setInterval": "nano-sib",
    "set-local-storage-item": "set-local-storage-item",
    "set-session-storage-item": "set-session-storage-item",
    "nobab": "nobab", "bab-defuser": "nobab",
    "nofab": "nofab", "fuckadblock.js-3.2.0": "nofab",
    "popads-dummy": "popads-dummy", "popads.net": "popads.net",
    "xml-prune": "xml-prune",
    "m3u-prune": "m3u-prune",
    "refresh-defuser": "refresh-defuser", "prevent-refresh": "refresh-defuser",
    "set-attr": "set-attr",
    "no-requestAnimationFrame-if": "no-requestAnimationFrame-if", "norafif": "no-requestAnimationFrame-if",
    "prevent-requestAnimationFrame": "no-requestAnimationFrame-if",
    "prevent-innerHTML": "prevent-innerHTML",
    "window.name-defuser": "window.name-defuser",
    "alert-buster": "alert-buster",
  };
  var CANON = {};
  for (var k in ALIASES) if (hasOwn.call(ALIASES, k)) CANON[ALIASES[k]] = true;

  var ARG_MAX = 400;                 // max length of one directive argument / live string
  var LIVE_SCRIPTLET_MAX = 500;      // max live directives per filters.json (SW and engine agree)
  // dotted property chain; may start with "_" or "$" (`_sp_`, jQuery `$`) —
  // __proto__/constructor/prototype stay out via argSafe().
  var NAME_RE = /^[a-zA-Z_$][\w.$-]{0,120}$/;

  // set-constant values: fixed dictionary or a plain integer — never code.
  // "{}"/"[]"/'""' are how the uBO lists spell emptyObj/emptyArr/emptyStr; throwFunc throws.
  var SETCONST_VALUES = ["false", "true", "null", "undefined", "noopFunc", "trueFunc",
    "falseFunc", "throwFunc", "", "emptyStr", "emptyArr", "emptyObj", "''", '""', "{}", "[]"];
  // set-local-storage-item / set-session-storage-item: what may be written — inert words
  // and small numbers (the uBO dictionary), or "$remove$" to delete the key. Never markup.
  var STORAGE_VALUES = ["undefined", "null", "false", "true", "on", "off", "yes", "no", "accept",
    "reject", "accepted", "rejected", "allowed", "denied", "''", '""', "", "{}", "[]", "emptyObj",
    "emptyArr", "emptyStr", "$remove$"];
  var STORAGE_KEY = /^"?[\w.$:@#/|\-\[\] ]{1,128}"?$/;
  // no-fetch-if / no-xhr-if: what a refused request answers with.
  var FETCH_BODY = /^(|true|emptyObj|emptyArr|emptyStr|length:\d{1,6}(-\d{1,6})?|war:[\w.-]{1,80})$/;
  var FETCH_TYPES = ["", "basic", "cors", "default", "error", "opaque"];
  // Chains through a prototype (`Object.prototype.hideAds`, `String.prototype.charCodeAt`) are
  // how the lists reach a whole class of objects. Allowed in the baked list for the property
  // routines only; __proto__ and constructor stay banned everywhere.
  var PROTO_ROUTINES = { "set-constant": 1, "abort-on-property-read": 1, "abort-on-property-write": 1,
    "abort-current-script": 1, "abort-on-stack-trace": 1 };

  // set-cookie: name charset, a denylist of names that are never a consent
  // cookie (session/auth/CSRF/tracking IDs, __Host-/__Secure- prefixes — the
  // "only if absent" guard is blind to HttpOnly, so the denylist is the fence),
  // and a fixed consent-style value dictionary or a small integer.
  var COOKIE_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
  var COOKIE_NAME_DENY = /(sess|auth|token|jwt|csrf|xsrf|login|passw|remember|^sid$|^ssid$|^uid$|^id$|^user|^_ga|^_gid|^_fbp|^__host-|^__secure-|^phpsessid$|^jsessionid$|^asp\.net_sessionid$|^connect\.sid$)/i;
  var COOKIE_VALUES = ["true", "false", "yes", "no", "y", "n", "ok", "accept", "accepted",
    "reject", "rejected", "allow", "deny", "dismiss", "hide", "hidden", "essential",
    "necessary", "on", "off", "close", "closed", "checked", "0", "1"];

  // Selector policy (shared with live cosmetic filters): never target form
  // controls / credential fields / the whole page.
  var UNSAFE_SELECTORS = ["*", "html", "body", ":root", "head", "div", "span", "a", "img",
    "main", "section", "article", "video", "iframe", "form", "input", "button",
    "label", "select", "textarea", "fieldset", "option", "nav", "header", "footer",
    "ul", "ol", "li", "p", "table", "tr", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6"];
  var FORM_TARGET = /(^|[\s>+~,(])(input|button|select|textarea|form|label|fieldset|option)([\s>+~,.:\[)#]|$)/i;
  var FORM_ATTR = /\[\s*(type|name|autocomplete|placeholder|id|class|aria-label)\s*[*^$|~]?=\s*["']?[^\]"']*?(pass|pwd|\bpin\b|secret|token|cc-|cvc|cvv|otp|ssn|iban|login|user|email|tel\b|card[-_ ]?num)/i;
  var UNIVERSAL = /(^|[\s>+~,(])\*(?![=\]])/;
  // The page itself as the TARGET (last compound): `body.x`, `html > body:not(.a)`,
  // `.a, body` — hiding it blanks the site. Ancestors (`body.x .ad`) stay fine.
  var PAGE_TARGET = /(^|,|[\s>+~])\s*(html|body|:root)(?![\w-])[^\s>+~,]*\s*(,|$)/i;

  // Attributes whose removal downgrades page security/semantics; tags that are
  // never a legitimate remove-node-text target.
  var ATTR_DENY = /^(sandbox|type|name|autocomplete|required|disabled|readonly|rel|integrity|crossorigin|nonce|csp|referrerpolicy|href|src|srcdoc|action|method|formaction|allow)$/i;
  // Procedural cosmetic ACTIONS change behaviour, not just visibility, so they
  // get their own rules (a hostile subscription list / live channel / import
  // must not be able to do more than hide things):
  //  - `:style()` may not load anything or read attributes — `url(…)` in a
  //    cosmetic rule is a tracking beacon on every matching page, and a CSS
  //    escape (`\75 rl(`) would slip past a plain text check;
  //  - `:remove-attr()` may never strip a security-relevant attribute
  //    (ATTR_DENY) — `iframe[sandbox]:remove-attr(sandbox)` is a sandbox escape.
  var STYLE_DENY = /url\s*\(|image-set|image\s*\(|attr\s*\(|expression|@import|element\s*\(|cross-fade|paint\s*\(|\\/i;
  var ATTR_SENSITIVE = ["sandbox", "type", "name", "autocomplete", "required", "disabled", "readonly",
    "rel", "integrity", "crossorigin", "nonce", "csp", "referrerpolicy", "href", "src", "srcdoc",
    "action", "method", "formaction", "allow"];
  var TAG_OK = /^[a-z][a-z0-9-]*$/i;
  var TAG_DENY = /^(input|textarea|select|option|button|form|label|html|body|head)$/i;

  // Core video / CDN hosts: never blocked by user/live domain rules and never
  // targeted by live scriptlets (YouTube has dedicated handling).
  var NEVER_LIVE = ["googlevideo.com", "ytimg.com", "youtube.com", "ggpht.com",
    "gstatic.com", "googleapis.com", "google.com", "fbcdn.net", "cdninstagram.com"];

  function argSafe(a) {
    return typeof a === "string" && a.length <= ARG_MAX &&
      !/__proto__|constructor|prototype/.test(a) &&
      !/<\/?script|<\/?style|-->/i.test(a);
  }
  // The baked list's property chains may go through a prototype (see PROTO_ROUTINES).
  function argSafeProto(a) {
    return typeof a === "string" && a.length <= ARG_MAX && !/__proto__|constructor/.test(a) &&
      !/<\/?script|<\/?style|-->/i.test(a);
  }
  // uBO varargs after the fixed arguments: "key, value" pairs from a fixed set of keys.
  function varargsOk(args, from, keys) {
    if ((args.length - from) % 2) return false;
    for (var i = from; i < args.length; i += 2) if (keys.indexOf(args[i]) < 0) return false;
    return true;
  }
  function fetchTypeOk(t) {
    if (FETCH_TYPES.indexOf(t) >= 0) return true;
    if (t.charAt(0) !== "{") return false;
    var o;
    try { o = JSON.parse(t); } catch (e) { return false; }
    if (!o || typeof o !== "object" || Array.isArray(o)) return false;
    for (var k in o) {
      if (!hasOwn.call(o, k)) continue;
      if (k === "ok" && typeof o[k] === "boolean") continue;
      if (k === "type" && FETCH_TYPES.indexOf(o[k]) >= 0) continue;
      if (k === "statusText" && typeof o[k] === "string" && /^[\w ]{0,40}$/.test(o[k])) continue;
      return false;
    }
    return true;
  }
  function storageValueOk(v) {
    return STORAGE_VALUES.indexOf(v) >= 0 || COOKIE_VALUES.indexOf(v) >= 0 || (/^-?\d{1,5}$/.test(v) && Math.abs(+v) <= 32767);
  }
  // set-attr: the attribute and what it may be set to (uBO dictionary). URL-bearing
  // attributes may only take a copy of another attribute of the same element
  // (`src` ← `[data-src]`, a lazy loader); event handlers and srcdoc never.
  var SET_ATTR_URLISH = /^(src|href|data|action|formaction|poster|background|codebase|cite|xlink:href)$/i;
  function setAttrOk(attr, value) {
    if (!/^[a-zA-Z][\w:-]{0,40}$/.test(attr) || /^on/i.test(attr) || /^(srcdoc|style)$/i.test(attr)) return false;
    var copy = /^\[[a-zA-Z][\w:-]{0,40}\]$/.test(value);
    if (SET_ATTR_URLISH.test(attr)) return copy;
    return copy || value === "" || value === "''" || value === "true" || value === "false" ||
      (/^\d{1,5}$/.test(value) && +value < 32768);
  }
  function styleOk(decl) {
    return typeof decl === "string" && decl.length <= ARG_MAX && !STYLE_DENY.test(decl);
  }
  function removeAttrOk(arg) {
    if (typeof arg !== "string") return false;
    var a = arg.trim();
    if (!a || a.length > ARG_MAX) return false;
    var last = a.lastIndexOf("/");
    if (a.charAt(0) === "/" && last > 0) {
      // regex argument: refuse it if it could match ANY sensitive attribute
      var re;
      try { re = new RegExp(a.slice(1, last), a.slice(last + 1).replace(/[^i]/g, "")); } catch (e) { return false; }
      for (var i = 0; i < ATTR_SENSITIVE.length; i++) if (re.test(ATTR_SENSITIVE[i])) return false;
      return true;
    }
    return !ATTR_DENY.test(a);
  }
  // Every :style(…) / :remove-attr(…) inside a (procedural) selector must pass.
  function proceduralOk(sel) {
    if (typeof sel !== "string") return false;
    var rx = /:(style|remove-attr)\(/g, m;
    while ((m = rx.exec(sel))) {
      var start = m.index + m[0].length, depth = 1, i = start;
      for (; i < sel.length && depth; i++) {
        var c = sel.charAt(i);
        if (c === "(") depth++; else if (c === ")") depth--;
      }
      if (depth) return false; // unbalanced
      var arg = sel.slice(start, i - 1);
      if (m[1] === "style" ? !styleOk(arg) : !removeAttrOk(arg)) return false;
    }
    return true;
  }
  function safeSelector(s) {
    if (typeof s !== "string") return false;
    s = s.trim();
    if (s.length < 3 || s.length > 400 || UNSAFE_SELECTORS.indexOf(s.toLowerCase()) >= 0) return false;
    if (FORM_TARGET.test(s) || FORM_ATTR.test(s)) return false;
    if (UNIVERSAL.test(s) || s.charAt(0) === ":") return false;
    // Selectors end up inside a stylesheet block (`html[data-tbab-on]{…}`): a
    // brace, semicolon or comment would let list data write declarations of its
    // own (`url()` beacons) or swallow the rules after it.
    if (/[{};]|\/\*|\*\/|\\$/.test(s)) return false; // a trailing \ escapes the next brace
    if (PAGE_TARGET.test(s)) return false;
    if (!proceduralOk(s)) return false;
    return true;
  }
  function attrsOk(list) {
    var parts = String(list).split(/[\s,|]+/);
    var any = false;
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      if (!/^[a-zA-Z][\w-]*$/.test(parts[i]) || ATTR_DENY.test(parts[i])) return false;
      any = true;
    }
    return any;
  }
  function cookieValueOk(v) {
    v = String(v);
    return COOKIE_VALUES.indexOf(v) >= 0 || /^\d{1,5}$/.test(v);
  }
  function setConstOk(v) {
    return SETCONST_VALUES.indexOf(v) >= 0 || /^-?\d+$/.test(v);
  }
  var RUN_AT = ["loading", "interactive", "complete", "idle", "asap", "stay", "asap stay", "end"];
  // Resolve a set-constant token to a concrete value (engine use).
  function tokenValue(raw) {
    switch (raw) {
      case "false": return { ok: true, v: false };
      case "true": return { ok: true, v: true };
      case "null": return { ok: true, v: null };
      case "undefined": return { ok: true, v: undefined };
      case "noopFunc": return { ok: true, v: function () {} };
      case "trueFunc": return { ok: true, v: function () { return true; } };
      case "falseFunc": return { ok: true, v: function () { return false; } };
      case "throwFunc": return { ok: true, v: function () { throw new Error(""); } };
      case "":
      case "emptyStr":
      case '""':
      case "''": return { ok: true, v: "" };
      case "[]":
      case "emptyArr": return { ok: true, v: [] };
      case "{}":
      case "emptyObj": return { ok: true, v: {} };
      default:
        if (/^-?\d+$/.test(raw)) return { ok: true, v: parseInt(raw, 10) };
        return { ok: false };
    }
  }
  // Own-property lookup: "__proto__"/"constructor" must not resolve via the prototype.
  function canonical(rawName) {
    return typeof rawName === "string" && hasOwn.call(ALIASES, rawName) ? ALIASES[rawName] : null;
  }
  function protectedHost(host) {
    for (var i = 0; i < NEVER_LIVE.length; i++) {
      var p = NEVER_LIVE[i];
      if (host === p || (host.length > p.length && host.slice(-p.length - 1) === "." + p)) return true;
    }
    return false;
  }

  // validateDirective(name, args, live) — name must be CANONICAL.
  function validateDirective(name, args, live) {
    if (typeof name !== "string" || !hasOwn.call(CANON, name)) return false;
    // The response pruners take uBO varargs ("propsToMatch, …"); everything else ≤ 3 (+runAt for set-constant).
    var maxArgs = name === "json-prune-fetch-response" || name === "json-prune-xhr-response" ? 6 : name === "set-constant" || name === "remove-cookie" ? 4 : 3;
    if (!args || typeof args.length !== "number" || args.length > maxArgs) return false;
    var n = args.length;
    var proto = !live && hasOwn.call(PROTO_ROUTINES, name);
    for (var i = 0; i < n; i++) if (!(proto && i === 0 ? argSafeProto(args[i]) : argSafe(args[i]))) return false;
    // The 5.2.0 routines exist for the baked uBO list only (there is no live scriptlet channel).
    if (live && /^(json-prune-(fetch|xhr)-response|noeval(-if)?|nano-(stb|sib)|set-(local|session)-storage-item|nobab|nofab|popads-dummy|popads\.net|xml-prune|m3u-prune|refresh-defuser|set-attr|no-requestAnimationFrame-if|prevent-innerHTML|window\.name-defuser|alert-buster)$/.test(name)) return false;
    switch (name) {
      case "set-constant":
        // (chain) = undefined; (chain, value); (chain, value, "runAt", when)
        return NAME_RE.test(args[0]) && (n === 1 || (n === 2 && setConstOk(args[1])) ||
          (n === 4 && !live && setConstOk(args[1]) && args[2] === "runAt" && RUN_AT.indexOf(args[3]) >= 0));
      case "abort-on-property-read":
      case "abort-on-property-write":
        return n === 1 && NAME_RE.test(args[0]);
      case "abort-current-script":
        return n >= 1 && n <= 2 && NAME_RE.test(args[0]);
      case "abort-on-stack-trace":
        return n === 2 && NAME_RE.test(args[0]);
      case "no-setTimeout-if":
      case "no-setInterval-if":
        // delay: exact ms, or a range "2000-5000" (baked lists)
        return n >= 1 && n <= 2 && (n < 2 || args[1] === "" || /^\d{1,7}$/.test(args[1]) || (!live && /^\d{1,7}-\d{1,7}$/.test(args[1])));
      case "no-fetch-if":
        // (conditions[, body[, type]]) — what the refused request answers with
        return n >= 1 && (n === 1 || !live) && (n < 2 || FETCH_BODY.test(args[1])) && (n < 3 || fetchTypeOk(args[2]));
      case "no-xhr-if":
        return n >= 1 && n <= 2 && (n === 1 || !live) && (n < 2 || FETCH_BODY.test(args[1]));
      case "no-window-open-if":
        // No argument = every window.open on that site (uBO): baked lists only.
        // (needle, seconds, "obj"|"blank"): hand the page a decoy window instead of null.
        return (n === 1 || (!live && n === 0)) ||
          (!live && n >= 2 && /^\d{0,3}$/.test(args[1]) && (n < 3 || args[2] === "" || args[2] === "obj" || args[2] === "blank"));
      case "addEventListener-defuser":
        return n >= 1 && n <= 2;
      case "json-prune":
        // (props[, needles[, stack needle]])
        return n >= 1 && n <= (live ? 2 : 3);
      case "json-prune-fetch-response":
      case "json-prune-xhr-response":
        return n >= 1 && args[0] !== "" && varargsOk(args, 2, ["propsToMatch", "stackToMatch"]);
      case "noeval-if":
        return n === 1 && args[0] !== "";
      case "noeval":
      case "nobab":
      case "nofab":
      case "popads-dummy":
      case "popads.net":
      case "window.name-defuser":
      case "alert-buster":
        return n === 0;
      case "nano-stb":
      case "nano-sib":
        // (needle, delay | "*", boost 0.02–50)
        return n <= 3 && (n < 2 || args[1] === "" || args[1] === "*" || /^\d{1,7}$/.test(args[1])) &&
          (n < 3 || args[2] === "" || /^\d{0,2}(\.\d{1,4})?$/.test(args[2])); // 0 → the 0.02 floor
      case "set-local-storage-item":
      case "set-session-storage-item":
        return n === 2 && STORAGE_KEY.test(args[0]) && storageValueOk(args[1]);
      case "xml-prune":
        return n >= 1 && args[0] !== "";
      case "m3u-prune":
        return n >= 1 && n <= 2 && args[0] !== "";
      case "refresh-defuser":
        return n === 0 || (n === 1 && /^\d{0,4}(\.\d{1,3})?$/.test(args[0]));
      case "set-attr":
        return (n === 2 || n === 3) && args[0] !== "" && setAttrOk(args[1], n === 3 ? args[2] : "");
      case "no-requestAnimationFrame-if":
        return n === 1 && args[0] !== "";
      case "prevent-innerHTML":
        return n >= 1 && n <= 2;
      case "remove-attr":
        // 3rd: when to act ("stay", "complete", "asap"…) — we always act now and on every change
        return n >= 1 && n <= 3 && (n < 3 || (!live && RUN_AT.indexOf(args[2]) >= 0)) && (!live || attrsOk(args[0])) && (n < 2 || !live || safeSelector(args[1]));
      case "remove-class":
        return n >= 1 && n <= 3 && (n < 3 || (!live && RUN_AT.indexOf(args[2]) >= 0)) && (n < 2 || !live || safeSelector(args[1]));
      case "href-sanitizer":
        return n >= 1 && n <= 2 && (!live || safeSelector(args[0]));
      case "remove-node-text":
        return n === 2 && TAG_OK.test(args[0]) && (!live || !TAG_DENY.test(args[0]));
      case "nowebrtc":
        return n === 0;
      case "set-cookie":
        return n === 2 && COOKIE_NAME.test(args[0]) && !COOKIE_NAME_DENY.test(args[0]) && cookieValueOk(args[1]);
      case "remove-cookie":
        // baked list only — it can log a user out of a site. (needle[, "when", "scroll keydown"])
        return !live && (n === 1 || (n === 3 && args[1] === "when" && /^(scroll|keydown|load|click)( (scroll|keydown|load|click))*$/.test(args[2])));
      default:
        return false;
    }
  }

  return {
    ALIASES: ALIASES, CANON: CANON, NAME_RE: NAME_RE, ARG_MAX: ARG_MAX, LIVE_SCRIPTLET_MAX: LIVE_SCRIPTLET_MAX,
    SETCONST_VALUES: SETCONST_VALUES, COOKIE_NAME: COOKIE_NAME, STORAGE_VALUES: STORAGE_VALUES,
    STORAGE_KEY: STORAGE_KEY, FETCH_BODY: FETCH_BODY, storageValueOk: storageValueOk, setAttrOk: setAttrOk,
    fetchTypeOk: fetchTypeOk, RUN_AT: RUN_AT,
    COOKIE_NAME_DENY: COOKIE_NAME_DENY, COOKIE_VALUES: COOKIE_VALUES,
    UNSAFE_SELECTORS: UNSAFE_SELECTORS, FORM_TARGET: FORM_TARGET, FORM_ATTR: FORM_ATTR,
    UNIVERSAL: UNIVERSAL, ATTR_DENY: ATTR_DENY, TAG_OK: TAG_OK, TAG_DENY: TAG_DENY,
    STYLE_DENY: STYLE_DENY, styleOk: styleOk, removeAttrOk: removeAttrOk, proceduralOk: proceduralOk,
    NEVER_LIVE: NEVER_LIVE,
    argSafe: argSafe, safeSelector: safeSelector, attrsOk: attrsOk,
    cookieValueOk: cookieValueOk, setConstOk: setConstOk, tokenValue: tokenValue,
    canonical: canonical, protectedHost: protectedHost, validateDirective: validateDirective,
  };
})();
