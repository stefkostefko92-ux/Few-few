// /test (server/test.html) — „Работи ли?“ демонстрацията. Всеки ред се опира на ИСТИНСКО правило/селектор от
// пакета; ако билдът на филтрите го махне, страницата би лъгала (би показвала „не е блокирано“ при работещо
// разширение), затова този тест пада. Избрани са стабилни източници:
//  • мрежа: ad_rules.json, id 211 `/ad-banner` — идва от tools/generate_rules.py (PATH_PATTERNS, фиксирани id-та),
//    не от EasyList, който се сменя с всеки билд; без domainType/initiatorDomains/requestDomains → важи и за first-party;
//  • козметика: `#ad-banner-top` в cosmetic_generic.css (старо EasyList генерично правило);
//  • параметри: removeparam.json, utm_source= и fbclid= (main_frame);
//  • GPC / банер: gpc.js и cookies.js REJECT_CMP (`#onetrust-reject-all-handler`).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ok, done } from "./_harness.mjs";

const read = (p) => readFileSync(join(ROOT, p), "utf8");
const json = (p) => JSON.parse(read(p));
const html = read("server/test.html");
const code0 = html.slice(html.lastIndexOf("<script>"));
const ORIGIN = "https://adblock.carbonstealth.eu";

// Минимален DNR urlFilter: `||`, `|`, `^`, `*`, иначе подниз. Достатъчен за правилата тук.
function matches(urlFilter, url, caseSensitive = false) {
  let f = urlFilter, re = "";
  if (f.startsWith("||")) { re += "^[a-z][a-z0-9+.-]*://(?:[^/?#]*\\.)?"; f = f.slice(2); }
  else if (f.startsWith("|")) { re += "^"; f = f.slice(1); }
  const end = f.endsWith("|"); if (end) f = f.slice(0, -1);
  for (const ch of f) re += ch === "*" ? ".*" : ch === "^" ? "(?:[^\\w\\d_.%-]|$)" : ch.replace(/[.+?${}()|[\]\\/]/g, "\\$&");
  return new RegExp(re + (end ? "$" : ""), caseSensitive ? "" : "i").test(url);
}
ok("matcher: || ^ * and plain substring", matches("||a.com^", "https://x.a.com/p") && !matches("||a.com^", "https://ba.com/") && matches("/ad-banner", `${ORIGIN}/test/ad-banner.js`) && matches("a*c", "xabcx") && !matches("|http", "xhttp"));

