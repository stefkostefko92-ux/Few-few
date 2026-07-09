#!/usr/bin/env bash
# Nexus Dominion — автоматичен release gate.
# Пуска се от CI (.github/workflows/nexus.yml) и от autodeploy преди пускане.
# Фейлва при известните release-блокери, така че да не разчитаме на памет:
#
#   1. PLACEHOLDER стойности в правните данни (Terms/Privacy/Impressum)
#   2. Некомерсиални асети (RPM sample, CC BY-NC) в сервираната realistic/
#   3. .dockerignore, който крие файл, копиран от Dockerfile (build блокер)
#
# Употреба: bash scripts/release-gate.sh   (от Nexus/ директорията)
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
err() { echo "✗ RELEASE GATE: $*" >&2; fail=1; }
ok() { echo "✓ $*"; }

# 1) Правни данни — нула PLACEHOLDER в single-source-of-truth файла.
if grep -q "PLACEHOLDER" client/src/lib/legal.ts; then
  err "client/src/lib/legal.ts съдържа PLACEHOLDER — попълни реалните фирмени данни."
else
  ok "legal.ts: без placeholder-и"
fi

# 2) Некомерсиални асети: RPM sample (CC BY-NC) НЕ трябва да се сервира.
#    Всеки .glb тук трябва да е собствен/комерсиално чист — гейтваме по
#    известния хеш на sample-а + предупреждаваме за всякакви .glb (одобряват
#    се съзнателно чрез allowlist файл).
RPM_SAMPLE_SHA="b69cec7a5cc7dc7e1c1f19c324024d090ae06e1315441a7bce4bf236112addc1"
shopt -s nullglob
for glb in client/public/assets/characters/realistic/*.glb; do
  sha=$(sha256sum "$glb" | cut -d' ' -f1)
  if [ "$sha" = "$RPM_SAMPLE_SHA" ]; then
    err "$glb е RPM sample аватарът (CC BY-NC) — забранен в продукционен билд."
  elif ! grep -qs "$sha" client/public/assets/characters/realistic/APPROVED-ASSETS.txt 2>/dev/null; then
    err "$glb не е в APPROVED-ASSETS.txt — добави реда „$sha  $(basename "$glb")\" след лицензна проверка."
  else
    ok "$(basename "$glb"): одобрен асет"
  fi
done
[ -z "$(echo client/public/assets/characters/realistic/*.glb)" ] 2>/dev/null || true
ok "realistic/ проверена"

# 3) .dockerignore ↔ Dockerfile COPY консистентност (хвана ни веднъж).
while read -r src; do
  [ -z "$src" ] && continue
  if git check-ignore --no-index -q -- "$src" 2>/dev/null; then :; fi
  # проверка срещу .dockerignore чрез docker-игнор семантика (приближение:
  # точното име или директория-префикс на ред от файла)
  while IFS= read -r pat; do
    case "$pat" in ''|'#'*) continue;; esac
    case "$src" in
      "$pat"|"$pat"/*) err ".dockerignore ред „$pat\" крие „$src\", който Dockerfile копира.";;
    esac
  done < .dockerignore
done < <(grep -oE '^COPY +[^ ]+' Dockerfile | awk '{print $2}' | grep -v '^--' || true)
ok "Dockerfile COPY пътищата не са скрити от .dockerignore"

if [ "$fail" -ne 0 ]; then
  echo; echo "Release gate: ПРОВАЛ — виж ✗ редовете по-горе." >&2
  exit 1
fi
echo; echo "Release gate: OK"
