#!/bin/sh
# Entrypoint на platform: изчаква базата, синхронизира схемата и сийдва САМО при
# първо пускане (за да не се презапишат акаунти/сайтове при следващ деплой).
set -e

echo "→ Изчакване на базата данни и синхронизиране на схемата…"
# Ако някой ден добавим prisma/migrations, ползвай migrate deploy; иначе db push.
if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  SYNC="npx prisma migrate deploy"
else
  SYNC="npx prisma db push --skip-generate"
fi

ATTEMPTS=0
until $SYNC 2>/dev/null; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 30 ]; then
    echo "✖ Базата данни не отговори навреме."
    exit 1
  fi
  echo "  …опит $ATTEMPTS, изчакване 2с"
  sleep 2
done
echo "✔ Схемата е приложена."

# Сийд само при първо пускане: ако още няма нито един потребител в базата.
# Тайните за собственика (OWNER_*) идват от .env; ако паролата е слаба/празна,
# seed.ts се проваля с ясна грешка — тук НЕ прекъсваме стартирането на панела,
# само предупреждаваме (собственикът може да сийдне ръчно, като оправи .env).
# Броим потребителите през Prisma клиента (работи без psql в образа).
COUNT="$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count().then(n=>{process.stdout.write(String(n));return p.\$disconnect()}).catch(()=>process.stdout.write('0'))" 2>/dev/null || echo 0)"
COUNT="$(printf '%s' "$COUNT" | tr -dc '0-9')"; COUNT="${COUNT:-0}"

if [ "${FORCE_SEED:-0}" = "1" ] || [ "$COUNT" = "0" ]; then
  echo "→ Първо пускане (потребители: $COUNT) — зареждам началните данни…"
  if npm run db:seed; then
    echo "✔ Началните данни са заредени."
  else
    echo "⚠ Сийдът не мина (вероятно OWNER_PASSWORD е слаба/празна в .env)."
    echo "  Панелът пак ще стартира. Оправи .env и пусни: docker compose exec web npm run db:seed"
  fi
else
  echo "✔ Базата вече е заредена ($COUNT потребителя) — пропускам сийда."
fi

echo "→ Стартиране на приложението."
exec "$@"
