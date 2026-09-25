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

# -X: no Unix extra fields (uid/gid/mode) — the Windows 11 Explorer extractor
#     has refused such archives with "access denied to the compressed folder";
# -D: no directory entries — nothing for an extractor to trip on, Chrome does not need them.
zip -r -X -D "$out" . \
  -x '.git/*' '_metadata/*' 'node_modules/*' 'dist/*' 'tools/*' 'docs/*' 'store/*' 'server/*' \
     'scriptlets/engine.js' 'scriptlets/list.txt' 'scriptlets/scriptlet_meta.json' 'rules/popup_hosts.json' 'tests/*' \
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
refs.add("lib/abp2dnr.js");       // importScripts() — author-hosted lists
refs.add("report/report.html");   // opened from the popup
refs.add("THIRD_PARTY_NOTICES.txt"); // linked from Settings; list licences ask for it
const zipFiles = zip.split("\n").filter(Boolean);
const has = (f) => f.endsWith("/*")
  ? zipFiles.some(z => z.startsWith(f.slice(0, -1)) && z !== f.slice(0, -1)) // glob: поне 1 файл с този префикс
  : zipFiles.includes(f);
const missing = [...refs].filter(f => !has(f));
if (missing.length) { console.error("MISSING from package:", missing); process.exit(1); }
// Dev-only trees must never ship, and packaged JS must be eval-free (Web Store: no remote code).
const devLeak = zipFiles.filter(z => /^(tests|tools|docs|store|server|dist|node_modules)\//.test(z));
// „_" в началото е запазено за Chrome: _metadata/ е локалният DNR кеш, който Chrome пише
// при „Load unpacked" (тестовете) — 4+ MB бинарни файлове, които не бива да се качват.
const reserved = zipFiles.filter(z => /^_/.test(z) && !z.startsWith("_locales/"));
if (reserved.length) { console.error("Reserved _ paths leaked into package:", reserved.slice(0, 5)); process.exit(1); }
if (devLeak.length) { console.error("DEV files leaked into package:", devLeak); process.exit(1); }
const evalHits = zipFiles.filter(z => z.endsWith(".js")).filter(z => /\beval\s*\(|new\s+Function\s*\(/.test(execSync(`unzip -p "${process.argv[2]}" "${z}"`).toString()));
if (evalHits.length) { console.error("eval/new Function in package:", evalHits); process.exit(1); }
console.log("Package contains every manifest-referenced file; no dev trees; no eval/new Function.");
NODE

# ---- Firefox (AMO) variant ----------------------------------------------------
# Same files; only the manifest differs: Firefox MV3 runs the background as an
# event page (background.scripts — no service worker, no importScripts, so the two
# shared classic scripts are listed first), needs a Gecko id, has world:"MAIN"
# scripting from 128, and AMO asks for the data-collection declaration ("none").
ff_out="dist/supreme-adblock-$ver-firefox.zip"
rm -f "$ff_out"
ff_tmp="$(mktemp -d)"
trap 'rm -rf "$ff_tmp"' EXIT
unzip -q "$out" -d "$ff_tmp"
node - "$ff_tmp/manifest.json" <<'NODE'
const fs = require("fs");
const p = process.argv[2];
const m = JSON.parse(fs.readFileSync(p, "utf8"));
m.background = { scripts: ["scriptlets/policy.js", "lib/abp2dnr.js", "background.js"] };
m.browser_specific_settings = {
  gecko: { id: "supreme-adblock@carbonstealth.eu", strict_min_version: "128.0", data_collection_permissions: { required: ["none"] } },
};
delete m.minimum_chrome_version;
m.web_accessible_resources = (m.web_accessible_resources || []).map((w) => { const c = { ...w }; delete c.use_dynamic_url; return c; });
fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
NODE
(cd "$ff_tmp" && zip -r -X -D -q "$OLDPWD/$ff_out" .)
echo "Built $ff_out"
