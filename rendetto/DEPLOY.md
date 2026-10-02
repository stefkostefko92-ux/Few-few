# Rendetto — разгръщане в продукция

Модел: Docker Compose (PostgreSQL + приложение) на VPS-а, nginx на хоста с Let's Encrypt.
Приложението слуша само на `127.0.0.1:4320`. Тайните са в `.env` до `docker-compose.yml` (mode 600).

## 0. Преди това

- DNS: `rendetto.carbonstealth.eu` → IP на сървъра.
- Портът е свободен: `ss -tlnp | grep ':4320 '` не връща нищо.
- Docker с compose plugin, nginx, certbot.

## 1. Тайните (веднъж, на сървъра)

```bash
sudo install -d -m 700 /opt/few-few/shared/rendetto /opt/few-few/shared/rendetto/data
sudo install -m 600 /dev/null /opt/few-few/shared/rendetto/.env
sudoedit /opt/few-few/shared/rendetto/.env    # по образеца .env.example
```

`ENC_KEY` и `HMAC_KEY` — `openssl rand -hex 32`, два различни. `POSTGRES_PASSWORD` — дълга случайна.
SMTP: Brevo на порт 2525 (Hetzner блокира 25/465/587).

Каталогът от магазините се слага в `/opt/few-few/shared/rendetto/data/catalog.json` (подава го
собственикът; не е в репото). Без него продуктът тръгва с основния каталог.

## 2. nginx + TLS (веднъж)

```bash
sudo cp rendetto/deploy/nginx/rendetto.carbonstealth.eu.conf /etc/nginx/sites-available/rendetto
sudo ln -sfn /etc/nginx/sites-available/rendetto /etc/nginx/sites-enabled/rendetto
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d rendetto.carbonstealth.eu
```

## 3. Деплой

От release папката (архивът от `deploy/fetch-deploy.sh`):

```bash
cd /opt/few-few/current/rendetto
sudo cp -a /opt/few-few/shared/rendetto/.env .env
# бекъп преди миграция (при повторен деплой)
sudo docker compose exec -T db pg_dump -U rendetto rendetto | gzip > /opt/few-few/shared/rendetto/pre-deploy-$(date +%Y%m%d%H%M).sql.gz
sudo docker compose up -d --build
curl -fsS http://127.0.0.1:4320/health     # {"status":"ok"}
```

Entrypoint-ът чака базата и пуска `prisma migrate deploy` (никога `db push`).

## 4. GeoIP (веднъж, после месечно)

```bash
sudo docker compose exec -T app npm run geoip:update && sudo docker compose restart app
```

Cron на хоста (1-во число, 04:10): същите две команди.

## 5. Първият собственик (веднъж)

```bash
read -rp 'Имейл: ' OWNER_EMAIL; read -rp 'Име: ' OWNER_NAME; read -rsp 'Парола: ' OWNER_PASSWORD; echo
sudo docker compose exec -T -e OWNER_EMAIL="$OWNER_EMAIL" -e OWNER_NAME="$OWNER_NAME" \
  -e OWNER_PASSWORD="$OWNER_PASSWORD" app npm run owner:create
unset OWNER_PASSWORD
```

Паролата се въвежда скрито и не остава в историята на шела.

Паролата минава същата проверка като всички: поне 12 знака, без името на продукта, без част от
имейла/името. При първи вход панелът иска включване на двуфакторна защита.

## 6. Проверка

```bash
curl -fsS https://rendetto.carbonstealth.eu/health
curl -sI https://rendetto.carbonstealth.eu/ | grep -i -E 'content-security-policy|strict-transport'
node tools/seo/indexnow.mjs https://rendetto.carbonstealth.eu   # от корена на репото, след деплой
```

## 7. Връщане назад

Предишният release е в `/opt/few-few/releases/`. Ако миграцията е счупила данни:
`gunzip -c pre-deploy-….sql.gz | sudo docker compose exec -T db psql -U rendetto rendetto`, после
`docker compose up -d --build` от предишния release.

Включването в `deploy/autodeploy.sh` (функция по модела на `deploy_piuma`) е отделна задача на
VPS-аджията.
