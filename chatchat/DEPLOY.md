# ChatChat — разгръщане в продукция

Модел: Docker Compose на VPS-а — **db** (PostgreSQL 16 + pgvector), **clamav** (антивирус за прикачените
файлове) и **app** — с nginx на хоста и Let's Encrypt. Приложението слуша само на `127.0.0.1:4330`;
базата и антивирусът нямат публикуван порт (базата е само във вътрешната мрежа на проекта). Тайните са
в `/opt/few-few/shared/chatchat/.env` (mode 600), никога в репото или в архива. Данните са шифровани в
покой (NFR-03, т. 12): прикачените файлове — от приложението (`FILES_KEK`), базата — в LUKS2 том.

Контейнерите са с файлова система само за четене, без Linux capabilities (базата и clamav пазят само
нужните им) и с `no-new-privileges`; образите са заковани по digest. Приложението пише само в
`/data/attachments` (папка на хоста) и в `/tmp`. Затова командите в контейнера са `node dist/…`, не
`npm run …` — npm иска да пише в домашната папка.

Всичко минава през **един скрипт** — `deploy/deploy.sh` — и при ръчния деплой, и от
`deploy/autodeploy.sh` (моделът на korpora). Изходи: `0` жив · `3` няма `.env` (машината не е
настроена — autodeploy го пропуска, не е провал) · `4` контейнерите са сменени, но ChatChat не отговаря
(autodeploy връща предишния release) · `1` спрян преди смяната (работещите не са пипани).

## 0. Преди това

- DNS: `chatchat.carbonstealth.eu` → IP на сървъра.
- Портът е свободен: `ss -tlnp | grep ':4330 '` не връща нищо.
- Docker Engine ≥ 29.5.1 с compose plugin, nginx, certbot, `age` (`apt-get install -y age`).
- **Памет:** clamav ~1 GB (таван 2 GB), базата до 1 GB, приложението до 1 GB → поне **4 GB RAM** на
  машината за ChatChat заедно с останалото (т. 8).

## 1. Тайните (веднъж, на сървъра)

```bash
sudo install -d -m 700 /opt/few-few/shared/chatchat
sudo install -m 600 /dev/null /opt/few-few/shared/chatchat/.env
sudoedit /opt/few-few/shared/chatchat/.env    # по образеца .env.example
```

| Ключ                 | Как се генерира                                                       | Какво чупи смяната му                                             |
| -------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `POSTGRES_PASSWORD`  | `openssl rand -hex 32` (само hex — влиза некодирана в `DATABASE_URL`) | връзката с вече създадената база                                  |
| `SESSION_PEPPER`     | `openssl rand -hex 32`                                                | всички сесии и QR токени                                          |
| `ATTACHMENT_URL_KEY` | `openssl rand -base64 32`                                             | издадените адреси за сваляне на прикачени файлове                 |
| `MFA_ENC_KEY`        | `openssl rand -base64 32`                                             | **всички MFA устройства** (тайните им в базата не се разшифроват) |
| `FILES_KEK`          | `openssl rand -base64 32`                                             | **всички прикачени файлове** — смяна само с ротация (т. 12)       |
| `REDIS_PASSWORD`     | `openssl rand -hex 32` (само hex — влиза некодирана в `REDIS_URL`)    | само чакащите задачи (т. 13)                                      |

Шестте са различни. Ако `ATTACHMENT_URL_KEY`, `MFA_ENC_KEY`, `FILES_KEK` или `REDIS_PASSWORD` липсват, `deploy.sh` ги
генерира сам (само тях, само ако ги няма, никога не ги презаписва и не ги печата) и казва това —
**копирай `.env` и извън сървъра** (password manager), **никога заедно с бекъпите**: без `MFA_ENC_KEY`
бекъпът на базата не връща MFA, а без `FILES_KEK` прикачените файлове (и тези в бекъпите) са загубени.

AI (по избор): `VERTEX_PROJECT_ID`, `VERTEX_REGION=eu` и ключът на service account-а (контейнерът тече
като uid 1000, затова ключът е негов и само за четене):

