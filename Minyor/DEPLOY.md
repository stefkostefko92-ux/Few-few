# Деплой

Ръководство за продукционно пускане на сайта на ФК „Миньор“ Бобов дол.

## Вариант А — Docker Compose (препоръчан)

Изисква сървър с Docker и Docker Compose.

```bash
# 1. Клониране и настройки
git clone https://github.com/stefkostefko92-ux/Few-few.git
cd Few-few/minyor-bobov-dol
cp .env.example .env
```

Попълнете в `.env` поне:

- `POSTGRES_PASSWORD` — силна парола за базата.
- `AUTH_SECRET` — дълъг случаен низ (`openssl rand -base64 48`).
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` (мин. 10 знака), `ADMIN_NAME`.
- `NEXT_PUBLIC_SITE_URL` — публичният адрес (напр. `https://minyor.carbonstealth.eu`).

```bash
# 2. Билд и старт
docker compose up -d --build

# 3. Първоначален администратор + примерни данни (еднократно)
docker compose exec app npm run db:seed
```

Приложението слуша на порт `3000` (конфигурируем чрез `HTTP_PORT`). Поставете
пред него обратен прокси (Nginx, Caddy, Traefik) за TLS и пренасочване 80→443.

При стартиране `docker-entrypoint.sh` изчаква базата и прилага схемата с
`prisma db push`.

## Вариант Б — Ръчно (Node 20+ и PostgreSQL)

```bash
npm ci
cp .env.example .env        # попълнете стойностите
npx prisma db push          # създава таблиците
npm run db:seed             # администратор + примерни данни
npm run build
npm run start               # слуша на PORT (по подразбиране 3000)
```

## Обратно прокси (примерно за Nginx)

```nginx
server {
  server_name minyor.carbonstealth.eu;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

TLS се издава най-лесно с `certbot --nginx`. Заглавието `Strict-Transport-Security`
вече се изпраща от приложението.

## Поддръжка на съдържанието

След пускане влезте в `/admin/login` с администраторския акаунт и заменете
примерните данни с реални: състав, програма, класиране, новини и снимки.

## Автоматична синхронизация (програма, резултати, класиране)

Програмата, резултатите, следващият мач и класирането се обновяват автоматично
от **bgclubs.eu** чрез защитената крайна точка `/api/sync`.

1. Задайте таен токен в `.env`:

   ```bash
   SYNC_TOKEN="$(openssl rand -hex 24)"
   ```

2. Добавете cron на сървъра, който я извиква на всеки 3 часа:

   ```cron
   7 */3 * * *  curl -fsS "https://minyor.carbonstealth.eu/api/sync?token=ТОКЕН" >/dev/null
   ```

Можете да стартирате обновяване и ръчно от админ панела →
**Синхронизация на данни → „Обнови сега"**. Съставът на отбора се поддържа
ръчно (няма надежден автоматичен източник за това ниво).

> Сървърът трябва да има изходящ достъп до `https://bgclubs.eu`.

## Архивиране

Архивирайте редовно базата:

```bash
docker compose exec db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup-$(date +%F).sql
```
