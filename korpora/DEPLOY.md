# Korpora — разгръщане в продукция

Модел: Docker Compose (PostgreSQL + приложение) на VPS-а, nginx на хоста с Let's Encrypt.
Приложението слуша само на `127.0.0.1:4320`. Тайните са в `.env` до `docker-compose.yml` (mode 600).

## 0. Преди това

- DNS: `korpora.carbonstealth.eu` → IP на сървъра.
- Портът е свободен: `ss -tlnp | grep ':4320 '` не връща нищо.
- Docker с compose plugin, nginx, certbot.

## 1. Тайните (веднъж, на сървъра)

`deploy/setup-env.sh` от репото прави папките и `.env` (mode 600): генерира `POSTGRES_PASSWORD`,
`ENC_KEY` и `HMAC_KEY` (`openssl rand -hex 32`, три различни) и пита само за SMTP (Brevo) и
`CATALOG_KEY` — без да ги показва. Съществуващ `.env` не пипа: нов `ENC_KEY` обезсилва 2FA, нов
`HMAC_KEY` — устройствата, резервните кодове и проверката на одитната верига отпреди смяната.

```bash
curl -fsSL https://codeload.github.com/stefkostefko92-ux/Few-few/tar.gz/main \
  | tar -xz -C /root --strip-components=1 --wildcards '*/korpora/deploy/setup-env.sh'
sudo bash /root/korpora/deploy/setup-env.sh
```

Ръчно — същото: папките `/opt/few-few/shared/korpora` (700) и `…/data` (700, собственик uid 1000 —
единствената папка, в която приложението пише) и `.env` (600) по образеца `.env.example` (`sudoedit`).

Контейнерите са с файлова система само за четене, без Linux capabilities и с `no-new-privileges`
(`docker-compose.yml`); образите са заковани по digest. Затова командите в контейнера по-долу са
`node dist/scripts/…`, не `npm run …` — npm иска да пише в домашната папка.

Паролата на базата влиза некодирана в `DATABASE_URL`: „/“, „?“, „#“ и „%“ (напр. от
`openssl rand -base64`) чупят адреса, затова `deploy.sh` ги отказва. `KORPORA_DATA` е точно
`/opt/few-few/shared/korpora/data` — с друг път `deploy.sh` не тръгва. SMTP: Brevo на порт 2525 (Hetzner
блокира 25/465/587).

Каталогът от магазините е в репото само шифрован (`sealed/catalog.json.enc`, AES-256-GCM) и идва с всеки
деплой. Отваря го `CATALOG_KEY` от `.env` — ключът е само тук и при собственика, никога в репото.
`deploy.sh` го пробва с новия образ преди смяната: грешен ключ спира деплоя с код 1, а работещите
контейнери не са пипани. Без `CATALOG_KEY` продуктът тръгва с основния каталог (или с
`data/catalog.json`, ако е сложен на ръка). Нов каталог: `CATALOG_KEY=… npm run catalog:seal` на машината
на собственика, commit, деплой.

## 2. TLS сертификат (веднъж)

Когато DNS вече сочи насам:

```bash
sudo certbot certonly --nginx -d korpora.carbonstealth.eu --deploy-hook 'systemctl reload nginx'
```

Само сертификат, без пипане на конфига: certbot сам вдига временен блок за проверката. Vhost-ът
(`deploy/nginx/korpora.carbonstealth.eu.conf`) го слага деплоят, щом сертификатът го има — преди
това `nginx -t` би отказал заради липсващите файлове. `--deploy-hook` презарежда nginx след всяко
подновяване; без него подновеният сертификат стига до nginx чак при следващ reload.

## 3. Деплой

Автоматично: `deploy/autodeploy.sh` (и `deploy/fetch-deploy.sh`) разгръща Korpora заедно с другите
продукти. Само Korpora: `sudo PROJECTS="korpora" bash deploy/fetch-deploy.sh`. Ръчно, от release
папка — същият скрипт:

```bash
sudo bash /opt/few-few/current/korpora/deploy/deploy.sh
```

`deploy/deploy.sh` прави всичко по реда:

1. копира тайните от `/opt/few-few/shared/korpora/` (без тях спира с код 3 — тайни не се
   измислят) и проверява, че `KORPORA_DATA` е `/opt/few-few/shared/korpora/data`;
2. `docker compose build` на образа — при провал спира с код 1, работещите контейнери не са пипани;
3. с `CATALOG_KEY` новият образ отваря шифрования каталог (`dist/scripts/catalog-check.js`) — грешен ключ
   или повреден файл спира с код 1, работещите контейнери не са пипани;
