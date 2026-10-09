// abp2dnr.js — ONE converter from ABP / uBlock Origin filter syntax to
// declarativeNetRequest rules + cosmetic data. Classic script, shared exactly like
// scriptlets/policy.js: the build (tools/build_filters.mjs, via node:vm) compiles
// the bundled lists with it, and the service worker (importScripts) converts the
// lists a user turns on that we may not redistribute (downloaded from their
// author, e.g. the Bulgarian list). Two copies of a parser drift — one does not.
// Pure: no I/O, no globals except SA_POLICY (the policy) and an optional
// domainToASCII (Node); the browser falls back to URL for IDN → punycode.
(function (root) {
"use strict";
const SA_POLICY = root.SA_POLICY;
const toASCII = typeof root.domainToASCII === "function"
  ? root.domainToASCII
  : (d) => { try { return new URL("http://" + d).hostname; } catch (e) { return ""; } };
const isProtected = (d) => SA_POLICY.protectedHost(d);
const DOMAINS_PER_RULE = 1000; // requestDomains chunk of one DNR rule

const TYPE_MAP = {
  script: "script", image: "image", stylesheet: "stylesheet", object: "object",
  xmlhttprequest: "xmlhttprequest", xhr: "xmlhttprequest",
  subdocument: "sub_frame", frame: "sub_frame", ping: "ping",
  websocket: "websocket", media: "media", font: "font", other: "other",
};

// Опции, при които правилото се пропуска (не се превеждат към DNR).
const SKIP_OPTS = new Set([
  "generichide", "elemhide", "ghide", "ehide", "genericblock",
  "rewrite", "redirect-rule", "removeparam", "replace",
  "header", "cookie", "cname", "denyallow", "strict1p", "strict3p",
  "inline-script", "inline-font", "mp4", "empty", "webrtc", "object-subrequest",
  "badfilter", "all", "urlskip", "ipaddress", "method", "to", "from", "permissions",
]);

const isAscii = (s) => /^[\x20-\x7e]+$/.test(s);

// $redirect=<resource> → our bundled surrogate (web_accessible resources/*). Unknown
// resource names are skipped (never a broken redirect). $redirect-rule stays
// skipped: DNR cannot express "only if otherwise blocked", and redirecting a
// request that would have loaded breaks sites.
const REDIRECT_MAP = {
  "noopjs": "noop.js", "noop.js": "noop.js",
  "1x1.gif": "1x1.gif", "1x1-transparent.gif": "1x1.gif", "2x2.png": "1x1.gif", "2x2-transparent.png": "1x1.gif", "32x32.png": "1x1.gif", "3x2.png": "1x1.gif",
  "noop.txt": "noop.txt", "nooptext": "noop.txt", "noop.html": "noop.html", "noopframe": "noop.html",
  "noop.css": "noop.css", "noopcss": "noop.css", "noop.json": "noop.json", "noopjson": "noop.json",
  "noop-vast2.xml": "noop-vast.xml", "noop-vast3.xml": "noop-vast.xml", "noop-vast4.xml": "noop-vast.xml", "noopvast2": "noop-vast.xml", "noopvast3": "noop-vast.xml",
  "noopvast-2.0": "noop-vast.xml", "noopvast-3.0": "noop-vast.xml", "noopvast-4.0": "noop-vast.xml",
  "google-analytics_analytics.js": "ga.js", "google-analytics.com/analytics.js": "ga.js", "google-analytics_ga.js": "ga.js", "google-analytics.com/ga.js": "ga.js",
  "googletagmanager_gtm.js": "ga.js", "googletagmanager.com/gtm.js": "ga.js",
  "googletagservices_gpt.js": "gpt.js", "googletagservices.com/gpt.js": "gpt.js",
  "googlesyndication_adsbygoogle.js": "adsbygoogle.js", "googlesyndication.com/adsbygoogle.js": "adsbygoogle.js",
  "google-ima.js": "ima3.js",
  "scorecardresearch_beacon.js": "scorecardresearch.js", "scorecardresearch.com/beacon.js": "scorecardresearch.js",
  "outbrain-widget.js": "outbrain.js", "widgets.outbrain.com/outbrain.js": "outbrain.js",
  "amazon_apstag.js": "apstag.js",
};
// $csp= values we pass through: a conservative charset + must look like a policy.
// Reporting directives are refused: `report-uri https://x/` would make the browser
// POST the visited document URL to a third party on every violation (a list line
// must never turn the extension into a beacon).
const CSP_OK = (v) => /^[A-Za-z0-9 '":;\/*.\-_]{6,300}$/.test(v)
  && /(-src\b|\bsandbox\b|frame-ancestors|upgrade-insecure-requests)/.test(v)
  && !/\breport-(uri|to)\b/i.test(v);
// Why a line was dropped (node tools/build_filters.mjs --report prints the histogram).
const SKIP_REASONS = {}; // read by the build's --report
const skip = (r) => { SKIP_REASONS[r] = (SKIP_REASONS[r] || 0) + 1; return null; };
const validDomain = (d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d);

// --- ABP мрежов ред -> междинно представяне -------------------------------
// Charset of an options string (everything after the last "$"). It MUST include
// "_" (surrogate names: redirect=googletagservices_gpt.js) and "[" "]" (IPv6 in
// domain=): without them the "$" was not recognised as the separator, the whole
// line became a urlFilter with a literal "$…" in it — a dead rule that never
// matches, and the intended redirect/exception was silently lost.
const OPT_RE = /^[a-z~][a-z0-9_\-~,=.|*:\[\]\/]*$/i; // "/" for redirect=google-analytics.com/ga.js

function parseNetLine(line) {
  let allow = false;
  if (line.startsWith("@@")) { allow = true; line = line.slice(2); }
  let pattern = line;
  let optStr = "";
  let cspValue = null;
  // $csp=<policy>: the value carries spaces/quotes, so split it off first (it is
  // always the last option in the lists we consume).
  const ci = line.search(/\$(?:[a-z0-9-~,=.|*:]*,)?csp=/i);
  if (ci >= 0) {
    const tail = line.slice(ci + 1);
    const cm = tail.match(/(?:^|,)csp=(.*)$/);
    cspValue = cm ? cm[1].trim() : "";
    if (!CSP_OK(cspValue)) return skip("csp:invalid");
    if (allow) return skip("csp:exception");
    pattern = line.slice(0, ci);
    optStr = tail.replace(/(?:^|,)csp=.*$/, "");
    if (optStr && !OPT_RE.test(optStr)) return skip("csp:bad-options");
  } else {
    const di = line.lastIndexOf("$");
    // "$" в URL шаблон е рядкост; опциите винаги са след последния "$".
    if (di >= 0) {
      const tail = line.slice(di + 1);
      if (OPT_RE.test(tail)) {
        pattern = line.slice(0, di);
        optStr = tail;
      } else if (/[\s'"]/.test(tail)) {
        return skip("opt:quoted-value");
      } else if (/^~?[a-z][a-z0-9-]*(=|,|$)/i.test(tail)) {
        // Options we cannot parse (a regex `removeparam=/^utm_|x/`…): never let
        // them fall into the URL pattern as literal text.
        return skip("opt:unparsable");
      }
    }
  }
  // IDN: `||пример.бг^` → punycode (DNR, като браузъра, вижда само ASCII хостове).
  if (pattern && !isAscii(pattern)) {
    const m = /^(\|\|)([^\^/|*]+)(.*)$/.exec(pattern);
    const ascii = m && toASCII(m[2].toLowerCase());
    if (!ascii || !isAscii(m[3])) return skip("pattern:non-ascii");
    pattern = m[1] + ascii + m[3];
  }
  if (pattern === "*") pattern = "";
  // Regex patterns stay out: an RE2-incompatible regex inside a STATIC ruleset
  // makes Chrome refuse the whole ruleset, and we cannot validate at build time.
  if (pattern.startsWith("/") && pattern.endsWith("/")) return skip("pattern:regex");

  const o = {
    allow, pattern, important: false, matchCase: false, party: null,
    types: [], notTypes: [], initiator: [], notInitiator: [], doc: false,
    redirect: null, csp: cspValue, popup: false,
    to: [], notTo: [], methods: [], notMethods: [], removeparam: null,
  };
  const asciiDomain = (d) => (isAscii(d) ? d : toASCII(d) || d);
  if (optStr) {
    for (const raw of optStr.split(",")) {
      const neg = raw.startsWith("~");
      const t = neg ? raw.slice(1) : raw;
      const [name, val] = t.split("=");
      if (name === "third-party" || name === "3p") { o.party = neg ? "firstParty" : "thirdParty"; continue; }
      if (name === "first-party" || name === "1p") { o.party = neg ? "thirdParty" : "firstParty"; continue; }
      if (name === "important") { o.important = true; continue; }
      if (name === "match-case") { o.matchCase = true; continue; }
      if (name === "document" || name === "doc") { if (neg) return skip("opt:~document"); o.doc = true; continue; }
      // uBO: `all` = every type (DNR's default set, never main_frame — our rule).
      if (name === "all") { if (neg) return skip("opt:~all"); continue; }
      if (name === "method") {
        for (const m of (val || "").toLowerCase().split("|")) {
          const mn = m.replace(/^~/, "");
          if (!/^(connect|delete|get|head|options|patch|post|put)$/.test(mn)) return skip("opt:method-value");
          (m.startsWith("~") ? o.notMethods : o.methods).push(mn);
        }
        continue;
      }
      // `to=` / `denyallow=`: the REQUEST's domain (DNR requestDomains / excludedRequestDomains).
      if (name === "to" || name === "denyallow") {
        for (let d of (val || "").toLowerCase().split("|")) {
          if (!d) continue;
          const isNeg = name === "denyallow" || d.startsWith("~");
          d = asciiDomain(d.replace(/^~/, ""));
          if (!validDomain(d)) { if (!o.allow && isNeg) return skip("to:lossy"); continue; }
          (isNeg ? o.notTo : o.to).push(d);
        }
        if (name === "to" && !o.to.length && !o.notTo.length) return skip("to:empty");
        continue;
      }
      if (name === "removeparam") {
        // Само просто име на параметър: regex/празно („махни всички") не се превеждат.
        if (neg || o.allow || !val || !/^[A-Za-z0-9_.\-\[\]]{1,60}$/.test(val)) return skip("opt:removeparam");
        o.removeparam = val;
        continue;
      }
      if (name === "domain" || name === "from") {
        let had = false, kept = 0, droppedNeg = false;
        for (let d of (val || "").toLowerCase().split("|")) {
          if (!d) continue;
          had = true;
          const isNeg = d.startsWith("~");
          const dn = asciiDomain(isNeg ? d.slice(1) : d);
          if (!validDomain(dn)) { if (isNeg) droppedNeg = true; continue; } // wildcard TLD и др.
          kept++;
          (isNeg ? o.notInitiator : o.initiator).push(dn);
        }
        // За BLOCK правило загубен запис може да РАЗШИРИ обхвата (over-block):
        // паднало ~изключване (напр. ~edu|~gov) или всички positive паднали →
        // пропускаме реда, за да не блокираме по-широко от източника.
        if (!o.allow && (droppedNeg || (had && kept === 0))) return skip("domain:lossy");
        continue;
      }
      if (TYPE_MAP[name]) { (neg ? o.notTypes : o.types).push(TYPE_MAP[name]); continue; }
      if (name === "popup") { if (neg || o.allow) return skip("popup:exception"); o.popup = true; continue; }
      if (name === "redirect") {
        if (neg || o.allow) return skip("redirect:exception");
        const res = REDIRECT_MAP[(val || "").split(":")[0]];
        if (!res) return skip("redirect:" + (val || "").split(":")[0]);
        o.redirect = res;
        continue;
      }
      if (SKIP_OPTS.has(name)) return skip("opt:" + name);
      return skip("unknown:" + name); // непозната опция — по-безопасно е да пропуснем реда
    }
  }
  // Смесени положителни+отрицателни domain= пазят от чупене на сайтове —
  // не ги апроксимираме, пропускаме реда.
  if (o.initiator.length && o.notInitiator.length) return skip("domain:mixed");
  if (o.types.length && o.notTypes.length) o.notTypes = [];
  return o;
}

// Чист ||domain^ (или ||domain/) шаблон -> домейн за сливане, иначе null.
function pureDomain(pattern) {
  const m = /^\|\|([a-z0-9.-]+)[\^/]?$/.exec(pattern.toLowerCase());
  return m && validDomain(m[1]) ? m[1] : null;
}

// Redirects (surrogates) must beat block rules (priority 1) — same as rules/surrogates.json;
// document allows (allowAllRequests) and $important sit above plain allow/block.
const rulePriority = (o) =>
  o.redirect ? 5 : o.doc && o.allow ? 4 : o.important ? (o.allow ? 4 : 3) : o.allow ? 2 : 1;
function actionFor(o) {
  if (o.csp) {
    return { type: "modifyHeaders", responseHeaders: [{ header: "content-security-policy", operation: "append", value: o.csp }] };
  }
  if (o.redirect) return { type: "redirect", redirect: { extensionPath: "/resources/" + o.redirect } };
  if (o.removeparam) return { type: "redirect", redirect: { transform: { queryTransform: { removeParams: [o.removeparam] } } } };
  return { type: o.doc && o.allow ? "allowAllRequests" : o.allow ? "allow" : "block" };
}
function conditionFor(o) {
  const c = {};
  if (o.party) c.domainType = o.party;
  if (o.types.length) c.resourceTypes = [...new Set(o.types)].sort();
  else if (o.notTypes.length) {
    // Chromium: правило само с excludedResourceTypes ползва клона
    // ElementType_ANY & ~exclude — който ЗАПАЗВА main_frame (за разлика от
    // "нито едно"-клона с default mask без main_frame). ABP `$~type` НЕ включва
    // документа, затова за block правила изрично изключваме и main_frame, иначе
    // блокираме навигация (напр. yandex /clck/, /ads/ страници).
    const ex = o.allow ? o.notTypes : [...o.notTypes, "main_frame"];
    c.excludedResourceTypes = [...new Set(ex)].sort();
  }
  if (o.initiator.length) c.initiatorDomains = [...new Set(o.initiator)].sort();
  if (o.notInitiator.length) c.excludedInitiatorDomains = [...new Set(o.notInitiator)].sort();
  if (o.matchCase) c.isUrlFilterCaseSensitive = true;
  if (o.to.length) c.requestDomains = [...new Set(o.to)].sort();
  if (o.notTo.length) c.excludedRequestDomains = [...new Set(o.notTo)].sort();
  if (o.methods.length) c.requestMethods = [...new Set(o.methods)].sort();
  if (o.notMethods.length) c.excludedRequestMethods = [...new Set(o.notMethods)].sort();
  // $removeparam: a navigation/request redirect that only strips the parameter.
  if (o.removeparam && !o.types.length && !o.notTypes.length) c.resourceTypes = ["main_frame", "sub_frame", "xmlhttprequest"];
  // $csp applies to documents only.
  if (o.csp) { c.resourceTypes = ["main_frame", "sub_frame"]; delete c.excludedResourceTypes; }
  return c;
}

// $popup domains (DNR cannot see popups) → baked into the MAIN-world engine as a
// window.open guard (rules/popup_hosts.json → scriptlets/main.js). Pattern (non-
// domain) popup rules stay skipped.
// $popup domains go into opts.popups (a Set) when the caller wants them: only the
// core lists feed the baked window.open guard (scriptlets/main.js runs on every page).

// uBO `$badfilter`: „изключи точно този ред" — така uBlock Origin маха правила от
// EasyList, които чупят сайтове. Събираме ги от основните листи (важат навсякъде)
// и от всеки лист за самия него; редът без опцията badfilter се пропуска.
function badfiltersOf(text) {
  const out = [];
  for (let line of text.split("\n")) {
    line = line.trim();
    const m = /^(.*)\$(.*)$/.exec(line);
    if (!m || !/(^|,)badfilter(,|$)/.test(m[2])) continue;
    const opts = m[2].split(",").filter((x) => x !== "badfilter");
    out.push(opts.length ? m[1] + "$" + opts.join(",") : m[1]);
  }
  return out;
}

// opts: { cap (block pattern rules), badfilter (Set of neutralised lines),
//         popups (Set to collect $popup hosts, or null), maxRules }
// Chrome rejects the WHOLE static ruleset when one urlFilter is invalid: `||` only
// at the start, `|` only at either end, ASCII only, never `||*`. Normalise what can
// be normalised (`||*.x.com/` → `.x.com/`, `x||` → `x|`), refuse the rest.
function normalizeUrlFilter(uf) {
  if (uf.startsWith("||*")) uf = uf.slice(2).replace(/^\*+/, "");
  while (uf.endsWith("||") && uf.length > 2) uf = uf.slice(0, -1);
  const body = uf.replace(/^\|\|?/, "").replace(/\|$/, "");
  if (body.includes("|") || !isAscii(uf)) return null;
  return uf;
}

function convertList(text, key, opts) {
  opts = opts || {};
  const BADFILTER = opts.badfilter || new Set();
  const merge = new Map(); // сигнатура -> {proto, domains:Set}
  const pattern = [];
  let skipped = 0;

  for (let line of text.split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("!") || line.startsWith("[")) continue;
    if (line.includes("##") || line.includes("#@#") || line.includes("#?#") || line.includes("#$#")) continue;
    if (BADFILTER.has(line)) { skip("badfiltered"); skipped++; continue; }
    const o = parseNetLine(line);
    if (!o) { skipped++; continue; }

    const d = pureDomain(o.pattern);
    if (o.popup) {
      if (d && !isProtected(d)) { if (opts.popups) opts.popups.add(d); } else skip("popup:pattern");
      continue;
    }
    if (d && !o.to.length && !o.removeparam) {
      if (!o.allow && isProtected(d)) continue;
      const sig = JSON.stringify([o.allow, o.doc, o.important, o.party, o.types.sort(), o.notTypes.sort(), o.initiator.sort(), o.notInitiator.sort(), o.redirect, o.csp, o.notTo.sort(), o.methods.sort(), o.notMethods.sort()]);
      if (!merge.has(sig)) merge.set(sig, { proto: o, domains: new Set() });
      merge.get(sig).domains.add(d);
    } else {
      // Surrogate redirects on protected hosts are fine (the site keeps working); blocks are not.
      if (!o.allow && !o.redirect && SA_POLICY.NEVER_LIVE.some((p) => o.pattern.includes(p))) continue;
      pattern.push(o);
    }
  }

  const rules = [];
  let id = 1;

  // 1) Слети domain правила (стабилен ред: по сигнатура, домейните сортирани).
  for (const sig of [...merge.keys()].sort()) {
    const { proto, domains } = merge.get(sig);
    const all = [...domains].sort();
    for (let i = 0; i < all.length; i += DOMAINS_PER_RULE) {
      const c = conditionFor(proto);
      c.requestDomains = all.slice(i, i + DOMAINS_PER_RULE);
      if (proto.doc && proto.allow) c.resourceTypes = ["main_frame", "sub_frame"];
      rules.push({
        id: id++,
        priority: rulePriority(proto),
        action: actionFor(proto),
        condition: c,
      });
    }
  }

  // 2) Пътни/шаблонни правила, изключенията винаги влизат, block до капа.
  const cap = opts.cap ?? Infinity;
  let blocks = 0;
  for (const o of pattern) {
    if (!o.allow && blocks >= cap) { skip("cap:" + key); skipped++; continue; }
    // (Only `*` is trimmed: a trailing `|` end-anchor is already in the pattern —
    // appending another one made `x.js||`, a rule that never matched.)
    let uf = normalizeUrlFilter(o.pattern.replace(/^\*+/, "").replace(/\*+$/, ""));
    if (uf === null) { skip("pattern:invalid-for-dnr"); skipped++; continue; }
    // DNR сравнява case-insensitive спрямо lowercase URL и суровия pattern —
    // pattern с главна буква тихо не match-ва. Свеждаме до lowercase.
    if (!o.matchCase) uf = uf.toLowerCase();
    // Без URL шаблон („*$script,to=x", глобален $removeparam) — валидно САМО ако
    // друго условие стеснява правилото (домейн на заявката/страницата, параметър);
    // иначе би блокирало всичко.
    const narrowed = o.to.length || o.initiator.length || o.removeparam;
    if (uf.length < 3 && !(uf === "" && narrowed)) { skip(uf ? "pattern:too-short" : "pattern:empty"); skipped++; continue; }
    const c = conditionFor(o);
    if (uf) c.urlFilter = uf;
    if (o.doc && o.allow) c.resourceTypes = ["main_frame", "sub_frame"];
    rules.push({
      id: id++,
      priority: rulePriority(o),
      action: actionFor(o),
      condition: c,
    });
    if (!o.allow) blocks++;
  }

  return { rules, skipped };
}

// --- Козметика --------------------------------------------------------------
// Селектор, безопасен за вграждане в CSS файла/JSON (никакво изпълнимо съдържание).
const BROAD = new Set(["*", "html", "body", ":root", "head", "div", "span", "a", "img", "main", "section", "article", "video", "iframe"]);
const cssSafe = (s) =>
  s.length >= 3 && s.length < 400 && !/[{}@]/.test(s) && !BROAD.has(s.toLowerCase());

// Процедурни оператори, които content.js engine-ът разбира.
const PROC_OK = /:(has-text|matches-css|matches-attr|matches-path|matches-media|matches-prop|watch-attr|upward|xpath|min-text-length|remove-attr|remove-class|remove|style)\(/;

function convertCosmetic(text) {
  const generic = new Set();
  const specific = new Map(); // domain -> Set(selector)
  const unhide = new Map();
  const addTo = (map, domain, sel) => {
    if (!map.has(domain)) map.set(domain, new Set());
    map.get(domain).add(sel);
  };

  for (let line of text.split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("!") || line.startsWith("[")) continue;
    let sep, target;
    if (line.includes("#@#")) { sep = "#@#"; target = "unhide"; }
    else if (line.includes("#?#")) { sep = "#?#"; target = "proc"; }
    else if (line.includes("##")) { sep = "##"; target = "hide"; }
    else continue;
    const i = line.indexOf(sep);
    const domPart = line.slice(0, i);
    const sel = line.slice(i + sep.length).trim();
    if (!cssSafe(sel) || !isAscii(sel)) continue;
    if (target === "proc" && !PROC_OK.test(sel)) continue;
    if (sel.includes("+js(") || sel.includes("#$#")) continue;

    const domains = domPart
      ? domPart.toLowerCase().split(",").map((d) => d.trim())
      : [];
    if (!domains.length) {
      if (target === "hide") generic.add(sel);
      continue; // генерични unhide/procedural — пропускаме (пренебрежимо малко)
    }
    for (const d of domains) {
      const neg = d.startsWith("~");
      const dn = neg ? d.slice(1) : d;
      if (!validDomain(dn)) continue;
      if (neg) continue; // ~domain изключения при козметика — пропускаме реда за този домейн
      addTo(target === "unhide" ? unhide : specific, dn, sel);
    }
  }
  return { generic, specific, unhide };
}

// uBO препроцесор: `!#if <израз>` … `!#else` … `!#endif`. Ние сме Chromium MV3.
const PRE_TRUE = new Set(["env_chromium", "env_mv3", "cap_user_stylesheet", "ext_ublock"]);
function preprocess(text) {
  const out = [];
  const stack = []; // [active, parentActive]
  let active = true;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("!#if ")) {
      const expr = line.slice(5).trim();
      const val = expr.split("||").some((part) => part.split("&&").every((t) => {
        t = t.trim(); const neg = t.startsWith("!"); const k = neg ? t.slice(1).trim() : t;
        const v = PRE_TRUE.has(k); return neg ? !v : v;
      }));
      stack.push([active, val]);
      active = active && val;
      continue;
    }
    if (line === "!#else") { if (stack.length) { const [parent, val] = stack[stack.length - 1]; active = parent && !val; } continue; }
    if (line === "!#endif") { if (stack.length) active = stack.pop()[0]; continue; }
    if (active) out.push(raw);
  }
  return out.join("\n");
}

// hosts формат: "0.0.0.0 domain" / "127.0.0.1 domain" / голи домейни → ||domain^
function hostsToAbp(text) {
  const out = [];
  for (let line of text.split("\n")) {
    line = line.replace(/#.*/, "").trim();
    if (!line) continue;
    const d = line.split(/\s+/).pop().toLowerCase();
    if (validDomain(d) && d !== "localhost") out.push("||" + d + "^");
  }
  return out.join("\n");
}

// Хостове с @@…$generichide / $elemhide — EasyList изрично изключва генеричната
// козметика там (напр. accounts.google.com, howtogeek.com). Пренасяме ги, за да
// НЕ прилагаме cosmetic_generic.css на тези сайтове (иначе скриваме легитимен UI).
function collectGenericHide(text) {
  const hosts = new Set();
  for (let line of text.split("\n")) {
    line = line.trim();
    if (!line.startsWith("@@")) continue;
    if (line.includes("##") || line.includes("#@#") || line.includes("#?#") || line.includes("#$#")) continue;
    const di = line.lastIndexOf("$");
    if (di < 0) continue;
    const opts = line.slice(di + 1);
    if (!/(^|,)(generichide|ghide|elemhide|ehide)(,|$)/.test(opts)) continue;
    const body = line.slice(2, di).toLowerCase();
    const m = /^\|\|([a-z0-9.-]+)(?:[\^/]|$)/.exec(body);
    if (m && validDomain(m[1])) hosts.add(m[1]);
    const dm = /domain=([^,]+)/.exec(opts);
    if (dm) for (const d of dm[1].toLowerCase().split("|")) {
      if (d && !d.startsWith("~") && validDomain(d)) hosts.add(d);
    }
  }
  return hosts;
}


root.ABP2DNR = {
  parseNetLine, convertList, convertCosmetic, collectGenericHide, badfiltersOf,
  preprocess, hostsToAbp, validDomain, isAscii, SKIP_REASONS, REDIRECT_MAP, TYPE_MAP,
};
})(typeof self !== "undefined" ? self : this);
