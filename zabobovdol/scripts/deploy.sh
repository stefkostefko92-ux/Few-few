#!/usr/bin/env bash
# Почти автоматичен деплой: строи и вдига стека, изчаква базата и я зарежда
# САМО при първо пускане (за да не презапише редакциите от админ панела).
# Употреба:   ./scripts/deploy.sh           (нормално)
#             ./scripts/deploy.sh --seed    (принудително презареждане на данните)
set -euo pipefail

cd "$(dirname "$0")/.."

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '\033[32m%s\033[0m\n' "$1"; }
warn() { printf '\033[33m%s\033[0m\n' "$1"; }

FORCE_SEED=0
[ "${1:-}" = "--seed" ] && FORCE_SEED=1

if [ ! -f ".env" ]; then
  warn "Няма .env. Пускам автоматичната настройка…"
  ./scripts/setup-env.sh
  echo
fi

# Избор на команда за compose (v2 „docker compose" или старото „docker-compose").
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  warn "Липсва Docker Compose. Инсталирайте Docker и опитайте пак."
  exit 1
fi

# --- Проверка за конфликт на портове (други сайтове на същия сървър) ---
read_env() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | sed 's/[[:space:]].*$//'; }
HTTP_PORT="$(read_env HTTP_PORT)"; HTTP_PORT="${HTTP_PORT:-80}"

port_in_use() {
  local p="$1"
  # Проверяваме и с ss, и с lsof — ако някой от двата види слушащ порт, е зает.
  if command -v ss >/dev/null 2>&1 &&
     ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$p\$"; then
    return 0
  fi
  if command -v lsof >/dev/null 2>&1 &&
     lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

# Нашият стек вече ли държи порта (при повторен деплой)?
OURS_UP=0
$DC ps 2>/dev/null | grep -i nginx | grep -qiE 'up|running' && OURS_UP=1

if [ "$OURS_UP" = "0" ] && port_in_use "$HTTP_PORT"; then
  warn "Порт $HTTP_PORT вече е ЗАЕТ от друга услуга на този сървър — спирам, за да не счупя нищо."
  echo
  echo "Какво слуша на 80 и 443:"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | grep -E "[:.](80|443)\b" || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:80 -iTCP:443 -sTCP:LISTEN 2>/dev/null || true
  fi
  echo
  bold "Изберете едно от двете:"
  echo "  1) Ако нищо друго не е уебсайт — спрете услугата на порт $HTTP_PORT и пуснете пак."
  echo "  2) Ако има друг сайт/панел (напр. Minecraft панел) на 80/443 — НЕ го пипайте."
  echo "     Сложете в .env:   HTTP_PORT=8080"
  echo "     и в съществуващото reverse proxy насочете zabobovdol.carbonstealth.eu"
  echo "     към http://127.0.0.1:8080 (HTTPS се поема от него; пропуснете init-letsencrypt)."
  echo "     После пуснете отново: ./scripts/deploy.sh"
  exit 1
fi
ok "Порт $HTTP_PORT е свободен."

bold "1/3 Строя и вдигам стека (приложение, база, бекъп, nginx)…"
$DC up -d --build

bold "2/3 Изчаквам приложението и базата да са готови…"
ready=0
for i in $(seq 1 40); do
  if $DC exec -T app node -e "const{PrismaClient}=require('@prisma/client');new PrismaClient().\$queryRaw\`SELECT 1\`.then(()=>process.exit(0)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    ready=1; break
  fi
  sleep 3
done
if [ "$ready" != "1" ]; then
  warn "Базата не отговори навреме. Вижте логовете:  $DC logs app"
  exit 1
fi
ok "Приложението и базата са готови."

# Има ли вече администратор (тоест заредена ли е базата)?
USERS=$($DC exec -T app node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count().then(n=>{process.stdout.write(String(n));return p.\$disconnect()}).catch(()=>process.stdout.write('0'))" 2>/dev/null || echo "0")
USERS=$(printf '%s' "$USERS" | tr -dc '0-9'); USERS=${USERS:-0}

if [ "$FORCE_SEED" = "1" ] || [ "$USERS" = "0" ]; then
  bold "3/3 Зареждам данните (администратор, услуги, ръководства, транспорт…)…"
  $DC exec -T app npm run db:seed:all
  ok "Данните са заредени."
else
  bold "3/3 Базата вече е заредена ($USERS потребителя) — пропускам сийда."
  warn "За принудително презареждане: ./scripts/deploy.sh --seed"
fi

echo
ok "Готово! Сайтът работи на порт $HTTP_PORT (http://<IP на сървъра>:$HTTP_PORT)."
echo
bold "Остава за HTTPS (когато домейнът сочи към сървъра):"
echo "   ./scripts/init-letsencrypt.sh"
echo "   после разкоментирайте 443 (скриптът показва стъпките) и: $DC up -d"
echo
bold "После влезте в админ панела на  /admin/login  и попълнете празните чернови."
