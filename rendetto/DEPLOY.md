# Rendetto — разгръщане в продукция

Модел: Docker Compose (PostgreSQL + приложение) на VPS-а, nginx на хоста с Let's Encrypt.
Приложението слуша само на `127.0.0.1:4320`. Тайните са в `.env` до `docker-compose.yml` (mode 600).

## 0. Преди това

- DNS: `rendetto.carbonstealth.eu` → IP на сървъра.
- Портът е свободен: `ss -tlnp | grep ':4320 '` не връща нищо.
- Docker с compose plugin, nginx, certbot.

## 1. Тайните (веднъж, на сървъра)

```bash
sudo install -d -m 700 /opt/few-few/shared/rendetto
# data/ е единствената папка, в която приложението пише (GeoIP базата, котвата на одита) — за uid 1000
sudo install -d -m 700 -o 1000 -g 1000 /opt/few-few/shared/rendetto/data
sudo install -m 600 /dev/null /opt/few-few/shared/rendetto/.env
sudoedit /opt/few-few/shared/rendetto/.env    # по образеца .env.example
```

Контейнерите са с файлова система само за четене, без Linux capabilities и с `no-new-privileges`
(`docker-compose.yml`); образите са заковани по digest. Затова командите в контейнера по-долу са
`node dist/scripts/…`, не `npm run …` — npm иска да пише в домашната папка.

`ENC_KEY` и `HMAC_KEY` — `openssl rand -hex 32`, два различни. `POSTGRES_PASSWORD` — дълга случайна.
SMTP: Brevo на порт 2525 (Hetzner блокира 25/465/587).

Каталогът от магазините се слага в `/opt/few-few/shared/rendetto/data/catalog.json` (подава го
собственикът; не е в репото). Без него продуктът тръгва с основния каталог.

## 2. TLS сертификат (веднъж)

Когато DNS вече сочи насам:

```bash
sudo certbot certonly --nginx -d rendetto.carbonstealth.eu --deploy-hook 'systemctl reload nginx'
```

Само сертификат, без пипане на конфига: certbot сам вдига временен блок за проверката. Vhost-ът
(`deploy/nginx/rendetto.carbonstealth.eu.conf`) го слага деплоят, щом сертификатът го има — преди
това `nginx -t` би отказал заради липсващите файлове. `--deploy-hook` презарежда nginx след всяко
подновяване; без него подновеният сертификат стига до nginx чак при следващ reload.

## 3. Деплой

Автоматично: `deploy/autodeploy.sh` (и `deploy/fetch-deploy.sh`) разгръща Rendetto заедно с другите
продукти. Само Rendetto: `sudo PROJECTS="rendetto" bash deploy/fetch-deploy.sh`. Ръчно, от release
папка — същият скрипт:

```bash
sudo bash /opt/few-few/current/rendetto/deploy/deploy.sh
```

`deploy/deploy.sh` прави всичко по реда:

1. копира тайните от `/opt/few-few/shared/rendetto/` (без тях спира с код 3 — тайни не се
   измислят) и проверява, че `RENDETTO_DATA` е `/opt/few-few/shared/rendetto/data`;
2. бекъп на базата преди миграция в `/opt/few-few/shared/rendetto/backups/` (пази последните 5);
   без бекъп не мигрира;
3. `docker compose build` и `up` — entrypoint-ът чака базата и пуска `prisma migrate deploy`
   (никога `db push`);
4. чака `/health` да върне `{"status":"ok","app":"rendetto"}` — маркерът доказва, че на порта
   отговаря Rendetto, а не друго приложение (иначе код 4 и `autodeploy.sh` връща последния
   работещ release);
5. слага vhost-а от репото в nginx (`nginx -t`, после reload; при грешка връща стария), щом има
   сертификат;
6. подава sitemap-а към IndexNow (Bing, Yandex, Seznam, Naver, Yep), само ако се е променил.

## 4. GeoIP (веднъж, после месечно)

```bash
sudo docker compose exec -T app node dist/scripts/geoip-update.js && sudo docker compose restart app
```

Cron на хоста (1-во число, 04:10): същите две команди.

## 5. Първият собственик (веднъж)

```bash
read -rp 'Имейл: ' OWNER_EMAIL; read -rp 'Име: ' OWNER_NAME; read -rsp 'Парола: ' OWNER_PASSWORD; echo
sudo docker compose exec -T -e OWNER_EMAIL="$OWNER_EMAIL" -e OWNER_NAME="$OWNER_NAME" \
  -e OWNER_PASSWORD="$OWNER_PASSWORD" app node dist/scripts/create-owner.js
unset OWNER_PASSWORD
```

Паролата се въвежда скрито и не остава в историята на шела.

Паролата минава същата проверка като всички: поне 12 знака, без името на продукта, без част от
имейла/името. При първи вход панелът иска включване на двуфакторна защита.

## 6. Проверка

```bash
curl -fsS https://rendetto.carbonstealth.eu/health
curl -sI https://rendetto.carbonstealth.eu/ | grep -i -E 'content-security-policy|strict-transport'
```

IndexNow тръгва сам от деплоя. Google не участва в IndexNow: в Search Console потвърдете домейна
веднъж и подайте `https://rendetto.carbonstealth.eu/sitemap.xml`.

## 7. Одитът

Одитната верига е HMAC с ключ, изведен от `HMAC_KEY` (не е в базата). Последният запис се пише и в
`data/audit-head.json` извън базата — изтрит край на веригата се хваща. Панелът (`/admin/audit`)
показва номера и хеша на последния запис: веднъж месечно ги запишете и извън сървъра.

Срокът за пазене е `AUDIT_RETENTION_DAYS` (по подразбиране 1825 дни = 5 години — решение на
собственика). По-старите записи се трият от поддръжката, без да се чупи веригата. Новото начало се
пише и в котвата и се сверява с нея, не с базата: след първото изтриване по срок изгубен или стар
`data/audit-head.json` вдига тревога — пазете го заедно с бекъпите.

## 8. Връщане назад

Кодът: `autodeploy.sh` го връща сам, ако новият release не отговори — пуска `deploy/deploy.sh` на
последния работещ (пътят му е в `/opt/few-few/shared/rendetto/last-good`). Ръчно — същият скрипт от
папката на предишния release в `/opt/few-few/releases/`.

Данните — само ако миграцията ги е счупила:
`gunzip -c /opt/few-few/shared/rendetto/backups/pre-deploy-….sql.gz | sudo docker compose exec -T db psql -U rendetto rendetto`.
