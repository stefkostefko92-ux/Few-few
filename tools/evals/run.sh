#!/usr/bin/env bash
# run.sh — детерминистични грейдъри над репото (слой за надеждност v2.1).
# „Грейдвай това, което агентът произвежда." Пуска наличните проверки на агентите
# и докладва pass/fail. Двойна роля: reliability гейт + smoke че „ръцете" работят.
#
# Употреба:  bash tools/evals/run.sh
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2
pass=0; fail=0; skip=0
PASS(){ printf '\033[32m✔ %s\033[0m\n' "$*"; pass=$((pass+1)); }
FAIL(){ printf '\033[31m✘ %s\033[0m\n' "$*"; fail=$((fail+1)); }
SKIP(){ printf '\033[33m… %s (пропуснато)\033[0m\n' "$*"; skip=$((skip+1)); }
have(){ command -v "$1" >/dev/null 2>&1; }

echo "── Детерминистични проверки ──"

# Сийдъра: дубли + целост
if [ -d zabobovdol/prisma ]; then
  node tools/seed/check-integrity.mjs >/tmp/ev_int 2>&1 && PASS "seed integrity (slug формат + задължителни)" || FAIL "seed integrity — виж /tmp/ev_int"
  # check-dups е информативен (дубли между файлове са възможни нарочно) — само докладвай.
  if node tools/seed/check-dups.mjs >/tmp/ev_dups 2>&1; then PASS "seed dup-slug (няма дубли)"; else
    printf '\033[33m… seed dup-slug: %s\033[0m\n' "$(grep -m1 'дублирани' /tmp/ev_dups || echo 'има дубли — провери')"; skip=$((skip+1)); fi
fi

# Геймъра: lint (ако има luacheck и .lua файлове)
if have luacheck && ls **/*.lua >/dev/null 2>&1; then
  luacheck --config tools/fivem/.luacheckrc . >/dev/null 2>&1 && PASS "luacheck" || FAIL "luacheck"
else SKIP "luacheck (няма luacheck или .lua файлове)"; fi

# Кодаджията: бързи репо-правила (ако има semgrep)
if have semgrep; then
  semgrep scan --config tools/code/semgrep-rules.yml --error . >/dev/null 2>&1 && PASS "semgrep репо-правила (чисто)" || FAIL "semgrep репо-правила — има находки"
else SKIP "semgrep (не е инсталиран)"; fi

# Преводач: глосар enforcement (ако има locale файлове)
for lf in $(ls zabobovdol/src/locales/*.json medqr/src/locales/*.json 2>/dev/null); do
  lang="$(basename "$lf" .json)"
  case "$lang" in en|it) node tools/i18n/glossary-check.mjs "$lang" "$lf" >/dev/null 2>&1 && PASS "glossary $lang" || FAIL "glossary $lang";; esac
done

# 3D: само ако има примерен mesh (обикновено няма в репото) — пропусни.
SKIP "3D watertight/deviation (нужен примерен scan)"

echo; echo "── Резултат ──"
echo "pass=$pass · fail=$fail · skip=$skip"
[ "$fail" -eq 0 ] && { echo "✔ Детерминистичните грейдъри минават."; exit 0; } || { echo "✘ Има провали."; exit 1; }
