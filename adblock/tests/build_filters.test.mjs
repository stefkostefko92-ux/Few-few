// tools/build_filters.mjs се пуска НАИСТИНА (върху фикстури, с --out в temp),
// не само се грепва. Причина: преименуването priorityOf → rulePriority изпусна
// едно извикване и седмичният ребилд на листите гърмеше с ReferenceError, докато
// всички тестове бяха зелени — те четяха изходния код, но никога не го изпълняваха.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, ok, done } from "./_harness.mjs";
import { genericCss, SAFE_CSS_SELECTOR } from "../tools/generic_css.mjs";

// generic_css.mjs: индексируеми списъци само от доказано валидни селектори; всичко
// друго — отделно правило (невалидното пада само, не повлича 500 други).
{
  const css = genericCss(["#a", ".b-c", "div.x > span[data-y=\"1;2\"]", "a:not(.z)", ".\\[x\\]", ".щ", "#e{x}", "[style=\"a{b}\"]", "ins.adsbygoogle[data-ad-slot]"], 3);
  ok("genericCss: one nested block gated by html[data-tbab-on]", css.includes("html[data-tbab-on]{\n") && css.trimEnd().endsWith("}"));
  ok("genericCss: provably valid selectors share a list", css.includes("#a,\n.b-c,\ndiv.x > span[data-y=\"1;2\"]{display:none!important}"));
  ok("genericCss: pseudo-class / escape / non-ASCII each get their own rule", ["a:not(.z){", ".\\[x\\]{", ".щ{"].every((r) => css.includes(r)));
  ok("genericCss: a brace outside quotes never enters (cannot close the rule)", !css.includes("#e{x}"));
  ok("genericCss: braces inside a quoted value are fine", css.includes("[style=\"a{b}\"]"));
  ok("SAFE_CSS_SELECTOR rejects what it cannot prove", !SAFE_CSS_SELECTOR.test("a:hover") && !SAFE_CSS_SELECTOR.test(".1x") && !SAFE_CSS_SELECTOR.test("[x=\"a\\\"b\"]") && SAFE_CSS_SELECTOR.test("div[id^=\"ad-\"] > .x"));
}

const fx = mkdtempSync(join(tmpdir(), "sa-bf-fx-"));
const out = mkdtempSync(join(tmpdir(), "sa-bf-out-"));

writeFileSync(join(fx, "easylist.txt"), [
  "[Adblock Plus 2.0]",
  "! Title: fixture",
  "||ads.example-network.com^",                                   // домейн → слято requestDomains правило
  "/banner/ad-*.js",                                              // ПЪТНО правило — точно редът, който гърмеше
  "@@||good.example.com/ads.js",                                  // изключение
  "||popunder-host.example^$popup",                               // → popup_hosts.json, не DNR
  "||cdn.example.com/gpt.js$script,redirect=googletagservices_gpt.js", // сурогат
  "||csp.example.com^$csp=script-src 'none'",                     // валиден $csp
  "||evil-csp.example.com^$csp=default-src 'self'; report-uri https://evil.example/c", // отказан
  "||googlevideo.com^",                                           // защитен домейн — никога block
  "##.ad-banner",
  "example.com##.sponsored-box",
  "@@||gh.example^$generichide",
].join("\n") + "\n");
writeFileSync(join(fx, "easyprivacy.txt"), "[Adblock Plus 2.0]\n||tracker.example.org^$third-party\n/pixel/track.gif\n");
writeFileSync(join(fx, "urlhaus.txt"), "# fixture\n127.0.0.1 malware.example\n127.0.0.1 ytimg.com\n");

let ran = false, stdout = "";
try {
  stdout = execFileSync("node", [join(ROOT, "tools", "build_filters.mjs"), "--local", fx, "--out", out, "--report"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  ran = true;
} catch (e) {
  stdout = String(e.stderr || e.message);
}
ok("build_filters.mjs runs to completion on fixtures (no ReferenceError)" + (ran ? "" : " — " + stdout.split("\n").slice(0, 3).join(" | ")), ran);

const read = (...p) => JSON.parse(readFileSync(join(out, ...p), "utf8"));
if (ran) {
  const el = read("rules", "easylist.json");
  const ep = read("rules", "easyprivacy.json");
  const all = [...el, ...ep];
  const byFilter = (s) => all.find((r) => r.condition.urlFilter && r.condition.urlFilter.includes(s));
  const path = byFilter("/banner/ad-");
  ok("path rule converted: block, priority 1", !!path && path.action.type === "block" && path.priority === 1);
  const allow = byFilter("good.example.com/ads.js");
  ok("exception converted: allow, priority above block", !!allow && allow.action.type === "allow" && allow.priority > 1);
  const redir = byFilter("cdn.example.com/gpt.js");
  ok("$redirect → our surrogate, priority 5", !!redir && redir.action.type === "redirect" && redir.action.redirect.extensionPath === "/resources/gpt.js" && redir.priority === 5);
  const domains = all.filter((r) => r.condition.requestDomains).flatMap((r) => r.condition.requestDomains);
  ok("domain rule merged into requestDomains", domains.includes("ads.example-network.com"));
  ok("protected domain (googlevideo.com) never blocked", !domains.includes("googlevideo.com") && !all.some((r) => r.action.type === "block" && JSON.stringify(r.condition).includes("googlevideo")));
  const csp = all.filter((r) => r.action.type === "modifyHeaders");
  ok("$csp: valid policy kept, report-uri one refused", csp.some((r) => JSON.stringify(r).includes("csp.example.com")) && !csp.some((r) => JSON.stringify(r).includes("report-uri")));
  ok("no block rule can reach main_frame", !all.some((r) => r.action.type === "block" && (r.condition.resourceTypes || []).includes("main_frame")));
  const ids = all.map((r) => r.id);
  ok("rule ids unique per ruleset", new Set(el.map((r) => r.id)).size === el.length && new Set(ep.map((r) => r.id)).size === ep.length);
  ok("popup domain → popup_hosts.json", read("rules", "popup_hosts.json").includes("popunder-host.example"));
  const uh = read("rules", "urlhaus.json").flatMap((r) => r.condition.requestDomains);
  ok("URLhaus: malware domain kept, protected ytimg.com dropped", uh.includes("malware.example") && !uh.includes("ytimg.com"));
  const counts = read("rules", "counts.json");
  ok("counts.json written with popupHosts", counts.popupHosts === read("rules", "popup_hosts.json").length && counts.easylist === el.length);
  const css = readFileSync(join(out, "cosmetic_generic.css"), "utf8");
  ok("generic cosmetic CSS gated behind html[data-tbab-on] (nested block)", /^html\[data-tbab-on\]\{$/m.test(css) && /(^|,\n)\.ad-banner(,\n|\{display:none!important\})/m.test(css));
  // Производителност: голям :is() списък не може да се индексира по id/клас → всеки
  // елемент при всеки style recalc срещу хиляди селектори (Speedtest падаше 45%).
  ok("generic cosmetic CSS has no :is() mega-list (unindexable by the style engine)", !/(^|[\s>+~,]):is\(/m.test(css));
  const spec = read("rules", "cosmetic_specific.json");
  ok("specific cosmetic + generichide collected", (spec.specific["example.com"] || []).includes(".sponsored-box") && spec.genericHide.includes("gh.example"));
  ok("--report prints the skip histogram", /skip reasons/.test(stdout));
  void ids;
}
ok("the repo's own rules/ were NOT touched by the test run", !existsSync(join(out, "..", "rules", "counts.json.tmp")) && readFileSync(join(ROOT, "rules", "counts.json"), "utf8").includes('"easylist"'));

done();
