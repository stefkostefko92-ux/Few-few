#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# install.sh — еднократна инсталация на VPS Dashboard на сървъра.
# Създава конфига (с генерирани тайни + парола), инсталира systemd unit-а и
# стартира услугата. Идемпотентен: повторно пускане НЕ презаписва съществуващ
# config.json (пази паролата/тайните). Тайните живеят само тук, mode 600.
#
# Употреба:
#   sudo bash deploy/install.sh                       # интерактивно (пита за парола)
#   sudo CSD_ADMIN_PASSWORD=... bash deploy/install.sh # без питане
#   sudo CSD_PEER_TOKEN=... bash deploy/install.sh      # + federation токен
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/vps-dashboard}"
CONFIG_DIR="${CONFIG_DIR:-/etc/vps-dashboard}"
CONFIG="${CONFIG_DIR}/config.json"
STATE_DIR="${STATE_DIR:-/var/lib/vps-dashboard}"
SERVICE="vps-dashboard"
NODE_ID="${CSD_NODE_ID:-$(hostname -s 2>/dev/null || echo local)}"
NODE_NAME="${CSD_NODE_NAME:-$(hostname 2>/dev/null || echo VPS)}"
PORT="${CSD_PORT:-7700}"

log()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Пусни като root (sudo)."
command -v node >/dev/null || die "Липсва node (нужен е Node.js ≥ 20)."
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# 1) Код → APP_DIR (rsync ако е наличен, иначе cp).
log "Инсталирам кода в ${APP_DIR}…"
mkdir -p "$APP_DIR"
if command -v rsync >/dev/null; then
  rsync -a --delete --exclude .state/ --exclude node_modules/ "$SRC_DIR"/ "$APP_DIR"/
else
  cp -a "$SRC_DIR"/. "$APP_DIR"/
fi

# 2) State папка.
install -d -m 700 "$STATE_DIR"

# 3) Конфиг — само ако липсва (пазим тайните при преинсталация).
if [ -f "$CONFIG" ]; then
  ok "Конфигът вече съществува (${CONFIG}) — не го пипам."
else
  log "Създавам конфиг с генерирани тайни…"
  mkdir -p "$CONFIG_DIR"
  ADMIN_PW="${CSD_ADMIN_PASSWORD:-}"
  if [ -z "$ADMIN_PW" ]; then
    if [ -t 0 ]; then
      read -r -s -p "Админ парола (празно = генерирам): " ADMIN_PW; echo
    fi
  fi
  GENERATED=0
  if [ -z "$ADMIN_PW" ]; then
    ADMIN_PW="$(node -e 'console.log(require("crypto").randomBytes(12).toString("base64url"))')"
    GENERATED=1
  fi
  PEER_TOKEN="${CSD_PEER_TOKEN:-}"

  # Генерираме конфига през самия auth.js — един източник на истината за хеша.
  # Всички стойности се подават като ENV (префикс пред node) — не като argv.
  # APP_DIR_ESM е абсолютен път, защото import() иска такъв за ESM модула.
  APP_DIR_ESM="$APP_DIR" \
  CSD_OUT="$CONFIG" CSD_ADMIN_PW="$ADMIN_PW" CSD_NODE_ID="$NODE_ID" \
  CSD_NODE_NAME="$NODE_NAME" CSD_PORT="$PORT" CSD_PEER_TOKEN_VAL="$PEER_TOKEN" \
  CSD_STATE_DIR="$STATE_DIR" \
  node -e '
    const crypto = require("crypto");
    import(process.env.APP_DIR_ESM + "/src/auth.js").then((auth) => {
      const cfg = {
        host: "127.0.0.1", port: Number(process.env.CSD_PORT)||7700,
        nodeId: process.env.CSD_NODE_ID, nodeName: process.env.CSD_NODE_NAME,
        adminUser: "admin", sessionTtlHours: 12, trustProxy: false,
        peerToken: process.env.CSD_PEER_TOKEN_VAL || "", peers: [],
        passwordHash: auth.hashPassword(process.env.CSD_ADMIN_PW),
        sessionSecret: crypto.randomBytes(32).toString("hex"),
        paths: { stateDir: process.env.CSD_STATE_DIR, releasesDir: "/opt/few-few/releases",
          currentLink: "/opt/few-few/current", archiveDir: "/root", autodeploy: "" },
      };
      require("fs").writeFileSync(process.env.CSD_OUT, JSON.stringify(cfg, null, 2));
    }).catch(e => { console.error(e); process.exit(1); });
  '
  chmod 600 "$CONFIG"
  ok "Конфиг записан: ${CONFIG} (mode 600)"
  if [ "$GENERATED" = "1" ]; then
    # Не печатаме тайната в лога (може да попадне в journald при авто-деплой).
    # Записваме я в root-only файл и казваме само КЪДЕ да я прочете операторът.
    CRED_FILE="${CONFIG_DIR}/initial-admin-credential.txt"
    umask 077
    printf '%s\n' "$ADMIN_PW" > "$CRED_FILE"
    chmod 600 "$CRED_FILE"
    printf '\033[33m⚠ Генерирана админ парола е записана (mode 600) в:\n    %s\n  Прочети я, запиши я в мениджъра за тайни, после изтрий файла.\033[0m\n' "$CRED_FILE"
  fi
fi

# 4) systemd unit.
log "Инсталирам systemd услугата…"
install -m 644 "$APP_DIR/deploy/vps-dashboard.service" /etc/systemd/system/${SERVICE}.service
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1 || true
systemctl restart "$SERVICE"
sleep 2

if curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:${PORT}/api/ping" \
  || [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:${PORT}/api/ping)" = "401" ]; then
  ok "VPS Dashboard е жив на http://127.0.0.1:${PORT}"
  log "Публикувай го през Nginx + TLS: виж deploy/nginx.conf.example"
else
  die "Услугата не отговаря — виж: journalctl -u ${SERVICE} -n 40"
fi
