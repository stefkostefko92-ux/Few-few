// Паритет на политиката между трите валидатора (engine.js · background.js ·
// tools/build_scriptlets.mjs). Таблиците са дублирани умишлено (engine работи в
// MAIN world без import; background е класически SW скрипт) — този тест превръща
// случайното съвпадение в гейт. Инвариант: live (background+engine) е строго
// надмножество по строгост спрямо build (печен, доверен списък).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ok, done } from "./_harness.mjs";

const engine = readFileSync(join(ROOT, "scriptlets", "engine.js"), "utf8");
const bg = readFileSync(join(ROOT, "background.js"), "utf8");
const build = readFileSync(join(ROOT, "tools", "build_scriptlets.mjs"), "utf8");

const list = (src, re) => { const m = src.match(re); return m ? m[1].match(/"([^"]*)"/g).map((s) => s.slice(1, -1)).sort().join("|") : null; };
const regexLit = (src, name) => { const m = src.match(new RegExp("(?:var|const) " + name + " = (/.*/[a-z]*);")); return m ? m[1] : null; };

// 1) set-cookie value dictionary
const cvEngine = list(engine, /var COOKIE_VALUES = \[([\s\S]*?)\];/);
const cvBg = list(bg, /const SCRIPTLET_COOKIE_VALUES = new Set\(\[([\s\S]*?)\]\);/);
const cvBuild = list(build, /const COOKIE_VALUES = new Set\(\[([\s\S]*?)\]\);/);
ok("COOKIE_VALUES identical in engine/background/build", cvEngine && cvEngine === cvBg && cvBg === cvBuild);

// 2) set-cookie name policy (charset + denylist)
ok("COOKIE_NAME regex identical (engine ↔ background ↔ build)",
  regexLit(engine, "COOKIE_NAME") && regexLit(engine, "COOKIE_NAME") === regexLit(bg, "SCRIPTLET_COOKIE_NAME") && build.includes(regexLit(engine, "COOKIE_NAME")));
ok("COOKIE_NAME_DENY regex identical (engine ↔ background ↔ build)",
  regexLit(engine, "COOKIE_NAME_DENY") && regexLit(engine, "COOKIE_NAME_DENY") === regexLit(bg, "SCRIPTLET_COOKIE_NAME_DENY") && build.includes(regexLit(engine, "COOKIE_NAME_DENY")));

// 3) set-constant dictionary: engine tokenValue cases ⊇ build/background sets
const scBuild = list(build, /const SETCONST_VALUES = new Set\(\[([\s\S]*?)\]\);/);
const scBg = list(bg, /const SCRIPTLET_SETCONST = new Set\(\[([\s\S]*?)\]\);/);
const tokenBody = engine.match(/function tokenValue\(raw\) \{([\s\S]*?)\n  \}/)[1];
const engineCases = [...tokenBody.matchAll(/case "([^"]*)":/g)].map((m) => m[1]);
ok("SETCONST dictionary identical (build ↔ background)", scBuild && scBuild === scBg);
ok("engine tokenValue accepts exactly the shared dictionary", scBuild.split("|").every((v) => engineCases.includes(v)) && engineCases.every((v) => scBuild.split("|").includes(v)));

// 4) selector policy (engine safeSel ↔ background safeSelector)
for (const name of ["FORM_TARGET", "FORM_ATTR", "UNIVERSAL"]) {
  ok(`${name} regex identical (engine ↔ background)`, regexLit(engine, name) && regexLit(engine, name) === regexLit(bg, name));
}
const unsafeEngine = list(engine, /var UNSAFE_SEL = \[([\s\S]*?)\];/);
const unsafeBg = list(bg, /const UNSAFE_SELECTORS = new Set\(\[([\s\S]*?)\]\);/);
ok("UNSAFE selector list identical (engine ↔ background)", unsafeEngine && unsafeEngine === unsafeBg);

// 5) attribute denylist
ok("ATTR_DENY regex identical (engine ↔ background)", regexLit(engine, "ATTR_DENY") && regexLit(engine, "ATTR_DENY") === regexLit(bg, "SCRIPTLET_ATTR_DENY"));
ok("TAG_DENY regex identical (engine ↔ background)", regexLit(engine, "TAG_DENY") && regexLit(engine, "TAG_DENY") === regexLit(bg, "SCRIPTLET_TAG_DENY"));

// 6) alias tables identical (build ↔ background); IMPL keys == canonical set
const aliases = (src, re) => { const m = src.match(re); return [...m[1].matchAll(/"([^"]+)": "([^"]+)"/g)].map((x) => x[1] + "=" + x[2]).sort().join("|"); };
const alBuild = aliases(build, /const ALIASES = \{([\s\S]*?)\n\};/);
const alBg = aliases(bg, /const SCRIPTLET_ALIASES = \{([\s\S]*?)\n\};/);
ok("ALIASES identical (build ↔ background)", alBuild === alBg);
const impl = [...engine.matchAll(/^ {4}"([\w-]+)": function/gm)].map((m) => m[1]).sort().join("|");
const canon = [...new Set(alBuild.split("|").map((p) => p.split("=")[1]))].sort().join("|");
ok("IMPL keys == canonical alias targets", impl === canon);

done();
