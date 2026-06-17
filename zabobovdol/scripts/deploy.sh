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
ok "✅ Готово! Сайтът работи на порт 80 (http://<IP на сървъра>)."
echo
bold "Остава за HTTPS (когато домейнът сочи към сървъра):"
echo "   ./scripts/init-letsencrypt.sh"
echo "   после разкоментирайте 443 (скриптът показва стъпките) и: $DC up -d"
echo
bold "После влезте в админ панела на  /admin/login  и попълнете празните чернови."
