# Деплой — LiftPilot (liftpilot.carbonstealth.eu)

Docker Compose (приложение + PostgreSQL 16) зад nginx на хоста с Let's Encrypt. Цялата сървърна
логика е в `deploy/deploy.sh` (идемпотентен); `deploy/autodeploy.sh` на монорепото го вика, когато
`PROJECTS` съдържа `liftpilot`. Тайните са само на сървъра: `/opt/few-few/shared/liftpilot/.env` (600).

## Докато LiftPilot е само в клона — всяка команда е `REF=<SHA> PROJECTS="liftpilot"`

`main` още няма `liftpilot/` (продуктът е в клона на PR-а). Затова **всяка** команда за деплой тук носи и двете:

- **Без `REF`** `fetch-deploy.sh` сваля `main`: там няма `liftpilot/`, а `autodeploy.sh` на `main` само пише
  „Няма liftpilot/ в архива — пропускам“ и завършва с „Деплой готов“ — нищо не е разгърнато. (От кръг 48
  `autodeploy.sh` в клона спира с грешка, когато `PROJECTS` изрично назовава `liftpilot`, а го няма в архива; но
  скриптът, който тече, е този от сваления архив — с `REF=main` е старият.)
- **Без `PROJECTS`** се разгръща всеки продукт от клона, а `main` е напред с другите (напр. vpsdash v1.14.0) —
  деплоят ги връща назад.

`fetch-deploy.sh` се взима от същия ref (сваля се архив за точния комит, проверява се, че е това репо):

```bash
curl -fsSL https://codeload.github.com/stefkostefko92-ux/Few-few/tar.gz/<SHA> \
  | tar -xz -C /root --strip-components=1 --wildcards '*/deploy/fetch-deploy.sh'
REF=<SHA> PROJECTS="liftpilot" bash /root/deploy/fetch-deploy.sh
```

Щом клонът се влее в `main`, `REF` може да падне; `PROJECTS="liftpilot"` остава, когато се разгръща само LiftPilot.

## Папката на работещия LiftPilot — `/opt/few-few/liftpilot-current`

`docker compose exec` (pdf:keep, legal:notice, engine:notice, възстановяване) иска папката `liftpilot/` на release-а,
от който вървят контейнерите. **Не** `/opt/few-few/current/liftpilot`: `current` сочи последния деплой на който и да е
продукт и след деплой на друг продукт от `main` там `liftpilot/` няма. От кръг 48 `autodeploy.sh` след всеки здрав
деплой на LiftPilot пише пътя в `/opt/few-few/shared/liftpilot/last-good` (предишният — в `last-good.prev`, целта на
връщането) и сменя връзката `/opt/few-few/liftpilot-current`; чистенето на старите releases (`KEEP_RELEASES`) не трие
тези два. Навсякъде долу:

```bash
LP="$(readlink -e /opt/few-few/liftpilot-current)" && cd "$LP"
```

Преди първия деплой с кръг 48 връзката я няма — папката е тази, от която са пуснати контейнерите (етикетът на Compose):

```bash
LP="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' \
  "$(docker ps -q --filter label=com.docker.compose.project=liftpilot --filter label=com.docker.compose.service=app | head -n 1)")" && cd "$LP"
```

Ако и нея вече я няма (изтрита от чистенето): всяка `…/releases/*/*/liftpilot` с `--env-file` — името на проекта на
Compose е по папката (`liftpilot`), значи командите стигат до същите контейнери:
`cd "$(ls -dt /opt/few-few/releases/*/*/liftpilot | head -n 1)" && docker compose --env-file /opt/few-few/shared/liftpilot/.env exec -T app …`.
Командите `docker exec liftpilot-app-1 …` (по името на контейнера) работят от всяка папка.

## Първи деплой (веднъж)

1. **DNS:** A запис `liftpilot.carbonstealth.eu` → IP на VPS-а. Без него приложението тръгва, но само
   на `127.0.0.1:4330`; сертификатът се издава при следващото пускане.
