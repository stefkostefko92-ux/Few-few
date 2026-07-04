#!/usr/bin/env bash
# ============================================================================
#  Балкан — setup.sh
#  Тегли третостранните зависимости (ox + qbx), които НЕ са в нашето репо
#  (отделни проекти, собствени лицензи, голям размер). Нашите ресурси в [bg]
#  вече са тук. Idempotent: пуска се повторно безопасно.
#
#  Употреба:  cd fivem/server && ./setup.sh
#  Изисква:   git, curl, unzip
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RES="$HERE/resources"
mkdir -p "$RES/[standalone]" "$RES/[qbx]"

# Пинати версии — обнови съзнателно (breaking changes при ox_core/qbx са възможни).
declare -A REPOS=(
  ["[standalone]/oxmysql"]="https://github.com/overextended/oxmysql"
  ["[standalone]/ox_lib"]="https://github.com/overextended/ox_lib"
  ["[standalone]/ox_target"]="https://github.com/overextended/ox_target"
  ["[standalone]/ox_inventory"]="https://github.com/overextended/ox_inventory"
  ["[qbx]/qbx_core"]="https://github.com/Qbox-project/qbx_core"
)

clone_or_update() {
  local dest="$1" url="$2"
  if [ -d "$RES/$dest/.git" ]; then
    echo "↻ обновявам $dest"
    git -C "$RES/$dest" pull --ff-only || echo "  (пропускам pull — локални промени?)"
  else
    echo "⤓ клонирам $dest"
    git clone --depth 1 "$url" "$RES/$dest"
  fi
}

echo "==> Зависимости (ox + qbx)"
for dest in "${!REPOS[@]}"; do
  clone_or_update "$dest" "${REPOS[$dest]}"
done

# ox_lib / ox_inventory се разпространяват и като build releases (web UI).
# За production вземи официалния release ZIP вместо raw clone, ако UI-то липсва:
echo
echo "ЗАБЕЛЕЖКА: за ox_lib/ox_inventory може да ти трябва официалният RELEASE билд"
echo "(съдържа компилираното web UI). Виж README.md → 'Зависимости'."
echo

# --- База данни -------------------------------------------------------------
cat <<'EOF'
==> База данни
1) Създай БД и потребител, задай mysql_connection_string в server.secret.cfg
2) Импортирай схемите В ТОЗИ РЕД:
     - базовата схема на qbx_core  (resources/[qbx]/qbx_core/*.sql)
     - нашата:  mysql balkan < sql/02_custom.sql
EOF

echo
echo "✅ setup.sh готов. Следва: копирай server.secret.cfg.example -> server.secret.cfg,"
echo "   попълни тайните, разкоментирай 'exec server.secret.cfg' в server.cfg и стартирай FXServer."
