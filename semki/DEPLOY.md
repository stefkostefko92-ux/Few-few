# Деплой — Semki Bot

Docker Compose (db + app на `127.0.0.1:<HTTP_PORT>`, първият свободен от 4340 нагоре) зад nginx на
хоста; домейн `vps2.carbonstealth.eu`.
Каноничният път е общият `deploy/autodeploy.sh` (проект `semki`) — той вика `semki/deploy/deploy.sh`.

## 1. Discord приложението

Виж [README.md → Настройка в Discord](README.md#настройка-в-discord-веднъж). Трябват: Application ID,
Client Secret, Bot Token, Server ID и redirect `https://vps2.carbonstealth.eu/auth/callback`.

## 2. Тайните на сървъра (веднъж)

```bash
sudo bash /opt/few-few/current/semki/deploy/setup-env.sh
```

Пише `/opt/few-few/shared/semki/.env` (600): генерира `POSTGRES_PASSWORD` и `SESSION_SECRET`, пита за
данните от т. 1 (токенът и secret-ът не се показват) и записва `HTTP_PORT` — първия свободен порт от
4340 нагоре (заетите ги държат други продукти). `deploy.sh` спира преди build-а, ако портът е зает от
нещо, което не е Semki. Промяна по-късно:

```bash
sudoedit /opt/few-few/shared/semki/.env
```

## 3. DNS и TLS (веднъж)

DNS A/AAAA за `vps2.carbonstealth.eu` → VPS-а. Сертификатът (vhost-ът от репото се слага от `deploy.sh`, щом сертификатът съществува):

```bash
sudo certbot certonly --nginx -d vps2.carbonstealth.eu --deploy-hook 'systemctl reload nginx'
```

## 4. Деплой

```bash
sudo PROJECTS="semki" bash /opt/few-few/current/deploy/fetch-deploy.sh
```

Ред: тайните → проверка → build → `pg_dump` преди миграцията (`/opt/few-few/shared/semki/backups`,
последните 5) → up (entrypoint-ът прилага `prisma migrate deploy`) → сонда за `"app":"semki"` →
vhost. При провал на сондата `autodeploy.sh` връща последния работещ release (`last-good`).

Проверка:

```bash
curl -fsS "http://127.0.0.1:$(sudo sed -n 's/^HTTP_PORT=//p' /opt/few-few/shared/semki/.env)/health"
```

Очаквано: `{"app":"semki","status":"ok","db":true,"discord":"ready"}`.

## 5. Първи вход

Влез на `https://vps2.carbonstealth.eu` като собственик/администратор на Discord сървъра →
„Настройки“: роля за дашборда, роля за командите, часови прозорец → „Известия“: правила (канал +
роля + праг) → „Пробно съобщение“ проверява правата на бота в канала.

## Провалена миграция

Ако логът на app съдържа `P3009`/`P3018`, откат само на кода не помага (старият код спира на същото).
От папката на последния работещ release:

```bash
cd "$(sudo cat /opt/few-few/shared/semki/last-good)"
```

PostgreSQL връща паднала миграция цялата, затова обикновено стига:

```bash
sudo docker compose run --rm --no-deps --entrypoint ./node_modules/.bin/prisma app migrate resolve --rolled-back <име_на_миграцията>
```

```bash
sudo SEMKI_SKIP_BACKUP=1 bash "$PWD/deploy/deploy.sh"
```

Възстановяване от дъмпа — само ако данните трябва да се върнат:

```bash
gunzip -c /opt/few-few/shared/semki/backups/pre-deploy-<TS>.sql.gz | sudo docker compose exec -T db psql -U semki -d semki
```
