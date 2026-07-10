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
out="dist/the-best-ads-block-$ver.zip"
rm -f "$out"

zip -r "$out" . \
  -x '.git/*' 'dist/*' 'tools/*' 'docs/*' 'store/*' 'server/*' \
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
const missing = [...refs].filter(f => !zip.split("\n").includes(f));
if (missing.length) { console.error("MISSING from package:", missing); process.exit(1); }
console.log("Package contains every manifest-referenced file.");
NODE
