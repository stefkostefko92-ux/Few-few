#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rilievi/deploy/backup.sh — дневният бекъп на базата (вика го rilievi-backup.timer, 03:10 UTC).
#
#   sudo bash /opt/few-few/current/rilievi/deploy/backup.sh   # ръчно, по всяко време
#
# pg_dump от контейнера на базата → gzip → атомично в $SHARED/backups/daily/ (600, папка 700);
# пазят се последните 14. Работи от последния release, който е отговорил (last-good), защото там е
# docker-compose.yml с тайните. Копие ИЗВЪН сървъра — DEPLOY.md, т. 6 (бекъп на същия диск не пази
# от загуба на диска).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

SHARED="${RILIEVI_SHARED:-/opt/few-few/shared/rilievi}"
KEEP="${RILIEVI_KEEP_DAILY:-14}"
DIR="$SHARED/backups/daily"

app="$(head -n 1 "$SHARED/last-good" 2>/dev/null || true)"
if [ -z "$app" ] || [ ! -f "$app/docker-compose.yml" ]; then
  echo "rilievi-backup: няма работещ release в $SHARED/last-good — няма от какво да се бекъпва" >&2
  exit 1
fi
install -d -m 700 "$DIR"
file="$DIR/rilievi-$(date -u +%Y%m%d-%H%M%S).sql.gz"
cd "$app"
if docker compose exec -T db pg_dump --clean --if-exists -U rilievi -d rilievi | gzip >"$file.partial"; then
  mv -f "$file.partial" "$file"
  echo "rilievi-backup: $file ($(du -h "$file" | cut -f1))"
else
  rm -f "$file.partial"
  echo "rilievi-backup: pg_dump се провали" >&2
  exit 1
fi
find "$DIR" -maxdepth 1 -name 'rilievi-*.sql.gz' -printf '%T@ %p\n' | sort -rn |
  tail -n "+$((KEEP + 1))" | cut -d' ' -f2- | xargs -r rm -f
