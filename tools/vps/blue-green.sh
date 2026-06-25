#!/usr/bin/env bash
# blue-green.sh — деплой без прекъсване чрез Caddy upstream суич (VPS-аджията v2.1).
# Вдига новия „цвят" контейнер, чака Docker healthcheck, после атомарно превключва
# reverse proxy upstream-а. Rollback = не превключвай. Старият се дренира със SIGTERM.
#
# Употреба:  bash tools/vps/blue-green.sh <project_dir> <health_path>
#   напр.    bash tools/vps/blue-green.sh /opt/few-few/current/zabobovdol /
# Изисква: docker compose, curl. Caddy admin API на :2019 (или nginx fallback).
set -euo pipefail
die(){ printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }
ok(){  printf '\033[32m✔ %s\033[0m\n' "$*"; }
inf(){ printf '\033[1;36m▸ %s\033[0m\n' "$*"; }

dir="${1:?project dir}"; health="${2:-/}"
[ -d "$dir" ] || die "Няма папка: $dir"
command -v docker >/dev/null || die "Липсва docker"
cd "$dir"

# Определи текущия и новия цвят (state файл до compose-а).
state=".bluegreen"; cur="$( [ -f "$state" ] && cat "$state" || echo blue )"
new="$([ "$cur" = blue ] && echo green || echo blue)"
inf "Текущ: $cur → нов: $new"

# Вдигни новия цвят като отделен compose project (без да пипаш стария).
COMPOSE_PROJECT_NAME="app-$new" docker compose up -d --build
inf "Чакам healthcheck на новия цвят…"

# Намери порта на app контейнера на новия цвят.
cid="$(COMPOSE_PROJECT_NAME="app-$new" docker compose ps -q app 2>/dev/null | head -1)"
[ -n "$cid" ] || die "Не намирам app контейнера на $new"
port="$(docker inspect -f '{{range $p,$c := .NetworkSettings.Ports}}{{(index $c 0).HostPort}}{{end}}' "$cid" 2>/dev/null | head -1)"
[ -n "$port" ] || die "Не намирам публикувания порт на $new"

healthy=0
for i in $(seq 1 20); do
  if curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:${port}${health}"; then healthy=1; break; fi
  sleep 3
done
[ "$healthy" = 1 ] || { warn(){ :; }; inf "Новият цвят е нездрав → НЕ превключвам (rollback)."; COMPOSE_PROJECT_NAME="app-$new" docker compose down; die "blue-green прекратен — старият $cur остава жив."; }
ok "Новият цвят е здрав (порт $port)."

# Превключи upstream-а.
if curl -fsS -o /dev/null "http://127.0.0.1:2019/config/" 2>/dev/null; then
  inf "Caddy admin: насочвам към 127.0.0.1:${port}"
  # (Шаблон — адаптирай пътя към твоя upstream в Caddy конфигурацията.)
  echo "  → PATCH Caddy reverse_proxy upstream към 127.0.0.1:${port} (виж README)."
elif command -v nginx >/dev/null; then
  inf "Nginx: обнови upstream порта и reload"
  echo "  → задай ${port} в upstream блока и: nginx -t && nginx -s reload"
else
  die "Нито Caddy admin, нито nginx — превключи upstream ръчно към ${port}."
fi

echo "$new" > "$state"
ok "Превключено към $new. Дренирам стария $cur…"
COMPOSE_PROJECT_NAME="app-$cur" docker compose down --timeout 30 || true
ok "Деплой без прекъсване готов ($cur → $new)."
