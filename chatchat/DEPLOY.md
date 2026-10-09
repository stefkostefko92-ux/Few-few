# ChatChat — разгръщане в продукция

Модел: Docker Compose на VPS-а — **db** (PostgreSQL 16 + pgvector), **clamav** (антивирус за прикачените
файлове) и **app** — с nginx на хоста и Let's Encrypt. Приложението слуша само на `127.0.0.1:4330`;
базата и антивирусът нямат публикуван порт (базата е само във вътрешната мрежа на проекта). Тайните са
в `/opt/few-few/shared/chatchat/.env` (mode 600), никога в репото или в архива.

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

Четирите са различни. Ако `ATTACHMENT_URL_KEY` или `MFA_ENC_KEY` липсват, `deploy.sh` ги генерира сам
(само тях, само ако ги няма, никога не ги презаписва и не ги печата) и казва това — **копирай `.env`
и извън сървъра** (password manager): без `MFA_ENC_KEY` бекъпът на базата не връща MFA.

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

1. `.env` от `/opt/few-few/shared/chatchat/.env` (няма го → изход 3); липсващите F2 ключове (т. 1);
   папката `attachments/` (uid 1000, mode 700); папката `eval-reports/` (755, монтирана само за четене);
   `clamd.conf` от репото на стабилния път.
2. `docker compose build app`; образите на db и clamav се теглят **само ако ги няма** (по digest).
3. **Бекъп на базата преди миграцията** (`shared/chatchat/backups/pre-deploy-<час>.sql.gz`, последните 5)
   — без валиден дъмп няма миграция (изход 1).
4. Еднократно: базата на pgvector + `REINDEX` (т. 11).
5. `docker compose up -d` — entrypoint-ът чака базата и пуска `prisma migrate deploy` (**никога**
   `db push`), после `node dist/index.js`.
6. Чака `http://127.0.0.1:4330/readyz` да върне `{"ok":true,"ai":…}` (до `CHATCHAT_HEALTH_WAIT`, 120 s).
   Не → изход 4 и autodeploy вдига предишния release.
7. Записва `shared/chatchat/last-good`; слага таймерите за бекъпа и ретенцията (т. 9); vhost-а (т. 2).

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
администраторът на данните го е определил. Изтритото остава в бекъпите до тяхната ротация (≤ 8 седмици).

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
