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

`POSTGRES_PASSWORD`, `ENC_KEY` и `HMAC_KEY` — `openssl rand -hex 32`, три различни. Паролата влиза
некодирана в `DATABASE_URL`: „/“, „?“, „#“ и „%“ (напр. от `openssl rand -base64`) чупят адреса, затова
`deploy.sh` ги отказва. `RENDETTO_DATA` е точно `/opt/few-few/shared/rendetto/data` — с друг път
`deploy.sh` не тръгва. SMTP: Brevo на порт 2525 (Hetzner блокира 25/465/587).

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
2. бекъп на базата преди миграция в `/opt/few-few/shared/rendetto/backups/` (пази последните 5;
   `pg_dump --clean --if-exists`); без бекъп не мигрира. С `RENDETTO_SKIP_BACKUP=1` (откатът) — без нов
   дъмп, за да не изтласка от ротацията дъмпа отпреди счупената миграция;
3. `docker compose build` и `up` — entrypoint-ът чака базата и пуска `prisma migrate deploy`
   (никога `db push`);
4. чака `/health` да върне `{"status":"ok","app":"rendetto"}` — маркерът доказва, че на порта
   отговаря Rendetto, а не друго приложение (иначе код 4 и `autodeploy.sh` връща последния
   работещ release); после записва папката на release-а в `/opt/few-few/shared/rendetto/last-good`;
5. слага vhost-а от репото в nginx с порта от `HTTP_PORT` (`nginx -t`, после reload; при грешка
   връща стария), щом има сертификат;
6. подава sitemap-а към IndexNow (Bing, Yandex, Seznam, Naver, Yep), само ако се е променил.

Изход: 0 — жив; 3 — няма `.env`; 4 — контейнерите са сменени, но Rendetto не отговаря; 1 — спрян преди
смяната (работещите не са пипани). Стъпки 5–6 след успешната сонда само предупреждават.

Командите `docker compose` по-долу се пускат от папката на работещия release — там са
`docker-compose.yml` и `.env` (`/opt/few-few/shared/rendetto/` е само за root, затова `sudo cat`):

```bash
cd "$(sudo cat /opt/few-few/shared/rendetto/last-good)"
```

## 4. GeoIP (веднъж, после месечно)

```bash
cd "$(sudo cat /opt/few-few/shared/rendetto/last-good)"
sudo docker compose exec -T app node dist/scripts/geoip-update.js && sudo docker compose restart app
```

Cron на хоста (1-во число, 04:10) — `/etc/cron.d/rendetto-geoip`, един ред:

```
10 4 1 * * root cd "$(cat /opt/few-few/shared/rendetto/last-good)" && docker compose exec -T app node dist/scripts/geoip-update.js && docker compose restart app
```

## 5. Първият собственик (веднъж)

```bash
cd "$(sudo cat /opt/few-few/shared/rendetto/last-good)"
read -rp 'Имейл: ' OWNER_EMAIL; read -rp 'Име: ' OWNER_NAME; read -rsp 'Парола: ' OWNER_PASSWORD; echo
printf '%s\n' "$OWNER_PASSWORD" | sudo docker compose exec -T -e OWNER_EMAIL="$OWNER_EMAIL" \
  -e OWNER_NAME="$OWNER_NAME" app sh -c \
  'IFS= read -r OWNER_PASSWORD && export OWNER_PASSWORD && exec node dist/scripts/create-owner.js'
unset OWNER_PASSWORD
```

Паролата се въвежда скрито и минава през stdin (`printf` е вграден в bash): не остава в историята на
шела и не е в командния ред на `sudo`/`docker` (`ps`, `/proc/<pid>/cmdline`).

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

**Кодът.** `autodeploy.sh` го връща сам, ако новият release не отговори: пуска `deploy/deploy.sh` на
последния работещ (`/opt/few-few/shared/rendetto/last-good`) с `RENDETTO_SKIP_BACKUP=1`. Ръчно — същото:

```bash
sudo RENDETTO_SKIP_BACKUP=1 bash "$(sudo cat /opt/few-few/shared/rendetto/last-good)/deploy/deploy.sh"
```

**Провалена миграция** — в `docker compose logs app` има `P3018`, а при всеки следващ старт `P3009`.
Откат само на кода не помага: entrypoint-ът и на стария release пуска `prisma migrate deploy`, а Prisma
отказва, докато в базата има неуредена миграция. Затова autodeploy тогава не връща кода, а казва кой е
последният дъмп. Командите са от папката на последния работещ release (`last-good` още сочи него):

```bash
cd "$(sudo cat /opt/few-few/shared/rendetto/last-good)"
sudo docker compose stop app
sudo docker compose exec -T db psql -U rendetto -d rendetto -c \
  'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL'
```

а) **Данните са цели** — обичайният случай: PostgreSQL прилага файла на миграцията като една транзакция и
при грешка връща всичко; остава само записът, че миграцията е паднала. Той се отбелязва като върнат и
тръгва предишният код (нищо не се губи):

```bash
sudo docker compose run --rm --no-deps --entrypoint ./node_modules/.bin/prisma app \
  migrate resolve --rolled-back <име_на_миграцията>
sudo RENDETTO_SKIP_BACKUP=1 bash "$PWD/deploy/deploy.sh"
```

б) **Данните трябва да се върнат** — миграцията е минала, но ги е развалила, или не си сигурен. Дъмпът е
отпреди build-а: записите след него (минутите на build-а) се губят. Възстановяването е една транзакция —
при грешка базата остава каквато е. `DROP SCHEMA` е нужен, защото таблица от новата миграция с външен
ключ към стара спира триенето в дъмпа. Дъмпът връща и `_prisma_migrations`, затова `migrate resolve`
след него не трябва (дава P3011):

```bash
DUMP=/opt/few-few/shared/rendetto/backups/pre-deploy-<дата-час>.sql.gz   # последният преди провала
gunzip -c "$DUMP" | sudo docker compose exec -T db psql -v ON_ERROR_STOP=1 --single-transaction \
  -U rendetto -d rendetto -c 'DROP SCHEMA public CASCADE' -c 'CREATE SCHEMA public' -f -
```

Одитът: ако номерът в котвата (`"head":{"id":…}` в `/opt/few-few/shared/rendetto/data/audit-head.json`)
е по-голям от `SELECT max(id) FROM "AuditLog"`, краят на веригата е изрязан с възстановяването и панелът
би го показал като скъсана верига. Тогава запиши случая извън сървъра и премести котвата встрани
(доказателство — не се трие); новата се пише от следващия запис:

```bash
sudo mv /opt/few-few/shared/rendetto/data/audit-head.json \
  "/opt/few-few/shared/rendetto/data/audit-head.pre-restore-$(date +%Y%m%d-%H%M%S).json"
```

Накрая — предишният код: `sudo RENDETTO_SKIP_BACKUP=1 bash "$PWD/deploy/deploy.sh"`.

Проверено с PostgreSQL 16 и Prisma 6: след а) и след б) `prisma migrate deploy` на стария код казва
„No pending migrations“. Поправената миграция идва с нов release.
