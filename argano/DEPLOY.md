# Деплой — argano (argano.carbonstealth.eu)

Docker Compose (приложение + PostgreSQL 16) зад nginx на хоста с Let's Encrypt. Цялата сървърна
логика е в `deploy/deploy.sh` (идемпотентен); `deploy/autodeploy.sh` на монорепото го вика, когато
`PROJECTS` съдържа `argano` (по подразбиране — да).

## Първи деплой (веднъж)

1. **DNS:** A запис `argano.carbonstealth.eu` → IP на VPS-а. Без него приложението тръгва, но само
   на `127.0.0.1:4320`; сертификатът се издава при следващото пускане.
2. **Портът:** `4320` по подразбиране. Провери с `ss -tlnp | grep 4320`; ако е зает, създай
   `/opt/few-few/shared/argano/.env` от `.env.example` с друг `APP_PORT` преди деплоя
   (скриптът и сам спира с ясна грешка, ако портът е зает при първия старт).
3. **Деплой:**
   ```bash
   sudo REF=<клон|таг|SHA> PROJECTS="argano" ARGANO_ADMIN_PASSWORD='…' bash /opt/few-few/current/deploy/fetch-deploy.sh
   ```
   Без `ARGANO_ADMIN_PASSWORD` се генерира случайна парола и се отпечатва веднъж — запиши я в
   password manager. Парола под правилото на приложението (12 знака с букви и цифри) работи само за
   първия вход: веднага иска нова.
4. **Вход:** `https://argano.carbonstealth.eu/it/login` с `admin@carbonstealth.eu`. После махни
   реда `ADMIN_PASSWORD=` от `/opt/few-few/shared/argano/.env` (повече не е нужен).
5. **Фирма за Panev:** „Aziende“ → нова фирма с титуляра ѝ; временната парола се показва веднъж.

## Всеки следващ деплой

Същата команда (или пълният `fetch-deploy.sh`). Скриптът: пренася `.env` → `pg_dump` в
`/opt/few-few/shared/argano/backups/` (последните 5; без бекъп няма миграция) → `docker compose
build` + `up -d` → миграциите от entrypoint-а (`prisma migrate deploy`, никога `db push`) → health
`/api/health` с маркер `"app":"argano"` → nginx vhost (`deploy/nginx/argano.conf`) + certbot.

## Проверка

```bash
curl -fsS http://127.0.0.1:4320/api/health          # {"status":"ok","app":"argano",…,"db":"ok"}
curl -fsSI https://argano.carbonstealth.eu/it | head -5
cd /opt/few-few/current/argano && docker compose ps && docker compose logs --tail 50 app
```

## Връщане назад

- **Код:** `sudo RELEASE_DIR=<предишен release> PROJECTS="argano" bash <release>/deploy/autodeploy.sh`.
- **База:** `gunzip -c /opt/few-few/shared/argano/backups/pre-deploy-<TS>.sql.gz | docker compose exec -T db psql -U argano argano`
  (в празна база; миграциите са адитивни, затова обикновено стига връщане на кода).

## Публично пускане (след съгласуване и разрешения)

Докато не е одобрено, търсачките са спрени (`ALLOW_INDEXING=false`: `robots.txt` Disallow, `noindex`).
След одобрение: `ALLOW_INDEXING=true` в `.env`, деплой, после IndexNow:
`node tools/seo/indexnow.mjs https://argano.carbonstealth.eu` и Search Console за Google.