4. бекъп на базата преди миграция в `/opt/few-few/shared/korpora/backups/` (пази последните 5;
   `pg_dump --clean --if-exists`) — след build-а и точно преди смяната, за да не губи
   възстановяването записите от минутите на build-а; без бекъп не мигрира (код 1). С
   `KORPORA_SKIP_BACKUP=1` (откатът) — без нов дъмп, за да не изтласка от ротацията дъмпа отпреди
   счупената миграция;
5. `docker compose up` — entrypoint-ът чака базата и пуска `prisma migrate deploy` (никога `db push`);
6. чака `/health` да върне `{"status":"ok","app":"korpora"}` — маркерът доказва, че на порта
   отговаря Korpora, а не друго приложение (иначе код 4 и `autodeploy.sh` връща последния
   работещ release); после записва папката на release-а в `/opt/few-few/shared/korpora/last-good`;
7. слага дневния шифрован бекъп (`deploy/backup-install.sh`: скриптът и таймерът; т. 9) и, ако няма
   бекъп от последните 26 ч, пуска един веднага;
8. слага vhost-а от репото в nginx с порта от `HTTP_PORT` (`nginx -t`, после reload; при грешка
   връща стария), щом има сертификат;
9. подава sitemap-а към IndexNow (Bing, Yandex, Seznam, Naver, Yep), само ако се е променил.

Изход: 0 — жив; 3 — няма `.env`; 4 — контейнерите са сменени, но Korpora не отговаря; 1 — спрян преди
смяната (работещите не са пипани). Стъпки 7–9 след успешната сонда само предупреждават.

Командите `docker compose` по-долу се пускат от папката на работещия release — там са
`docker-compose.yml` и `.env` (`/opt/few-few/shared/korpora/` е само за root, затова `sudo cat`):

```bash
cd "$(sudo cat /opt/few-few/shared/korpora/last-good)"
```

## 4. GeoIP (веднъж, после месечно)

```bash
cd "$(sudo cat /opt/few-few/shared/korpora/last-good)"
sudo docker compose exec -T app node dist/scripts/geoip-update.js && sudo docker compose restart app
```

Cron на хоста (1-во число, 04:10) — `/etc/cron.d/korpora-geoip`, един ред:

```
10 4 1 * * root cd "$(cat /opt/few-few/shared/korpora/last-good)" && docker compose exec -T app node dist/scripts/geoip-update.js && docker compose restart app
```

## 5. Първият собственик (веднъж)

```bash
cd "$(sudo cat /opt/few-few/shared/korpora/last-good)"
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
curl -fsS https://korpora.carbonstealth.eu/health
curl -sI https://korpora.carbonstealth.eu/ | grep -i -E 'content-security-policy|strict-transport'
```

IndexNow тръгва сам от деплоя. Google не участва в IndexNow: в Search Console потвърдете домейна
веднъж и подайте `https://korpora.carbonstealth.eu/sitemap.xml`.

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
последния работещ (`/opt/few-few/shared/korpora/last-good`) с `KORPORA_SKIP_BACKUP=1`. Ръчно — същото:

```bash
sudo KORPORA_SKIP_BACKUP=1 bash "$(sudo cat /opt/few-few/shared/korpora/last-good)/deploy/deploy.sh"
```

**Провалена миграция** — в `docker compose logs app` има `P3018`, а при всеки следващ старт `P3009`.
Откат само на кода не помага: entrypoint-ът и на стария release пуска `prisma migrate deploy`, а Prisma
отказва, докато в базата има неуредена миграция. Затова autodeploy тогава не връща кода, а казва кой е
последният дъмп. Командите са от папката на последния работещ release (`last-good` още сочи него):

```bash
cd "$(sudo cat /opt/few-few/shared/korpora/last-good)"
sudo docker compose stop app
sudo docker compose exec -T db psql -U korpora -d korpora -c \
  'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL'
```

а) **Данните са цели** — обичайният случай: PostgreSQL прилага файла на миграцията като една транзакция и
при грешка връща всичко; остава само записът, че миграцията е паднала. Той се отбелязва като върнат и
тръгва предишният код (нищо не се губи):

```bash
sudo docker compose run --rm --no-deps --entrypoint ./node_modules/.bin/prisma app \
  migrate resolve --rolled-back <име_на_миграцията>
sudo KORPORA_SKIP_BACKUP=1 bash "$PWD/deploy/deploy.sh"
```

б) **Данните трябва да се върнат** — миграцията е минала, но ги е развалила, или не си сигурен. Дъмпът е
взет след build-а, точно преди смяната: губят се само записите от секундите между него и спирането на
стария код, както и всичко, записано от новия. Възстановяването е една транзакция —
при грешка базата остава каквато е. Преди това `gunzip -t` проверява целия файл: `psql
--single-transaction` потвърждава и при внезапен край на входа, тоест отрязан дъмп би влязъл наполовина.
`DROP SCHEMA` е нужен, защото таблица от новата миграция с външен ключ към стара спира триенето в дъмпа.
Дъмпът връща и `_prisma_migrations`, затова `migrate resolve` след него не трябва (дава P3011):