```bash
sudo install -o 1000 -g 1000 -m 400 ключ.json /opt/few-few/shared/chatchat/gcp-sa.json
# в .env: GCP_SA_FILE=/opt/few-few/shared/chatchat/gcp-sa.json
```

Без `VERTEX_PROJECT_ID` приложението тръгва, но `/api/v1/chat/messages` връща 503 (без резервен
доставчик). Семантичното търсене (`EMBEDDING_*`) е по избор — празно → само точното и пълнотекстовото.

Всички `docker compose` команди по-долу са от папката `chatchat/` на работещия release:

```bash
cd "$(cat /opt/few-few/shared/chatchat/last-good)"   # последният release, който е отговорил
CC="sudo docker compose"                              # .env до compose файла го слага deploy.sh
```

Името на проекта е заковано (`name: chatchat`), затова томовете (`chatchat_db-data`, `chatchat_clamav-db`)
са едни и същи, от която и release папка да се пуска.

## 2. TLS и nginx (веднъж)

Когато DNS вече сочи насам:

```bash
sudo certbot certonly --nginx -d chatchat.carbonstealth.eu --deploy-hook 'systemctl reload nginx'
```

От тук нататък `deploy.sh` слага **vhost-а от репото** (`deploy/nginx/chatchat.carbonstealth.eu.conf`) при
всеки деплой: `nginx -t`, после reload; при грешка връща стария. Не се пише на ръка на сървъра.

Какво прави vhost-ът:

- **Тела:** 1 MB общо; `10m` под `/api/v1/cases/` (снимки до 10 MB); `50m` под `/api/v1/admin/` (PDF до
  50 MB). nginx буферира тялото, преди да го подаде на приложението.
- **Събития в реално време (SSE)** — `/api/v1/events`: `proxy_buffering off`, `proxy_cache off`, без gzip,
  `proxy_read_timeout 1h`. Всяко събитие стига до браузъра веднага; приложението трябва да праща пулс
  (SSE коментар) по-често от 1 ч, иначе nginx затваря тих поток — EventSource се свързва отново сам.
  `X-Accel-Buffering: no` от приложението също се зачита, но не е нужно.
- **QR етикетите** — `/q/<жетон>` отиват направо в приложението.
- `proxy_read_timeout` за останалото е 120 s (AI отговорът е до `AI_TIMEOUT_MS`, по подразбиране 60 s).
- `/readyz` е достъпен само от самия сървър; без дневник на заявките (нула IP адреси в nginx).

## 3. Деплой (първи и всеки следващ)

**Автоматично** — от `deploy/autodeploy.sh`, само ChatChat:

```bash
sudo REF=main PROJECTS=chatchat bash /opt/few-few/current/deploy/fetch-deploy.sh
```

**Ръчно** — от папката на release-а:

```bash
sudo bash /opt/few-few/releases/<час>/<корен>/chatchat/deploy/deploy.sh
```

Какво прави `deploy.sh`, по ред:

1. `.env` от `/opt/few-few/shared/chatchat/.env` (няма го → изход 3); липсващите ключове (т. 1);
   базата е в шифрования том (т. 12) → томът трябва да е отключен и монтиран, а `.env` да носи
   `COMPOSE_FILE=…pgdata.yml` (иначе изход 1 — никога база върху стария некриптиран том);
   папката `attachments/` (uid 1000, mode 700); папката `eval-reports/` (755, монтирана само за четене);
   `clamd.conf` от репото на стабилния път.
2. `docker compose build app` (същият образ `chatchat-app` е и `worker`); образите на db, clamav и redis
   се теглят **само ако ги няма** (по digest).
3. **Бекъп на базата преди миграцията** (`shared/chatchat/backups/pre-deploy-<час>.sql.gz`, последните 5;
   с шифрования том — в него: `shared/chatchat/pgdata/pre-deploy/`) — без валиден дъмп няма миграция (изход 1).
