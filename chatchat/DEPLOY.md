# ChatChat — разгръщане в продукция

Модел: Docker Compose (PostgreSQL 16 + приложение) на VPS-а, nginx на хоста с Let's Encrypt.
Приложението слуша само на `127.0.0.1:4330`; базата няма публикуван порт. Тайните са в
`/opt/few-few/shared/chatchat/.env` (mode 600), никога в репото или в архива.

Контейнерите са с файлова система само за четене, без Linux capabilities и с `no-new-privileges`;
образите са заковани по digest. Затова командите в контейнера са `node dist/…`, не `npm run …` —
npm иска да пише в домашната папка.

## 0. Преди това

- DNS: `chatchat.carbonstealth.eu` → IP на сървъра.
- Портът е свободен: `ss -tlnp | grep ':4330 '` не връща нищо.
- Docker Engine ≥ 29.5.1 с compose plugin, nginx, certbot.

## 1. Тайните (веднъж, на сървъра)

```bash
sudo install -d -m 700 /opt/few-few/shared/chatchat /opt/few-few/shared/chatchat/backups
sudo install -m 600 /dev/null /opt/few-few/shared/chatchat/.env
sudoedit /opt/few-few/shared/chatchat/.env    # по образеца .env.example
```

- `POSTGRES_PASSWORD` и `SESSION_PEPPER` — `openssl rand -hex 32`, различни. Паролата влиза
  некодирана в `DATABASE_URL` — само hex. Нов `SESSION_PEPPER` изхвърля всички сесии и QR токени.
- AI (по избор): `VERTEX_PROJECT_ID`, `VERTEX_REGION=eu` и ключът на service account-а. Контейнерът
  тече като uid 1000, затова ключът е негов и само за четене:

  ```bash
  sudo install -o 1000 -g 1000 -m 400 ключ.json /opt/few-few/shared/chatchat/gcp-sa.json
  # в .env: GCP_SA_FILE=/opt/few-few/shared/chatchat/gcp-sa.json
  ```

  Без `VERTEX_PROJECT_ID` приложението тръгва, но `/api/v1/chat/messages` връща 503 (без резервен
  доставчик).

Всички `docker compose` команди по-долу са от папката `chatchat/` на release-а и с изричния `.env`:

```bash
cd /opt/few-few/current/chatchat     # или папката на конкретния release
CC="sudo docker compose --env-file /opt/few-few/shared/chatchat/.env"
```

Името на проекта е заковано (`name: chatchat`), затова томът на базата (`chatchat_db-data`) е един и
същ, от която и release папка да се пуска.

## 2. TLS сертификат (веднъж)

Когато DNS вече сочи насам:

```bash
sudo certbot certonly --nginx -d chatchat.carbonstealth.eu --deploy-hook 'systemctl reload nginx'
```

После vhost-ът от репото (не се пише на ръка):

```bash
sudo install -m 644 deploy/nginx/chatchat.carbonstealth.eu.conf /etc/nginx/sites-available/chatchat
sudo ln -sf /etc/nginx/sites-available/chatchat /etc/nginx/sites-enabled/chatchat
sudo nginx -t && sudo systemctl reload nginx
```

`proxy_read_timeout` е 120 s (AI отговорът е до `AI_TIMEOUT_MS`, по подразбиране 60 s); 8 MB тяло
се приема само под `/api/v1/admin/` (качване на документи), другаде 1 MB. `/readyz` е достъпен само
от самия сървър.

## 3. Първи деплой

```bash
$CC build
$CC up -d
```

Entrypoint-ът чака базата и пуска `prisma migrate deploy` (**никога** `db push`), после
`node dist/index.js`. Изчакай готовността:

```bash
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:4330/readyz && break; sleep 2; done
```

## 4. Първият администратор (веднъж)

Паролата минава през средата, не през историята на shell-а:

```bash
read -rsp 'Парола: ' USER_PASSWORD; echo; export USER_PASSWORD
TENANT_SLUG=… TENANT_NAME='…' USER_EMAIL=… USER_NAME='…' USER_ROLE=TENANT_ADMIN \
  $CC exec -T -e TENANT_SLUG -e TENANT_NAME -e USER_EMAIL -e USER_NAME -e USER_PASSWORD -e USER_ROLE \
  app node dist/cli/tenant.js tenant
unset USER_PASSWORD
```

