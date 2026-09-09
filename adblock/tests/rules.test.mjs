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

done();
