// 5.5.0 — новите scriptlet-и през ЕДИНСТВЕНИЯ валидатор (scriptlets/policy.js) и билда:
// какво пропускаме от списъка на uBO, какво никога (обработчици на събития, srcdoc, URL от
// непозната стойност, прототипи на живо), граматиката на аргументите (кавички, „\,“),
// „entity“ домейните (example.*) и „~host“ изключенията. Поведението им в истински
// Chromium е в tests/browser/scriptlets.browser.mjs.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { ROOT, ok, done } from "./_harness.mjs";

const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(ROOT, "scriptlets", "policy.js"), "utf8") + ";this.P = SA_POLICY;", ctx);
const P = ctx.P;
const V = (name, args, live = false) => P.validateDirective(P.canonical(name), args, live);

// ---- names and aliases ----
ok("aliases: cookie-remover / prevent-fetch / prevent-window-open map to the routines we have",
  P.canonical("cookie-remover") === "remove-cookie" && P.canonical("prevent-fetch") === "no-fetch-if" && P.canonical("prevent-window-open") === "no-window-open-if");
ok("aliases: nano-stb / adjust-setTimeout and nano-sib / adjust-setInterval",
  P.canonical("adjust-setTimeout") === "nano-stb" && P.canonical("nano-setInterval-booster") === "nano-sib");
ok("still no trusted-* and no rpnt", P.canonical("trusted-set") === null && P.canonical("rpnt") === null && P.canonical("trusted-replace-xhr-response") === null);

// ---- build profile accepts what the uBO lists say ----
ok("set-constant: {} [] throwFunc '\"\"' and (chain) alone", V("set", ["a.b", "{}"]) && V("set", ["a", "[]"]) && V("set", ["a", "throwFunc"]) && V("set", ["a", '""']) && V("set", ["a"]));
ok("set-constant: runAt interactive", V("set", ["a.b", "false", "runAt", "interactive"]) && !V("set", ["a.b", "false", "runAt", "whenever"]));
ok("prototype chains: allowed for the property routines in the baked list", V("set", ["Object.prototype.hideAds", "true"]) && V("aost", ["String.prototype.charCodeAt", "ai_"]) && V("acs", ["EventTarget.prototype.addEventListener", "delete window"]));
ok("prototype chains: never live, never __proto__ / constructor", !V("set", ["Object.prototype.hideAds", "true"], true) && !V("set", ["__proto__.x", "true"]) && !V("set", ["a.constructor.b", "true"]));
ok("json-prune: a stack needle (3rd) in the baked list", V("json-prune", ["a.[-].b", "", "/player/"]) && !V("json-prune", ["a", "", "x"], true));
ok("json-prune-fetch-response: propsToMatch / stackToMatch varargs only", V("json-prune-fetch-response", ["a.[-].ad", "", "propsToMatch", "url:/api"]) &&
  !V("json-prune-fetch-response", ["a", "", "evilKey", "x"]) && !V("json-prune-fetch-response", ["a", "", "propsToMatch"]));
ok("nano-stb: delay \"*\", boost 0 (floor) and 0.02", V("nano-stb", ["_0x", "*"]) && V("nano-stb", ["", "10000", "0"]) && V("nano-sib", ["", "", "0.02"]) && !V("nano-stb", ["", "1000", "x"]));
ok("storage: dictionary values and $remove$, never markup or long numbers",
  V("set-local-storage-item", ["ADB_ACTIVE_STATUS", "$remove$"]) && V("set-session-storage-item", ["adViewed", "true"]) && V("set-local-storage-item", ["n", "-32767"]) &&
  !V("set-local-storage-item", ["k", "<img src=x onerror=alert(1)>"]) && !V("set-local-storage-item", ["k", "9999999999999"]) && !V("set-local-storage-item", ["k", "javascript:x"]));
ok("set-attr: dictionary values and [copy]", V("set-attr", ["img.lazy", "src", "[data-src]"]) && V("set-attr", ["div", "data-x", "1"]) && V("set-attr", ["iframe", "loading", "''"]));
ok("set-attr: never on*, srcdoc or style; URL attributes only as a copy",
  !V("set-attr", ["a", "onclick", "[data-x]"]) && !V("set-attr", ["iframe", "srcdoc", "[data-x]"]) && !V("set-attr", ["a", "style", "''"]) &&
  !V("set-attr", ["a", "href", "1"]) && !V("set-attr", ["img", "src", "true"]));
ok("no-fetch-if: body + type in the baked list", V("no-fetch-if", ["doubleclick", "length:10", '{"type":"cors"}']) && V("prevent-fetch", ["/ads/", "war:noop.json"]) &&
  V("no-fetch-if", ["x", "", "opaque"]) && !V("no-fetch-if", ["x", "<script>"]) && !V("no-fetch-if", ["x", "", '{"url":"https://evil"}']) && !V("no-fetch-if", ["x", "length:10"], true));
