---
name: deploy-carbon-stealth
description: >-
  Deploy a project to the Carbon Stealth VPS using the standard stack (Docker
  compose + nginx + Let's Encrypt + PM2). Use when the user wants to deploy,
  redeploy, ship, or release a project to production / staging, set up nginx for
  a subdomain.carbonstealth.eu, or troubleshoot a failed deploy. Do NOT use for
  local-only dev runs.
allowed-tools: Bash, Read, Edit, Write
---

# Deploy към Carbon Stealth VPS

Стандартен, идемпотентен deploy по правилата от `CLAUDE.md`.

## Кога
Потребителят иска да качи проект на prod/staging на VPS
`178.104.77.242` под `subdomain.carbonstealth.eu`.

## Вход / Изход
- **Вход:** име на проект, целеви subdomain, branch/таг за деплой.
- **Изход:** running контейнери, nginx vhost + TLS, минаващ health check.
- **Edge cases:** зает port, липсваща миграция, изтекъл cert, Hetzner блокира
  SMTP порт 25/465/587 (използвай Brevo SMTP).

## Pre-flight (преди всичко)
1. Провери заетите портове срещу port map-а в паметта:
   ```bash
   ss -tlnp
   ```
2. Backup на базата (rollback план):
   ```bash
   set -euo pipefail
   pg_dump "$DATABASE_URL" | gzip > "backup-$(date +%F-%H%M).sql.gz"
   ```
3. Миграции — `migrate deploy`, **никога** `db push` на prod:
   ```bash
   npx prisma migrate deploy
   ```

## Стъпки
1. Build на образа (multi-stage, non-root, HEALTHCHECK в Dockerfile):
   ```bash
   set -euo pipefail
   docker compose build
   ```
2. Старт:
   ```bash
   docker compose up -d
   ```
3. nginx vhost от файл в репото (никога ръчно на сървъра) + TLS:
   ```bash
   sudo ln -sf "$PWD/nginx/<project>.conf" /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d "<subdomain>.carbonstealth.eu" --non-interactive --agree-tos -m admin@carbonstealth.eu
   ```
4. PM2 (ако е PM2-управляван процес, не само Docker):
   ```bash
   pm2 startOrReload ecosystem.config.js --env production
   ```

## Smoke test — "Готово" =
```bash
curl -fsS "https://<subdomain>.carbonstealth.eu/health"   # очаквай 200 OK
```
- [ ] build OK
- [ ] контейнери `Up (healthy)`
- [ ] `nginx -t` минава, TLS валиден
- [ ] `curl /health` връща 200

## Rollback
1. `docker compose down`
2. Възстанови предишния образ/таг.
3. При нужда: `gunzip < backup-*.sql.gz | psql "$DATABASE_URL"`.

## Забележки
- Без hard-coded secrets — всичко през env vars.
- Conventional commits, никога force-push на main.
- Email през Brevo SMTP (порт 25/465/587 са блокирани от Hetzner).