2. **Портът:** `4330` по подразбиране. Провери с `ss -tlnp | grep 4330`; ако е зает, създай
   `/opt/few-few/shared/liftpilot/.env` от `.env.example` с друг `APP_PORT` преди деплоя
   (скриптът и сам спира с ясна грешка, ако портът е зает при първия старт). До кръг 26 портът беше
   `4320`, който сега е на korpora (до 2026-10-07 — rendetto): на сървър, където LiftPilot вече върви, смени `APP_PORT=4320` на
   `4330` в `.env` и пусни деплоя наново (vhost-ът се пише с порта от `.env`) — преди деплоя на korpora.
3. **Поща (Brevo):** SMTP login и SMTP ключ от Brevo (SMTP & API → SMTP); подателят
   (`MAIL_FROM`, по подразбиране `LiftPilot <noreply@carbonstealth.eu>`) трябва да е потвърден в Brevo, а домейнът —
   удостоверен (SPF, DKIM, DMARC — „Поща: SPF, DKIM, DMARC“ по-долу). Изпраща се през `smtp-relay.brevo.com:2525` със
   STARTTLS (VPS-ът блокира 25/465/587). Без тези данни регистрацията и забравената парола стоят затворени
   (страниците го казват), всичко друго работи.
4. **Деплой** в root shell (`sudo -i`; `sudo bash …` губи променливите). Паролите се въвеждат скрито и
   не остават в историята на shell-а. Блокът в `{ … }` се поставя наведнъж: shell-ът го прочита целия,
   преди да зададе първия въпрос, затова следващ ред не попада в поле за парола:
   ```bash
   curl -fsSL https://codeload.github.com/stefkostefko92-ux/Few-few/tar.gz/<SHA> \
     | tar -xz -C /root --strip-components=1 --wildcards '*/deploy/fetch-deploy.sh'
   {
     read -rsp 'Парола на admin@carbonstealth.eu: ' LIFTPILOT_ADMIN_PASSWORD; echo
     read -rp  'Brevo SMTP login: ' LIFTPILOT_SMTP_USER
     read -rsp 'Brevo SMTP ключ: ' LIFTPILOT_SMTP_PASS; echo
     export LIFTPILOT_ADMIN_PASSWORD LIFTPILOT_SMTP_USER LIFTPILOT_SMTP_PASS
     REF=<SHA> PROJECTS="liftpilot" bash /root/deploy/fetch-deploy.sh
     unset LIFTPILOT_ADMIN_PASSWORD LIFTPILOT_SMTP_USER LIFTPILOT_SMTP_PASS
   }
   ```
   Без `LIFTPILOT_ADMIN_PASSWORD` се генерира случайна парола и се отпечатва веднъж. Администраторът
   се създава при първия старт; щом приложението е здраво, `ADMIN_PASSWORD` се изпразва в `.env`.
   Парола под правилото на приложението (12 знака с букви и цифри) работи само за първия вход: веднага
   иска нова. Нова парола по-късно — „Нова парола на администратора“ по-долу.
5. **Вход:** `https://liftpilot.carbonstealth.eu/it/login` с `admin@carbonstealth.eu`.
6. **Фирми:** в бетата регистрацията е само с покана (`REGISTRATION_MODE=invite`, по подразбиране): администраторът
   кани от `/app/admin` → „Inviti alla beta“; линкът отваря регистрацията само за този адрес (потвърждение с линк по
   имейл и паролата). Администраторът може и да създаде фирма с титуляра ѝ („Aziende“), с временна парола, показана
   веднъж. `REGISTRATION_MODE=open` в `.env` + деплой отваря регистрацията за всички (поканите пак работят).

## Всеки следващ деплой

`REF=<SHA> PROJECTS="liftpilot" bash /root/deploy/fetch-deploy.sh` (с `fetch-deploy.sh` от същия ref, по-горе) — без
въпросите (тайните вече са в `.env`). Скриптът: пренася `.env` → `pg_dump` в `/opt/few-few/shared/liftpilot/backups/`
(последните 5; без бекъп няма миграция) → `docker compose build` + `up -d` → миграциите от entrypoint-а (`prisma
migrate deploy`, никога `db push`) → health `/api/health` с маркер `"app":"liftpilot"` → нощно копие на базата
(`deploy/backup.sh` като `/usr/local/sbin/liftpilot-backup`, cron `/etc/cron.d/liftpilot-backup` в 03:17; всяко копие, и
преди деплой, се изтрива на 30 дни — политиката го казва) → nginx vhost (`deploy/nginx/liftpilot.conf`) + certbot →
`autodeploy.sh` записва release-а като последния здрав и мести `/opt/few-few/liftpilot-current`. Смяна на ключа на
Brevo: същата команда с новите `LIFTPILOT_SMTP_USER`/`LIFTPILOT_SMTP_PASS`.

