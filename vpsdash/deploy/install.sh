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
# Версията се ПРОВЕРЯВА, не се предполага. Node 18 стартира и пада чак при първия
# модерен синтаксис — тоест услугата се „инсталира успешно" и после рестартира в
# цикъл, а причината е на 40 реда навътре в journald.
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js $(node -v 2>/dev/null) е твърде стар — нужен е ≥ 20."
command -v curl >/dev/null || die "Липсва curl (нужен е за проверката накрая)."
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# 1) Код → APP_DIR (rsync ако е наличен, иначе cp).
# ПРЕДПАЗИТЕЛ: `rsync --delete` с APP_DIR=/opt (една сгрешена буква) изтрива
# /opt/medqr, /opt/vizitka, /opt/nexus… Системните папки се отказват изрично.
case "$APP_DIR" in
  /|/opt|/usr|/etc|/var|/root|/home|/srv|/boot) die "Опасен APP_DIR: $APP_DIR" ;;
esac
if [ "$SRC_DIR" = "$APP_DIR" ]; then
  ok "Кодът вече е на място (${APP_DIR}) — пропускам копирането."
else
  log "Инсталирам кода в ${APP_DIR}…"
  mkdir -p "$APP_DIR"
  if command -v rsync >/dev/null; then
    # `deploy/desktop/desktop.env` е ТАЙНА, която живее до compose файла, тоест
    # ВЪТРЕ в дървото на кода — а `--delete` го трие при всеки деплой. Резултатът
    # изглежда като липсваща стъпка („сложи там DESKTOP_PASSWORD"), не като
    # регресия: човек го създава, десктопът тръгва, следващият деплой го изтрива
    # мълчаливо и съобщението се връща. Изключва се поименно.
    rsync -a --delete --exclude .state/ --exclude node_modules/ \
      --exclude deploy/desktop/desktop.env "$SRC_DIR"/ "$APP_DIR"/
  else
    # Без rsync няма `--delete`: изтритите в новата версия файлове оцеляват.
    # Казваме го, вместо да се преструваме, че е същото.
    printf '\033[33m⚠ Няма rsync — копирам с cp -a. Файлове от предишна версия НЕ се махат.\033[0m\n'
    cp -a "$SRC_DIR"/. "$APP_DIR"/
    rm -rf "$APP_DIR/.state"
  fi
fi

# 2) State папка + права на конфиг папката.
install -d -m 700 "$STATE_DIR"
# ВЪН от блока „ако липсва конфиг": при преинсталация папката с тайните
# (initial-admin-credential.txt, restic.env) иначе никога не се затяга.
install -d -m 700 "$CONFIG_DIR"

# 3) Конфиг — само ако липсва (пазим тайните при преинсталация).
if [ -f "$CONFIG" ]; then
  ok "Конфигът вече съществува (${CONFIG}) — не го пипам."