ok("nowoif: seconds + obj decoy", V("nowoif", ["!x", "10", "obj"]) && V("nowoif", ["", "1"]) && !V("nowoif", ["x", "10", "iframe"]));
ok("remove-attr / remove-class: a when token", V("ra", ["href|target", "a[target]", "stay"]) && V("rc", ["x", ".y", "complete"]) && !V("ra", ["x", ".y", "evil"]));
ok("remove-cookie: when scroll keydown", V("cookie-remover", ["ad_", "when", "scroll keydown"]) && !V("remove-cookie", ["ad_", "when", "unload"]));
ok("timers: a delay range in the baked list", V("nostif", ["", "2000-5000"]) && !V("nostif", ["", "2000-5000"], true));
ok("argument-less defusers take no arguments", V("nofab", []) && V("nobab", []) && V("popads-dummy", []) && !V("nofab", ["x"]));
ok("the 5.5.0 routines exist for the baked list only (no live channel)", !V("noeval-if", ["ads"], true) && !V("xml-prune", ["Ad"], true) && !V("set-attr", ["a", "x", "1"], true));

// ---- the build: quoting, escaped commas, entities, ~host ----
const dir = mkdtempSync(join(tmpdir(), "sa-55-"));
const list = join(dir, "list.txt"), out = join(dir, "main.js");
writeFileSync(list, [
  "a.com##+js(xml-prune, 'xpath(//*[contains(text(),\"x\")])', , .mpd)",
  "a.com##+js(m3u-prune, /a(.|\\n){1\\,100}b/gm, x.m3u8)",
  "a.com,~b.a.com##+js(set-constant, flag, true)",
  "shop.*,a.com##+js(set-constant, shopFlag, true)",
  "lk21.*>>##+js(set-constant, bad, true)",
].join("\n") + "\n");
execFileSync("node", [join(ROOT, "tools", "build_scriptlets.mjs"), `--list=${list}`, `--out=${out}`], { stdio: "ignore" });
const src = readFileSync(out, "utf8");
const MAP = JSON.parse(src.match(/var MAP = (\{.*?\});\n/s)[1]);
ok("build: a quoted argument keeps its commas", JSON.stringify(MAP["a.com"]).includes('xpath(//*[contains(text(),\\"x\\")])'));
ok("build: \\, is a literal comma", JSON.stringify(MAP["a.com"]).includes("{1,100}"));
ok("build: ~b.a.com becomes an exception entry there", JSON.stringify(MAP["b.a.com"]) === JSON.stringify([["#@", "set-constant", "flag", "true"]]));
ok("build: an entity keeps its line, exact hosts on the same line too", JSON.stringify(MAP["shop.*"]) === JSON.stringify([["set-constant", "shopFlag", "true"]]) && JSON.stringify(MAP["a.com"]).includes("shopFlag"));
ok("build: an unknown host form drops the line", !JSON.stringify(MAP).includes('"bad"'));

// ---- the shipped bundle: entities ride in the manifest content script ----
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const ent = manifest.content_scripts.find((c) => (c.js || []).includes("scriptlets/ubo/entities.js"));
const entSrc = readFileSync(join(ROOT, "scriptlets", "ubo", "entities.js"), "utf8");
const entData = JSON.parse(entSrc.match(/value: (\{.*\}), configurable/s)[1].replace(/\\u0028/g, "(").replace(/\\u0020/g, " "));
ok(`manifest: the entity data script runs in the MAIN world at document_start, only where a glob matches (${ent ? ent.include_globs.length : 0} entities)`,
  !!ent && ent.world === "MAIN" && ent.run_at === "document_start" && ent.all_frames === true && ent.matches.join() === "<all_urls>" &&
  ent.include_globs.length > 1000 && ent.include_globs.every((g) => /^\*:\/\/\*[a-z0-9.-]+\.\*\/\*$/.test(g)));
ok("manifest globs == the entities in the data file", ent && ent.include_globs.length === Object.keys(entData).length &&
  Object.keys(entData).every((k) => ent.include_globs.includes("*://*" + k.slice(0, -1) + "*/*")));
ok("entity data removes itself if no engine took it (allowlisted site, protection off)", /setTimeout\(function \(\) \{ try \{ delete document\.__tbabScriptletEntities; \} catch \(e\) \{\} \}, 0\);/.test(entSrc));
const bg = readFileSync(join(ROOT, "background.js"), "utf8");
ok("SW: while the uBO list is off, entities-off.js runs first and drops that data", /if \(!uboOn\) \{\s*all\.unshift\(\{\s*id: UBO_ENTITIES_OFF_ID[\s\S]{0,80}scriptlets\/entities-off\.js/.test(bg) &&
  /delete document\.__tbabScriptletEntities/.test(readFileSync(join(ROOT, "scriptlets", "entities-off.js"), "utf8")));
const meta = readFileSync(join(ROOT, "scriptlets", "ubo_index.json"), "utf8");
ok("bundle: more than 9,000 uBO directives baked (6,608 in 5.1.8)", (() => {
  let n = 0;
  for (const f of JSON.parse(meta)) { const s = readFileSync(join(ROOT, f.file), "utf8"); n += (s.match(/\],\[|\[\[/g) || []).length; }
  return n + Object.values(entData).reduce((a, v) => a + v.length, 0) > 9000;
})());

done();
