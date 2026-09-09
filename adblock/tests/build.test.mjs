// Билд валидатор (list.txt → main.js): отхвърля зловредни директиви, пази $-аргументи,
// sync guard (IMPL ↔ ALIASES), --check свежест.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Script } from "node:vm";
import { ROOT, ok, done } from "./_harness.mjs";

const BUILD = join(ROOT, "tools", "build_scriptlets.mjs");
const dir = mkdtempSync(join(tmpdir(), "sa-build-"));
const build = (lines) => {
  const list = join(dir, "list.txt"), out = join(dir, "main.js");
  writeFileSync(list, lines.join("\n") + "\n");
  const r = spawnSync("node", [BUILD, `--list=${list}`, `--out=${out}`], { encoding: "utf8" });
  return { code: r.status, log: r.stdout + r.stderr, out: r.status === 0 ? readFileSync(out, "utf8") : "" };
};
const mapOf = (src) => JSON.parse(src.match(/var MAP = (\{.*\});/)[1]);

// 1) зловредни/невалидни директиви се дропват, валидната остава
const bad = build([
  "##+js(set-constant, __proto__.polluted, true)",
  "##+js(set-constant, foo, alert(1))",
  "##+js(eval, document.cookie)",
  "##+js(set-constant, foo.constructor.x, true)",
  "##+js(no-setTimeout-if, x, notanumber)",
  "##+js(set-constant, foo)",
  "badhost_no_tld##+js(set-constant, foo, true)",
  "##+js(remove-attr, onclick, </script><script>evil)",
  "##+js(remove-node-text, script)",
  "##+js(nowebrtc, extra)",
  "##+js(set-cookie, sid, arbitrary-value)",
  "##+js(set-constant, ok.prop, false)",
]);
ok("build: 11 malicious/invalid dropped, 1 kept", bad.code === 0 && JSON.stringify(mapOf(bad.out)) === '{"":[["set-constant","ok.prop","false"]]}');

// 2) $ в regex аргумент оцелява verbatim (String.replace $-инжекция)
const dollar = build(["example.com##+js(no-fetch-if, /ads\\.js$/)", "test.com##+js(no-window-open-if, /pop$'up/)"]);
const m = mapOf(dollar.out);
ok("build: $-args survive verbatim, main.js valid", m["example.com"][0][1] === "/ads\\.js$/" && m["test.com"][0][1] === "/pop$'up/" && (new Script(dollar.out), true));

// 3) всички scriptlet-и с валидни аргументи минават (вкл. новите)
const all = build([
  "a.com##+js(abort-on-stack-trace, detect, evil.js)", "a.com##+js(set-cookie, consent, accepted)",
  "a.com##+js(remove-cookie, /^_ga/)", "a.com##+js(nowebrtc)", "a.com##+js(href-sanitizer, a.out, ?u)",
  "a.com##+js(rmnt, script, detect)", "a.com##+js(aeld, click, popunder)", "a.com##+js(json-prune, ads)",
]);
ok("build: all new scriptlets + aliases accepted", all.code === 0 && mapOf(all.out)["a.com"].length === 8);

// 4) sync guard: alias без IMPL → билдът пада шумно
{
  const src = readFileSync(BUILD, "utf8").replace('"nowebrtc": "nowebrtc",', '"nowebrtc": "nowebrtc", "bogus": "bogus-scriptlet",');
  const broken = join(dir, "build_broken.mjs"); writeFileSync(broken, src);
  const list = join(dir, "l2.txt"); writeFileSync(list, "##+js(set-constant, a, true)\n");
  const r = spawnSync("node", [broken, `--engine=${join(ROOT, "scriptlets", "engine.js")}`, `--list=${list}`, `--out=${join(dir, "o2.js")}`], { encoding: "utf8" });
  ok("build: IMPL↔ALIASES drift fails the build", r.status === 1 && /has no IMPL/.test(r.stdout + r.stderr));
}

// 5) --check: shipped main.js е свеж спрямо list.txt
const chk = spawnSync("node", [BUILD, "--check"], { encoding: "utf8" });
ok("build: shipped scriptlets/main.js is up to date (--check)", chk.status === 0);

done();
