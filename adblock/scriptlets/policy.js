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
    "set-cookie": "set-cookie",
    "remove-cookie": "remove-cookie",
  };
  var CANON = {};
  for (var k in ALIASES) if (hasOwn.call(ALIASES, k)) CANON[ALIASES[k]] = true;

  var ARG_MAX = 400;                 // max length of one directive argument / live string
  var LIVE_SCRIPTLET_MAX = 500;      // max live directives per filters.json (SW and engine agree)
  var NAME_RE = /^[a-zA-Z][\w.-]{0,60}$/;                  // dotted property chain

  // set-constant values: fixed dictionary or a plain integer — never code.
  var SETCONST_VALUES = ["false", "true", "null", "undefined", "noopFunc", "trueFunc",
    "falseFunc", "", "emptyStr", "emptyArr", "emptyObj", "''"];

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

  // Attributes whose removal downgrades page security/semantics; tags that are
  // never a legitimate remove-node-text target.
  var ATTR_DENY = /^(sandbox|type|name|autocomplete|required|disabled|readonly|rel|integrity|crossorigin|nonce|csp|referrerpolicy|href|src|srcdoc|action|method|formaction|allow)$/i;
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
  function safeSelector(s) {
    if (typeof s !== "string") return false;
    s = s.trim();
    if (s.length < 3 || s.length > 400 || UNSAFE_SELECTORS.indexOf(s.toLowerCase()) >= 0) return false;
    if (FORM_TARGET.test(s) || FORM_ATTR.test(s)) return false;
    if (UNIVERSAL.test(s) || s.charAt(0) === ":") return false;
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
      case "":
      case "emptyStr":
      case "''": return { ok: true, v: "" };
      case "emptyArr": return { ok: true, v: [] };
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
    if (!args || typeof args.length !== "number" || args.length > 3) return false;
    var n = args.length;
    for (var i = 0; i < n; i++) if (!argSafe(args[i])) return false;
    switch (name) {
      case "set-constant":
        return n === 2 && NAME_RE.test(args[0]) && setConstOk(args[1]);
      case "abort-on-property-read":
      case "abort-on-property-write":
        return n === 1 && NAME_RE.test(args[0]);
      case "abort-current-script":
        return n >= 1 && n <= 2 && NAME_RE.test(args[0]);
      case "abort-on-stack-trace":
        return n === 2 && NAME_RE.test(args[0]);
      case "no-setTimeout-if":
      case "no-setInterval-if":
        return n >= 1 && n <= 2 && (n < 2 || /^\d{1,7}$/.test(args[1]));
      case "no-fetch-if":
      case "no-window-open-if":
        return n === 1;
      case "addEventListener-defuser":
      case "json-prune":
        return n >= 1 && n <= 2;
      case "remove-attr":
        return n >= 1 && n <= 2 && (!live || attrsOk(args[0])) && (n < 2 || !live || safeSelector(args[1]));
      case "remove-class":
        return n >= 1 && n <= 2 && (n < 2 || !live || safeSelector(args[1]));
      case "href-sanitizer":
        return n >= 1 && n <= 2 && (!live || safeSelector(args[0]));
      case "remove-node-text":
        return n === 2 && TAG_OK.test(args[0]) && (!live || !TAG_DENY.test(args[0]));
      case "nowebrtc":
        return n === 0;
      case "set-cookie":
        return n === 2 && COOKIE_NAME.test(args[0]) && !COOKIE_NAME_DENY.test(args[0]) && cookieValueOk(args[1]);
      case "remove-cookie":
        return !live && n === 1; // baked list only — it can log a user out of a site
      default:
        return false;
    }
  }

  return {
    ALIASES: ALIASES, CANON: CANON, NAME_RE: NAME_RE, ARG_MAX: ARG_MAX, LIVE_SCRIPTLET_MAX: LIVE_SCRIPTLET_MAX,
    SETCONST_VALUES: SETCONST_VALUES, COOKIE_NAME: COOKIE_NAME,
    COOKIE_NAME_DENY: COOKIE_NAME_DENY, COOKIE_VALUES: COOKIE_VALUES,
    UNSAFE_SELECTORS: UNSAFE_SELECTORS, FORM_TARGET: FORM_TARGET, FORM_ATTR: FORM_ATTR,
    UNIVERSAL: UNIVERSAL, ATTR_DENY: ATTR_DENY, TAG_OK: TAG_OK, TAG_DENY: TAG_DENY,
    NEVER_LIVE: NEVER_LIVE,
    argSafe: argSafe, safeSelector: safeSelector, attrsOk: attrsOk,
    cookieValueOk: cookieValueOk, setConstOk: setConstOk, tokenValue: tokenValue,
    canonical: canonical, protectedHost: protectedHost, validateDirective: validateDirective,
  };
})();