```bash
DUMP=/opt/few-few/shared/korpora/backups/pre-deploy-<дата-час>.sql.gz   # последният преди провала
sudo gunzip -t "$DUMP" && sudo gunzip -c "$DUMP" | sudo docker compose exec -T db psql -v ON_ERROR_STOP=1 \
  --single-transaction -U korpora -d korpora -c 'DROP SCHEMA public CASCADE' -c 'CREATE SCHEMA public' -f -
```

Одитът: ако номерът в котвата (`"head":{"id":…}` в `/opt/few-few/shared/korpora/data/audit-head.json`)
е по-голям от `SELECT max(id) FROM "AuditLog"`, краят на веригата е изрязан с възстановяването и панелът
би го показал като скъсана верига. Тогава запиши случая извън сървъра и нулирай само края на котвата.
Началото ѝ (`"base"`) остава: без него първата проверка след изтриване по срок вдига трайна тревога и
спира самото изтриване. Старата котва се копира встрани като доказателство и не се трие. Докато `app`
е спрян, от папката на release-а:

```bash
sudo docker compose run --rm --no-deps --entrypoint node app -e "
const fs = require('fs'), f = 'data/audit-head.json';
if (!fs.existsSync(f)) { console.log('няма котва'); process.exit(0); }
const a = JSON.parse(fs.readFileSync(f, 'utf8'));
fs.copyFileSync(f, f + '.pre-restore-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.writeFileSync(f + '.tmp', JSON.stringify({ head: null, base: a.base ?? null }), { mode: 0o600 });
fs.renameSync(f + '.tmp', f);
console.log('base в котвата:', JSON.stringify(a.base ?? null));"
sudo docker compose exec -T db psql -U korpora -d korpora -tAc 'SELECT "lastId", "lastHash" FROM "AuditBase"'
```

Двете трябва да казват едно и също: `base` `null` и празен отговор от базата, или същите номер и хеш.
Ако се различават, между дъмпа и възстановяването е минало изтриване по срок. Тогава котвата не се
пипа повече, случаят се записва извън сървъра и решава човек: панелът ще показва скъсана верига, докато
решението не е взето.

Накрая — предишният код: `sudo KORPORA_SKIP_BACKUP=1 bash "$PWD/deploy/deploy.sh"`.

Проверено с PostgreSQL 16 и Prisma 6: след а) и след б) `prisma migrate deploy` на стария код казва
„No pending migrations“. Поправената миграция идва с нов release.

## 9. Дневен шифрован бекъп

Всеки ден в 02:30 UTC (± 10 мин.; пропуснат ден се наваксва) `korpora-backup.timer` пуска
`/usr/local/sbin/korpora-backup` (= `deploy/backup.sh`). Слага ги деплоят (`deploy/backup-install.sh`,
идемпотентно); ръчно — `sudo bash "$(sudo cat /opt/few-few/shared/korpora/last-good)/deploy/backup-install.sh"`.

- **Какво:** `pg_dump -Fc` на цялата база от контейнера на базата (намира го по етикетите на compose, не
  по папката на release-а).
