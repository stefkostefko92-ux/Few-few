#!/usr/bin/env node
// Compile scriptlets/list.txt (##+js directives, DATA) into scriptlets/main.js
// by baking a validated per-site directive MAP into scriptlets/engine.js.
//
// Dev-only. The engine CODE ships verbatim; only inert, strictly-validated
// arguments are baked in. Nothing here is fetched or evaluated at runtime.
//
//   node tools/build_scriptlets.mjs            # write the generated files
//   node tools/build_scriptlets.mjs --check    # fail if main.js is stale (CI/pack)
//
// Emits: scriptlets/main.js (the registered MAIN-world script) and
//        scriptlets/scriptlet_meta.json (dev-only info: counts + host list; NOT
//        shipped in the package and not read at runtime).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = (process.argv.find((x) => x.startsWith("--engine=")) || "").slice(9) || join(ROOT, "scriptlets", "engine.js");
// --list=<file> / --out=<file> let tests build into a temp dir without touching the repo.
const argOf = (k) => { const a = process.argv.find((x) => x.startsWith(k + "=")); return a ? a.slice(k.length + 1) : null; };
// The policy (names, grammar, dictionaries) is ONE classic script shared with the
// engine (inlined) and the service worker (importScripts). Loaded here via vm.
const POLICY_PATH = argOf("--policy") || join(ROOT, "scriptlets", "policy.js");
const POLICY_SRC = readFileSync(POLICY_PATH, "utf8");
const SA_POLICY = (() => { const ctx = {}; runInNewContext(POLICY_SRC, ctx, { filename: "policy.js" }); return ctx.SA_POLICY; })();
if (!SA_POLICY || typeof SA_POLICY.validateDirective !== "function") { console.error("ERROR: scriptlets/policy.js did not define SA_POLICY"); process.exit(1); }
const LIST = argOf("--list") || join(ROOT, "scriptlets", "list.txt");
const OUT = argOf("--out") || join(ROOT, "scriptlets", "main.js");
const META = argOf("--out") ? null : join(ROOT, "scriptlets", "scriptlet_meta.json");
// EasyList $popup domains (from build_filters.mjs) baked as the engine's window.open guard.
const POPUP_PATH = argOf("--popup") || join(ROOT, "rules", "popup_hosts.json");
let POPUP_HOSTS = [];
try { POPUP_HOSTS = JSON.parse(readFileSync(POPUP_PATH, "utf8")); } catch (e) { POPUP_HOSTS = []; }
if (!Array.isArray(POPUP_HOSTS) || !POPUP_HOSTS.every((h) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h))) { console.error("ERROR: rules/popup_hosts.json is not a clean domain list"); process.exit(1); }

// uBO alias → canonical name: from the single policy.
const ALIASES = SA_POLICY.ALIASES;

// Build profile of the single validator (trusted, baked list). The live channel
// uses the same function with live=true (stricter) in the service worker + engine.
function validate(name, args) {
  return SA_POLICY.validateDirective(name, args, false) ? [name, ...args] : null;
}

// Split "a, b, c" respecting nothing fancy (uBO uses plain comma separation;
// regex args must not contain a comma — a known uBO limitation we mirror).
function splitArgs(s) {
  return s.split(",").map((x) => x.trim());
}

const HOST_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/;

function parseLine(line) {
  line = line.trim();
  if (!line || line.startsWith("!")) return null;
  const idx = line.indexOf("##+js(");
  if (idx < 0) return null;
  if (!line.endsWith(")")) return null;
  const domainPart = line.slice(0, idx).trim();
  const inner = line.slice(idx + 6, -1); // between "##+js(" and ")"
  const parts = splitArgs(inner);
  const rawName = parts.shift();
  const canonical = ALIASES[rawName];
  if (!canonical) return null;
  const directive = validate(canonical, parts);
  if (!directive) return null;

  // Domains: comma-separated bare hosts, or empty for global.
  let hosts = [""];
  if (domainPart) {
    hosts = domainPart.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
    if (!hosts.every((h) => HOST_RE.test(h))) return null;
  }
  return { hosts, directive };
}

