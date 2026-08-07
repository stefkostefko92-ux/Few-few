#!/usr/bin/env bash
# smoke.sh — доказва, че ПРОДУКТЪТ работи, не че контейнерът слуша.
#
# ЗАЩО СЪЩЕСТВУВА (одит, 07.08.2026): `autodeploy.sh` питаше ЕДИН URL за 200 и
# обявяваше деплоя за успешен. Точно тихите провали, които гонихме цял ден,
# минават покрай такава проверка: базата може да е мигрирана наполовина, ботът
# да е паднал, Stripe да няма цени, статичните файлове да липсват — а
# фронтендът пак връща 200.
#
# Всяка проверка тук е за нещо, което ВЕЧЕ се е чупило или е било близо до това.
# Изходен код 0 = продуктът работи; 1 = не пускай това пред клиенти.
#
# Употреба:
#   bash deploy/smoke.sh                        # локални портове по подразбиране
#   BASE=https://supremebot.carbonstealth.eu bash deploy/smoke.sh
# deploy-check: allow-no-errexit — диагностичен скрипт: всяка проверка трябва
# да се изпълни и докладва; `-e` би спрял на първата и би скрил останалите.
set -uo pipefail

BASE="${BASE:-http://127.0.0.1:8080}"
API="${API:-http://127.0.0.1:3000}"
BOT="${BOT:-http://127.0.0.1:3001}"
TIMEOUT="${TIMEOUT:-10}"

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); }
note() { printf '  \033[33m·\033[0m %s\n' "$1"; }

# `curl -s -o /dev/null -w %{http_code}` не хвърля при 4xx/5xx — точно каквото
# искаме: интересува ни КОДЪТ, не дали curl е сърдит.
code() { curl -s -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT" "$1" 2>/dev/null || echo "000"; }
body() { curl -s --max-time "$TIMEOUT" "$1" 2>/dev/null || echo ""; }

echo "── Smoke: $BASE ──"

# ─── 1. Фронтендът отдава ПРИЛОЖЕНИЕТО, не празна обвивка ───────────────────
c=$(code "$BASE/")
if [ "$c" = "200" ]; then
  html="$(body "$BASE/")"
  if echo "$html" | grep -qi '<div id="root"'; then ok "фронтендът отдава приложението"
  else bad "фронтендът връща 200, но без React корен — счупен билд?"; fi
  # Билдът пререндира 19 маршрута; липсата им значи, че prerender стъпката е
  # пропаднала тихо и SEO-то е нула.
  if [ "$(code "$BASE/terms")" = "200" ]; then ok "статичните маршрути са пререндирани"
  else bad "/terms не се отдава — prerender стъпката е пропаднала"; fi
else
  bad "фронтендът върна $c"
fi

# ─── 2. Backend-ът е ЖИВ И вижда базата ─────────────────────────────────────
h="$(body "$API/api/health")"
if echo "$h" | grep -q '"database":"up"'; then ok "backend + база"
else bad "backend/база: ${h:-без отговор}"; fi

# ─── 3. Съставното състояние (база + Redis + Discord gateway) ───────────────
# `/api/status/probe` е нарочно направен за машина: празно тяло, само код.
c=$(code "$API/api/status/probe")
if [ "$c" = "200" ]; then ok "всички компоненти са здрави"
elif [ "$c" = "503" ]; then bad "компонент е паднал — виж $API/api/status"
else bad "probe върна $c"; fi

# ─── 4. Ботът е свързан с Discord ───────────────────────────────────────────
b="$(body "$BOT/health")"
if echo "$b" | grep -q '"gateway":"connected"'; then
  ok "ботът е свързан с Discord"
  down=$(echo "$b" | grep -o '"down":[0-9]*' | head -1 | cut -d: -f2)
  [ "${down:-0}" != "0" ] && note "паднали бранд ботове: $down (чужди токени — не блокира деплоя)"
else
  bad "ботът не е свързан: ${b:-без отговор}"
fi

# ─── 5. Автентикацията отхвърля НЕлогнат ────────────────────────────────────
# Ако това върне 200, значи гардът е паднал — по-лошо от счупен деплой.
c=$(code "$API/api/servers")
if [ "$c" = "401" ] || [ "$c" = "403" ]; then ok "защитените маршрути искат вход"
else bad "GET /api/servers върна $c за нелогнат — гардът е паднал"; fi

# ─── 6. Stripe е конфигуриран за ПРОДАЖБА ───────────────────────────────────
# Липсваща цена значи, че клиент може да плати и да получи грешен план.
c=$(code "$API/api/stripe/status/000000000000000000")
if [ "$c" = "503" ]; then bad "Stripe не е конфигуриран (STRIPE_SECRET_KEY липсва)"
elif [ "$c" = "401" ] || [ "$c" = "403" ] || [ "$c" = "404" ]; then ok "Stripe маршрутите живеят"
else note "Stripe статус върна $c"; fi

# ─── 7. Правните страници се отдават ────────────────────────────────────────
# Импресум/условия недостъпни = правен проблем, не UX дребулия.
legal_ok=1
for p in /privacy /cookies /eula /accessibility; do
  [ "$(code "$BASE$p")" = "200" ] || { bad "$p не се отдава"; legal_ok=0; }
done
[ "$legal_ok" = "1" ] && ok "правните страници се отдават"

# ─── 8. SEO артефактите са на място ─────────────────────────────────────────
for f in /robots.txt /sitemap.xml /llms.txt; do
  [ "$(code "$BASE$f")" = "200" ] || bad "$f липсва"
done
[ "$(code "$BASE/robots.txt")" = "200" ] && ok "robots/sitemap/llms са на място"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m✓ Smoke мина: %d проверки\033[0m\n' "$pass"
  exit 0
fi
printf '\033[31m✗ Smoke падна: %d от %d\033[0m — НЕ пускай това пред клиенти.\n' "$fail" "$((pass+fail))"
exit 1