Провал: `autodeploy.sh` излиза с грешка и не мести `current` нито `liftpilot-current`. Ако е след `docker compose up`,
новите контейнери вече вървят (и entrypoint-ът е пуснал миграциите) — виж изхода и „Връщане назад“.

**Имената на миграциите (кръг 30):** папките са `00_…`–`14_…` — с водеща нула, за да ги подрежда Prisma правилно
и в празна база. Entrypoint-ът преди `migrate deploy` пуска `prisma/rename-migrations.sql`, което преименува
приложените стари имена (`0_init`…`9_…`) в таблицата `_prisma_migrations`; идемпотентно, на нова база не прави нищо.

**Нова версия на условията** (`TERMS_VERSION`, `docs/terms-changes.md`): веднага след деплоя
`docker exec liftpilot-app-1 npm run legal:notice` (кой ще получи писмо), после същото с `-- --send`. Без писмото
новата версия не обвързва вече регистрираните фирми. **За версия 3** преди деплоя: изключено проследяване на
отварянията и кликовете в Brevo (текстът го обещава) — подробно в `docs/terms-changes.md`, „Какво още решава
собственикът“.

**Преди деплой, който мени двигател** (кръг 46а): PDF-ът на издаден комплект се рисува при първото сваляне и само
докато двигателите още дават чертежа му — комплект, издаден и несвалян, губи PDF-а си, щом двигател се смени (409).
Затова на работещия release (`cd "$LP"`, по-горе), преди деплоя на двигателите: `docker compose exec -T app npm run
pdf:keep -- --dry-run` (кои ще се нарисуват и кои вече не се възпроизвеждат), после `docker compose exec -T app npm run
pdf:keep` — рисува един по един и пази PDF-а на всеки комплект без запазен PDF, който текущите двигатели още чертаят
(както първото сваляне); другите изброява като `stale` за собственика (нужна е нова ревизия, ако комплектът трябва),
а комплект, който не се рисува по друга причина или се проваля, е с причината на реда си (`failed` → изход 1; обходът
продължава с останалите). Идемпотентно и бързо: втори пробег не рисува нищо. Нищо друго не пише. **Пусни `npm run
pdf:keep` отново точно преди деплоя на release-а, който мени двигател**: комплект, издаден между първия пробег и този
деплой, несвалян и чийто фонов рендер се е отказал (`RendererBusy` — „първото сваляне го пази“), иначе губи PDF-а си при
вдигането на версиите.

**След деплой, който мени двигател — писмото за корекцията** (`npm run engine:notice`, `docs/terms-changes.md` §8):
записите на фирмите, направени с по-стари двигатели, се изчисляват наново и се сравняват с каквото са записали
(присъда, броят провалени и предупреждения, проверките, които са или са били провалени/предупреждения). Фирма с поне
един сменен резултат получава едно писмо до Titolare. На сървъра:

```bash
docker exec liftpilot-app-1 npm run engine:notice > /root/engine-notice-$(date +%Y%m%d).txt   # списъкът, нищо не праща
less /root/engine-notice-$(date +%Y%m%d).txt      # фирма, импианти, elaborati, записите и какво се сменя
docker exec liftpilot-app-1 npm run engine:notice -- --send --motivo "<какво е поправено, на италиански, един ред>"
```

Писмото е веднъж за версиите на четирите двигателя (`ENGINE_NOTICE_SENT` в регистъра на фирмата): повторно пускане
не праща на вече уведомените, а неизпратените (грешка на релея) се пращат при следващото. Без пощенски настройки
`--send` спира, без да праща.

## Кръг 48 — редът на деплоя

