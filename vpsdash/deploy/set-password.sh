#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# set-password.sh — смяна на админ паролата на панела.
#
# Употреба:
#   sudo bash deploy/set-password.sh                    # пита скрито, два пъти
#   sudo CSD_NEW_PW='…' bash deploy/set-password.sh     # без питане (автоматизация)
#
# ЗАЩО СКРИПТ, А НЕ ЕДНОРЕДОВА КОМАНДА. Същото нещо, подадено през
# `bash -s <<EOF`, НЕ работи: тялото на скрипта идва по stdin, значи `read`
# поглъща собствения си скрипт вместо да чака терминала и втората променлива
# остава незададена (`unbound variable` при `set -u`). Скриптът чете от
# терминала, защото stdin му е терминалът — капанът не може да се повтори.
#
# Паролата НИКОГА не е аргумент на командата: аргументите влизат в
# `~/.bash_history`, виждат се в `ps` от всеки потребител на машината и
# попадат в journald. Затова само през промпт или през ENV.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/vps-dashboard}"
CONFIG="${CONFIG:-/etc/vps-dashboard/config.json}"
SERVICE="${SERVICE:-vps-dashboard}"
MIN_LEN="${MIN_LEN:-12}"

ok()  { printf '\033[32m✔ %s\033[0m\n' "$*"; }
die() { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Пусни като root (sudo) — конфигът е mode 600."
command -v node >/dev/null || die "Липсва node."
[ -f "$CONFIG" ] || die "Няма конфиг: $CONFIG (панелът инсталиран ли е?)"
[ -f "$APP_DIR/src/auth.js" ] || die "Няма $APP_DIR/src/auth.js — сгрешен APP_DIR?"

# Паролата: от ENV (автоматизация) или скрито от терминала, с потвърждение.
if [ -z "${CSD_NEW_PW:-}" ]; then
  [ -t 0 ] || die "Няма терминал за питане — подай паролата през CSD_NEW_PW."
  read -r -s -p "Нова парола (мин. ${MIN_LEN} знака): " CSD_NEW_PW; echo
  read -r -s -p "Повтори: " PW_CONFIRM; echo
  [ "$CSD_NEW_PW" = "$PW_CONFIRM" ] || die "Паролите не съвпадат — нищо не е пипнато."
  unset PW_CONFIRM
fi
export CSD_NEW_PW

# Хешът се прави от САМИЯ auth.js на панела — един източник на истината за
# scrypt параметрите. Копие на формулата тук би се разминало при първата ѝ промяна.
CSD_CONFIG_FILE="$CONFIG" CSD_APP_DIR="$APP_DIR" CSD_MIN_LEN="$MIN_LEN" node -e '
const fs = require("fs");
const F = process.env.CSD_CONFIG_FILE;
const pw = process.env.CSD_NEW_PW || "";
const min = Number(process.env.CSD_MIN_LEN) || 12;
if (pw.length < min) { console.error(`Паролата е под ${min} знака — отказвам.`); process.exit(1); }
import(process.env.CSD_APP_DIR + "/src/auth.js").then((auth) => {
  const c = JSON.parse(fs.readFileSync(F, "utf8"));
  c.passwordHash = auth.hashPassword(pw);
  // Вдигането на поколението сваля ВСЯКА издадена сесия — включително тази на
  // текущия браузър и всяка забравена на чуждо устройство. Смяна на парола,
  // която оставя старите сесии живи, не е смяна на парола.
  c.sessionGen = (c.sessionGen || 0) + 1;
  // Атомарно: няма миг, в който конфигът да е половин (той носи sessionSecret и
  // всички токени за известия — прекъснат запис значи изгубени тайни).
  fs.writeFileSync(F + ".tmp", JSON.stringify(c, null, 2), { mode: 0o600 });
  fs.renameSync(F + ".tmp", F);
  console.log("gen=" + c.sessionGen);
}).catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
' || die "Паролата НЕ е сменена."

unset CSD_NEW_PW
chmod 600 "$CONFIG"
ok "Паролата е сменена (конфигът остава mode 600)."

systemctl restart "$SERVICE" \
  || die "Конфигът е записан, но рестартът се провали: systemctl status $SERVICE"

# Рестартът не е доказателство, че панелът е ЖИВ. Портът се чете от конфига, не
# от подразбирането — панел на нестандартен порт иначе се обявява за мъртъв.
PORT="$(CSD_CFG="$CONFIG" node -p 'JSON.parse(require("fs").readFileSync(process.env.CSD_CFG,"utf8")).port||7700' 2>/dev/null || echo 7700)"
HEALTH_CODE=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  HEALTH_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:${PORT}/" 2>/dev/null || true)"
  # 401 е нормалният отговор („жив съм, но не си вписан"); 403 значи жив, но
  # allowIps не пуска loopback. И двете са ЗДРАВ панел — само 000 е мъртъв.
  case "$HEALTH_CODE" in 200|401|403) break ;; esac
done
case "$HEALTH_CODE" in
  200|401|403) ok "Панелът отговаря на 127.0.0.1:${PORT} (${HEALTH_CODE}) — всички стари сесии паднаха." ;;
  *) die "Панелът НЕ отговаря след рестарт (${HEALTH_CODE:-няма отговор}). Паролата Е сменена; виж: journalctl -u ${SERVICE} -n 50" ;;
esac

# Първоначалната парола вече е само стар ключ, който лежи на диска.
CRED="$(dirname "$CONFIG")/initial-admin-credential.txt"
if [ -f "$CRED" ]; then
  rm -f "$CRED"
  ok "Изтрит е старият $CRED."
fi
