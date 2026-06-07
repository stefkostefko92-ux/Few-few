# Деплой — един VPS (Docker Compose + Caddy)

Production стек за „Помагам Бобов дол": PostgreSQL, Redis, API, worker и Caddy
(reverse proxy + статичен admin панел + автоматичен HTTPS чрез Let's Encrypt).

## Предпоставки

- VPS с Docker и Docker Compose.
- Домейн, чийто A/AAAA запис сочи към VPS-а (за ACME сертификата).
- Отворени портове **80** и **443**.
- Brevo акаунт за SMTP (имейл към общината).

## Стъпки

```bash
# на VPS-а, в корена на репото
cd deploy
cp .env.prod.example .env
nano .env                      # попълни домейн, пароли, JWT_SECRET, SMTP_*

docker compose -f docker-compose.prod.yml up -d --build
```

При първото стартиране API контейнерът прилага миграциите и seed-ва
референтните данни (8 категории, 18 населени места) и първоначалния админ от
`ADMIN_EMAIL` / `ADMIN_PASSWORD`. Caddy сам издава TLS сертификат за `DOMAIN`.

## Какво къде слуша

- Навън излизат само портове 80/443 (Caddy).
- Caddy проксира `/reports`, `/admin/*` и `/health` към `api:4400`, а всичко
  останало сервира като статичен admin SPA.
- PostgreSQL и Redis са само във вътрешната мрежа.
- Медията живее в `media` volume, споделен между `api` и `worker`.

## Мобилно приложение

Задай `EXPO_PUBLIC_API_BASE_URL=https://<DOMAIN>` при build на `apps/mobile` —
подаването на сигнали отива на `https://<DOMAIN>/reports`.

## Поддръжка

```bash
docker compose -f docker-compose.prod.yml logs -f api worker
docker compose -f docker-compose.prod.yml ps

# ръчно пре-seed/миграция при нужда
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
docker compose -f docker-compose.prod.yml run --rm api node dist/prisma/seed.js

# смяна на админ парола: смени ADMIN_PASSWORD в .env и пусни seed-а горе
```

> Бележка: образите се изграждат от корена на репото (build context `..`), за
> да включат `packages/shared`. `apps/mobile` е изключен през `.dockerignore`.

## Резервни копия (задължително преди продукция)

Базата живее в `pg_data` volume, а медията — в `media`. Логовете се ротират
(10MB × 3 на услуга). Настрой ежедневен бекъп към външно място:

```bash
# ежедневен dump на базата (cron на хоста)
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > /backup/pomagam-$(date +%F).sql.gz

# медийни файлове (rsync/tar към външно хранилище)
docker run --rm -v pomagam_media:/data -v /backup:/backup alpine \
  tar czf /backup/pomagam-media-$(date +%F).tar.gz -C /data .
```

Тествай възстановяване периодично (`gunzip -c … | psql …`).
