#!/usr/bin/env bash
# Build the Chrome Web Store upload zip.
# Everything in the repo ships except dev-only files, so a new runtime file
# can never be left out of the package by mistake.
set -euo pipefail

# Base is the extension folder (this script lives in <ext>/tools/), so the build
# lands in <ext>/dist/ even inside a monorepo.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p dist
ver="$(node -p "require('./package.json').version" 2>/dev/null || echo dev)"
out="dist/supreme-adblock-$ver.zip"
rm -f "$out"

# Fail early if the generated scriptlet bundle is stale (engine.js/list.txt
# edited without a rebuild) — a set-euo pipefail abort with a clear message.
node tools/build_scriptlets.mjs --check

zip -r "$out" . \
  -x '.git/*' 'dist/*' 'tools/*' 'docs/*' 'store/*' 'server/*' \
     'scriptlets/engine.js' 'scriptlets/list.txt' 'scriptlets/scriptlet_meta.json' 'tests/*' \
     '*.md' 'package.json' '.gitignore' '*/.DS_Store' '.DS_Store' \
  >/dev/null

echo "Built $out"

# Sanity check: every file the manifest references must be in the zip.
node - "$out" <<'NODE'
const { execSync } = require("child_process");
const m = require("./manifest.json");
const zip = execSync(`unzip -Z1 "${process.argv[2]}"`).toString();
const refs = new Set();
(m.content_scripts || []).forEach(cs => [...(cs.js||[]), ...(cs.css||[])].forEach(f => refs.add(f)));
(m.web_accessible_resources || []).forEach(w => (w.resources||[]).forEach(f => refs.add(f)));
if (m.background?.service_worker) refs.add(m.background.service_worker);
Object.values(m.icons || {}).forEach(f => refs.add(f));
if (m.action?.default_popup) refs.add(m.action.default_popup);
if (m.options_ui?.page) refs.add(m.options_ui.page);
(m.declarative_net_request?.rule_resources || []).forEach(r => refs.add(r.path));
// Registered dynamically via chrome.scripting (not in the manifest), so add it
// explicitly — otherwise a forgotten `build_scriptlets.mjs` ships without it.
refs.add("scriptlets/main.js");
refs.add("scriptlets/policy.js"); // importScripts() in the service worker
const zipFiles = zip.split("\n").filter(Boolean);
const has = (f) => f.endsWith("/*")
  ? zipFiles.some(z => z.startsWith(f.slice(0, -1)) && z !== f.slice(0, -1)) // glob: поне 1 файл с този префикс
  : zipFiles.includes(f);
const missing = [...refs].filter(f => !has(f));
if (missing.length) { console.error("MISSING from package:", missing); process.exit(1); }
// Dev-only trees must never ship, and packaged JS must be eval-free (Web Store: no remote code).
const devLeak = zipFiles.filter(z => /^(tests|tools|docs|store|server|dist)\//.test(z));
if (devLeak.length) { console.error("DEV files leaked into package:", devLeak); process.exit(1); }
const evalHits = zipFiles.filter(z => z.endsWith(".js")).filter(z => /\beval\s*\(|new\s+Function\s*\(/.test(execSync(`unzip -p "${process.argv[2]}" "${z}"`).toString()));
if (evalHits.length) { console.error("eval/new Function in package:", evalHits); process.exit(1); }
console.log("Package contains every manifest-referenced file; no dev trees; no eval/new Function.");
NODE
