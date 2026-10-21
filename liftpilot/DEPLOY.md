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
продукт и след деплой на друг продукт от `main` там `liftpilot/` няма. От кръг 48 `autodeploy.sh` **на клона** след
всеки здрав деплой на LiftPilot пише пътя в `/opt/few-few/shared/liftpilot/last-good` (предишният здрав — в
`last-good.prev`) и сменя връзката `/opt/few-few/liftpilot-current`; неговото чистене на старите releases
(`KEEP_RELEASES`) пази трите (last-good, `.prev` и целта на връзката). **`main` тази защита я няма** — виж следващия
раздел. Навсякъде долу:

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

### Деплой на друг продукт от `main` трие папката на LiftPilot (докато клонът не е влят)

Деплой на друг продукт с `main` (`fetch-deploy.sh` без `REF`; или панелът vpsdash, когато `current` е release от
`main` — панелът пуска `autodeploy.sh` от `current`) върви със **скрипта на `main`**: неговото чистене пази само последните `KEEP_RELEASES` (5) releases,
`current` и паметта на Korpora — **не** и LiftPilot. След пет такива деплоя папката на работещия LiftPilot е изтрита и
`liftpilot-current` виси (проверено със симулация и с теста `tools/vps/autodeploy-liftpilot.test.mjs`). Контейнерите
продължават да вървят (томът на базата е именуван, nginx и cron са извън release-а); губят се командите от папката
(`docker compose exec`, pdf:keep, възстановяването) и връщането назад от диска.

- **Всеки деплой от `main`, докато клонът не е влят:** с `KEEP_RELEASES=50` (`fetch-deploy.sh` го подава на
  `autodeploy.sh`): `KEEP_RELEASES=50 PROJECTS="<продукт>" bash /root/deploy/fetch-deploy.sh`. Мястото на диска:
  `du -sh /opt/few-few/releases`; изтрий ръчно стари releases, които не са нито `last-good`, нито `last-good.prev`.
  От панела vpsdash `KEEP_RELEASES` не се задава — до вливането деплоите на другите продукти са от командния ред.
- **След всеки деплой на друг продукт** — проверка:
  ```bash
  readlink -e /opt/few-few/liftpilot-current || echo 'liftpilot-current виси'
  for f in last-good last-good.prev; do d="$(head -n 1 /opt/few-few/shared/liftpilot/$f 2>/dev/null)"; [ -d "$d" ] && echo "$f: $d" || echo "$f: ЛИПСВА ($d)"; done
  ```
- **Ако виси:** папката се връща с деплой на същия комит, който работи (`REF=<SHA> PROJECTS="liftpilot"` с
  `fetch-deploy.sh` от него — нов release от архива, бекъп преди миграциите, кратък рестарт; SHA-то е в името на
  архива в `/root`, `few-few-<SHA>-<час>.tar.gz`, `fetch-deploy.sh` пази последните два — записвай го при всеки деплой).
  Връщане към release, чиято папка е изтрита: същото с `REF=<SHA на целта>` („Връщане назад“).

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
   имейл и паролата). **Покана — само при писмена молба** на човека (имейл до info@ — така казва и страницата на регистрацията): писмото с
   поканата рекламира услугата, а търговско писмо без поискване до италиански адрес иска съгласие (art. 130 d.lgs.
   196/2003). В бележката на поканата — препратка към молбата (дата и тема, напр. „richiesta e-mail del 12/10/2026“);
   молбата остава в досието. Администраторът може и да създаде фирма с титуляра ѝ („Aziende“), с временна парола, показана
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

Всеки етап — жив и здрав (`/api/health`, вход, едно съоръжение отворено), преди следващия. SHA-то на кръг 48 е `4215e1f67` —
последният комит на кода на кръг 48 в клона на PR-а (следващите комити на клона са само документи и дават същия release).

0. **Проверки преди** (по-долу): `[ -s /opt/few-few/shared/liftpilot/backups/pre-22-replacement-ids.txt ] && wc -l
   /opt/few-few/shared/liftpilot/backups/pre-22-replacement-ids.txt` — файлът е и не е празен (празен или липсващ —
   „Id-тата отпреди 22“ сега, докато дъмпът отпреди 22 още е на диска); SPF/DKIM/DMARC за поканите („Поща“);
   наблюдението и сигналът на бекъпа („Наблюдение“) и копието извън сървъра („Копие извън сървъра“) — преди тестерите;
   регистрациите, които чакат потвърждение (кой е писал, преди поканите):
   `docker exec liftpilot-db-1 psql -U liftpilot -d liftpilot -Atc 'SELECT email, "createdAt" FROM "PendingRegistration" WHERE "expiresAt" > now()'`
   — след деплоя линкът им не прави фирма (т. 3).