Всеки етап — жив и здрав (`/api/health`, вход, едно съоръжение отворено), преди следващия. `<SHA48>` е комитът на
кръг 48 в клона на PR-а.

0. **Проверки преди** (по-долу): има ли `/opt/few-few/shared/liftpilot/backups/pre-22-replacement-ids.txt` (иначе —
   „Id-тата отпреди 22“ сега, докато дъмпът отпреди 22 още е на диска); SPF/DKIM/DMARC за поканите („Поща“);
   наблюдението и сигналът на бекъпа („Наблюдение“) и копието извън сървъра („Копие извън сървъра“) — преди тестерите.
1. **PDF-ите на издадените комплекти, преди двигателите 1.8.0** — на работещия release (връзката я няма още, затова
   `LP` по етикета на Compose, по-горе):
   ```bash
   cd "$LP" && docker compose exec -T app npm run pdf:keep -- --dry-run
   docker compose exec -T app npm run pdf:keep
   ```
2. **Деплоят:** `REF=<SHA48> PROJECTS="liftpilot"` (с `fetch-deploy.sh` от `<SHA48>`). Миграции `23_beta_invites` и
   `24_feedback` са адитивни (нови таблици; нищо съществуващо не се пипа), entrypoint-ът ги пуска. Проверка:
   `curl -fsS http://127.0.0.1:4330/api/health` → `"engine":"1.8.0"`; `readlink -e /opt/few-few/liftpilot-current` →
   папката на новия release; `cat /opt/few-few/shared/liftpilot/last-good`.
3. **`REGISTRATION_MODE`:** по подразбиране `invite` (в `docker-compose.yml`) — регистрираните фирми не са засегнати
   (влизат и работят както досега), нова фирма — само с покана. Тестерите се канят от `/app/admin` → „Inviti alla
   beta“ (адрес + бележка); писмото е `betaInvite`, а линкът се показва и веднъж на екрана, за да се предаде и иначе.
   Преди първата покана — DNS на пощата (т. 0).
4. **Писмото за корекцията в двигателя** (по-горе): `npm run engine:notice` (списъкът), решение на собственика,
   после `-- --send --motivo "…"`. За 1.8.0: двигателят сам не сменя нито една присъда или проверка на записите от
   предишните версии (преизчисление на копието, `argano_r48`: 0 промени — сменя текста на документите: реда „Freno“,
   точките на CE маркировката при модификация, цитата 6.3.3 a)); списъкът показва разликите, натрупани от записи на
   по-стари версии (на копието `argano_r48ops`: 2 фирми, 219 elaborati). Дали да се прати и с какъв текст — решава
   собственикът (`docs/terms-changes.md` §8).

## Нова парола на администратора

`docker-compose.yml` не подава `ADMIN_RESET` на контейнера, а повторен деплой с `LIFTPILOT_ADMIN_PASSWORD` при
съществуващ администратор дава само „admin exists, unchanged“ (`scripts/create-admin.ts`: паролата се сменя само при
`ADMIN_RESET=1`). Затова — направо в контейнера, с паролата прочетена скрито:

```bash
cd "$(readlink -e /opt/few-few/liftpilot-current)"
{
  read -rsp 'Нова парола на admin@carbonstealth.eu: ' P; echo
  docker compose exec -T -e ADMIN_RESET=1 -e ADMIN_PASSWORD="$P" app node_modules/.bin/tsx scripts/create-admin.ts
  unset P
}
```

Отговорът е `admin password reset: admin@carbonstealth.eu`. Сесиите на администратора падат (`tokenVersion`); парола
под правилото (12 знака с букви и цифри) работи само за един вход и после иска нова. Паролата минава като аргумент на
`docker exec` за миг — сървърът е само на root.

## Поща: SPF, DKIM, DMARC

Подателят е `noreply@carbonstealth.eu`, значи удостоверен трябва да е `carbonstealth.eu`. Днес (проверено по DNS):
има само `v=spf1 include:spf.webapps.net ~all` (на Register.it, MX `mail.register.it`); няма запис за Brevo, няма DKIM
на Brevo (`brevo1._domainkey`, `brevo2._domainkey`) и няма `_dmarc`. Без тях писмата за регистрация, покани и нова
парола отиват в спам или Brevo ги отказва — **преди поканите**.