4. Еднократно: базата на pgvector + `REINDEX` (т. 11).
5. `docker compose up -d` — entrypoint-ът чака базата и пуска `prisma migrate deploy` (**никога**
   `db push`), после `node dist/index.js`.
6. Чака `http://127.0.0.1:4330/readyz` да върне `{"ok":true,"ai":…}` (до `CHATCHAT_HEALTH_WAIT`, 120 s).
   Не → изход 4 и autodeploy вдига предишния release.
7. Worker-ът (т. 13) трябва да е здрав — иначе само предупреждение (API-то работи, задачите чакат в Redis).
8. Записва `shared/chatchat/last-good`; шифрова старите нешифровани прикачени файлове
   (`files.js encrypt`, идемпотентно, т. 12); слага таймерите за бекъпа и ретенцията (т. 9); vhost-а (т. 2).

Миграциите са само адитивни; триене на колони/таблици — в отделен, по-късен release. Така старият код
работи и с новата схема и връщането назад е само на кода.

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

## 5. Ръчни стъпки при деплой без скрипта (авария)

Само ако `deploy.sh` не може да се ползва:

```bash
$CC build
# с шифрования том (т. 12) — в него, не на некриптирания диск: …/chatchat/pgdata/pre-deploy/
DUMP=/opt/few-few/shared/chatchat/backups/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ).sql.gz
$CC exec -T db pg_dump -U chatchat -d chatchat --clean --if-exists | gzip | sudo tee "$DUMP" >/dev/null
sudo chmod 600 "$DUMP" && sudo gunzip -t "$DUMP" && echo "бекъп: $DUMP"
$CC up -d
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:4330/readyz && break; sleep 2; done
```

## 6. Проверка

```bash
curl -fsS https://chatchat.carbonstealth.eu/healthz
curl -sI https://chatchat.carbonstealth.eu/ | grep -i -E 'content-security-policy|strict-transport'
$CC ps        # db, clamav и app: healthy (clamav — до ~2 мин след старт)
systemctl list-timers 'chatchat-*'
```

## 7. Връщане назад

**Кодът.** autodeploy го прави сам при изход 4: `deploy.sh` на `last-good` с `CHATCHAT_SKIP_BACKUP=1`
(откатът не изтласква дъмпа отпреди миграцията). Ръчно — същото:

```bash
sudo CHATCHAT_SKIP_BACKUP=1 bash "$(cat /opt/few-few/shared/chatchat/last-good)/deploy/deploy.sh"
```

Базата не се пипа. Изключение: release отпреди pgvector **не** се вдига, щом базата вече е минала (т. 11).

**Провалена миграция** — в `$CC logs app` има `P3018`, а при всеки следващ старт `P3009`; контейнерът
не тръгва и autodeploy не прави откат (старият entrypoint спира на същото), а казва кой е дъмпът.

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

После — предишният код (горе). Поправената миграция идва с нов release. **Никога**
`docker compose down -v` — трие томовете на базата и на сигнатурите.

## 8. ClamAV (антивирусът)

- Образът е официалният `clamav/clamav` (Debian вариантът — amd64 и arm64), закован по digest.
  Конфигът е `deploy/clamav/clamd.conf` (в контейнера само за четене): `TCPSocket 3310` (само за app
  през вътрешната мрежа), `StreamMaxLength`/`MaxFileSize 60M` (над най-големия приеман файл),
  `AlertExceedsMax yes` (файл над таван се отбелязва `Heuristics.Limits.Exceeded`, не минава за чист без
  проверка), `ConcurrentDatabaseReload no`.
- **Памет:** с пълната база clamd държи ~1 GB (измерено: 962 MiB, 1.5.4). Таванът е **2 GB**.
  `ConcurrentDatabaseReload no` значи, че след всеки ъпдейт на сигнатурите (4 проверки на денонощие)
  презареждането не държи два двигателя в паметта — за десетки секунди сканиранията **чакат**. Ако
  машината има памет в излишък и забавянето пречи: `yes` в конфига и `mem_limit: 3g` в compose.