else
  log "Създавам конфиг с генерирани тайни…"
  # (папката вече е създадена с mode 700 по-горе — при преинсталация тя трябва да
  # се затегне ВИНАГИ, не само когато липсва конфиг.)
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

  # trustProxy: зад Nginx клиентският адрес идва от X-Forwarded-For/X-Real-IP.
  # Без него панелът вижда 127.0.0.1 за ВСЕКИ — списъкът с разрешени адреси става
  # безсмислен, а одитът записва грешен адрес. С него, но БЕЗ прокси, което
  # презаписва хедъра, всеки може да си измисли адрес. Затова се пита изрично.
  TRUST_PROXY="${CSD_TRUST_PROXY:-}"
  if [ -z "$TRUST_PROXY" ]; then
    if [ -t 0 ]; then
      read -r -p "Панелът ще стои зад Nginx/reverse proxy? [Д/н]: " ans
      case "${ans:-д}" in [нНnN]*) TRUST_PROXY=false ;; *) TRUST_PROXY=true ;; esac
    else
      TRUST_PROXY=false
    fi
  fi

  # Продуктови проверки: пишем САМО тези, чийто порт наистина слуша на ТОЗИ
  # сървър. Иначе вторият VPS вдига по една критична аларма за всеки продукт,
  # който изобщо не е негов — и панелът започва живота си с 7 фалшиви тревоги.
  log "Търся кои продукти живеят на тази машина…"
  HEALTH_JSON="$(
    node -e '
      const net = require("net");
      const all = [
        ["zabobovdol", 80, "/"], ["medqr", 3000, "/"], ["vizitka", 3100, "/"],
        ["mastilko", 3200, "/"], ["nexus", 4000, "/api/health"], ["supreme", 8080, "/"],
        ["eternaltouch", 4300, "/healthz"], ["ospedali", 8788, "/healthz"],
      ];
      const probe = ([name, port, path]) => new Promise((res) => {
        const s = net.connect({ host: "127.0.0.1", port, timeout: 800 });
        const done = (ok) => { s.destroy(); res(ok ? { name, url: `http://127.0.0.1:${port}${path}` } : null); };
        s.on("connect", () => done(true));
        s.on("error", () => done(false));
        s.on("timeout", () => done(false));
      });
      Promise.all(all.map(probe)).then((r) => console.log(JSON.stringify(r.filter(Boolean))));
    ' 2>/dev/null || echo '[]'
  )"
  ok "Намерени продукти: $(node -p "JSON.parse(process.argv[1]).map(h=>h.name).join(', ')||'нито един (добави ги после в config.json)'" "$HEALTH_JSON")"

  # Генерираме конфига през самия auth.js — един източник на истината за хеша.
  # Всички стойности се подават като ENV (префикс пред node) — не като argv.
  # APP_DIR_ESM е абсолютен път, защото import() иска такъв за ESM модула.
  APP_DIR_ESM="$APP_DIR" \
  CSD_OUT="$CONFIG" CSD_ADMIN_PW="$ADMIN_PW" CSD_NODE_ID="$NODE_ID" \
  CSD_NODE_NAME="$NODE_NAME" CSD_PORT="$PORT" CSD_PEER_TOKEN_VAL="$PEER_TOKEN" \
  CSD_STATE_DIR="$STATE_DIR" CSD_TRUST_PROXY_VAL="$TRUST_PROXY" CSD_HEALTH_JSON="$HEALTH_JSON" \
  node -e '
    const crypto = require("crypto");
    import(process.env.APP_DIR_ESM + "/src/auth.js").then((auth) => {
      let healthChecks = [];
      try { healthChecks = JSON.parse(process.env.CSD_HEALTH_JSON || "[]"); } catch {}
      const cfg = {
        host: "127.0.0.1", port: Number(process.env.CSD_PORT)||7700,
        nodeId: process.env.CSD_NODE_ID, nodeName: process.env.CSD_NODE_NAME,
        adminUser: "admin", sessionTtlHours: 12,
        trustProxy: process.env.CSD_TRUST_PROXY_VAL === "true",
        peerToken: process.env.CSD_PEER_TOKEN_VAL || "", peers: [],
        passwordHash: auth.hashPassword(process.env.CSD_ADMIN_PW),
        sessionSecret: crypto.randomBytes(32).toString("hex"),
        paths: { stateDir: process.env.CSD_STATE_DIR, releasesDir: "/opt/few-few/releases",
          currentLink: "/opt/few-few/current", archiveDir: "/root", autodeploy: "" },
        // Само реално слушащите продукти — виж бележката по-горе.
        healthChecks,
        // Полетата, които собственикът пипа най-често, се записват ПРАЗНИ, за да
        // са видими при `cat config.json`. JSON няма коментари — обяснението
        // живее в src/config.js и в README.
        notify: {
          telegram: { botToken: "", chatId: "", minSeverity: "" },
          ntfy: { server: "https://ntfy.sh", topic: "", token: "", minSeverity: "" },
          webhook: { url: "", minSeverity: "" },
          email: { to: "", from: "vps-dashboard@localhost", minSeverity: "" },
        },
        alerts: { enabled: true, heartbeatUrl: "", silences: [] },
        allowIps: [],
        watchDomains: [],
        envFiles: [],
      };
      // mode при СЪЗДАВАНЕТО, не след това — иначе има прозорец, в който
      // конфигът (passwordHash + sessionSecret) е четим от всички.
      require("fs").writeFileSync(process.env.CSD_OUT, JSON.stringify(cfg, null, 2), { mode: 0o600 });
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

# 4) systemd unit + DROP-IN за локалните пътища.
#
# Локалните разлики НЕ се режат в самия unit файл със `sed`. Причината е точно
# същата, заради която ресурсните лимити на панела са drop-in: `autodeploy.sh`
# преинсталира unit-а при всеки деплой (`install -m 644 …`) и заличава всяка
# персонализация. При node извън `/usr/bin` (nvm/nodesource) това значи, че
# панелът умира на следващия рестарт, а причината е един презаписан ред.
# Drop-in-ът оцелява преинсталацията и се маха с `systemctl revert`.
log "Инсталирам systemd услугата…"
NODE_BIN="$(command -v node)"
# Всичко, което влиза в конфигурационен файл, минава през проверка за знаци:
# път с „&", „#" или интервал произвежда мълчаливо повреден ред.
for p in "$APP_DIR" "$CONFIG_DIR" "$STATE_DIR" "$CONFIG" "$NODE_BIN"; do
  case "$p" in
    *[!A-Za-z0-9._/-]*) die "Непозволен знак в пътя: $p" ;;
  esac
done
install -m 644 "$APP_DIR/deploy/vps-dashboard.service" /etc/systemd/system/${SERVICE}.service
install -d -m 755 "/etc/systemd/system/${SERVICE}.service.d"
# Празният `ExecStart=`/`ReadWritePaths=` ИЗРИЧНО нулира наследеното — без него
# systemd добавя към списъка вместо да го замени.
cat > "/etc/systemd/system/${SERVICE}.service.d/10-local.conf" <<EOF
# Управлява се от deploy/install.sh. Локални пътища на ТАЗИ машина.
# Маха се с: systemctl revert ${SERVICE}
[Service]
WorkingDirectory=${APP_DIR}
ExecStart=
ExecStart=${NODE_BIN} server.js
Environment=CSD_CONFIG=${CONFIG}
Environment=HOME=${STATE_DIR}
ReadWritePaths=
ReadWritePaths=-/root -${STATE_DIR} -${CONFIG_DIR} -/opt/few-few
EOF
chmod 644 "/etc/systemd/system/${SERVICE}.service.d/10-local.conf"
# Папката за релийзите трябва да СЪЩЕСТВУВА, преди unit-ът да я поиска.
install -d -m 755 /opt/few-few
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1 || true
systemctl restart "$SERVICE"

# Портът се чете от КОНФИГА, не от ENV: при преинсталация върху съществуващ
# конфиг `CSD_PORT` не важи и проверката щеше да чука на грешна врата.
if [ -f "$CONFIG" ]; then
  PORT="$(CSD_CFG="$CONFIG" node -p 'JSON.parse(require("fs").readFileSync(process.env.CSD_CFG,"utf8")).port||7700' 2>/dev/null || echo "$PORT")"
fi

# Три приемливи отговора, не един:
#   200 — рядко (панелът иска сесия)
#   401 — нормалното „жив съм, но не си вписан"
#   403 — жив, но `allowIps` не включва loopback. ФИКСИРАНИЯТ преди отказ тук
#         обявяваше напълно здрав панел за мъртъв.
# И цикъл вместо `sleep 2`: бавен старт не е провал.
alive=0
for _ in $(seq 20); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${PORT}/api/ping" || echo 000)"
  case "$code" in
    200|401|403) alive=1; break ;;
  esac
  sleep 1
done
if [ "$alive" = "1" ]; then
  ok "VPS Dashboard е жив на http://127.0.0.1:${PORT} (отговор ${code})"
  log "Публикувай го през Nginx + TLS: виж deploy/nginx.conf.example"
else
  die "Услугата не отговаря на http://127.0.0.1:${PORT}/api/ping — виж: journalctl -u ${SERVICE} -n 40"
fi