1. **PDF-ите на издадените комплекти, преди двигателите 1.8.0** — на работещия release (връзката я няма още, затова
   `LP` по етикета на Compose, по-горе):
   ```bash
   cd "$LP" && docker compose exec -T app npm run pdf:keep -- --dry-run
   docker compose exec -T app npm run pdf:keep
   ```
2. **Деплоят:** `REF=4215e1f67 PROJECTS="liftpilot"` (с `fetch-deploy.sh` от `4215e1f67`). Миграциите `23_beta_invites`,
   `24_feedback` и `25_clauses_write_key` са адитивни, entrypoint-ът ги пуска: 23 — нова таблица `BetaInvite` и нова
   nullable колона `betaInviteId` в `PendingRegistration` (с външен ключ); 24 — нова таблица `Feedback` (и enum-ът
   `FeedbackKind`); 25 — nullable
   колони `User.clausesApprovedAt` и `Scheda.writeKey` и уникален индекс `(companyId, writeKey)` (всички съществуващи
   редове са `NULL` — без конфликт). Никоя не трие и не пренаписва данни; старият код върви с тях („Връщане назад“).
   Проверка: `curl -fsS http://127.0.0.1:4330/api/health` → `"engine":"1.8.0"`; `readlink -e
   /opt/few-few/liftpilot-current` → папката на новия release; `cat /opt/few-few/shared/liftpilot/last-good`.
3. **`REGISTRATION_MODE`:** по подразбиране `invite` (в `docker-compose.yml`) — регистрираните фирми не са засегнати
   (влизат и работят както досега), нова фирма — само с покана. **Регистрация, подадена преди деплоя без покана и още
   непотвърдена** (списъкът от т. 0), вече не прави фирма: линкът ѝ казва, че регистрацията е с покана, и нищо не се
   използва (`verifyEmailAction` — `registrationInviteOnly`); при писмена молба такъв човек получава покана. Тестерите се
   канят от `/app/admin` → „Inviti alla beta“ (адрес + бележка с препратка към писмената молба — „Първи деплой“, т. 6);
   писмото е `betaInvite`, а линкът се показва и веднъж на екрана, за да се предаде и иначе. Преди първата покана — DNS
   на пощата (т. 0).
   **Клаузите — веднъж:** собственик, приел действащите условия (v5) с отметка преди кръг 48, няма одобрение на клаузите
   по чл. 1341–1342 c.c. с паролата (`User.clausesApprovedAt` е `NULL`): приложението му го иска **веднъж** — лента и
   кратката форма на `/app/terms`, без да спира работата; записът е `CLAUSES_APPROVED` в регистъра (`docs/terms-changes.md`
   §1в). Собственик, още на по-стара версия, ги одобрява с приемането на v5. Колко остават (на v5 без одобрение):
   `docker exec liftpilot-db-1 psql -U liftpilot -d liftpilot -Atc "SELECT count(*) FROM \"User\" WHERE role = 'OWNER' AND active AND \"termsVersion\" = '5' AND \"clausesApprovedAt\" IS NULL"`.
4. **Писмото за корекцията в двигателя** (по-горе): `npm run engine:notice` (списъкът), решение на собственика,
   после `-- --send --motivo "…"`. За 1.8.0: двигателят сам не сменя нито една присъда или проверка на записите от
   предишните версии (преизчисление на копието, `argano_r48`: 0 промени — сменя текста на документите: реда „Freno“,
   точките на CE маркировката при модификация, цитата 6.3.3 a)); списъкът показва разликите, натрупани от записи на
   по-стари версии (на копието `argano_r48ops`: 2 фирми, 219 elaborati). **Ред от списъка, в който присъда или
   проверка минава от OK/WARN към провал, прави писмото задължително** — праща се веднага след деплоя; собственикът
   решава само текста на `--motivo` и дали да прати, когато провал няма (`docs/terms-changes.md` §8).

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
  `liftpilot-*.sql.gz` там до 30-ия ден, както своите (`-mtime +28`). **На приемника** копията са в
  `/var/lib/vps-dashboard/offsite/<nodeId>/` (`<nodeId>` — `nodeId` от конфигурацията на изпращащия панел;
  `vpsdash/src/backupsched.js`, `offsiteDir`, `receiveOffsite`), а `backups.offsite.keep` (по подразбиране 10, в
  конфигурацията **на приемника**) е **общ брой за всички файлове на този възел** — всички бази, SQLite и томове, не 10
  копия на LiftPilot: при ~10 файла на нощ от възела там остава само последната нощ. Размер: `keep` ≥ файловете на
  една нощ от възела × нощите, които искаш (`ls /var/lib/vps-dashboard/offsite/<nodeId>/ | wc -l` след една нощ, при
  `keep`, по-голям от тях). И `keep` пази **по брой**, не по възраст: ако изнасянето спре, последните остават завинаги —
  над 30-те дни на политиката. Затова на приемника — cron по възраст:
  `17 4 * * * root find /var/lib/vps-dashboard/offsite -type f -name 'liftpilot-*.sql.gz' -mtime +28 -delete`
  (`/etc/cron.d/liftpilot-offsite-age`). Пробата за възстановяване на vpsdash (`backups.drillEnabled`, на 30 дни)
  проверява снимките му.
