#!/usr/bin/env bash
# Run all automated checks: syntax, shared-logic tests, engine simulation.
set -e
cd "$(dirname "$0")/.."

echo "== JSON =="
for f in manifest.json _locales/*/messages.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" >/dev/null; done
echo "ok"

echo "== JS syntax (content scripts) =="
for f in src/core/*.js src/modules/*.js src/ui/panel.js src/content/*.js stats/stats.js; do node --check "$f"; done
echo "ok"

echo "== JS syntax (modules/server/controller/tools) =="
for f in src/shared/*.js src/background/service-worker.js popup/popup.js options/options.js \
         server/license-server.mjs controller/controller.mjs controller/lib/*.mjs tools/*.mjs; do
  node --check --input-type=module < "$f" >/dev/null
done
echo "ok"

echo "== shared-logic tests =="
node tools/selftest.mjs | tail -1

echo "== engine simulation tests =="
node tools/engine-test.mjs | tail -1

echo "== api.js XML-RPC parsing tests =="
if node -e "import('linkedom').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
  node tools/api-test.mjs | tail -1
else
  echo "  (skipped — run 'npm install' to enable: needs linkedom)"
fi