1. Brevo → Senders, Domains & Dedicated IPs → Domains → `carbonstealth.eu` → Authenticate: точните записи (кода
   `brevo-code:…` като TXT, двата DKIM CNAME `brevo1._domainkey` и `brevo2._domainkey`) се копират оттам в DNS на
   домейна (при Register.it). Не ги измисляй — стойностите са на акаунта.
2. **Един SPF запис:** не се добавя втори `v=spf1` (два записа = грешка). Включването на Brevo се добавя в
   съществуващия: `v=spf1 include:spf.webapps.net include:spf.brevo.com ~all` (точното име на include — каквото
   показва Brevo).
3. **DMARC, отначало само наблюдение:** TXT на `_dmarc.carbonstealth.eu`:
   `v=DMARC1; p=none; rua=mailto:<адрес за отчетите>; adkim=r; aspf=r` (адресът — кутия, която някой чете, напр.
   info@). След 2–4 седмици чисти отчети — `p=quarantine`.
4. Проверка (DNS-ът се разпространява до часове):
   ```bash
   dig +short TXT carbonstealth.eu                    # един v=spf1 с двата include + brevo-code
   dig +short CNAME brevo1._domainkey.carbonstealth.eu
   dig +short CNAME brevo2._domainkey.carbonstealth.eu
   dig +short TXT _dmarc.carbonstealth.eu
   ```
   В Brevo домейнът трябва да стане „Authenticated“; после една регистрация с покана към външна кутия — в заглавките
   `dkim=pass`, `spf=pass`, `dmarc=pass`.
5. Проследяването на отварянията и кликовете в Brevo — изключено (политиката обещава писма без пиксели;
   `docs/terms-changes.md`, „Какво още решава собственикът“).

## Наблюдение (vpsdash)

LiftPilot го няма в панела на сървъра (vpsdash): нито проверка на живота, нито аларма за нощния бекъп.

1. **Проверката:** в `/etc/vps-dashboard/config.json` (mode 600 — редакция с root, пази правата) в масива
   `healthChecks` на най-горното ниво добави
   `{"name":"liftpilot","url":"https://liftpilot.carbonstealth.eu/api/health"}` (по домейна — така минава през nginx и
   TLS и се брои в покритието на „Уеб сървър“; по желание и `{"name":"liftpilot-local","url":"http://127.0.0.1:4330/api/health"}`),
   после `systemctl restart vps-dashboard`. Без настроен канал проверката само рисува червено в панела.
2. **Канал за известия:** панелът → „Аларми“ → ntfy (тема) или Telegram (бот + chat id) → „Запази“ → „Тестово
   известие“ (ключовете са `notify.ntfy.topic`, `notify.telegram.botToken`/`chatId`). По желание `alerts.heartbeatUrl` —
   „мъртвешкият ключ“ на самия панел: външен наблюдател, който вдига тревога, щом панелът спре да пинга.
3. **Сигналът на бекъпа:** алармата на vpsdash за възрастта на бекъпа гледа само неговата папка
   (`/opt/few-few/shared/db-dumps`), не `/opt/few-few/shared/liftpilot/backups`. Затова `liftpilot-backup` (`deploy/backup.sh`)
   при успех пинга `LIFTPILOT_BACKUP_HEARTBEAT_URL`, ако е зададен в `/opt/few-few/shared/liftpilot/.env`: направи
   „push“/heartbeat проверка с период 1 ден и толеранс няколко часа (healthchecks.io или Uptime Kuma „Push“ на другия
   VPS) и добави реда
   `LIFTPILOT_BACKUP_HEARTBEAT_URL=https://…` в `.env` (600; приложението не го чете — само скриптът). Тя алармира, ако
   нощното копие не стане (и ако cron изобщо не тръгне). Провал се вижда и тук:
   `journalctl -t liftpilot-backup --since -2d` (причината), а изходът на скрипта е ненулев.

## Копие извън сървъра