- **restic** (S3/B2 в ЕС): `tools/vps/backup-verify.sh` не включва LiftPilot, а неговото `prune` пази месечни снимки 6
  месеца — над 30 дни. За LiftPilot — отделно хранилище и само последното нощно копие всяка нощ:
  `restic backup "$(ls -1t /opt/few-few/shared/liftpilot/backups/nightly-*.sql.gz | head -n 1)" --tag liftpilot`, после
  `restic forget --tag liftpilot --keep-within 29d --prune` (снимка на цялата папка би пазила 29-дневни дъмпове още 29 дни).
  **`--keep-within` брои от най-новата снимка, не от днес** (документацията на restic): ако нощното `restic backup` спре,
  снимките от последните 29 дни преди спирането остават завинаги. Затова отделно, по възраст спрямо днес — скрипт
  `/usr/local/sbin/liftpilot-restic-age` от cron всяка нощ (средата на restic — `RESTIC_REPOSITORY`, паролата — както за
  `restic backup`; `python3` чете JSON-а):
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  # snapshots of LiftPilot older than 29 days by the calendar, whatever the newest one is
  ids="$(restic snapshots --tag liftpilot --json | python3 -c 'import json,sys; c=sys.argv[1]; print(" ".join(s["id"] for s in json.load(sys.stdin) if s["time"][:10] < c))' "$(date -u -d '29 days ago' +%F)")"
  [ -z "$ids" ] || restic forget --prune $ids
  ```
  (Изборът по дата е пробван с примерен JSON; самият restic тук не е пробван — няма го на машината за разработка.) И
  наблюдение: ако `restic backup` не мине, сигнал (както `LIFTPILOT_BACKUP_HEARTBEAT_URL` по-горе).

**Една проба за възстановяване** от отдалеченото копие (в отделна база, не в живата). Копието първо се пренася на
сървъра: при vpsdash — от приемника (другия VPS), напр. `scp root@<приемник>:/var/lib/vps-dashboard/offsite/<nodeId>/liftpilot-<час>.sql.gz /root/`;
при restic — `restic restore <снимка> --target /root/restore-test` (пътят вътре е пълният път на нощното копие). После:

```bash
cd "$(readlink -e /opt/few-few/liftpilot-current)"
docker compose exec -T db createdb -U liftpilot restore_test
gunzip -c <копието>.sql.gz | docker compose exec -T db psql -q -v ON_ERROR_STOP=1 --single-transaction -U liftpilot -d restore_test
docker compose exec -T db psql -U liftpilot -d restore_test -Atc 'SELECT count(*) FROM "Project"'
docker compose exec -T db dropdb -U liftpilot restore_test
rm -rf <копието>.sql.gz /root/restore-test     # пренесеното копие не остава на сървъра извън 30-те дни
```

## Проверка

```bash
curl -fsS http://127.0.0.1:4330/api/health          # {"status":"ok","app":"liftpilot","engine":"…",…,"db":"ok"}
curl -fsSI https://liftpilot.carbonstealth.eu/it | head -5
cd "$(readlink -e /opt/few-few/liftpilot-current)" && docker compose ps && docker compose logs --tail 50 app
```

## Връщане назад

**Първо — къде си** (кой release е последният здрав, кой е предишният, от коя папка вървят контейнерите):

```bash
cat /opt/few-few/shared/liftpilot/last-good /opt/few-few/shared/liftpilot/last-good.prev
cat /opt/few-few/shared/liftpilot/last-good.rolled-back-from 2>/dev/null   # има го само след връщане
readlink -e /opt/few-few/liftpilot-current
docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' liftpilot-app-1
```

Папките са `…/releases/<час>/<корен>/liftpilot`; `RELEASE_DIR` е папката **без** `/liftpilot` накрая. Командата е
`autodeploy.sh` на `liftpilot-current` (последният здрав — най-новият скрипт), не на целта.

- **Код — деплоят се провали** (`autodeploy.sh` излезе с грешка): `last-good` и `liftpilot-current` **не са мръднали** —
  сочат последния здрав release. Ако `working_dir` от `docker inspect` е друг (провал след `docker compose up`, напр.
  на здравната проверка: вървят новите контейнери), разгърни **last-good** — не `.prev`, той е с още една версия назад:
  ```bash
  PREV="$(dirname "$(head -n 1 /opt/few-few/shared/liftpilot/last-good)")"
  sudo RELEASE_DIR="$PREV" PROJECTS="liftpilot" bash "$(readlink -e /opt/few-few/liftpilot-current)/../deploy/autodeploy.sh"
  ```
  Ако `working_dir` е самият last-good (провал преди `up`, напр. на build), предишният код още върви — няма какво да
  се връща.
- **Код — деплоят беше здрав, но новият код е лош** (`last-good` вече е новият): целта е `last-good.prev`:
  ```bash
  PREV="$(dirname "$(head -n 1 /opt/few-few/shared/liftpilot/last-good.prev)")"
  sudo RELEASE_DIR="$PREV" PROJECTS="liftpilot" bash "$(readlink -e /opt/few-few/liftpilot-current)/../deploy/autodeploy.sh"
  ```
  След връщането `last-good` е PREV, `.prev` **остава** същият (връщането с `RELEASE_DIR` не го пренаписва), а лошият
  е записан в `last-good.rolled-back-from`; следващ обикновен деплой го маха. **Не пускай командата за връщане втори
  път**: с `autodeploy.sh` от кръг 48 тя само разгръща PREV наново, а с по-стар — `.prev` вече е лошият и тя го връща.
  Още стъпка назад: папката — сам, от `ls -dt /opt/few-few/releases/*/*/liftpilot`.
- `last-good.prev` има след втория здрав деплой с `autodeploy.sh` от кръг 48 нататък; дотогава `RELEASE_DIR` е папката
  на предишния release (`ls -dt /opt/few-few/releases/*/*/liftpilot`). **Папката на целта е изтрита** (чистенето на
  `main` — „Деплой на друг продукт от `main`“): `REF=<SHA на целта> PROJECTS="liftpilot" bash /root/deploy/fetch-deploy.sh`
  (с `fetch-deploy.sh` от същия SHA) — нов release от архива, с бекъп преди миграциите.

**Преди връщане към по-стар код — какво носи то:**

1. **Миграциите 23–26 са адитивни:** старият код върви с базата — `migrate deploy` на кода на кръг 47 срещу копие с 23
   и 24: „No pending migrations to apply“ (пробвано при прегледа на кръг 48; така и за 22). За 25 — по построение
   (две nullable колони, които старият клиент не чете, и уникален индекс, в който старият код пише само `NULL`);
   не е пробвано. За 26 (`26_rilievi_sync_2`: енум и 33 колони, NULL или празен списък) — пробвано в кръг 49: клиентът
   на Prisma от схемата на кръг 48 на копие на `argano_visual` (`argano_r49`) преди и след 26 чете всичките 215 карти със
   същия отпечатък `2995daa5c76ba085` и записва, променя и трие карта по старата форма. **След връщане към кръг 48 не
   редактирай карти с марка на таблото Mastech, записани от кръг 49:** старият код не пита „Ordine quadro“ при Mastech и
   при запис изпразва `quadroOrdine` и поръчката (`ordineQuadro` става NULL); новите колони оцеляват, защото старият код
   не ги пише.
2. **Двигателите:** връщане към release с други версии на двигателите (отпреди кръг 48 — 1.7.x) прави комплект, издаден
   под сегашните и още несвален, без PDF (409 — същото като „Преди деплой, който мени двигател“, в обратна посока).
   Затова преди връщането, на текущия release: `cd "$(readlink -e /opt/few-few/liftpilot-current)" && docker compose
   exec -T app npm run pdf:keep`.
3. **Регистрацията:** release отпреди кръг 48 няма `REGISTRATION_MODE` — регистрацията е **отворена за всеки**. Затваря се
   само с празен `SMTP_HOST`: старото `smtpConfigured()` иска само `SMTP_HOST` и `MAIL_FROM` (без `SMTP_USER`/`SMTP_PASS`
   пощата пак се брои за настроена — регистрацията остава отворена, а писмата тихо падат в Brevo). В
   `/opt/few-few/shared/liftpilot/.env` (600) редът става `SMTP_HOST=` (празен ред, не изтрит: деплой с
   `LIFTPILOT_SMTP_*` слага стойността по подразбиране само на липсващ ред), после
   `cd "$(readlink -e /opt/few-few/liftpilot-current)" && install -m 600 /opt/few-few/shared/liftpilot/.env .env && docker compose up -d app`.
   Това спира и „забравена парола“ и всяко писмо за всички. Обратно: `SMTP_HOST=smtp-relay.brevo.com` и същата команда.
   По-просто — по време на бетата не се връщай отпреди кръг 48.
4. **`current` също се мести** — `autodeploy.sh` го насочва към release-а на връщането (а vpsdash взима
   `autodeploy.sh` от `current`); следващият деплой от правилния ref го оправя.

**База** — само ако данните трябва да се върнат (обикновено стига кодът). Дъмповете са без `--clean`: налят в живата,
непразна база, psql без `ON_ERROR_STOP` продължава след всяка грешка и излиза с 0 — получава се слята, наполовина
върната база, която изглежда успешна. Затова — в празна база, наведнъж. Блокът е в `( … )`: поставен в shell-а, той се
прочита цял, `set -o pipefail` важи само вътре, а всяка разрушителна стъпка е в условие — интерактивният shell няма
`set -e` и иначе следващият ред (`dropdb`) върви и след провал. Нищо не се трие, преди и дъмпът, и свежото копие на
сегашното състояние да са **цели** (`gzip -t` доказва само архива; цял е дъмпът, чиито последни редове носят знака на
`pg_dump` за край — на `pg_dump` 16.13 последният ред е `\unrestrict …`, затова се гледат последните 8):

```bash
( set -o pipefail
  # дъмпът е цял, когато последните му редове носят знака на pg_dump за край (gzip -t доказва само архива)
  whole() { gunzip -t "$1" && gunzip -c "$1" | tail -n 8 | grep -qx -- '-- PostgreSQL database dump complete'; }
  LP="$(readlink -e /opt/few-few/liftpilot-current)" && cd "$LP" || exit 1
  B=/opt/few-few/shared/liftpilot/backups
  DUMP="$B/pre-deploy-<TS>.sql.gz"            # или $B/nightly-<YYYYMMDD>.sql.gz
  NOW="$B/before-restore-$(date -u +%Y%m%d-%H%M%S).sql.gz"
  # 1) дъмпът е цял, после свеж дъмп на сегашното състояние — и той цял (за връщане от връщането)
  if whole "$DUMP" \
    && (umask 077; docker compose exec -T db pg_dump -U liftpilot liftpilot | gzip > "$NOW") \
    && whole "$NOW"; then
    # 2) приложението спира, 3) празна база, 4) възстановяване — всяка стъпка само ако предишната е минала
    if docker compose stop app \
      && docker compose exec -T db dropdb -U liftpilot liftpilot \
      && docker compose exec -T db createdb -U liftpilot liftpilot \
      && gunzip -c "$DUMP" | docker compose exec -T db psql -q -v ON_ERROR_STOP=1 --single-transaction -U liftpilot -d liftpilot; then
      # 5) приложението (entrypoint-ът пуска миграциите, които дъмпът няма) и проверка
      docker compose start app
      for i in $(seq 30); do curl -fsS http://127.0.0.1:4330/api/health && break; sleep 2; done
    else
      echo "СТОП: възстановяването спря — приложението е спряно; свежото копие: $NOW"
    fi
  else
    whole "$NOW" 2>/dev/null || rm -f "$NOW"
    echo "СТОП: дъмпът или свежото копие не е цял — базата не е пипана"
  fi
)
```

- **„СТОП: дъмпът или свежото копие не е цял“** — нищо не е пипано (приложението върви); избери друг дъмп или виж защо
  `pg_dump` пада.
- **„СТОП: възстановяването спря“** — приложението е **спряно** и не се пуска (иначе entrypoint-ът прави празна схема в
  празната база). Ако е спряло на `dropdb` („базата се ползва“ — напр. снимката на vpsdash): същият блок с `dropdb
  --force`. Ако е спряло на т. 4: базата е празна (транзакцията се връща цяла) — същият блок с `DUMP=` свежото копие
  от съобщението връща състоянието отпреди.

Пробвано (кръг 48, след прегледа) с точно този блок върху временни бази (`r48d_*`, после изтрити), с `docker` заглушен
към локалния PostgreSQL 16.13: отрязан дъмп → стоп, базата непипната; провален `pg_dump` → стоп, базата непипната, без
остатъчен файл; провал на т. 4 → стоп, приложението не е пуснато, базата празна; повторно пускане със свежото копие →
базата се върна; успешно възстановяване → данните на дъмпа (396 проекта), таблица, добавена след дъмпа — няма я.
По-рано (кръг 48): `argano_r48ops` → нова празна база с тези флагове: всичките 28 таблици с еднакъв брой редове,
тригерите също; същият дъмп в непразна база — с флаговете спира с код 3 и не пише нищо, без тях — 243 грешки и код 0.
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
3. Преди 22 — id-тата на съоръженията с `REPLACEMENT` в отделен файл (нужни са само за връщане по-назад от т. 2).
   Първо във `.tmp`; на мястото — само ако заявката е минала и файлът не е празен (пренасочването създава файла, преди
   `psql` да се провали — иначе остава празен файл, който изглежда като готов):
   ```bash
   F=/opt/few-few/shared/liftpilot/backups/pre-22-replacement-ids.txt
   cd "$LP" && (umask 077; docker compose exec -T db psql -U liftpilot -d liftpilot -Atc "SELECT id FROM \"Project\" WHERE kind = 'REPLACEMENT' ORDER BY id" > "$F.tmp") \
     && [ -s "$F.tmp" ] && mv "$F.tmp" "$F" || { rm -f "$F.tmp"; echo 'СТОП: заявката не мина или няма id-та — файлът не е записан'; }
   ```
   Този файл е трайното копие: `pre-deploy-<TS>.sql.gz` на `deploy.sh` също ги има, но `deploy.sh` пази само
   последните 5 дъмпа, а нощният `liftpilot-backup` (`BACKUP_DAYS` = 30) трие всеки `.sql.gz` в папката на 30 дни, и
   `pre-deploy-*`. Файлът не е `.sql.gz` — нито ротацията на `deploy.sh`, нито нощното чистене го трият.
4. Миграция 22 — комитът на D3 (последният комит на кръг 47): `REF=b8cf6ac69 PROJECTS="liftpilot" bash
   /root/deploy/fetch-deploy.sh`; entrypoint-ът я пуска с `migrate deploy` (бекъп преди нея — както винаги).
   Заключването е за миг (`DROP COLUMN` не пренаписва таблицата).

**Id-тата отпреди 22, ако файлът от т. 3 липсва или е празен** (`[ -s /opt/few-few/shared/liftpilot/backups/pre-22-replacement-ids.txt ]`
не минава).
Публичните файлове на продукцията носят времето на комита на 22, т.е. production най-вероятно вече е след 22 — тогава
id-тата са само в `pre-deploy-<TS>.sql.gz`, направен точно преди 22 (най-новият с дата преди деплоя на `b8cf6ac69`), а той
изтича: след още 5 деплоя (ротацията) или на 30 дни (нощното чистене). Извличане във временна база, сега:

```bash
cd "$LP"
D=/opt/few-few/shared/liftpilot/backups/pre-deploy-<TS>.sql.gz    # дъмпът точно преди 22
docker compose exec -T db createdb -U liftpilot tmp22
gunzip -c "$D" | docker compose exec -T db psql -q -v ON_ERROR_STOP=1 --single-transaction -U liftpilot -d tmp22
F=/opt/few-few/shared/liftpilot/backups/pre-22-replacement-ids.txt
(umask 077; docker compose exec -T db psql -U liftpilot -d tmp22 -Atc "SELECT id FROM \"Project\" WHERE kind = 'REPLACEMENT' ORDER BY id" > "$F.tmp") \
  && [ -s "$F.tmp" ] && mv "$F.tmp" "$F" || { rm -f "$F.tmp"; echo 'СТОП: заявката не мина или няма id-та — файлът не е записан'; }
docker compose exec -T db dropdb -U liftpilot tmp22
wc -l "$F"
```

Заявка, която мине, но не върне нито един ред (в дъмпа няма `REPLACEMENT`), не записва файла — тогава запиши това
ръчно (`echo 'nessun REPLACEMENT' > "$F"`), за да мине проверката на т. 0.

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
