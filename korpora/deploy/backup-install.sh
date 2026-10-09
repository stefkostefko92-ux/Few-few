#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# korpora/deploy/backup-install.sh — слага дневния шифрован бекъп: deploy/backup.sh като
# /usr/local/sbin/korpora-backup и korpora-backup.service/.timer от deploy/systemd/ (DEPLOY.md, т. 9).
#
#   sudo bash korpora/deploy/backup-install.sh   # ръчно; deploy.sh го вика след всяка успешна сонда
#
# Идемпотентен: файл, който не се е променил, не се пише, а daemon-reload е само при промяна на unit.
# Без получател (публичния ключ на собственика) или без age таймерът пак се слага, но казва какво
# липсва — бекъп без тях не тръгва (тайни и ключове не се измислят). Ако няма бекъп от последните 26 ч,
# пуска един веднага: така развален таймер или пясъчник личи още при деплоя, не след седмици.
# Изход ≠ 0 само ако нещо не се е сложило или първият бекъп не е минал; deploy.sh го прави на
# предупреждение — бекъпът не сменя изхода на деплоя.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

SHARED="${KORPORA_SHARED:-/opt/few-few/shared/korpora}"
SYSTEMD_DIR="${KORPORA_SYSTEMD_DIR:-/etc/systemd/system}"
SBIN="${KORPORA_SBIN:-/usr/local/sbin}"
FRESH_MIN="${KORPORA_BACKUP_FRESH_MIN:-1560}"
UNITS="korpora-backup.service korpora-backup.timer"

ib_log() { printf '\033[1;36m▸ korpora: %s\033[0m\n' "$*"; }
ib_ok() { printf '\033[32m✔ korpora: %s\033[0m\n' "$*"; }
ib_warn() { printf '\033[33m⚠ korpora: %s\033[0m\n' "$*" >&2; }

# Файлът $1 става $2 с права $3 — само ако е различен. Връща 0 при запис, 1 ако е същият, 2 при грешка.
ib_put() {
  if [ -f "$2" ] && cmp -s "$1" "$2"; then return 1; fi
  install -m "$3" "$1" "$2" || return 2
}

install_backup() {
  local src unit tmp changed=0 rc
  src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if ! command -v systemctl >/dev/null 2>&1 || [ ! -d "$SYSTEMD_DIR" ]; then
    ib_warn "няма systemd — дневният бекъп не е сложен (DEPLOY.md, т. 9)"
    return 0
  fi
  # пътят влиза в unit-а със sed: само прости знаци, иначе би счупил замяната
  [[ "$SHARED" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
    ib_warn "необичаен път $SHARED — дневният бекъп не е сложен"
    return 1
  }
  install -d -m 700 "$SHARED/backups" "$SHARED/backups/daily" || return 1
  rc=0 && ib_put "$src/backup.sh" "$SBIN/korpora-backup" 700 || rc=$?
  [ "$rc" != 2 ] || return 1
  for unit in $UNITS; do
    tmp="$(mktemp)" || return 1
    sed "s#/opt/few-few/shared/korpora#$SHARED#g" "$src/systemd/$unit" >"$tmp"
    rc=0 && ib_put "$tmp" "$SYSTEMD_DIR/$unit" 644 || rc=$?
    rm -f "$tmp"
    [ "$rc" != 2 ] || return 1
    [ "$rc" != 0 ] || changed=1
  done
  if [ "$changed" = 1 ]; then systemctl daemon-reload || return 1; fi
  systemctl enable --now korpora-backup.timer >/dev/null || return 1

  if ! command -v "${KORPORA_AGE:-age}" >/dev/null 2>&1; then
    ib_warn "таймерът е сложен, но липсва age — бекъпите не тръгват до: apt-get install -y age"
    return 0
  fi
  if [ ! -s "$SHARED/backup-recipients.txt" ]; then
    ib_warn "таймерът е сложен, но няма получател — бекъпите не тръгват до публичния ключ на собственика в"
    ib_warn "  $SHARED/backup-recipients.txt (age1…, mode 600; частният ключ — само при собственика) — DEPLOY.md, т. 9"
    return 0
  fi
  if [ -n "$(find "$SHARED/backups/daily" -maxdepth 1 -name 'korpora-*.dump.age' -mmin "-$FRESH_MIN" 2>/dev/null)" ]; then
    ib_ok "дневният шифрован бекъп е на място (korpora-backup.timer, 02:30 UTC)"
    return 0
  fi
  ib_log "няма бекъп от последните $((FRESH_MIN / 60)) ч — пускам един сега…"
  if ! systemctl start korpora-backup.service; then
    ib_warn "бекъпът не мина — journalctl -u korpora-backup -n 50"
    return 1
  fi
  ib_ok "дневният шифрован бекъп мина и е на място (korpora-backup.timer, 02:30 UTC)"
}

# Изпълнен — слага бекъпа; зареден със `source` (deploy.sh, тестовете) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  [ "$(id -u)" = 0 ] || {
    ib_warn "пусни като root (sudo)."
    exit 1
  }
  install_backup
fi
