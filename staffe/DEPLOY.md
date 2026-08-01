# Деплой на Staffe (WMS) на VPS

Продукционен стек: **`app`** (Next.js 15 + Prisma) + **`db`** (PostgreSQL 16) през
Docker Compose, зад reverse proxy (Nginx или Caddy), който поема TLS.
Приложението слуша **само на `127.0.0.1:3300`**; базата не публикува порт изобщо.

Каноничният път за деплой в това репо е автоматичният:
`sudo bash /root/few-few-*/deploy/autodeploy.sh` (виж [`deploy/README.md`](../deploy/README.md)).
Този файл описва какво прави той и как се работи ръчно, когато трябва.

---

## 1. Изисквания

- Ubuntu 24.04 LTS (или подобен), 2+ GB RAM, Docker Engine ≥ 29.5.1 + Compose v2.
- Домейн `staffe.carbonstealth.eu` с A/AAAA запис към VPS-а (за TLS).
- `ufw` пуска само 22/80/443. Портът на приложението остава на loopback.

## 2. Тайните — на сървъра, никога в репото

Всички стойности живеят в **`staffe/.env` до `docker-compose.yml`**, с права `600`.
В репото има само `.env.example` (без реални стойности) и `.env*` е в
`.gitignore`/`.dockerignore` → не влиза нито в архива за деплой, нито в слой на образа.

```bash
cd /opt/few-few/current/staffe        # или директорията на release-а
cp .env.example .env
chmod 600 .env
```

Задължителни:

| Променлива | Как се получава | Бележка |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `openssl rand -base64 32` | без нея compose спира с ясна грешка |
| `AUTH_SECRET` | `openssl rand -base64 48` | ≥32 знака, иначе `auth.ts` хвърля |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | твои | ползват се само от сийда (първо пускане) |

По избор: `POSTGRES_USER`/`POSTGRES_DB` (по подразбиране `staffe`), `APP_PORT`
(по подразбиране `3300`), `APP_BIND` (по подразбиране `127.0.0.1`), `SMTP_URL`,
`NOTIFICHE_MITTENTE`.

`DATABASE_URL` **не се задава ръчно** — compose го сглобява от `POSTGRES_*` към
услугата `db`. `UPLOAD_DIR` също е фиксиран (`/app/uploads` в контейнера, върху том).

## 3. Първо пускане

```bash
cd /opt/few-few/current/staffe
docker compose up -d --build
docker compose logs -f app          # следи „Schema allineato. Avvio…"
```

Какво става при старт (`deploy/docker-entrypoint.sh`, идемпотентно):

1. чака PostgreSQL да приема връзки (до 60 с);
2. **ако има `prisma/migrations/`** → `prisma migrate deploy`;
   **ако още няма** → `prisma db push` (без `--accept-data-loss`: разрушителна
   промяна се отказва, вместо да трие данни);
3. стартира `next start`.

Демо каталог + ubicazioni + потребители (**само първия път**):

```bash
docker compose exec app npm run db:seed
```

`autodeploy.sh` прави същото автоматично и слага маркер
`/opt/few-few/shared/staffe/.seeded`, за да не сийдва повторно.

## 4. Health check

```bash
curl -fsS http://127.0.0.1:3300/api/health   # {"stato":"ok","database":"ok"}
```

Сондата пипа и базата: жив процес с недостъпна база връща **503**, тоест не е
„здрав“. Същата проверка е и Docker healthcheck на контейнера:

```bash
docker compose ps            # колоната STATUS показва (healthy)
```

## 5. Бекъп на базата — ЗАДЪЛЖИТЕЛНО преди миграция

Миграцията не се „отменя“. Преди всяка нова версия, която мени схемата:

```bash
mkdir -p /opt/few-few/shared/staffe/backups
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | gzip -c > /opt/few-few/shared/staffe/backups/staffe-pre-$(date +%Y%m%d-%H%M%S).sql.gz
```

`autodeploy.sh` прави точно този бекъп сам преди `up -d --build` и **спира
деплоя**, ако `pg_dump` се провали (не мигрираме без възстановима точка).
Пази последните 14 копия.