// ---- 1. мрежа ----
const probe = (html.match(/load\("(\/test\/[^"]+)"/g) || []).map((m) => m.slice(6, -1));
ok(`page loads two first-party probes: ${probe.join(", ")}`, probe.length === 2 && probe.every((p) => p.startsWith("/test/") && existsSync(join(ROOT, "server", p))));
const [PROBE, CONTROL] = probe;
const rule = json("rules/ad_rules.json").find((r) => r.id === 211);
const c = rule?.condition || {};
ok("ad_rules.json id 211 is `/ad-banner`, a block rule", rule?.action.type === "block" && c.urlFilter === "/ad-banner");
ok("…it applies to first-party scripts (no domainType / initiator / request domain limits, script is a resource type)",
  !c.domainType && !c.initiatorDomains && !c.excludedInitiatorDomains && !c.requestDomains && !c.excludedRequestDomains && !c.regexFilter && c.resourceTypes.includes("script"));
ok("…and the probe URL matches that exact rule", matches(c.urlFilter, ORIGIN + PROBE, c.isUrlFilterCaseSensitive === true));
// the control must be matched by NO blocking rule of the always-on rulesets, or „blocked“ would mean nothing
const hits = [];
for (const rs of ["ad_rules", "easylist", "easyprivacy", "surrogates"]) {
  for (const r of json(`rules/${rs}.json`)) {
    if (r.action.type !== "block" || !r.condition.urlFilter) continue;
    if (matches(r.condition.urlFilter, ORIGIN + CONTROL, r.condition.isUrlFilterCaseSensitive === true)) hits.push(`${rs}#${r.id}`);
  }
}
ok(`the control file matches no block rule (${hits.join(", ") || "none"})`, hits.length === 0 && PROBE !== CONTROL);

// никое allow/allowAllRequests правило (приоритет >= на блока) не отменя пробата, документа /test или removeparam адреса —
// иначе страницата би показала „Not blocked“ при работещо разширение след следващ билд на EasyList.
const HOST = new URL(ORIGIN).hostname;
const inDomains = (list) => !list || list.some((d) => HOST === d || HOST.endsWith("." + d));
function overrides(r, url, type, minPriority) {
  const k = r.condition;
  if (!["allow", "allowAllRequests"].includes(r.action.type) || !k.urlFilter || (r.priority || 1) < minPriority) return false;
  if (k.resourceTypes && !k.resourceTypes.includes(type)) return false;
  if (k.excludedResourceTypes?.includes(type)) return false;
  if (k.domainType === "thirdParty") return false;
  if (k.initiatorDomains && !inDomains(k.initiatorDomains)) return false;
  if (k.requestDomains && !inDomains(k.requestDomains)) return false;
  return matches(k.urlFilter, url, k.isUrlFilterCaseSensitive === true);
}
const over = [];
const qs = "/test" + new URL(link0(), ORIGIN).search;
function link0() { return (html.match(/id="trk-link" href="([^"]+)"/) || [])[1].replace(/&amp;/g, "&"); }
for (const rs of ["ad_rules", "easylist", "easyprivacy", "surrogates", "privacy", "youtube_rules", "removeparam"]) {
  if (!existsSync(join(ROOT, `rules/${rs}.json`))) continue;
  for (const r of json(`rules/${rs}.json`)) {
    if (overrides(r, ORIGIN + PROBE, "script", rule.priority || 1)) over.push(`${rs}#${r.id} (probe)`);
    if (overrides(r, ORIGIN + "/test", "main_frame", 1) || overrides(r, ORIGIN + qs, "main_frame", 1)) over.push(`${rs}#${r.id} (page)`);
  }
}
ok(`no allow/allowAllRequests rule overrides the probe or the page (${over.join(", ") || "none"})`, over.length === 0);

// ---- 2. козметика ----
const css = read("cosmetic_generic.css");
const block = css.slice(css.indexOf("html[data-tbab-on]{"));
const sels = block.split("\n").map((l) => l.replace(/,$/, "").trim());
const id = (html.match(/id="(ad-banner-top)" class="demo-ad"/) || [])[1];
ok("the sample box id is in the page", id === "ad-banner-top");
ok("`#ad-banner-top` is a selector of cosmetic_generic.css, inside the html[data-tbab-on] gate", css.includes("html[data-tbab-on]{") && sels.includes("#" + id));
ok("the box is not hidden by the page itself (no inline display:none, no .demo-ad hiding rule)", !/id="ad-banner-top"[^>]*style=/.test(html) && !/\.demo-ad\{[^}]*display:none/.test(html));

// ---- 3. параметри ----
const link = (html.match(/id="trk-link" href="([^"]+)"/) || [])[1].replace(/&amp;/g, "&");
const u = new URL(link, ORIGIN);
const names = [...u.searchParams.keys()];
ok(`the link carries only ${names.join(", ")} on /test`, u.pathname === "/test" && names.join() === "utm_source,fbclid");
const rp = json("rules/removeparam.json");
for (const n of names) {
  const r = rp.find((x) => x.condition.urlFilter === n + "=");
  const t = r?.action.redirect?.transform?.queryTransform?.removeParams || [];
  ok(`removeparam.json strips ${n} on navigations (rule ${r?.id}: main_frame, no domain limits)`,
    !!r && matches(r.condition.urlFilter, ORIGIN + "/test" + u.search) && t.includes("utm_source") && t.includes("fbclid") &&
    r.condition.resourceTypes.includes("main_frame") && !r.condition.initiatorDomains && !r.condition.requestDomains && !r.condition.excludedInitiatorDomains);
}

// ---- 4. GPC ----
ok("gpc.js defines navigator.globalPrivacyControl = true", /globalPrivacyControl/.test(read("gpc.js")) && /return true/.test(read("gpc.js")));
ok("the page reads navigator.globalPrivacyControl === true", html.includes("navigator.globalPrivacyControl !== true") && html.includes("data-tbab-on"));

// ---- 5. банер ----
const reject = read("cookies.js").slice(read("cookies.js").indexOf("const REJECT_CMP = ["));
const rejectList = reject.slice(0, reject.indexOf("];"));
ok("cookies.js REJECT_CMP (consent-platform-specific, global tier) contains #onetrust-reject-all-handler", rejectList.includes('"#onetrust-reject-all-handler"'));
ok("the demo banner's Reject button has exactly that id, and is a plain button (submits nothing)", /<button type="button" id="onetrust-reject-all-handler">/.test(html));
ok("a press by the person (isTrusted) is not counted as the extension's", /e\.isTrusted/.test(html));

// ---- резултатът се приписва на разширението само при неговия маркер ----
ok("the page gates every „working“ on the extension's own marker (data-tbab-on) and never claims it blindly",
  /hasAttribute\("data-tbab-on"\)/.test(code0) && /tbab-cookies/.test(code0) && !/show Supreme AdBlock working/.test(html));
ok("without the marker the summary says Supreme AdBlock is not active", /but Supreme AdBlock is not active on this page/.test(html));

// ---- нищо не излиза от страницата ----
const external = [...html.matchAll(/<(script|link|img|iframe|source|video|audio|embed)\b[^>]*\b(?:src|href)="(?:https?:)?\/\/[^"]+"[^>]*>/g)]
  .filter((m) => !/rel="(canonical|alternate)"/.test(m[0]));
ok(`test.html loads no resource from another origin (${external.length})`, external.length === 0);
const code = html.slice(html.lastIndexOf("<script>"));
ok("the inline script makes no network call of its own (no fetch/XHR/beacon/WebSocket/image ping/cross-origin URL)",
  !/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|new Image)\b/.test(code) && !/https?:\/\//.test(code));
ok("exactly one inline script (the checks), no external script tag", (html.match(/<script(?![^>]*ld\+json)[^>]*>/g) || []).length === 1 && !/<script[^>]*\bsrc=/.test(html));
ok("the page says it is a demonstration, not a comparison, and that nothing is sent", /a demonstration, not a comparison/.test(html) && /Nothing on this page is sent anywhere/.test(html));
ok("each of the 5 rows has a „does not prove“ sentence", (html.match(/What it does not prove:/g) || []).length === 5);
ok("the „Not blocked“ section links /support", /If a row says “Not blocked”[\s\S]*href="\/support"/.test(html));

done();