Нощните копия на LiftPilot (`/opt/few-few/shared/liftpilot/backups/`) са на същия диск като базата. Едно копие
извън сървъра — **решение на собственика**, едното от двете:

- **vpsdash offsite** (другият VPS през federation, само по https). Нощната снимка на vpsdash (`backups.schedule`,
  включена по подразбиране в 03:00) дъмпва всеки Postgres контейнер, и `liftpilot-db-1`, като
  `/opt/few-few/shared/db-dumps/liftpilot-<час>.sql.gz` (с `--clean --if-exists`); `backups.offsite.enabled: true` ги
  изнася към peer-а. Сроковете: локално vpsdash трие на `-mtime +30` (до ~31 дни) — затова `liftpilot-backup` трие и
  `liftpilot-*.sql.gz` там до 30-ия ден, както своите (`-mtime +28`); на приемника `backups.offsite.keep` (10) пази **по брой**, не по
  възраст: ако изнасянето спре, последните 10 остават завинаги — над 30-те дни на политиката. На приемника — cron:
  `17 4 * * * root find /var/lib/vps-dashboard/offsite -type f -name 'liftpilot-*.sql.gz' -mtime +28 -delete`
  (`/etc/cron.d/liftpilot-offsite-age`). Пробата за възстановяване на vpsdash (`backups.drillEnabled`, на 30 дни)
  проверява снимките му.
- **restic** (S3/B2 в ЕС): `tools/vps/backup-verify.sh` не включва LiftPilot, а неговото `prune` пази месечни снимки 6
  месеца — над 30 дни. За LiftPilot — отделно хранилище и само последното нощно копие всяка нощ:
  `restic backup "$(ls -1t /opt/few-few/shared/liftpilot/backups/nightly-*.sql.gz | head -n 1)" --tag liftpilot`, после
  `restic forget --tag liftpilot --keep-within 29d --prune` (снимка на цялата папка би пазила 29-дневни дъмпове още 29 дни).

**Една проба за възстановяване** от отдалеченото копие (в отделна база, не в живата):

```bash
cd "$(readlink -e /opt/few-few/liftpilot-current)"
docker compose exec -T db createdb -U liftpilot restore_test
gunzip -c <копието>.sql.gz | docker compose exec -T db psql -q -v ON_ERROR_STOP=1 --single-transaction -U liftpilot -d restore_test
docker compose exec -T db psql -U liftpilot -d restore_test -Atc 'SELECT count(*) FROM "Project"'
docker compose exec -T db dropdb -U liftpilot restore_test
```

## Проверка

```bash
curl -fsS http://127.0.0.1:4330/api/health          # {"status":"ok","app":"liftpilot","engine":"…",…,"db":"ok"}
curl -fsSI https://liftpilot.carbonstealth.eu/it | head -5
cd "$(readlink -e /opt/few-few/liftpilot-current)" && docker compose ps && docker compose logs --tail 50 app
```

## Връщане назад

- **Код:** предишният здрав release е в `last-good.prev` (кръг 48 нататък); `autodeploy.sh` от текущия release го
  разгръща без архив и записва паметта наново:
  ```bash
  PREV="$(dirname "$(head -n 1 /opt/few-few/shared/liftpilot/last-good.prev)")"
  sudo RELEASE_DIR="$PREV" PROJECTS="liftpilot" bash "$(readlink -e /opt/few-few/liftpilot-current)/../deploy/autodeploy.sh"
  ```
  `last-good.prev` има след втория здрав деплой с `autodeploy.sh` от кръг 48 нататък; дотогава `RELEASE_DIR` е папката
  на предишния release (`ls -dt /opt/few-few/releases/*/*/liftpilot`, без `/liftpilot` накрая). Миграциите от 23 нататък
  са адитивни: старият код върви с базата (`migrate deploy` на код без 23/24 срещу база с тях: „No pending
  migrations“ — пробвано така за 22).