Възстановяване:

```bash
docker compose stop app                       # никой да не пише по време на restore
gunzip -c staffe-pre-XXXX.sql.gz | docker compose exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose start app
```

Прикачените файлове (`uploads`) са отделен том:

```bash
docker run --rm -v staffe_uploads:/u -v /opt/few-few/shared/staffe/backups:/b alpine \
  tar czf /b/uploads-$(date +%F).tar.gz -C /u .
```

**Бекъп без тестван restore не е бекъп** — веднъж на тримесечие прави пробно
възстановяване в тестова база.

## 6. Обновяване

```bash
cd <нов release>/staffe
docker compose up -d --build        # entrypoint-ът мига схемата при старт
curl -fsS http://127.0.0.1:3300/api/health
```

Compose проектът се казва `staffe` (по името на папката), затова новият release
поема **същите** контейнери и томове — данните и качените файлове остават.

## 7. Rollback

Предпоставки: бекъп от т.5 + предишният release още е на диска
(`/opt/few-few/releases/`, пазят се последните 5).

```bash
cd /opt/few-few/releases/<предишен>/staffe
docker compose up -d --build        # старият код се вдига обратно
curl -fsS http://127.0.0.1:3300/api/health
```

`autodeploy.sh` прави това автоматично, ако health check-ът на новата версия падне.

**Внимание:** връщането на кода НЕ връща схемата. Ако новата версия е приложила
миграция, която старият код не разбира, възстанови и базата от бекъпа (т.5)
**преди** да пуснеш стария контейнер. Затова адитивните миграции (добавяне, не
триене) са правило, а изтриването на колони отива в отделен, следващ релийз.

## 8. Reverse proxy + TLS

Приложението **не** говори HTTPS. Nginx на хоста:

```nginx
server {
    server_name staffe.carbonstealth.eu;
    client_max_body_size 25m;          # прикачени файлове (CAD/PDF)
    location / {
        proxy_pass http://127.0.0.1:3300;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
    listen 80;
}
```

```bash
nginx -t && systemctl reload nginx
certbot --nginx -d staffe.carbonstealth.eu --agree-tos -n --redirect --keep-until-expiring
systemctl status certbot.timer      # авто-подновяването трябва да е активно
```

Бележки:

- Сертификатите стават **по-къси** (45-дневен профил от 13.05.2026, после 6-дневни).
  Не разчитай на „подновявам на 60-ия ден“ — остави подновяването на таймера/ARI,
  а не на ръчен cron с фиксиран ден. Caddy е алтернатива с вграден ACME.
- Заглавките за сигурност (`X-Frame-Options`, `X-Content-Type-Options`,
  `Permissions-Policy: camera=(self)` за скенера) идват от `next.config.mjs` —
  **не ги дублирай и не ги отслабвай** в прокси конфига; камерата е нужна за
  четенето на баркодове и работи само по HTTPS.

## 9. Диагностика

```bash
docker compose ps                       # състояние + healthy
docker compose logs -f app              # логове на приложението
docker compose logs db | tail -50
docker compose exec db psql -U staffe -d staffe -c '\dt'   # има ли таблици
docker system df                        # място, заето от образи/томове
df -h /                                 # диск
```

Чести случаи:

- **`app` рестартира в цикъл** → виж последните редове на `logs app`: обикновено
  `AUTH_SECRET` е под 32 знака или `migrate deploy` е паднал.
- **P3005 („database schema is not empty“)** → заварена база без история на
  миграциите. Entrypoint-ът **нарочно** не решава сам: първо бекъп, после
  еднократно `docker compose run --rm app npx prisma migrate resolve --applied <първата_миграция>`.
- **health 503** → приложението е живо, но базата не е: `docker compose ps db`.

## 10. Какво НЕ правим без потвърждение и бекъп

`docker compose down -v` (трие томовете `staffe_db-data` и `staffe_uploads` =
цялата база + всички прикачени файлове), `docker volume rm`, ръчен `psql` с
`DROP`. Само след пресен, проверен бекъп и изрично решение.
