#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# chatchat/deploy/timers-install.sh — слага дневните задачи на хоста (DEPLOY.md, т. 9):
#   · шифрования бекъп — deploy/backup.sh като /usr/local/sbin/chatchat-backup + chatchat-backup.timer;
#   · ретенцията — deploy/retention.sh като /usr/local/sbin/chatchat-retention + chatchat-retention.timer.
#
#   sudo bash chatchat/deploy/timers-install.sh   # ръчно; deploy.sh го вика след всяка успешна сонда
#
# Идемпотентен: файл, който не се е променил, не се пише, а daemon-reload е само при промяна на unit.
# Без получател (публичния ключ на собственика) или без age таймерът пак се слага, но казва какво
# липсва — бекъп без тях не тръгва (тайни и ключове не се измислят). Ако няма бекъп от последните 26 ч,
# пуска един веднага: така развален таймер или пясъчник личи още при деплоя, не след седмици.
# Изход ≠ 0 само ако нещо не се е сложило или първият бекъп не е минал; deploy.sh го прави на
# предупреждение — таймерите не сменят изхода на деплоя.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

SHARED="${CHATCHAT_SHARED:-/opt/few-few/shared/chatchat}"
SYSTEMD_DIR="${CHATCHAT_SYSTEMD_DIR:-/etc/systemd/system}"
SBIN="${CHATCHAT_SBIN:-/usr/local/sbin}"
FRESH_MIN="${CHATCHAT_BACKUP_FRESH_MIN:-1560}"
UNITS="chatchat-backup.service chatchat-backup.timer chatchat-retention.service chatchat-retention.timer"

it_log() { printf '\033[1;36m▸ chatchat: %s\033[0m\n' "$*"; }
it_ok() { printf '\033[32m✔ chatchat: %s\033[0m\n' "$*"; }
it_warn() { printf '\033[33m⚠ chatchat: %s\033[0m\n' "$*" >&2; }

# Файлът $1 става $2 с права $3 — само ако е различен. Връща 0 при запис, 1 ако е същият, 2 при грешка.
it_put() {
  if [ -f "$2" ] && cmp -s "$1" "$2"; then return 1; fi
  install -m "$3" "$1" "$2" || return 2
}

install_timers() {
  local src unit tmp changed=0 rc pair
  src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if ! command -v systemctl >/dev/null 2>&1 || [ ! -d "$SYSTEMD_DIR" ]; then
    it_warn "няма systemd — дневният бекъп и ретенцията не са сложени (DEPLOY.md, т. 9)"
    return 0
  fi
  # пътят влиза в unit-а със sed: само прости знаци, иначе би счупил замяната
  [[ "$SHARED" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
    it_warn "необичаен път $SHARED — таймерите не са сложени"
    return 1
  }
  install -d -m 700 "$SHARED/backups" "$SHARED/backups/daily" || return 1
  for pair in backup.sh:chatchat-backup retention.sh:chatchat-retention; do
    rc=0 && it_put "$src/${pair%%:*}" "$SBIN/${pair#*:}" 700 || rc=$?
    [ "$rc" != 2 ] || return 1
  done
  for unit in $UNITS; do
    tmp="$(mktemp)" || return 1
    sed "s#/opt/few-few/shared/chatchat#$SHARED#g" "$src/systemd/$unit" >"$tmp"
    rc=0 && it_put "$tmp" "$SYSTEMD_DIR/$unit" 644 || rc=$?
    rm -f "$tmp"
    [ "$rc" != 2 ] || return 1
    [ "$rc" != 0 ] || changed=1
  done
  if [ "$changed" = 1 ]; then systemctl daemon-reload || return 1; fi
  systemctl enable --now chatchat-backup.timer chatchat-retention.timer >/dev/null || return 1
  it_ok "ретенцията е дневна (chatchat-retention.timer, 03:17 UTC)"

  if ! command -v "${CHATCHAT_AGE:-age}" >/dev/null 2>&1; then
    it_warn "таймерът за бекъпа е сложен, но липсва age — бекъпите не тръгват до: apt-get install -y age"
    return 0
  fi
  if [ ! -s "$SHARED/backup-recipients.txt" ]; then
    it_warn "таймерът за бекъпа е сложен, но няма получател — бекъпите не тръгват до публичния ключ на собственика в"
    it_warn "  $SHARED/backup-recipients.txt (age1…, mode 600; частният ключ — само при собственика) — DEPLOY.md, т. 9"
    return 0
  fi
  if [ -n "$(find "$SHARED/backups/daily" -maxdepth 1 -name 'chatchat-*.files.tar.age' -mmin "-$FRESH_MIN" 2>/dev/null)" ]; then
    it_ok "дневният шифрован бекъп е на място (chatchat-backup.timer, 02:45 UTC)"
    return 0
  fi
  it_log "няма пълен бекъп от последните $((FRESH_MIN / 60)) ч — пускам един сега…"
  if ! systemctl start chatchat-backup.service; then
    it_warn "бекъпът не мина — journalctl -u chatchat-backup -n 50"
    return 1
  fi
  it_ok "дневният шифрован бекъп мина и е на място (chatchat-backup.timer, 02:45 UTC)"
}

# Изпълнен — слага таймерите; зареден със `source` (deploy.sh, тестовете) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  [ "$(id -u)" = 0 ] || {
    it_warn "пусни като root (sudo)."
    exit 1
  }
  install_timers
fi