// Enforce the cross-file name connascence: every ALIASES canonical must have an
// IMPL in engine.js and vice-versa, else a scriptlet silently drops (unknown
// alias) or no-ops (missing IMPL). Turn that drift into a loud build failure.
function assertNamesInSync(engine) {
  const implKeys = new Set(
    [...engine.matchAll(/^ {4}"([\w-]+)": function/gm)].map((m) => m[1])
  );
  const canonical = new Set(Object.values(ALIASES));
  for (const c of canonical) {
    if (!implKeys.has(c)) {
      console.error("ERROR: ALIASES canonical", JSON.stringify(c), "has no IMPL in engine.js");
      process.exit(1);
    }
  }
  for (const k of implKeys) {
    if (!canonical.has(k)) {
      console.error("ERROR: IMPL", JSON.stringify(k), "has no alias in build_scriptlets.mjs");
      process.exit(1);
    }
  }
}

// Bake a set of ##+js lines into the engine template. Returns the generated
// source + the host→directives map.
function bake(engine, lines, { quiet = false } = {}) {
  const map = {};
  let kept = 0;
  let dropped = 0;
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("!")) continue;
    // `host#@#+js(…)` (uBO data only): an exception, validated like a directive,
    // baked as ["#@", name, …args] — the engine then skips that directive for
    // this host even when it comes from a parent domain.
    const isExc = line.includes("#@#+js(");
    const parsed = parseLine(isExc ? line.replace("#@#+js(", "##+js(") : line);
    if (!parsed) { dropped++; if (!quiet) console.warn("  drop:", line.trim()); continue; }
    for (const h of parsed.hosts) {
      (map[h] = map[h] || []).push(isExc ? ["#@"].concat(parsed.directive) : parsed.directive);
    }
    kept++;
  }
  const mapJson = JSON.stringify(map);
  const POLICY_MARKER = "/*__SCRIPTLET_POLICY__*/";
  if (!engine.includes(POLICY_MARKER)) { console.error("ERROR: engine.js is missing the /*__SCRIPTLET_POLICY__*/ marker"); process.exit(1); }
  const MARKER = "/*__SCRIPTLET_MAP__*/{}";
  const POPUP_MARKER = "/*__POPUP_HOSTS__*/[]";
  if (!engine.includes(POPUP_MARKER)) { console.error("ERROR: engine.js is missing the /*__POPUP_HOSTS__*/[] marker"); process.exit(1); }
  if (!engine.includes(MARKER)) {
    console.error("ERROR: engine.js is missing the /*__SCRIPTLET_MAP__*/{} injection point");
    process.exit(1);
  }
  const header =
    "// GENERATED by tools/build_scriptlets.mjs from scriptlets/list.txt — DO NOT EDIT.\n" +
    "// Edit scriptlets/engine.js (code) or scriptlets/list.txt (data) and rebuild.\n";
  // Function replacement: a plain-string replacement would interpret $$, $&,
  // $` and $' — and args legitimately contain "$" (regex anchors like /ads\.js$/).
  // Inline the policy first (the engine references SA_POLICY), then bake the MAP.
  const popupJson = JSON.stringify(POPUP_HOSTS);
  const out = header + engine.replace(POLICY_MARKER, () => POLICY_SRC).replace(MARKER, () => mapJson).replace(POPUP_MARKER, () => popupJson);
  // Paranoia: a String.replace "$1" artifact would be valid JS and a silent breakage.
  if (/^\$\d+$/m.test(out) || /^\$\d+$/m.test(engine)) { console.error("ERROR: $N replacement artifact in engine/main.js"); process.exit(1); }
  return { out, map, kept, dropped };
}

