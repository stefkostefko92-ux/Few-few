// DNR правила + manifest: структурна валидност, никой block не достига main_frame,
// бюджет, RULESET_IDS ↔ manifest синхрон, service worker санитизация.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ok, done, loadBackground } from "./_harness.mjs";

const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const VALID_TYPES = new Set(["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object",
  "xmlhttprequest", "ping", "csp_report", "media", "websocket", "webtransport", "webbundle", "other"]);

let structural = true, reachMain = 0, blocks = 0, enabledTotal = 0;
for (const rr of manifest.declarative_net_request.rule_resources) {
  const rules = JSON.parse(readFileSync(join(ROOT, rr.path), "utf8"));
  const ids = new Set();
  for (const r of rules) {
    if (ids.has(r.id) || !r.action?.type) structural = false;
    ids.add(r.id);
    const c = r.condition || {};
    for (const t of c.resourceTypes || []) if (!VALID_TYPES.has(t)) structural = false;
    if (r.action.type === "block") {
      blocks++;
      const reaches = (c.resourceTypes || []).includes("main_frame") ||
        (!c.resourceTypes && c.excludedResourceTypes && !c.excludedResourceTypes.includes("main_frame"));
      if (reaches) reachMain++;
    }
  }
  if (rr.enabled) enabledTotal += rules.length;
}
ok("rules: every ruleset structurally valid (unique ids, valid types, action)", structural);
ok(`rules: 0 of ${blocks} block rules reach main_frame (navigation never blocked)`, reachMain === 0);
ok(`rules: enabled static budget ${enabledTotal} < 30000`, enabledTotal < 30000);

const bgSrc = readFileSync(join(ROOT, "background.js"), "utf8");
const codeIds = JSON.parse(bgSrc.match(/const RULESET_IDS = (\[[^\]]+\])/)[1]);
const manIds = manifest.declarative_net_request.rule_resources.map((r) => r.id);
ok("rules: RULESET_IDS (code) ↔ manifest rule_resources in sync", [...codeIds].sort().join() === [...manIds].sort().join());
ok("manifest: MV3, CSP strict, scripting present, no externally_connectable",
  manifest.manifest_version === 3 && /script-src 'self'/.test(manifest.content_security_policy?.extension_pages || "") &&
  manifest.permissions.includes("scripting") && !("externally_connectable" in manifest));
ok("package: scriptlets/main.js exists (dynamically registered, must ship)", existsSync(join(ROOT, "scriptlets", "main.js")));

// service worker: sanitizeConfig / safeSelector
const bg = loadBackground();
const cfg = bg.sanitizeConfig({ version: 7, blockDomains: ["||ads.example.com^", "youtube.com", "bad host"], cosmetic: [".ad", "input[type=password]", "[autocomplete*=cc-]", "html *", ".sponsored-box"],
  scriptlets: [
    { h: "Example.com", n: "aopr", a: ["adBlock"] }, { h: "", n: "set", a: ["x", "true"] },
    { h: "s.com", n: "remove-cookie", a: ["/x/"] }, { h: "s.com", n: "set-cookie", a: ["c", "accepted"] },
    { h: "s.com", n: "set-cookie", a: ["sid", "stolen"] }, { h: "youtube.com", n: "set", a: ["x", "true"] },
    { h: "s.com", n: "__proto__", a: ["x"] }, { h: "s.com", n: "trusted-replace-fetch-response", a: ["a", "b"] },
  ] });
ok("bg: blockDomains normalised, protected/invalid dropped", cfg.blockDomains.length === 1 && cfg.blockDomains[0] === "ads.example.com");
ok("bg: cosmetic guards (form/password/cc/universal) applied", cfg.cosmetic.join() === ".ad,.sponsored-box");
const names = cfg.scriptlets.map((s) => s.h + ":" + s.d.join(","));
ok("bg: scriptlets — aliases canonicalised, global/remove-cookie/bad-cookie/protected/proto/trusted dropped",
  names.length === 2 && names.includes("example.com:abort-on-property-read,adBlock") && names.includes("s.com:set-cookie,c,accepted"));
ok("bg: safeSelector policy", bg.safeSelector(".ad-slot") && !bg.safeSelector("[type^=pass]") && !bg.safeSelector("div") && !bg.safeSelector(":not(#x)"));
ok("bg: parseUserDomains never blocks protected hosts", bg.parseUserDomains("||ads.x.com^\nyoutube.com\n! c\nnot a domain").join() === "ads.x.com");

// Сурогати: всеки redirect сочи към съществуващ ресурс; privacy: Set-Cookie strip; chunk-нати live правила
const surrogates = JSON.parse(readFileSync(join(ROOT, "rules", "surrogates.json"), "utf8"));
ok("surrogates: every redirect target exists under resources/ and beats block priority",
  surrogates.every((r) => r.action.type === "redirect" && r.priority > 1 && existsSync(join(ROOT, r.action.redirect.extensionPath.replace(/^\//, "")))));
ok("surrogates: IMA SDK, comScore and Outbrain are covered", ["ima3.js", "scorecardresearch.js", "outbrain.js"].every((f) => surrogates.some((r) => r.action.redirect.extensionPath.endsWith("/" + f))));
const privacy = JSON.parse(readFileSync(join(ROOT, "rules", "privacy.json"), "utf8"));
const strip = privacy.find((r) => r.action.type === "modifyHeaders");
ok("privacy: third-party Set-Cookie strip rule present, never main_frame",
  !!strip && strip.action.responseHeaders.some((h) => h.header === "set-cookie" && h.operation === "remove") && strip.condition.domainType === "thirdParty" && !(strip.condition.resourceTypes || []).includes("main_frame") && strip.condition.requestDomains.length >= 20);
const many = Array.from({ length: 20500 }, (_, i) => `d${i}.example`);
const live = bg.domainBlockRules(many, 100000, 20000);
ok("live rules: 20 000 domains → 20 chunked rules, ids 100000..100019, ≤1000 each, never main_frame",
  live.length === 20 && live[0].id === 100000 && live[19].id === 100019 && live.every((r) => r.condition.requestDomains.length <= 1000 && !r.condition.resourceTypes.includes("main_frame") && r.action.type === "block") && live.reduce((n, r) => n + r.condition.requestDomains.length, 0) === 20000);
ok("user rules: cap 2000 → 2 rules from 80000; empty → none", bg.domainBlockRules(many, 80000, 2000).length === 2 && bg.domainBlockRules([], 80000, 2000).length === 0);

const popupHosts = JSON.parse(readFileSync(join(ROOT, "rules", "popup_hosts.json"), "utf8"));
ok("popup hosts: >1000 clean domains from EasyList $popup, none protected", popupHosts.length > 1000 && popupHosts.every((h) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) && !popupHosts.some((h) => /(^|\.)(youtube|google|googleapis|gstatic)\.com$/.test(h)));
ok("popup hosts are baked into shipped main.js", readFileSync(join(ROOT, "scriptlets", "main.js"), "utf8").includes(JSON.stringify(popupHosts.slice(0, 3)).slice(0, -1)));

done();