- **База** — само ако данните трябва да се върнат (обикновено стига кодът). Дъмповете са без `--clean`: налят в живата,
  непразна база, psql без `ON_ERROR_STOP` продължава след всяка грешка и излиза с 0 — получава се слята, наполовина
  върната база, която изглежда успешна. Затова — в празна база, наведнъж:
  ```bash
  cd "$(readlink -e /opt/few-few/liftpilot-current)"
  B=/opt/few-few/shared/liftpilot/backups
  DUMP="$B/pre-deploy-<TS>.sql.gz"            # или $B/nightly-<YYYYMMDD>.sql.gz
  gunzip -t "$DUMP"                            # архивът е цял
  # 1) свеж дъмп на сегашното състояние (ако трябва да се върнеш и от връщането)
  (umask 077; docker compose exec -T db pg_dump -U liftpilot liftpilot | gzip > "$B/before-restore-$(date -u +%Y%m%d-%H%M%S).sql.gz")
  # 2) приложението спира (базата остава)
  docker compose stop app
  # 3) празна база (ако dropdb каже, че базата се ползва: dropdb --force)
  docker compose exec -T db dropdb -U liftpilot liftpilot
  docker compose exec -T db createdb -U liftpilot liftpilot
  # 4) възстановяване: спира при първата грешка, една транзакция — всичко или нищо
  gunzip -c "$DUMP" | docker compose exec -T db psql -q -v ON_ERROR_STOP=1 --single-transaction -U liftpilot -d liftpilot
  # 5) приложението (entrypoint-ът пуска миграциите, които дъмпът няма) и проверка
  docker compose start app
  curl -fsS http://127.0.0.1:4330/api/health
  ```
  Ако т. 4 спре с грешка, базата е празна (транзакцията се връща цяла): т. 3–4 със свежия `before-restore-…`.
  Пробвано на копие (`argano_r48ops` → нова празна база с тези флагове: всичките 28 таблици с еднакъв брой редове,
  тригерите също; същият дъмп в непразна база — с флаговете спира с код 3 и не пише нищо, без тях — 243 грешки и код 0).
  Дъмп отпреди 22 с код след 22: entrypoint-ът прилага 22 наново (колоната `kind` пада) — за връщане отпреди 22 виж
  „Връщане след 22“.

## Кръг 47 — миграция 22, отделен release

(`22_drop_project_kind`: колоната `Project.kind`, индексът ѝ и enum-ът `ProjectKind` падат — първата разрушителна
миграция.) Редът, всеки етап — жив и здрав (`/api/health`, вход, едно съоръжение отворено), преди следващия.
SHA-тата са на клона на PR-а (`efa56c45f` — подготовката за D3, върху поправките след прегледа, след повторната
проверка и след последната сверка; клонът се влива без пренареждане):

1. 46а — `REF=d54580b14 PROJECTS="liftpilot"` и двете `pdf:keep` (по-горе). Release-ът на 46а е комитът `d54580b14` —
   `b37c9bf92` с поправката на скрипта, без нито един двигател (в историята двата комита са първи, двигателите — след
   тях; комитът е в качения клон, затова `fetch-deploy.sh` го сваля по SHA).
2. Release-ът на двигателите — кръг 46 B с кръг 47 D1, D2 и подготовката за D3 (`Project.kind @ignore`: клиентът вече
   не назовава колоната в нито една заявка, и в INSERT): `pdf:keep` още веднъж, после
   `REF=efa56c45f PROJECTS="liftpilot" bash /root/deploy/fetch-deploy.sh`. Без миграция.
3. Преди 22 — id-тата на съоръженията с `REPLACEMENT` в отделен файл (нужни са само за връщане по-назад от т. 2):
   `cd "$LP" && (umask 077; docker compose exec -T db psql -U liftpilot liftpilot -Atc "SELECT id FROM \"Project\" WHERE
   kind = 'REPLACEMENT' ORDER BY id" > /opt/few-few/shared/liftpilot/backups/pre-22-replacement-ids.txt)`.
   Този файл е трайното копие: `pre-deploy-<TS>.sql.gz` на `deploy.sh` също ги има, но `deploy.sh` пази само
   последните 5 дъмпа, а нощният `liftpilot-backup` (`BACKUP_DAYS` = 30) трие всеки `.sql.gz` в папката на 30 дни, и
   `pre-deploy-*`. Файлът не е `.sql.gz` — нито ротацията на `deploy.sh`, нито нощното чистене го трият.