Това е `npm run tenant:create`; следващи потребители — същото с `… tenant.js user`
(`npm run user:create`). Променливите и ролите — в `src/cli/tenant.ts`.

### Ретенция (дневно)

Изтеклите/отнетите сесии се трият след `RETENTION_SESSION_DAYS` (30); затворените случаи — след
`RETENTION_CASE_DAYS`, **само ако** администраторът на данните го е определил (иначе не се пипат).
Пример с cron на хоста (03:17 всеки ден):

```bash
17 3 * * * cd /opt/few-few/current/chatchat && docker compose exec -T app node dist/cli/retention.js
```

## 5. Следващ деплой (нова версия)

1. `$CC build` — при провал спри: работещите контейнери не са пипани.
2. **Бекъп на базата преди миграцията** (след build-а, точно преди смяната):

   ```bash
   DUMP=/opt/few-few/shared/chatchat/backups/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ).sql.gz
   $CC exec -T db pg_dump -U chatchat -d chatchat --clean --if-exists | gzip | sudo tee "$DUMP" >/dev/null
   sudo chmod 600 "$DUMP" && sudo gunzip -t "$DUMP" && echo "бекъп: $DUMP"
   ```

   Без валиден дъмп — не продължавай.

3. `$CC up -d` — новият контейнер мигрира и тръгва.
4. Проверка: `/readyz` (както в т. 3) и `$CC logs --tail 50 app`.

Миграциите са само адитивни; триене на колони/таблици — в отделен, по-късен release. Така старият
код работи и с новата схема и връщането назад е само на кода.

## 6. Проверка

```bash
curl -fsS https://chatchat.carbonstealth.eu/healthz
curl -sI https://chatchat.carbonstealth.eu/ | grep -i -E 'content-security-policy|strict-transport'
$CC ps        # app и db: healthy
```

## 7. Връщане назад

**Кодът.** От папката на предишния release: `$CC up -d --build`. Базата не се пипа.

**Провалена миграция** — в `$CC logs app` има `P3018`, а при всеки следващ старт `P3009`; контейнерът
не тръгва. Откат само на кода не помага (и старият entrypoint пуска `migrate deploy`).

```bash
$CC stop app
$CC exec -T db psql -U chatchat -d chatchat -c \
  'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL'
```

а) Данните са цели (PostgreSQL прилага миграцията в една транзакция) — отбележи я като върната и
пусни предишния код:

```bash
$CC run --rm --no-deps --entrypoint ./node_modules/.bin/prisma app migrate resolve --rolled-back <име>
```

б) Данните трябва да се върнат — от дъмпа отпреди деплоя (една транзакция; при грешка базата остава
каквато е). Губи се всичко, записано след дъмпа, включително краят на одита (`AuditEvent`) — запиши
случая извън сървъра. Дъмпът връща и `_prisma_migrations`, затова `migrate resolve` след него не трябва:

```bash
sudo gunzip -t "$DUMP" && sudo gunzip -c "$DUMP" | $CC exec -T db psql -v ON_ERROR_STOP=1 \
  --single-transaction -U chatchat -d chatchat -c 'DROP SCHEMA public CASCADE' -c 'CREATE SCHEMA public' -f -
```

После — предишният код (`$CC up -d --build` от неговата папка). Поправената миграция идва с нов
release. **Никога** `docker compose down -v` — трие тома на базата.

## 8. Следваща стъпка (решение на собственика)

ChatChat още **не е** в `deploy/autodeploy.sh`. Интеграцията е отделна промяна: `deploy/deploy.sh`
по модела на korpora (тайни от `/opt/few-few/shared/chatchat/`, build → `pg_dump` → `up` → сонда на
`/readyz` → `last-good` → vhost с `nginx -t`), откат към последния работещ release при провал и
дневен шифрован бекъп с тестван restore. Дотогава — ръчно, по т. 5.
