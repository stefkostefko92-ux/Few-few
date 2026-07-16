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
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = join(ROOT, "scriptlets", "engine.js");
const LIST = join(ROOT, "scriptlets", "list.txt");
const OUT = join(ROOT, "scriptlets", "main.js");
const META = join(ROOT, "scriptlets", "scriptlet_meta.json");

// uBO alias → canonical IMPL name. ONLY these names are accepted; anything else
// is dropped. Keep in sync with the IMPL keys in engine.js.
const ALIASES = {
  "set-constant": "set-constant", "set": "set-constant",
  "abort-on-property-read": "abort-on-property-read", "aopr": "abort-on-property-read",
  "abort-on-property-write": "abort-on-property-write", "aopw": "abort-on-property-write",
  "abort-current-script": "abort-current-script", "acs": "abort-current-script",
  "abort-current-inline-script": "abort-current-script", "acis": "abort-current-script",
  "no-setTimeout-if": "no-setTimeout-if", "nostif": "no-setTimeout-if", "setTimeout-defuser": "no-setTimeout-if",
  "no-setInterval-if": "no-setInterval-if", "nosiif": "no-setInterval-if", "setInterval-defuser": "no-setInterval-if",
  "addEventListener-defuser": "addEventListener-defuser", "aeld": "addEventListener-defuser",
  "json-prune": "json-prune",
  "no-fetch-if": "no-fetch-if",
  "no-window-open-if": "no-window-open-if", "nowoif": "no-window-open-if", "window.open-defuser": "no-window-open-if",
  "remove-attr": "remove-attr", "ra": "remove-attr",
  "remove-class": "remove-class", "rc": "remove-class",
};

// Per-scriptlet arg policy. A directive is rejected unless it passes.
const NAME_RE = /^[a-zA-Z][\w.-]{0,60}$/;                 // property-chain arg
const SETCONST_VALUES = new Set([
  "false", "true", "null", "undefined", "noopFunc", "trueFunc", "falseFunc",
  "", "emptyStr", "emptyArr", "emptyObj", "''",
]);

// Reject dangerous tokens anywhere in an argument (prototype-pollution / markup
// breakout / over-long). Applied to every argument of every directive.
function argSafe(a) {
  if (typeof a !== "string") return false;
  if (a.length > 400) return false;
  if (/__proto__|constructor|prototype/.test(a)) return false;
  if (/<\/?script|<\/?style|-->/i.test(a)) return false;
  return true;
}

function validate(name, args) {
  if (!args.every(argSafe)) return null;
  switch (name) {
    case "set-constant": {
      if (args.length !== 2 || !NAME_RE.test(args[0])) return null;
      const v = args[1];
      if (!(SETCONST_VALUES.has(v) || /^-?\d+$/.test(v))) return null;
      return [name, args[0], v];
    }
    case "abort-on-property-read":
    case "abort-on-property-write":
      if (args.length !== 1 || !NAME_RE.test(args[0])) return null;
      return [name, args[0]];
    case "abort-current-script":
      if (args.length < 1 || args.length > 2 || !NAME_RE.test(args[0])) return null;
      return args.length === 2 ? [name, args[0], args[1]] : [name, args[0]];
    case "no-setTimeout-if":
    case "no-setInterval-if":
      if (args.length < 1 || args.length > 2) return null;
      if (args.length === 2 && !/^\d{1,7}$/.test(args[1])) return null;
      return args.length === 2 ? [name, args[0], args[1]] : [name, args[0]];
    case "addEventListener-defuser":
      if (args.length < 1 || args.length > 2) return null;
      return args.length === 2 ? [name, args[0], args[1]] : [name, args[0]];
    case "json-prune":
      if (args.length < 1 || args.length > 2) return null;
      return args.length === 2 ? [name, args[0], args[1]] : [name, args[0]];
    case "no-fetch-if":
      if (args.length !== 1) return null;
      return [name, args[0]];
    case "no-window-open-if":
      if (args.length !== 1) return null;
      return [name, args[0]];
    case "remove-attr":
    case "remove-class":
      if (args.length < 1 || args.length > 2) return null;
      return args.length === 2 ? [name, args[0], args[1]] : [name, args[0]];
    default:
      return null;
  }
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

function main() {
  const check = process.argv.includes("--check");
  const engine = readFileSync(ENGINE, "utf8");
  const lines = readFileSync(LIST, "utf8").split("\n");
  assertNamesInSync(engine);

  const map = {};
  let kept = 0;
  let dropped = 0;
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("!")) continue;
    const parsed = parseLine(line);
    if (!parsed) { dropped++; console.warn("  drop:", line.trim()); continue; }
    for (const h of parsed.hosts) {
      (map[h] = map[h] || []).push(parsed.directive);
    }
    kept++;
  }

  // Bake the map into the engine at the /*__SCRIPTLET_MAP__*/ injection marker.
  const mapJson = JSON.stringify(map);
  const MARKER = "/*__SCRIPTLET_MAP__*/{}";
  if (!engine.includes(MARKER)) {
    console.error("ERROR: engine.js is missing the /*__SCRIPTLET_MAP__*/{} injection point");
    process.exit(1);
  }
  const header =
    "// GENERATED by tools/build_scriptlets.mjs from scriptlets/list.txt — DO NOT EDIT.\n" +
    "// Edit scriptlets/engine.js (code) or scriptlets/list.txt (data) and rebuild.\n";
  // Function replacement: a plain-string replacement would interpret $$, $&,
  // $` and $' — and args legitimately contain "$" (regex anchors like /ads\.js$/).
  const out = header + engine.replace(MARKER, () => mapJson);

  const hosts = Object.keys(map).filter((h) => h !== "");
  const meta = {
    generated: true,
    directives: kept,
    dropped,
    global: (map[""] || []).length,
    hosts,
  };
  const metaOut = JSON.stringify(meta, null, 2) + "\n";

  if (check) {
    // Freshness guard: verify the committed main.js matches what we'd generate,
    // without writing. Catches "edited engine.js/list.txt, forgot to rebuild".
    let current = null;
    try { current = readFileSync(OUT, "utf8"); } catch (e) {}
    if (current !== out) {
      console.error("ERROR: scriptlets/main.js is stale — run: node tools/build_scriptlets.mjs");
      process.exit(1);
    }
    console.log("scriptlets: main.js is up to date");
    return;
  }

  writeFileSync(OUT, out);
  writeFileSync(META, metaOut);

  console.log(
    `scriptlets: ${kept} directive(s) baked (${meta.global} global, ${hosts.length} host-scoped), ${dropped} dropped`
  );
}

main();