- **Шифроване:** [age](https://age-encryption.org) към публичния ключ на собственика в
  `/opt/few-few/shared/korpora/backup-recipients.txt`. Сървърът може да пише бекъпи, но не и да ги чете:
  частният ключ е само при собственика. Откраднат диск, бекъп или off-site копие не издават нищо.
  Некриптиран дъмп не стъпва на диска.
- **Проверка при всеки бекъп:** същият поток, който влиза в age, се чете докрай от `pg_restore` (отрязан или
  повреден дъмп спира бекъпа); файлът е поне 8 KiB и е във формата на age; до него е `.sha256`. Сървърът
  не може да го разшифрова (така е замислено) — затова т. 10, репетицията, е задължителна.
- **Къде:** `/opt/few-few/shared/korpora/backups/daily/korpora-<ГГГГММДД-ччммсс>.dump.age` (600, папката 700),
  записан атомично (временен файл → fsync → rename).
- **Ротация:** след всеки успешен бекъп — най-новият от всеки от последните 14 дни и от всяка от
  последните 8 седмици (около два месеца назад, 19–20 файла). 14 дни дават ден по ден за повреда,
  забелязана до две седмици; седмичните покриват бавно забелязана грешка. По-дълго не: изтрит акаунт
  остава в бекъпите до изтичането им (SECURITY.md). Провал → изход ≠ 0, нищо старо не се трие.
- **Лог:** `journalctl -u korpora-backup -n 50` — само имена на файлове, размери и броеве.
- **Пясъчник:** unit-ът е без capabilities и без мрежа (docker е през unix сокет), пише само в
  `backups/daily` (`systemd-analyze security korpora-backup` — 1.5).

Бекъпите преди миграция (т. 3, стъпка 4: `pre-deploy-*.sql.gz`, последните 5) остават както са —
некриптирани (600 в папка 700), за да се възстановят веднага на сървъра без ключа на собственика (т. 8).

**Веднъж — ключът (собственикът).** На своята машина, не на сървъра:

```bash
age-keygen -o korpora-backup.key      # частният ключ — само тук, в мениджъра на пароли и офлайн копие
age-keygen -y korpora-backup.key      # публичният ключ (age1…) — той отива на сървъра
```

Загубен частен ключ = загубени бекъпи (няма възстановяване). Може и втори ключ (напр. в сейф): по един
публичен ключ на ред — всеки от тях отваря бекъпите. На сървъра:

```bash
sudo apt-get install -y age
printf '%s\n' 'age1…' | sudo tee /opt/few-few/shared/korpora/backup-recipients.txt >/dev/null
sudo chmod 600 /opt/few-few/shared/korpora/backup-recipients.txt
sudo bash "$(sudo cat /opt/few-few/shared/korpora/last-good)/deploy/backup-install.sh"   # пуска първия бекъп
```

`korpora-backup` отказва файл с частен ключ (`AGE-SECRET-KEY-…`), файл, в който пише друг освен root, и
редове, които не са публичен ключ (`age1…`, `ssh-ed25519 …`).

**Проверка:**

```bash
systemctl list-timers korpora-backup.timer
sudo systemctl start korpora-backup.service && journalctl -u korpora-backup -n 20 --no-pager
sudo ls -l /opt/few-few/shared/korpora/backups/daily/
```

**Извън сървъра.** Бекъп на същия диск не оцелява при загуба на машината. Файловете са шифровани, затова
копие на `backups/daily/` в хранилище в ЕС (втория VPS, Hetzner Storage Box) не издава данни — кое и как
решава собственикът. За нов сървър трябват и тайните от `.env` (`ENC_KEY`, `HMAC_KEY` — без тях 2FA,
устройствата и одитната верига от бекъпа не се проверяват) и котвата `data/audit-head.json`: те **не** са в
бекъпа на базата — пазете ги отделно (т. 1, т. 7).

## 10. Възстановяване от дневния бекъп

Скриптът е `deploy/backup-restore.sh` в папката на работещия release. Разшифроването е при собственика:
дъмпът минава по ssh, частният ключ не стъпва на сървъра. Командите са от машината на собственика:

```bash
SRV=root@<сървър>
D=/opt/few-few/shared/korpora/backups/daily
ssh "$SRV" "ls -1 $D"                                   # избери файл
F=korpora-<ГГГГММДД-ччммсс>.dump.age
```

**Репетиция — веднъж месечно, без риск.** Възстановява в нова празна база до живата, проверява таблиците,
миграциите и акаунтите и я трие; живата база и приложението не се пипат:

```bash
ssh "$SRV" "cd $D && sha256sum -c --quiet $F.sha256 >&2 && cat $F" | age -d -i korpora-backup.key |
  ssh "$SRV" 'bash "$(cat /opt/few-few/shared/korpora/last-good)/deploy/backup-restore.sh" --into korpora_restore_drill -'
```

Успех: `възстановено в korpora_restore_drill: … таблици, … миграции (последна …), … акаунта` и
`репетицията мина`. С `--keep` базата остава за оглед. Запишете датата и резултата извън сървъра.

**Авария — живата база (разрушително: всичко след бекъпа се губи).** Същото, с `--live --yes-i-know`:

```bash
ssh "$SRV" "cd $D && sha256sum -c --quiet $F.sha256 >&2 && cat $F" | age -d -i korpora-backup.key |
  ssh "$SRV" 'bash "$(cat /opt/few-few/shared/korpora/last-good)/deploy/backup-restore.sh" --live --yes-i-know -'
```

Скриптът спира приложението, прави шифрована снимка на сегашната база
(`/opt/few-few/shared/korpora/backups/pre-restore-<дата-час>.dump.age` — отменя се със същата команда),
заменя схемата като една транзакция и пуска приложението отново (и при грешка). COMMIT има само ако дъмпът
е прочетен докрай: отрязан или повреден вход оставя базата каквато е. След това — котвата на одита (т. 8,
„Одитът“) и `curl -fsS https://korpora.carbonstealth.eu/health`.

Ако ssh не е възможно, файлът се разшифрова и на сървъра: ключът временно в `/dev/shm` (паметта, не
дискът), `--identity /dev/shm/korpora-backup.key /opt/…/daily/$F`, после `shred -u` на ключа.

Проверено с PostgreSQL 16 (`tests/integration/backup-restore.test.ts`): бекъп → възстановяване в празна
база със същите акаунти и миграции; живо възстановяване връща изтрит акаунт; отрязан дъмп не променя нищо.