- Стартът зарежда сигнатурите 1–2 минути (healthcheck `clamdcheck.sh`, `start_period` 10 мин).
  Приложението не чака clamav да е здрав: файл, качен дотогава, остава непоказан (PENDING/FAILED),
  докато не бъде проверен.
- Нов том се пълни от базата, вградена в образа (по-стара), и freshclam я обновява от
  `database.clamav.net` — затова clamav е и в мрежата с изход навън (базата е само във вътрешната).
- Проверка на живо (EICAR тестовият низ, не е вирус):

  ```bash
  $CC exec clamav clamdcheck.sh
  printf 'X5O!P%%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' \
    | $CC exec -T clamav clamdscan --no-summary --stream -     # → Eicar-Test-Signature FOUND
  ```

## 9. Дневен шифрован бекъп и ретенция

`deploy.sh` слага (след всяка успешна сонда, идемпотентно, през `deploy/timers-install.sh`):

| Таймер                     | Кога (UTC) | Какво                                                                            |
| -------------------------- | ---------- | -------------------------------------------------------------------------------- |
| `chatchat-backup.timer`    | 02:45      | `/usr/local/sbin/chatchat-backup` (= `deploy/backup.sh`)                         |
| `chatchat-retention.timer` | 03:17      | `/usr/local/sbin/chatchat-retention` → `node dist/cli/retention.js` в контейнера |

**Бекъпът** = две половини със същия час в `/opt/few-few/shared/chatchat/backups/daily/` (700/600, с
`.sha256`): `chatchat-<час>.dump.age` (`pg_dump -Fc`, четен докрай от `pg_restore` в същия поток) и
`chatchat-<час>.files.tar.age` (tar на прикачените файлове). Първо базата, после файловете. И двете са
шифровани с **age към публичния ключ на собственика** — сървърът пише бекъпи, но не може да ги чете.
Файловете в архива са шифровани **и** от приложението (`FILES_KEK`): възстановяването иска и двата
ключа — частния age ключ и `FILES_KEK` (т. 12); затова никой от тях не се пази заедно с архива.
Ротация: 14 дневни + 8 седмични (двете половини заедно). Архивът на файловете е пълен всеки ден —
следи мястото на диска (`du -sh .../backups/daily`).

Веднъж — ключът (частният **никога** на сървъра):

```bash
# на компютъра на собственика:
age-keygen -o chatchat-backup.key        # пази го офлайн; печата публичния ключ age1…
# на сървъра:
sudo install -m 600 /dev/null /opt/few-few/shared/chatchat/backup-recipients.txt
echo 'age1…' | sudo tee /opt/few-few/shared/chatchat/backup-recipients.txt >/dev/null
sudo systemctl start chatchat-backup.service && journalctl -u chatchat-backup -n 20
```

Без получател таймерът стои, но бекъп не тръгва (и деплоят казва това). **Ретенцията** трие стари сесии
след `RETENTION_SESSION_DAYS` (30) и затворени случаи след `RETENTION_CASE_DAYS` — **само ако**
администраторът на данните го е определил; същото за съобщенията по вид разговор
(`RETENTION_DIRECT/GROUP/CHANNEL_DAYS`). Известия (90 дни), присъствие (7), метаданни (90) и одитът
(10 г., с контролна точка — веригата остава проверима) имат подразбиране; всичко е в `.env.example`.
Изтритото остава в бекъпите до тяхната ротация (≤ 8 седмици).

## 10. Възстановяване (бекъп без тестван restore не е бекъп)

От папката на работещия release; входът е **разшифрован при собственика** и подаден по ssh на stdin:

