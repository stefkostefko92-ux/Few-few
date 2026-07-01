# Деплой на platform

Продукционен модел: **Docker Compose зад reverse proxy** (nginx/Caddy на хоста
поема TLS), точно като `zabobovdol`. Приложението (`web`) слуша само на
`127.0.0.1:${HTTP_PORT}` (по подразбиране 3000); базата (`db`) е във вътрешна мрежа,
без публикуван порт.

## Файлове

- `Dockerfile` — многослоен билд (`deps → build → runner`), Next.js **standalone**,
  не-root, `HEALTHCHECK` на `/api/health`.
- `docker-compose.yml` — услуги `web` + `db` (`postgres:16-alpine`), том `db-data`,
  вътрешна мрежа `internal`. Env-ите идват от `.env`.
- `docker-entrypoint.sh` — изчаква базата → `prisma db push` (или `migrate deploy`,
  ако добавите `prisma/migrations/`) → сийд **само при първо пускане** (когато няма
  нито един потребител).
- `.dockerignore` — държи `node_modules`, `.next`, `.env` и т.н. извън образа.

## Задължителни env (в `platform/.env` на сървъра, права 600)

Копирайте от `.env.example` и попълнете. **Никога не комитвайте `.env`.**

| Променлива | Смисъл |
| --- | --- |
| `DATABASE_URL` | Автоматично се сглобява от compose (`db:5432`); попълва се от `POSTGRES_*`. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Достъп до базата (силна парола). |
| `AUTH_SECRET` | ≥32 знака (кодът отхвърля примерната стойност). `openssl rand -base64 48`. |
| `ENCRYPTION_KEY` | 32 байта hex (64 знака) за AES-256-GCM. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `CRON_TOKEN` | Секрет за периодичните здравни проверки (`/api/cron/health`). |
| `OWNER_EMAIL` / `OWNER_PASSWORD` / `OWNER_NAME` | Начален собственик — ползва се само при първо сийдване (парола ≥10 знака). |
| `NEXT_PUBLIC_SITE_URL` | Публичният HTTPS адрес на панела. |
| `HTTP_BIND` / `HTTP_PORT` | Къде да слуша `web` на хоста (по подр. `127.0.0.1:3000`). |

### По избор (не са задължителни — панелът работи и без тях)

| Променлива | За какво |
| --- | --- |
| `AI_PROVIDER` | Доставчик за AI конструктора: `anthropic` (подр.) / `openai` / `gemini`. Без ключ пада на `rules` fallback. |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Ключ и модел за Anthropic (подр. модел `claude-opus-4-8`). |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | Ключове за другите доставчици (само ако ги ползвате). |
| `AUDIT_RETENTION_DAYS` | Колко дни се пазят одит логовете при прунинг (подр. `365`). |
| `HEALTH_RETENTION_DAYS` | Колко дни се пазят health записите при прунинг (подр. `90`). |

## Стъпки (ръчно, еднократна настройка)

```bash
cd platform
cp .env.example .env          # попълни тайните (виж таблицата), chmod 600 .env
docker compose up -d --build  # билд + вдигане; entrypoint прави db push + сийд (1-ви път)
curl -fsS http://127.0.0.1:3000/api/health   # → {"status":"ok",...}
```

Автоматизирано през `deploy/autodeploy.sh` (`platform` е в `PROJECTS`): пренася
`platform/.env`, билдва, вдига и проверява `/api/health`.

### Принудителен сийд

```bash
FORCE_SEED=1 docker compose up -d --build   # или ръчно:
docker compose exec web npm run db:seed
```

## Reverse proxy (nginx на хоста)

Панелът слуша само на localhost — проксирайте домейна към него. TLS (Let's Encrypt)
се поема от външния nginx/Caddy, не от този стек.

```nginx
server {
  server_name platform.carbonstealth.eu;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  # TLS блокът се добавя от certbot --nginx.
}
```

## Периодични здравни проверки (cron)

Панелът проверява свързаните сайтове през пазен маршрут. Закачете systemd timer или
външен cron (секретът е в заглавие, не в URL, за да не влиза в логовете):

```bash
curl -X POST -H "Authorization: Bearer $CRON_TOKEN" \
  https://platform.carbonstealth.eu/api/cron/health
```

## Бекъп преди миграция

Схемата се синхронизира при всеки старт. Преди рискова промяна на схемата направете
бекъп на базата:

```bash
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > platform-$(date +%F).sql
```

## Забележки

- Билдът не пипа реална база: страниците с база са `force-dynamic`, а Dockerfile
  билдва с dummy `DATABASE_URL` (както CI).
- `/api/health` е лек (не чука базата) и е извън middleware guard-а — ползва се от
  `HEALTHCHECK` и от `autodeploy.sh`.
