// Единствен източник на политиката: scriptlets/policy.js. Този тест гейтва, че
// (1) няма локални копия на таблиците в engine/background/build, (2) policy.js
// е инлайннат в shipped main.js, (3) двата профила (build ↔ live) държат
// инварианта „live приема ⇒ build приема, никога обратното".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { ROOT, ok, done } from "./_harness.mjs";

const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");
const policySrc = read("scriptlets", "policy.js");
const engine = read("scriptlets", "engine.js");
const main = read("scriptlets", "main.js");
const bg = read("background.js");
const build = read("tools", "build_scriptlets.mjs");

// 1) policy.js loads standalone (vm) and exposes the contract
const ctx = {};
runInNewContext(policySrc, ctx);
const P = ctx.SA_POLICY;
ok("policy.js loads in a bare context and exposes SA_POLICY", P && typeof P.validateDirective === "function" && typeof P.safeSelector === "function");
for (const key of ["ALIASES", "CANON", "SETCONST_VALUES", "COOKIE_VALUES", "COOKIE_NAME", "COOKIE_NAME_DENY", "FORM_TARGET", "FORM_ATTR", "UNIVERSAL", "UNSAFE_SELECTORS", "ATTR_DENY", "TAG_DENY", "NEVER_LIVE", "tokenValue", "canonical", "protectedHost"]) {
  ok(`policy exposes ${key}`, key in P);
}

// 2) no local copies anywhere else
const copies = [
  ["engine.js", engine, [/var FORM_ATTR =/, /var COOKIE_VALUES =/, /var UNSAFE_SEL =/, /function tokenValue\(/, /var NEVER_LIVE =/, /var ALIASES =/]],
  ["background.js", bg, [/const SCRIPTLET_ALIASES =/, /const FORM_ATTR =/, /const UNSAFE_SELECTORS =/, /const SCRIPTLET_SETCONST =/, /const NEVER_BLOCK = \[/]],
  ["build_scriptlets.mjs", build, [/const ALIASES = \{/, /const SETCONST_VALUES =/, /const COOKIE_VALUES =/, /^function argSafe\(/m]],
  ["build_filters.mjs", read("tools", "build_filters.mjs"), [/const NEVER_BLOCK = \[/, /const isProtected = \(d\) => NEVER_BLOCK/]],
];
for (const [name, src, res] of copies) ok(`${name}: no local copy of the policy tables`, res.every((r) => !r.test(src)));
ok("engine.js carries the /*__SCRIPTLET_POLICY__*/ marker", engine.includes("/*__SCRIPTLET_POLICY__*/"));
ok("shipped main.js has policy.js inlined (SA_POLICY defined, marker consumed)", main.includes("var SA_POLICY = (function () {") && !main.includes("/*__SCRIPTLET_POLICY__*/"));
ok("background.js loads policy via importScripts (classic SW)", /importScripts\("scriptlets\/policy\.js"\)/.test(bg));

// 3) IMPL keys == canonical names
const impl = [...engine.matchAll(/^ {4}"([\w-]+)": function/gm)].map((m) => m[1]).sort().join("|");
ok("engine IMPL keys == policy CANON", impl === Object.keys(P.CANON).sort().join("|"));

// 4) profiles: live ⊂ build (strictness)
const V = (name, args, live) => P.validateDirective(name, args, live);
const cases = [
  ["remove-cookie", ["/x/"]], ["remove-attr", ["type", "input[type=password]"]], ["remove-attr", ["sandbox", ".x"]],
  ["href-sanitizer", ["a"]], ["remove-node-text", ["textarea", "x"]], ["remove-class", ["y", "form .x"]],
];
ok("live-rejected directives are all build-accepted (live ⊂ build), never the reverse",
  cases.every(([n, a]) => V(n, a, false) === true && V(n, a, true) === false));
const both = [["set-constant", ["x", "true"]], ["aopr", ["y"]], ["no-fetch-if", ["/ads$/"]], ["set-cookie", ["consent", "accepted"]], ["nowebrtc", []], ["href-sanitizer", ["a.out", "?u"]]];
ok("benign directives accepted by both profiles", both.every(([n, a]) => { const c = P.canonical(n); return V(c, a, false) && V(c, a, true); }));
ok("both profiles reject: unknown name, bad set-constant value, proto key, denied cookie name, >3 args",
  !V("eval", ["x"], false) && !V("set-constant", ["x", "alert(1)"], false) && P.canonical("__proto__") === null &&
  !V("set-cookie", ["PHPSESSID", "1"], false) && !V("set-cookie", ["csrf_token", "true"], true) && !V("json-prune", ["a", "b", "c", "d"], false));
ok("protectedHost: youtube.com and subdomains, not evil-youtube.com", P.protectedHost("m.youtube.com") && P.protectedHost("youtube.com") && !P.protectedHost("evil-youtube.com") && !P.protectedHost("youtube.com.evil.com"));
ok("tokenValue dictionary == SETCONST_VALUES", P.SETCONST_VALUES.every((v) => P.tokenValue(v).ok) && !P.tokenValue("alert(1)").ok);

done();