```bash
R=/opt/few-few/shared/chatchat/backups/daily; T=20261009-024500
# База — репетиция в празна база до живата (не пипа нищо живо):
ssh root@СЪРВЪР "cat $R/chatchat-$T.dump.age" | age -d -i chatchat-backup.key \
  | ssh root@СЪРВЪР 'bash "$(cat /opt/few-few/shared/chatchat/last-good)/deploy/backup-restore.sh" --into chatchat_restore_proba -'
# Файлове — репетиция в НОВА папка:
ssh root@СЪРВЪР "cat $R/chatchat-$T.files.tar.age" | age -d -i chatchat-backup.key \
  | ssh root@СЪРВЪР 'bash "$(cat /opt/few-few/shared/chatchat/last-good)/deploy/files-restore.sh" --into /root/chatchat-files-proba -'
```

Пробата за файловете не спира на „разопакова се“: всеки файл се **разшифрова докрай** с `FILES_KEK`
на сървъра (`files.js verify --root` в контейнер от образа на app, ключовете — от `.env` на release-а).
Сменен или загубен ключ → пробата пада. Същата проверка тече и при `--live`, преди размяната.

Авария (РАЗРУШИТЕЛНО — губи се всичко след бекъпа; базата и файловете от **същия** час):
`backup-restore.sh --live --yes-i-know -` (спира app, шифрована снимка на сегашната база, замяна в една
транзакция, пуска app) и `files-restore.sh --live --yes-i-know -` (спира app, разопакова до живата папка,
разменя ги; старата остава като `attachments.pre-restore-<час>` до ръчното ѝ изтриване). Репетиция —
поне веднъж месечно.

## 11. База: pgvector (еднократно преминаване)

Образът на базата е `pgvector/pgvector` (PostgreSQL 16 на Debian + разширението `vector`). Досегашният
беше `postgres:16-alpine`. Една и съща главна версия — данните тръгват без dump/restore (собственикът
uid 70 → 999 се сменя от entrypoint-а), **но** Alpine (musl) и Debian (glibc) подреждат текста различно и
индексите по текст стават невалидни (проверено с `amcheck`: „high key invariant violated“).

Затова `deploy.sh`, при **съществуващ** том и без маркера `shared/chatchat/.db-pgvector`: бекъп →
`up` само на базата с новия образ → `REINDEX DATABASE chatchat` → маркер → нормалният `up`. На нова
инсталация маркерът се слага след първия успешен деплой. След преминаването autodeploy **не** връща
автоматично release със стария образ (индексите пак биха се разминали) — вика човек. Ако все пак се
наложи: стария образ + `REINDEX DATABASE chatchat` веднага след старта, после махни маркера.

## 12. Шифроване в покой (NFR-03, §15.1)

Два слоя: **файловете** — шифровани от приложението (всеки файл); **базата** — в LUKS2 том. Бекъпите
(т. 9) са шифровани отделно, с age към ключа на собственика. Процедурите при авария (изгубен ключ,
рестарт, ротация) — `docs/runbook.md`, „Шифроване в покой“.

### Модел на заплахата (честно)

Ключовете за автоматичен старт живеят **на същия сървър** (`FILES_KEK` в `.env`, ключовият файл на
тома в `/etc/chatchat/`). Затова:

| Пази от                                                                                               | Не пази от                                                             |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| изтекъл/откачен **Hetzner Volume** или негова снимка, бракуван носител (ключът е на системния диск)   | root (или процес на приложението) на **работещия** сървър              |
| копие само на папката с файловете или само на тома/файла на базата (бекъп, грешен rsync, чужд достъп) | снимка на **системния** диск, щом томът на базата е файл на същия диск |
| бекъпа на файловете: age ключът сам не стига (трябва и `FILES_KEK`)                                   | изтичане на `.env` заедно с файловете                                  |
| „крипто-изтриване“: унищожен ключ = данните не се връщат, каквото и да е останало по дисковете        | атакуващ с root, който чете паметта или ключовете                      |

- **Най-добре:** базата върху **отделен Hetzner Volume** (`CHATCHAT_PGDATA_DEVICE`) — ключът е на
  системния диск, данните на тома; снимка/изтичане на единия не дава другия. Томът-файл
  (`pgdata.luks` на системния диск) пази от по-малко — само от копия на файла без `/etc`.