4. Миграция 22 — комитът на D3 (последният комит на кръг 47): `REF=b8cf6ac69 PROJECTS="liftpilot" bash
   /root/deploy/fetch-deploy.sh`; entrypoint-ът я пуска с `migrate deploy` (бекъп преди нея — както винаги).
   Заключването е за миг (`DROP COLUMN` не пренаписва таблицата).

**Id-тата отпреди 22, ако файлът от т. 3 липсва** (`ls -l /opt/few-few/shared/liftpilot/backups/pre-22-replacement-ids.txt`).
Публичните файлове на продукцията носят времето на комита на 22, т.е. production най-вероятно вече е след 22 — тогава
id-тата са само в `pre-deploy-<TS>.sql.gz`, направен точно преди 22 (най-новият с дата преди деплоя на `b8cf6ac69`), а той
изтича: след още 5 деплоя (ротацията) или на 30 дни (нощното чистене). Извличане във временна база, сега:

```bash
cd "$LP"
D=/opt/few-few/shared/liftpilot/backups/pre-deploy-<TS>.sql.gz    # дъмпът точно преди 22
docker compose exec -T db createdb -U liftpilot tmp22
gunzip -c "$D" | docker compose exec -T db psql -q -v ON_ERROR_STOP=1 --single-transaction -U liftpilot -d tmp22
(umask 077; docker compose exec -T db psql -U liftpilot -d tmp22 -Atc "SELECT id FROM \"Project\" WHERE kind = 'REPLACEMENT' ORDER BY id" \
  > /opt/few-few/shared/liftpilot/backups/pre-22-replacement-ids.txt)
docker compose exec -T db dropdb -U liftpilot tmp22
wc -l /opt/few-few/shared/liftpilot/backups/pre-22-replacement-ids.txt
```

Пробвано с дъмпа отпреди 22 на копието: 33 id-та, същите като файла, взет преди миграцията (`cmp` — еднакви).
Колоната `kind` в дъмпа значи, че е отпреди 22; ако `SELECT` каже „column kind does not exist“ — дъмпът е след 22,
вземи по-стар. Копирай файла и извън сървъра.

**Връщане след 22.** До release-а от т. 2 — само кодът (`RELEASE_DIR=<release от т. 2>`): той не назовава колоната никъде
(проба на `argano_r47` след миграцията: create/update/updateMany — наред). Release отпреди т. 2 (кръгове 45–46 — с
глобалния `omit`, който пак пише `kind` във всеки INSERT; или по-стар) не може да създаде съоръжение без колоната
(„The column `kind` does not exist“) — първо колоната, после кодът: заявките от коментара на `migration.sql` (enum-ът,
колоната `NOT NULL DEFAULT 'FULL'`, `REPLACEMENT` по id-тата от т. 3, индексът, редът в `_prisma_migrations`) в една
транзакция. Пробвано на копие: 39 `REPLACEMENT` / 348 `FULL` — както преди миграцията, `migrate diff` срещу схемата с
`@ignore` — празен, клиентът на кръг 46 създава съоръжение.

## Публично пускане (след съгласуване и разрешения)

Докато не е одобрено, търсачките са спрени (`ALLOW_INDEXING=false`: `robots.txt` Disallow, `noindex`).
След одобрение: `ALLOW_INDEXING=true` в `.env` и деплой; за Google — Search Console (`tools/seo/gsc.mjs`).
IndexNow (Bing, Yandex, Seznam…): ключът е в `public/indexnow-key.txt` и сайтът го публикува на
`/indexnow-key.txt`; след одобрението и деплоя —
`node tools/seo/indexnow.mjs https://liftpilot.carbonstealth.eu --key-location https://liftpilot.carbonstealth.eu/indexnow-key.txt`
(и след всяка промяна в публичните страници). `robots.txt` тогава пуска търсачките и AI търсачките (OAI-SearchBot,
Claude-SearchBot, PerplexityBot, Meta-WebIndexer…) и спира ботовете за обучение на модели (GPTBot, ClaudeBot, CCBot,
Google-Extended, Applebot-Extended, meta-externalagent, Bytespider) — `src/app/robots.ts`.
