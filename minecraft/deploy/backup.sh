#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# minecraft/deploy/backup.sh — бекъп на Pelican панела (не на световете).
#
#   sudo bash /opt/pelican/backup.sh       # ръчно; дневно го пуска pelican-backup.timer (03:40 UTC)
#
# Пази: дъмп на MariaDB (потребители, нодове, сървъри, графици), volume-а pelican-data (APP_KEY в
# .env на панела — без него шифрованите полета в базата са загубени) и /opt/pelican/.env.
# Световете на Minecraft се бекъпват от самия панел (Server → Backups + Schedule) в
# /var/lib/pelican/backups — виж README.md.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

PELICAN_DIR="${PELICAN_DIR:-/opt/pelican}"
BACKUP_DIR="${PELICAN_BACKUP_DIR:-/var/backups/pelican}"
KEEP="${PELICAN_KEEP_BACKUPS:-14}"
TS="$(date -u +%Y%m%d-%H%M%S)"
COMPOSE=(docker compose --project-name pelican --env-file "$PELICAN_DIR/.env" -f "$PELICAN_DIR/compose.yml")

fail() { printf '✘ pelican-backup: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "пусни като root"
[ -f "$PELICAN_DIR/.env" ] || fail "няма $PELICAN_DIR/.env — панелът не е инсталиран"

install -d -m 700 "$BACKUP_DIR"
OUT="$BACKUP_DIR/$TS"
install -d -m 700 "$OUT"

# Паролата не минава през командния ред на хоста: mariadb-dump я чете от средата на контейнера.
# shellcheck disable=SC2016 # $MARIADB_ROOT_PASSWORD се разгъва в контейнера, не тук.
"${COMPOSE[@]}" exec -T database sh -c \
  'exec mariadb-dump --single-transaction --quick --routines -uroot -p"$MARIADB_ROOT_PASSWORD" panel' \
  | gzip -9 > "$OUT/panel.sql.gz"
[ -s "$OUT/panel.sql.gz" ] || fail "празен дъмп на базата"

docker run --rm -v pelican_pelican-data:/data:ro -v "$OUT":/out alpine:3.20 \
  tar -czf /out/pelican-data.tar.gz -C /data .

install -m 600 "$PELICAN_DIR/.env" "$OUT/stack.env"
chmod 600 "$OUT"/*

# Ротация: остават последните $KEEP папки (имената са сортируеми по време).
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort | head -n -"$KEEP" \
  | while read -r old; do rm -rf -- "${BACKUP_DIR:?}/$old"; done

printf '✔ pelican-backup: %s\n' "$OUT"