- **По-строго:** ръчно отключване (`chatchat-pgdata manual-unlock`) — ключов файл на диска няма, след
  всеки рестарт човек въвежда паролата; дотогава базата на ChatChat не тръгва (другите продукти — да).
  Тогава и снимка на целия сървър не издава базата. `FILES_KEK` остава в `.env` (приложението го иска
  при старт).
- Изтритото не се презаписва: стари нешифровани файлове, дъмпове и томове, изтрити след прехода, може
  да стоят в свободните блокове на диска, докато не бъдат презаписани. Пълна гаранция — нов диск.
- Swap: ако машината има swap, страници от паметта може да стигнат до диска нешифровани (образите на
  Hetzner по подразбиране са без swap — `swapon --show`).

### Файловете (`FILES_KEK`)

Всеки обект (снимка, лог, PDF оригинал, файл от разговор) е AES-256-GCM с **отделен случаен ключ
(DEK)**, опакован с главния ключ `FILES_KEK`; заглавката носи версия на формата и id (отпечатък) на
KEK; тялото е на 64 KiB сегменти с отделен tag; опаковката е вързана към ключа на обекта (файл,
преместен под чужд ключ, не се отваря). Целостта на открития текст остава `sha256` в базата
(`Attachment.sha256`, `Document.checksum`). Антивирусът сканира **открития** текст в паметта при
качването — clamd никога не вижда диска. Без `FILES_KEK` приложението не тръгва
(`FILES_ENCRYPTION=off` — само извън продукция).

```bash
cd "$(cat /opt/few-few/shared/chatchat/last-good)"; CC="sudo docker compose"
$CC exec -T app node dist/cli/files.js status        # шифровани (текущ/стар KEK) и нешифровани — броеве
$CC exec -T app node dist/cli/files.js encrypt       # старите → шифровани (deploy.sh го пуска след всеки деплой)
$CC exec -T app node dist/cli/files.js verify --db   # разшифрова ВСИЧКО докрай + sha256 срещу базата
```

**Преходът:** четенето разпознава старите нешифровани файлове; `encrypt` ги шифрова идемпотентно — нов
обект до стария → разшифрова се докрай и се сверява sha256 → атомарна смяна (rename) → старият изчезва.
Файл, изтрит междувременно (ретенцията), не се възкресява. Щом `status` покаже 0 нешифровани:
`FILES_PLAINTEXT=deny` в `.env` + деплой — оттам нешифрован файл на диска е отказ (подменен файл не
минава за „стар“). Откат на кода до release **отпреди** шифроването вижда шифротекст вместо файлове —
не се прави (базата и знанието работят, файловете — не).

**Ротация на `FILES_KEK`** (преопакова се само DEK, файловете не се пренаписват):

```bash
openssl rand -base64 32                       # новият → в password manager-а ПРЕДИ следващата стъпка
sudoedit /opt/few-few/shared/chatchat/.env    # FILES_KEK_PREVIOUS=<стария>, FILES_KEK=<новия>
sudo bash "$(cat /opt/few-few/shared/chatchat/last-good)/deploy/deploy.sh"   # новите файлове — с новия
$CC exec -T app node dist/cli/files.js rekey  # изход 0 = нито един обект със стар KEK
sudoedit /opt/few-few/shared/chatchat/.env    # махни FILES_KEK_PREVIOUS; пак deploy.sh
```

Стария KEK **пази офлайн, докато има бекъпи отпреди ротацията** (до 8 седмици, т. 9) — те са с него.

### Базата (LUKS2): `deploy/pgdata-encrypt.sh`

Веднъж, като root, от работещия release (идемпотентно — повторното пускане само проверява):