// Directive ARGUMENTS are needles ("eval(", "new Function") — data, but a store
// scanner reading the file cannot tell. Escape them inside the JSON strings
// (\u0028 / \u0020 decode to the same characters at runtime).
function dataJson(v) {
  return JSON.stringify(v).replace(/\beval(\s*)\(/g, "eval$1\\u0028").replace(/\bnew(\s+)Function/g, "new\\u0020Function");
}

function checkOrWrite(path, content, check, label) {
  if (check) {
    let current = null;
    try { current = readFileSync(path, "utf8"); } catch (e) {}
    if (current !== content) {
      console.error(`ERROR: ${label} is stale — run: node tools/build_scriptlets.mjs`);
      process.exit(1);
    }
    return;
  }
  writeFileSync(path, content);
}

function main() {
  const check = process.argv.includes("--check");
  const engine = readFileSync(ENGINE, "utf8");
  const lines = readFileSync(LIST, "utf8").split("\n");
  assertNamesInSync(engine);

  const { out, map, kept, dropped } = bake(engine, lines);
  const hosts = Object.keys(map).filter((h) => h !== "");
  const meta = {
    generated: true,
    directives: kept,
    dropped,
    global: (map[""] || []).length,
    hosts,
    popupHosts: POPUP_HOSTS.length,
  };
  checkOrWrite(OUT, out, check, "scriptlets/main.js");
  if (META && !check) writeFileSync(META, JSON.stringify(meta, null, 2) + "\n");

  // uBlock Origin directives (scriptlets/list_ubo.txt, DATA from build_filters.mjs):
  // same validator, split into DATA chunks (scriptlets/ubo/cNN.js) grouped by the
  // last two host labels, so a page matches at most one chunk. The service worker
  // registers each chunk just before main.js, only on that chunk's hosts — every
  // other page keeps main.js alone (a MAIN-world script is parsed in every frame;
  // all 14k hosts' directives in one file would be >1 MB).
  let uboNote = "";
  const UBO_LIST = join(ROOT, "scriptlets", "list_ubo.txt");
  if (!argOf("--out") && existsSync(UBO_LIST)) {
    const uboLines = readFileSync(UBO_LIST, "utf8").split("\n");
    const ubo = bake(engine, uboLines, { quiet: true });
    delete ubo.map[""]; // never global: build_filters.mjs already leaves those out
    const N = 64;
    const group = (h) => h.split(".").slice(-2).join(".");
    const hash = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619) >>> 0; return x; };
    const chunks = Array.from({ length: N }, () => ({}));
    for (const h of Object.keys(ubo.map).sort()) chunks[hash(group(h)) % N][h] = ubo.map[h];
    const index = [];
    mkdirSync(join(ROOT, "scriptlets", "ubo"), { recursive: true });
    const seen = new Set();
    chunks.forEach((c, k) => {
      const hostsK = Object.keys(c);
      if (!hostsK.length) return;
      const file = `scriptlets/ubo/c${String(k).padStart(2, "0")}.js`;
      seen.add(file);
      const src = "// GENERATED by tools/build_scriptlets.mjs from the uBlock Origin filters (GPL-3.0) — DATA, not code.\n" +
        'Object.defineProperty(document, "__tbabScriptletChunk", { value: ' + dataJson(c) + ", configurable: true });\n";
      checkOrWrite(join(ROOT, file), src, check, file);
      index.push({ file, hosts: hostsK });
    });
    if (!check) for (const f of readdirSync(join(ROOT, "scriptlets", "ubo"))) if (!seen.has("scriptlets/ubo/" + f)) unlinkSync(join(ROOT, "scriptlets", "ubo", f));
    checkOrWrite(join(ROOT, "scriptlets", "ubo_index.json"), JSON.stringify(index) + "\n", check, "scriptlets/ubo_index.json");
    const nHosts = index.reduce((n, c) => n + c.hosts.length, 0);
    uboNote = `; uBO: ${ubo.kept} directive(s) on ${nHosts} host(s) in ${index.length} chunk(s) (${ubo.dropped} dropped by the validator)`;
  }

  if (check) { console.log("scriptlets: main.js is up to date" + (uboNote ? " (+ uBO chunks)" : "")); return; }
  console.log(
    `scriptlets: ${kept} directive(s) baked (${meta.global} global, ${hosts.length} host-scoped), ${dropped} dropped` + uboNote
  );
}

main();
