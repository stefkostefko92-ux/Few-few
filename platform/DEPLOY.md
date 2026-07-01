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

Копирайте от `.env.example` и попълнете. **Никога не комитвайте `.env`** (той е в
`.gitignore` и не влиза в архива за деплой).

### Бърз старт на тайните — `deploy/gen-secrets.sh`

Трите **криптографски** тайни се генерират автоматично (силни случайни стойности):

```bash
cd platform
bash deploy/gen-secrets.sh        # създава/допълва .env (mode 600) и попълва:
                                  #   AUTH_SECRET (48B base64), ENCRYPTION_KEY (32B hex), CRON_TOKEN
FORCE=1 bash deploy/gen-secrets.sh  # регенерира ги (внимавай: къса сесии/криптирани данни)
```

Скриптът е **идемпотентен** — не презаписва вече попълнена тайна и не отпечатва
стойностите. `POSTGRES_PASSWORD`, `OWNER_PASSWORD` и `NEXT_PUBLIC_SITE_URL` се
задават **ръчно** (силна парола за собственика, мин. 10 знака).

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
| `SMTP_HOST`…`MAIL_FROM` | SMTP за имейл известия (виж по-долу). Без `SMTP_HOST` — изключено. |
| `UPLOAD_DIR` | Папка за качените изображения. В compose е монтиран том `/data/uploads` (не пипай). |
| `AUDIT_RETENTION_DAYS` | Колко дни се пазят одит логовете при прунинг (подр. `365`). |
| `HEALTH_RETENTION_DAYS` | Колко дни се пазят health записите при прунинг (подр. `90`). |
| `SUBMISSION_RETENTION_DAYS` | Колко дни се пазят заявките от форми при прунинг (подр. `365`). |

### AI ключ (по избор) — конструкторът работи и без него

Панелът има AI генератор на страници. Ако **не** зададете ключ, `AI_PROVIDER`
пада на детерминиран **`rules`** режим (без AI, без изходящи заявки) — панелът е
напълно функционален. За да включите Anthropic (наш стандарт):

```bash
# в platform/.env — вземете ключ от console.anthropic.com
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="sk-ant-…"          # само ако ползвате AI
ANTHROPIC_MODEL="claude-opus-4-8"     # по подразбиране
```

Алтернативи: `AI_PROVIDER="openai"` + `OPENAI_API_KEY`, или `"gemini"` +
`GEMINI_API_KEY`. Ако избраният доставчик няма ключ, кодът пада на `rules`.

### SMTP (по избор) — имейл известия при нова заявка

При запитване от контактна форма панелът уведомява отговорниците на сайта по
имейл. **Без `SMTP_HOST` изпращането е изключено** (заявките пак се пазят в
таблото). За да го включите:

```bash
# в platform/.env
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"                 # 587 STARTTLS (типично) или 465 (implicit TLS)
SMTP_SECURE="false"             # "true" САМО за порт 465
SMTP_USER="apikey_или_потребител"
SMTP_PASS="…"                   # тайна — само в .env (mode 600)
MAIL_FROM="Платформа <no-reply@carbonstealth.eu>"
```

Забележка: `SMTP_SECURE="true"` ⇒ implicit TLS (порт 465); за 587 оставете
`false` (STARTTLS). `MAIL_FROM` трябва да е адрес, който доставчикът разрешава.

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

## Качени изображения (том `uploads`)

Блоковете Снимка/Галерия пишат в `UPLOAD_DIR=/data/uploads`, което в
`docker-compose.yml` е монтиран named том `uploads` — така файловете **оцеляват
при ре-деплой** (образът се пресъздава, томът не). Не пипайте `UPLOAD_DIR` в
`.env` — стойността в compose трябва да съвпада с точката на монтиране. Томът се
**включва в бекъпа** (виж по-долу).

## Периодични задачи (cron / systemd timers)

Два пазени маршрута (POST, `Authorization: Bearer $CRON_TOKEN` — секретът е в
заглавие, не в URL, за да не влиза в логовете):

| Endpoint | Какво прави | Препоръчан график |
| --- | --- | --- |
| `POST /api/cron/health` | Здравна проверка на активните свързани сайтове. | на 5 мин |
| `POST /api/cron/prune` | Изчистване по давност (GDPR): одит логове, health, заявки. | дневно 03:30 |

Ръчна проверка:

```bash
curl -X POST -H "Authorization: Bearer $CRON_TOKEN" \
  https://platform.carbonstealth.eu/api/cron/health
```

**Готови units:** `deploy/systemd/platform-cron-{health,prune}.{service,timer}`.
Инсталация:

```bash
sudo mkdir -p /etc/platform
# /etc/platform/cron.env (mode 600) с два реда:
#   CRON_TOKEN=<същият като в platform/.env>
#   BASE_URL=https://platform.carbonstealth.eu
sudo install -m 600 /dev/stdin /etc/platform/cron.env <<'EOF'
CRON_TOKEN=ПОСТАВИ_МЕ
BASE_URL=https://platform.carbonstealth.eu
EOF
sudo cp deploy/systemd/platform-cron-*.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now platform-cron-health.timer platform-cron-prune.timer
systemctl list-timers 'platform-*'          # проверка
```

Класически cron еквивалент: `deploy/cron.example`.

## Бекъп и възстановяване

**Криптиран** бекъп на базата (`db`) **и** тома с качванията (`uploads`), с
ротация — `deploy/backup.sh`; възстановяване — `deploy/restore.sh`; ключове и
пълна процедура — **`deploy/README-backup.md`**.

```bash
# ръчен бекъп (публичен age ключ; частният стои офлайн, извън сървъра):
AGE_RECIPIENT="age1..." bash deploy/backup.sh
#   → backups/platform-db-*.sql.gz.age  +  backups/platform-uploads-*.tar.gz.age (+ .sha256)
```

**Автоматизиране:** `deploy/systemd/platform-backup.{service,timer}` (дневно
03:15) — `AGE_RECIPIENT` в `/etc/platform/backup.env` (mode 600).

Бързо ръчно **преди рискова миграция** на схемата (само базата):

```bash
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > platform-$(date +%F).sql
```

> Бекъп без тестван restore не е бекъп — периодично възстановявайте най-новия в
> отделен стек и проверявайте (виж `README-backup.md`).

## Мониторинг и error tracking (насока)

- **Healthcheck** вече е в compose (`HEALTHCHECK` в `Dockerfile` бие
  `/api/health`) и се ползва от `autodeploy.sh`. За външен мониторинг вържете
  Uptime Kuma / Beszel към `https://platform.carbonstealth.eu/api/health` и към
  `platform-cron-health` резултатите.
- **Error tracking (Sentry):** незадължително. Ако се добави, инициализацията
  става в `src/**` (не в deploy) — Next.js instrumentation (`instrumentation.ts`
  / `@sentry/nextjs`), а `SENTRY_DSN` се подава като env през `.env` +
  `docker-compose.yml` (по същия модел като AI ключовете, mode 600). DSN не е
  тайна от криптографски клас, но го дръжте извън репото за хигиена.

## Забележки

- Билдът не пипа реална база: страниците с база са `force-dynamic`, а Dockerfile
  билдва с dummy `DATABASE_URL` (както CI).
- `/api/health` е лек (не чука базата) и е извън middleware guard-а — ползва се от
  `HEALTHCHECK` и от `autodeploy.sh`.