```bash
sudo apt-get install -y cryptsetup
R="$(cat /opt/few-few/shared/chatchat/last-good)"
# а) Hetzner Volume (препоръчано): ПРАЗЕН — без автоматично монтиране/ext4 от конзолата. Скриптът
#    отказва носител с файлова система или дялове; изчистването е ръчно и само ако томът СИГУРНО е
#    празен: umount, махни реда от /etc/fstab, после изтрий подписите (wipefs -a <устройството>).
sudo CHATCHAT_PGDATA_DEVICE=/dev/disk/by-id/scsi-0HC_Volume_<id> bash "$R/deploy/pgdata-encrypt.sh" enable
# б) или файл на системния диск (sparse; размерът — с резерв за растежа):
sudo CHATCHAT_PGDATA_SIZE=20G bash "$R/deploy/pgdata-encrypt.sh" enable
```

Какво прави: ключ `/etc/chatchat/pgdata.key` (0400, `openssl rand`, 64 байта) → LUKS2 (aes-xts-plain64,
512-битов ключ, argon2id) само върху **празен** носител → ext4 → монтиран на
`/opt/few-few/shared/chatchat/pgdata` (`nodev,nosuid,noexec`) → `chatchat-pgdata.service` (отключва и
монтира при старт, `Before=docker.service`; Docker **не** зависи от него) и `/usr/local/sbin/chatchat-pgdata`
→ ред `COMPOSE_FILE=docker-compose.yml:docker-compose.pgdata.yml` в `.env` (compose монтира
`pgdata/data` вместо тома `db-data`, **без** `create_host_path`: незаключен том = базата не тръгва,
никога празна база върху некриптирания диск) → миграция:

1. проверка на мястото (2 × базата + 1 GiB, в тома и под файла);
2. **app спира** (нищо не пише); броеве на редовете на всяка таблица + одитната верига (брой и md5 на
   `prevHash>hash` по ред);
3. `pg_dump -Fc` **в шифрования том** (`pgdata/migration/pre-luks-<час>.dump`), прочетен докрай;
4. db спира → compose минава на тома → нов клъстер → `pg_restore` в една транзакция;
5. същите броеве и верига → app тръгва; дъмповете отпреди деплой се местят в тома (`pgdata/pre-deploy/`).

Грешка след т. 2 → **автоматично връщане**: compose пак на `db-data`, базата и app тръгват както
преди, провалените данни остават настрана (`pgdata/data.failed-<час>`). Престой: от спирането на app
до края (дъмп + възстановяване). **Старият том остава** — след проверка (`curl -fsS
127.0.0.1:4330/readyz`, вход, един случай): `sudo docker volume rm chatchat_db-data` и
`sudo rm -r /opt/few-few/shared/chatchat/pgdata/migration`. Release **отпреди** шифрования том няма
`docker-compose.pgdata.yml` → compose отказва; autodeploy вика човек (не вдига стария том).

```bash
sudo chatchat-pgdata status        # режим, носител, отключен/монтиран
sudo chatchat-pgdata open          # ръчно отключване + монтиране + пуска db и app
sudo chatchat-pgdata close         # спира app и db, демонтира, заключва
sudo chatchat-pgdata rotate-key    # нов ключов файл: luksAddKey → проба → luksRemoveKey на стария
sudo chatchat-pgdata manual-unlock # по-строгият режим: парола при всеки рестарт, ключовият файл изчезва
sudo chatchat-pgdata auto-unlock   # обратно към ключов файл (паролата остава резервен слот)
```

`rotate-key` сменя **слота** (ключа, който отключва тома), не главния ключ на LUKS. Изтекли заглавка и
стар ключ заедно (или изтекъл главен ключ) → пълна смяна: `cryptsetup reencrypt` (онлайн, LUKS2) или
нов том + повторна миграция. Стари копия на заглавката (`cryptsetup luksHeaderBackup`) приемат стария
ключ — унищожи ги след ротация.

**Разширяване:** Volume — увеличи го в конзолата; файл — `truncate -s +10G …/pgdata.luks` и
`losetup -c <loop устройството му>` (`losetup -j …/pgdata.luks`); после
`cryptsetup resize --key-file /etc/chatchat/pgdata.key chatchat-pgdata` и
`resize2fs /dev/mapper/chatchat-pgdata` (всичко като root).

### Тайни, които се пазят ИЗВЪН сървъра (password manager на собственика)

