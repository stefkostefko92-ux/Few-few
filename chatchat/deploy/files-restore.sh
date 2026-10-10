#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# chatchat/deploy/files-restore.sh — възстановяване на ПРИКАЧЕНИТЕ ФАЙЛОВЕ от дневния шифрован бекъп
# (DEPLOY.md, т. 10). Базата — deploy/backup-restore.sh; двете от бекъпа със СЪЩИЯ час.
#
#   R="$(cat /opt/few-few/shared/chatchat/last-good)"
#   bash "$R/deploy/files-restore.sh" --into /root/chatchat-files-проба ВХОД      # репетиция
#   bash "$R/deploy/files-restore.sh" --live --yes-i-know ВХОД                     # авария
#
#   ВХОД: `-` — tar архивът, разшифрован при собственика и подаден на stdin през ssh (препоръчано);
#         или --identity КЛЮЧ ФАЙЛ.files.tar.age — разшифроване тук.
#
# --into: разопакова в НОВА (несъществуваща) папка и казва колко файла има — живите не се пипат.
# --live: РАЗРУШИТЕЛНО — спира приложението, разопакова в съседна папка, после я разменя с живата
#         (тя остава до нея като attachments.pre-restore-<час>, mode 700 — трие се на ръка, когато
#         проверката мине) и пуска приложението отново — и при грешка.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# shellcheck source=backup.sh
source "$(dirname "${BASH_SOURCE[0]}")/backup.sh"
SRC="" IDENTITY="" APP_ID="" STAGE=""

usage() {
  die "употреба: files-restore.sh (--into НОВА_ПАПКА | --live --yes-i-know) (- | --identity КЛЮЧ ФАЙЛ.files.tar.age)"
}

plain_tar() {
  if [ "$SRC" = - ]; then cat; else "$AGE" -d -i "$IDENTITY" "$SRC"; fi
}

# Архивът се разопакова в $1: без собственици от архива (всичко става на uid 1000 — node в образа),
# без абсолютни пътища и без излизане извън папката (GNU tar ги отказва по подразбиране).
extract_to() {
  install -d -m 700 -o 1000 -g 1000 "$1"
  plain_tar | tar --no-same-owner --no-same-permissions -C "$1" -xf -
  chown -R 1000:1000 "$1"
  find "$1" -type d -exec chmod 700 {} + && find "$1" -type f -exec chmod 600 {} +
}

check_source() {
  if [ "$SRC" = - ]; then
    [ ! -t 0 ] || die "очаквам разшифрования tar на stdin (DEPLOY.md, т. 10)."
    return 0
  fi
  [ -f "$SRC" ] && [ -n "$IDENTITY" ] && [ -f "$IDENTITY" ] ||
    die "за файл трябва и --identity с частния ключ (по-добре: разшифровай при себе си и подай на stdin)."
  command -v "$AGE" >/dev/null 2>&1 || die "липсва age (apt-get install -y age)."
  if [ -f "$SRC.sha256" ]; then
    (cd "$(dirname "$SRC")" && sha256sum -c --quiet "$(basename "$SRC").sha256") ||
      die "контролната сума на $(basename "$SRC") не съвпада — файлът е повреден."
  else
    warn "няма $(basename "$SRC").sha256 — целостта я проверява само age при разшифроването."
  fi
}

drill() {
  [ ! -e "$1" ] || die "$1 вече съществува — репетицията разопакова само в нова папка."
  extract_to "$1" || die "разопаковането в $1 се провали."
  log "репетицията мина: $(find "$1" -type f | wc -l) файла в $1 — изтрий я след огледа (rm -r $1)"
}

# Приложението тръгва отново при всеки изход от --live; недовършената съседна папка се трие.
finish_live() {
  cleanup
  [ -z "$STAGE" ] || rm -rf "${STAGE:?}"
  if [ -n "$APP_ID" ]; then
    if docker start "$APP_ID" >/dev/null; then log "приложението е пуснато отново"; else warn "приложението не тръгна — docker start $APP_ID"; fi
  fi
}

live() {
  local old
  [ -d "$FILES_DIR" ] || die "няма $FILES_DIR — сложи я с deploy.sh, после възстановявай."
  APP_ID="$(container app)" || APP_ID=""
  trap finish_live EXIT
  if [ -n "$APP_ID" ]; then docker stop "$APP_ID" >/dev/null || die "приложението не спря — файловете не са пипани."; fi
  # Съседна папка на същата файлова система — размяната е два rename-а, не копиране.
  STAGE="$FILES_DIR.restore-$(date -u +%Y%m%d-%H%M%S)"
  extract_to "$STAGE" || die "разопаковането се провали — живите файлове не са пипани."
  old="$FILES_DIR.pre-restore-$(date -u +%Y%m%d-%H%M%S)"
  mv "$FILES_DIR" "$old" || die "живата папка не се премести — нищо не е сменено."
  if ! mv "$STAGE" "$FILES_DIR"; then
    mv "$old" "$FILES_DIR" || true
    die "новата папка не застана на мястото — върнах старата."
  fi
  STAGE=""
  log "възстановени: $(find "$FILES_DIR" -type f | wc -l) файла; старите са в $old (изтрий ги след проверката)"
}

main() {
  local into="" mode="" sure=0
  [ "$(id -u)" = 0 ] || die "пусни като root (sudo)."
  while [ $# -gt 0 ]; do
    case "$1" in
      --into) [ $# -ge 2 ] || usage && into="$2" && mode=into && shift 2 ;;
      --live) mode=live && shift ;;
      --yes-i-know) sure=1 && shift ;;
      --identity) [ $# -ge 2 ] || usage && IDENTITY="$2" && shift 2 ;;
      -) SRC=- && shift ;;
      -*) usage ;;
      *) SRC="$1" && shift ;;
    esac
  done
  [ -n "$SRC" ] && [ -n "$mode" ] || usage
  if [ "$mode" = live ]; then
    [ -z "$into" ] || usage
    [ "$sure" = 1 ] || die "--live заменя прикачените файлове с бекъпа — потвърди с --yes-i-know."
  else
    case "$into" in /*) ;; *) die "--into иска абсолютен път към НОВА папка." ;; esac
    case "$(realpath -m "$into")/" in "$(realpath -m "$FILES_DIR")/"*) die "--into не може да е в живата папка." ;; esac
  fi
  check_source
  lock
  if [ "$mode" = live ]; then live; else drill "$into"; fi
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