| Тайна                                    | Без нея                                           | Никога заедно с                         |
| ---------------------------------------- | ------------------------------------------------- | --------------------------------------- |
| `.env` (вкл. `FILES_KEK`, `MFA_ENC_KEY`) | файловете — загубени, вкл. в бекъпите; MFA наново | `*.files.tar.age`, `*.dump.age`         |
| стар `FILES_KEK` (след ротация)          | бекъпите отпреди ротацията не се отварят          | бекъпите                                |
| `/etc/chatchat/pgdata.key` (`base64 …`)  | томът на базата (остава дневният бекъп от т. 9)   | бекъпите на базата, копие на заглавката |
| паролата на тома (ръчен режим)           | същото                                            | —                                       |
| частният age ключ (т. 9)                 | бекъпите                                          | сървъра                                 |

## 13. Опашките и worker-ът (Redis + BullMQ, NFR-06)

Тежката работа е извън API-то: услугата `worker` (същият образ, `node dist/worker.js`, само за четене, без
root, без HTTP) изпълнява опашките от Redis 7 — `ingest` (разбор на PDF/DOCX/XLSX/лог в отделна нишка с
таван на паметта и срок), `ocr` (pdftoppm + tesseract `ita+eng+bul`, само страниците без текстов слой и
изображенията), `embed` (векторите след публикуване + периодичен преглед). Изчерпаните опити отиват в
опашката `dead` (само id-та и причина), а файлът става „Неуспех“ — в конзолата „Повтори“ го пуска наново
(и файл, заседнал над 30 мин. в опашката). Redis пази и pub/sub между инстанциите на API-то (SSE), общите
лимити на заявките и пазача срещу повторен TOTP код. Без `REDIS_URL` (dev) всичко е в процеса — тогава
работи **само една** инстанция на API-то.

```bash
$CC ps worker redis                     # и двете „healthy“
$CC logs --tail=80 worker               # „chatchat worker тръгна“, после само id-та и кодове
$CC exec -T redis redis-cli info memory | grep used_memory_human   # таван 256 MB, noeviction
```

- **Здраве:** worker-ът обновява `/tmp/chatchat-worker.alive` на 10 s, само ако Redis отговаря; HEALTHCHECK
  — файлът е по-нов от 60 s. Спиране: текущите задачи довършват до 90 s (`stop_grace_period: 120s`), после
  задачата се поема наново (идемпотентно по id на файла — документ не се записва два пъти).
- **Метрики** (по избор, `WORKER_METRICS_PORT` → `127.0.0.1:<порт>`): `chatchat_queue_jobs_total{queue,result}`,
  `chatchat_queue_job_duration_seconds`, `chatchat_queue_depth{queue,state}` (и `dead`),
  `chatchat_ingest_items_total{format,result}`, `chatchat_ocr_pages_total{result}`; в API-то —
  `chatchat_realtime_bus_messages_total{direction,kind}`.
- **Данните на Redis** (`chatchat_redis-data`, AOF) не са в бекъпа: там са само задачи и броячи. Загубата им
  оставя файловете „В опашката“ — след 30 мин. „Повтори“ ги пуска наново (оригиналите са във файловете).
- **OCR пакетите** в `Dockerfile` са заковани по версия (Debian 12): ако Debian публикува поправка и махне
  закованата версия, билдът спира ПРЕДИ смяната (`deploy.sh` → изход 1, работещото не се пипа) — тогава
  новата версия от `apt-cache policy tesseract-ocr poppler-utils` се вписва в `ARG …_VERSION`.
- **Smoke тест на истинския OCR** (не е в gate): `docker build -t chatchat-app . && npm run test:ocr-smoke`
  — пуска образа като в продукция (node, read-only, tmpfs, без мрежа) и разпознава сканиран PDF и PNG.
- **Втора инстанция на API-то:** същият `REDIS_URL`; nginx балансира към двете (SSE работи и през двете —
  събитията се разпращат през Redis, правата се проверяват при изпращане).
