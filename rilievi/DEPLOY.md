# Деплой — Rilievi Impianti

Docker Compose (PostgreSQL 16 + приложението на `127.0.0.1:4330`) зад nginx на хоста с Let's Encrypt.
Тайните са само на сървъра: `/opt/few-few/shared/rilievi/.env` (600). Всичко по-долу — като root.

Нужни на VPS-а: Docker с compose plugin, nginx, certbot (същите като за korpora/piuma).

## 0. Първо сваляне на кода

```bash
sudo REF=main PROJECTS="rilievi" bash /opt/few-few/current/deploy/fetch-deploy.sh
```

Без `.env` скриптът казва „тази машина още не е настроена“ и пропуска rilievi (код 3 — не е провал), но
кодът вече е в `/opt/few-few/current/rilievi/`. До сливане в `main` вместо `REF=main` — името на клона.

## 1. Тайните (веднъж)

```bash
sudo bash /opt/few-few/current/rilievi/deploy/setup-env.sh
```

Генерира `POSTGRES_PASSWORD`, `JWT_SECRET` и `INTERVENTI_SEAL_KEY` (`openssl rand -hex 32`), пише
`PUBLIC_BASE_URL` и пита само за Brevo SMTP. Без SMTP порталът работи: поканите и връзките за нова парола
се показват на екрана за копиране. Пощата се настройва и от конзолата на MASTER (`/master/posta` — сървър,
порт, логин, ключ, подател, пробно писмо): докато е включена там, е над `SMTP_*` от `.env`; ключът е в базата
шифрован с ключ, изведен от `INTERVENTI_SEAL_KEY`. Съществуващ `.env` не се пипа — промяна: `sudoedit
/opt/few-few/shared/rilievi/.env`.

**Само за нов портал.** Нов сървър за портал, който вече има данни, НЕ минава оттук: `setup-env.sh` прави
нов `INTERVENTI_SEAL_KEY`, а с нов ключ възстановеният дъмп не става — т. 8 „Нов сървър“.

`INTERVENTI_SEAL_KEY` е ключът на печата на потвърдените листове за интервенция (HMAC). Машина отпреди
листовете няма такъв ключ — `deploy.sh` го създава веднъж в същия `.env` и казва това в изхода. **Не се
сменя никога** и се пази заедно с бекъпа на тайните (копие на `.env` извън сървъра): сменен или загубен
ключ значи, че нито един потвърден лист не минава проверката — страницата му го казва, а PDF и имейл
спират. От същия ключ се извеждат и тайните на 2FA и резервните кодове, шифрованите ключове за пощата и
за Revolut (и signing secret-ът на webhook-а), API ключовете и печатите на регистрите на доказателствата
(`src/auth/chiavi.ts`): със сменен ключ хората с 2FA не влизат, плащанията спират, API ключовете стават
невалидни, а приеманията и подписите излизат „нарушени“. Дъмпът на базата без ключа не стига. Липсва ли
редът, а в базата има което и да е от тях (`Intervento`/`Verbale`/`BuonoFirma`/`Accettazione`/
`AccettazioneOfferta`/`EmissioneCalcolo` с печат, `User.totpSecretEnc`, `RecoveryCode`,
`ConfigPagamenti`, `PostaPortale`, `ChiaveApi`), `deploy.sh` НЕ създава нов ключ: спира (изход 1,
работещото не е пипано), казва колко и какво е намерил и да се върне старият от бекъпа на тайните.

### Входът с Microsoft / Google (по избор)

Клиент, който иска своите хора да влизат с акаунта си в Microsoft Entra или Google Workspace (условията
2026-11-12, чл. 4.6), иска приложение на портала при доставчика — регистрира го собственикът веднъж:

- **Microsoft Entra** (portal.azure.com → App registrations → New registration): „Accounts in any
  organizational directory (Multitenant)“; Redirect URI (Web)
  `https://rilievi.carbonstealth.eu/accesso/esterno/microsoft/ritorno`; Certificates & secrets → New client
  secret (срокът му — в календара: изтекла тайна = входът спира). В `.env`: `OIDC_MICROSOFT_CLIENT_ID`
  (Application ID) и `OIDC_MICROSOFT_CLIENT_SECRET` (стойността на тайната).
- **Google Cloud** (APIs & Services → Credentials → OAuth client ID → Web application): Authorized redirect
  URI `https://rilievi.carbonstealth.eu/accesso/esterno/google/ritorno`; екранът за съгласие — External, само
  `openid` и `email`. В `.env`: `OIDC_GOOGLE_CLIENT_ID` и `OIDC_GOOGLE_CLIENT_SECRET`.

После — деплой на същия release, защото само той копира `$SHARED/.env` в release-а (`docker compose up -d app`
не вижда новите редове):

```bash
sudo RILIEVI_SKIP_BACKUP=1 bash "$(sudo cat /opt/few-few/shared/rilievi/last-good)/deploy/deploy.sh"
```

Контейнерът излиза към `login.microsoftonline.com`, `accounts.google.com`,
`oauth2.googleapis.com` и `www.googleapis.com` (HTTPS). Всяка фирма го включва сама: ADMIN пише своя tenant ID
или домейн в „Impostazioni → Accesso con Microsoft o Google“, а всеки човек свързва акаунта си от „Account“
с паролата. Без тези стойности бутоните и настройката ги няма.

### Плащанията с Revolut Business (по избор)

Всичко се настройва от конзолата — в `.env` няма нищо за плащанията (`REVOLUT_API_BASE` е само за тестовете и в
продукция не се чете). Собственикът веднъж:

1. В Revolut Business — ключът на Merchant API (Secret key). За проба първо ключът от sandbox акаунта
   (developer.revolut.com → Merchant API → Get started обяснява къде е всеки). Ключ **без** подписване на
   заявките (Ed25519 request signing) — порталът не го поддържа и всяка заявка би върнала 401.
2. В портала, MASTER → „Pagamenti“: „Pagamenti attivi“, средата (Sandbox или Produzione), ключът и паролата ти →
   „Salva“. Ключът се пази шифрован и не се показва повече; празно поле при следващ запис го оставя. Всеки MASTER
   получава писмо при нов ключ или друга среда.
3. „Registra il webhook“ — порталът записва в Revolut адреса `https://rilievi.carbonstealth.eu/webhook/revolut`
   (от `PUBLIC_BASE_URL`) и пази signing secret-а шифрован. Наново при смяна на ключа или на средата.
4. Плановете (ниво, месеци, цена без ДДС) — в същата страница; „Non offrire più“ спира план, без да го трие.
5. Проба в Sandbox с тестова карта на Revolut → „Ultimi pagamenti“ казва „Completato“. На живия сървър плащане в
   Sandbox е само проба: абонаментът на фирмата НЕ се сменя (тестова карта не дава Premium) и страницата на
   офертата го казва. После — Produzione с нейния ключ и пак „Registra il webhook“ (старият се маха сам).

**Връщания и спорове (от версия 4.0).** След деплоя на 4.0 натисни „Registra il webhook“ още веднъж: новата
регистрация иска и известията за спорове (`DISPUTE_*`); ако Revolut ги откаже за ключа или средата, порталът
регистрира само поръчките и го казва — плащанията и връщанията работят, споровете се гледат в Revolut Business.
Връщането се нарежда от „Pagamenti“ → „Rimborsa“ (с паролата); ключът на Merchant API трябва да има право и за
връщания. Четенето на спорове е само в Produzione на Revolut.

**Проверката на ДДС номера (VIES).** При покупка от фирма извън България порталът пита
`https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number` — контейнерът трябва да излиза и към
`ec.europa.eu` (HTTPS). Не отговаря ли VIES, покупката не тръгва („Riprova“); нищо за настройване няма
(`VIES_API_BASE` е само за тестовете и в продукция не се чете). Проба от контейнера:

```bash
cd "$(sudo cat /opt/few-few/shared/rilievi/last-good)"
sudo docker compose exec -T app node -e "fetch('https://ec.europa.eu/taxation_customs/vies/rest-api/check-status').then(r => console.log('ok', r.status), e => { console.error(e.cause ?? e); process.exit(1); })"
```

Контейнерът излиза към `merchant.revolut.com` и `sandbox-merchant.revolut.com` (HTTPS). Webhook-ът не иска нищо
в nginx (тялото е до 64 KB, общото `location /`). Изгубено известие не губи плащане: връщането на човека и
поддръжката (всеки час) питат Revolut за поръчката. Фактурата (до 5 дни, ЗДДС чл. 113(4)) се издава извън портала —
данните са в „Ultimi pagamenti“ и в писмото с офертата до платилия.

**Първото пускане на плащанията** (веднъж, преди да кажеш на клиент, че може да плати):

1. SMTP работи — пробно писмо от `/master/posta`. В продукция без поща не тръгват кодът за подпис на условията
   и копието на офертата до платилия.
2. Изходът към Revolut от контейнера (трябва да върне код, а не грешка за връзка):

   ```bash
   cd "$(sudo cat /opt/few-few/shared/rilievi/last-good)"
   sudo docker compose exec -T app node -e "fetch('https://merchant.revolut.com').then(r => console.log('ok', r.status), e => { console.error(e.cause ?? e); process.exit(1); })"
   ```

3. TLS първо (т. 2), после „Registra il webhook“: адресът е от `PUBLIC_BASE_URL` и Revolut трябва да го стига
   по HTTPS — преди сертификата известията не идват.
4. Фирмите отпреди миграцията `20261113150000_abbonamento` са с `abbonamentoFino` NULL — на тях плановете не се
   предлагат (условията, чл. 12.8). MASTER им задава ниво и срок от страницата на фирмата (Aziende → фирмата).
   Кои са:

   ```bash
   cd "$(sudo cat /opt/few-few/shared/rilievi/last-good)"
   sudo docker compose exec -T db psql -U rilievi -d rilievi -c 'SELECT name FROM "Azienda" WHERE "abbonamentoFino" IS NULL ORDER BY name'
   ```

5. Фактурата до 5 дни: в конзолата „Pagamenti“ — разделът „Da fatturare“ (всяко платено без фактура) с отметка
   след издаването ѝ; „Pagamenti da verificare“ (платено, което не е активирало плана само) и „Rimborsi
   dovuti“ — прегледът им е част от същия ред; CSV на плащанията — за счетоводството. Срокът тече от
   плащането: при нов платен MASTER получава писмо „Nuovo pagamento: … — da fatturare“.

## 2. DNS и TLS сертификат (веднъж)

`A` запис `rilievi.carbonstealth.eu` → IP-то на VPS-а (ако няма wildcard за `*.carbonstealth.eu`).
Когато DNS сочи насам:

```bash
sudo certbot certonly --nginx -d rilievi.carbonstealth.eu --deploy-hook 'systemctl reload nginx'
```

Само сертификат: vhost-ът (`deploy/nginx/rilievi.carbonstealth.eu.conf`) го слага деплоят, щом
сертификатът го има.

## 3. Деплой

```bash
sudo REF=main PROJECTS="rilievi" bash /opt/few-few/current/deploy/fetch-deploy.sh
```

`deploy/deploy.sh` (вика го autodeploy; същият е и за ръчен деплой от папката на release-а):

0. общото заключване с дневния бекъп (`/run/lock/rilievi-deploy.lock`, `flock`): върви ли бекъп, деплоят го
   чака до 30 мин. (и бекъпът — деплоя, до 1 ч.), никога двамата заедно;
1. `.env` от `/opt/few-few/shared/rilievi/` в release-а; проверка на паролата и ключа;
2. `docker compose build app worker` (приложението — с poppler-utils за картинката на табелата — и
   фоновият процес на снимките — той с ffmpeg) —
   провал тук не пипа работещите контейнери (код 1);
3. бекъп на базата ПРЕДИ миграцията (`backups/pre-deploy-*.sql.gz`, последните 5) — без бекъп няма
   миграция;
4. страницата за поддръжка (`deploy/nginx/manutenzione.html` → `/var/www/rilievi/`): докато приложението се
   рестартира, nginx показва нея (502/503/504, `Retry-After`) вместо гола 502; после `docker compose up` —
   entrypoint-ът пуска `prisma migrate deploy` (никога `db push`);
5. чака `/health` да върне `{"status":"ok","app":"rilievi"}`; иначе код 4 и autodeploy връща
   последния работещ release;
6. записва release-а в `/opt/few-few/shared/rilievi/last-good`; проверява, че фоновият процес на
   снимките (`worker`) върви — без него порталът работи, но каченото чака в опашката (предупреждение,
   не провал); маха висящите образи на проекта `rilievi` и build кеша, по-стар от 7 дни (иначе дискът
   на базата и снимките се пълни с всеки build); слага дневния бекъп и vhost-а в nginx (`nginx -t`, после
   reload; при грешка връща стария); подава IndexNow, ако sitemap-ът се е сменил (т. 5). Нищо от т. 6
   не сменя изхода 0.

Ръчно връщане към по-стар release, след като новият е работил: старият код не познава новите
въпроси. От 22 октомври 2026 това е „Operatore da cambiare?“ — release отпреди него изтрива листа 2SG
на полуавтоматичен асансьор при първия запис на картата. От 23 октомври 2026 — и скицникът v2: release
отпреди него не чете лист с новите елементи (кръг/елипса, стрелка, кота, символ, пунктир) — не го
показва, а при първия запис на картата го изтрива (тогавашният запис на листовете трие всичко и пише
пратеното; днешният пази нечетимите). От 24 октомври 2026 — и миграцията
`20261024090000_bottoniere_quadro_stop_argano` (добавя колони: „Quadro di manovra da sostituire?“,
„Stop argano da installare?“, разделът „Bottoniere“; на стара карта с „Controllo su quadro manovra: Sì“
пише „No“ в новата колона на таблото — само в нея): release отпреди нея не ги чете и не ги пипа, а при
автоматични врати не пита оператора — записът му с „Operatore: Sì“ (без окачвания) затваря листа 2SG и
изтрива попълненото в него. Затова назад — с `pre-deploy` дъмпа (т. 6), или без да се записват такива
карти, докато новият код не се върне.

От 30 октомври 2026 — и миграцията `20261030240000_ruoli_colori` (имената и правата на ролите по фирма,
цветовете на човека и стойността `CUSTOM` на enum-а `Theme`; само добавя, PostgreSQL не маха стойност от
enum). Release отпреди нея не познава `CUSTOM`: човек с тема „Personalizzato“ не може да влезе (Prisma
отказва непозната стойност), а правата на ролите се връщат към йерархията. Преди връщане назад:
`UPDATE "User" SET theme = 'AUTO' WHERE theme = 'CUSTOM';` (цветовете остават записани и се връщат с новия
код).

От 30 октомври 2026 — и миграцията `20261030230000_cartelli_fermo_impianto` (табелата „Avviso di fermo
impianto“: таблицата `Cartello` и две колони на фирмата — данните ѝ и избраният шаблон; само добавя).
Release отпреди нея не ги чете и не ги пипа: табелите и данните на фирмата остават, но не се виждат, докато
новият код не се върне.

От 30 октомври 2026 — и миграцията `20261030220000_ami100` (AMI 100: три колони и enum-ът
`Ami100Tipo`; само добавя). Release отпреди нея не чете колоните и не ги пипа — записаното в листа
AMI 100 остава, но не се вижда, докато новият код не се върне. Листът на 2SG в него е старият
(сканираният) — по картата си, стойностите са същите.

От 30 октомври 2026 — миграцията `20261030090000_quadro_elettroquadri`: добавя марката на таблото
`ELETTROQUADRI` в enum-а `QuadroMarca` (само добавя; PostgreSQL не маха стойност от enum, затова тя
остава и след връщане назад). Release отпреди нея не познава стойността: карта с „Marca quadro:
Elettroquadri“ не се отваря (Prisma отказва непозната стойност на enum) и поръчката ѝ не излиза. Затова
назад — с `pre-deploy` дъмпа (т. 6), или първо смени марката на тези карти, докато новият код не се върне.

От 30 октомври 2026 — и миграцията `20261030150000_interventi`: таблицата на листовете за интервенция и
броячът на номерата във фирмата (`Azienda.interventiNumero`, 0 по подразбиране). Само добавя: release
отпреди нея не чете таблицата и не пипа брояча — листовете остават, но не се виждат, докато новият код
не се върне; номерата продължават от брояча. Писмата с PDF на листа минават през същия SMTP (Brevo) като
поканите; без SMTP страницата казва, че изпращането не е настроено, и PDF-ът се тегли.

От 30 октомври 2026 — и миграцията `20261030180000_interventi_sigillo`: подписът е обвързан със
съдържанието. Добавя отпечатъка и печата на листа (`impronta`, `sigillo`), маха подписите и имената от
черновите (бяха положени върху чернова — подписва се наново при потвърждението) и слага
`Intervento_firme_check`: чернова без подписи, потвърден лист с двата подписа и имената. Release отпреди
нея записва подписите още в черновата — базата отказва такъв запис (500): листовете остават само за
четене, докато новият код не се върне. Ако откатът трябва да пише листове, махни проверката —
`ALTER TABLE "Intervento" DROP CONSTRAINT "Intervento_firme_check";` (подписите на черновите вече са
махнати, нищо друго не се губи) — и я върни със следващия деплой на новия код (миграцията
`20261030200000_interventi_firme_ripetute` я слага наново). Потвърдените листове отпреди печата нямат печат — показват се, но PDF и имейл
за тях са спрени (не може да се провери, че са непокътнати).

От 30 октомври 2026 — и миграцията `20261030200000_interventi_firme_ripetute`: отпечатък (SHA-256) на
щрихите на всеки подпис, с индекс — подпис, който вече стои на друг лист, не се приема. Попълва
потвърдените листове (същият низ като в приложението; печатът им не се сменя) и слага
`Intervento_firme_check` наново, с отпечатъците. Само добавя: предишният код не чете колоните.

От 9 ноември 2026 — миграцията `20261109100000_tubo_flessibile_diametro_testo` **не позволява връщане
назад**: диаметърът на маркуча става от число (`DECIMAL(8,2)`) текст („25,4 mm“). Release отпреди нея чака
число и всяка карта с попълнен диаметър не се отваря (Prisma не конвертира текста); това важи и за
автоматичното връщане на autodeploy при провален `/health` след миграцията. Назад — само с `pre-deploy`
дъмпа (т. 6, „Връщане към по-стар release заедно с данните“). Останалите от 5–10 ноември само добавят (`Verbale`, `CalcoloLimitatore`, `Novita`,
колоните за оператора, ръчните врати и снимките в печата) и старият код не ги чете, с три уговорки:
`matricola` става свободен текст до 40 знака, а старият код приема само цифри до 20, затова такава карта
не се записва, докато новият код не се върне; фирма с протоколи или изчисления на ограничителя не се
трие от стария код (връзките са RESTRICT); скиците остават включени във всяка фирма (собственикът,
10 ноември 2026), изборът „изключени“ отпреди не се връща.

От 10 ноември 2026 — миграцията `20261110220000_condizioni_servizio` (условията за услугата и регистрите на
доказателствата: `TestoLegale`, `Accettazione`, `FirmaCondizioni`, `EmissioneCalcolo` и колоните на версиите в
`Azienda`/`User`; само добавя). Миграцията `20261110230000_condizioni_esistenti` брои фирмите и хората, които съществуват към деплоя (тестовите
на собственика), за приели версия 2026-11-10 — влизат без страницата за приемане; в регистъра на приеманията за тях
няма ред (подпис не е имало). **Всяка нова фирма** след деплоя: администраторът ѝ приема условията и подписва с код,
който получава **по имейл** — SMTP (Brevo) трябва да работи, иначе подписът не минава; хората на фирмата чакат него.
Тестова фирма, която стане истински клиент — да подпише наистина:

```bash
cd "$(sudo cat /opt/few-few/shared/rilievi/last-good)"
# фирмите, приетата версия и дали има подпис в регистъра:
sudo docker compose exec -T db psql -U rilievi -d rilievi -c 'SELECT a.name, a."condizioniVersione",
  EXISTS (SELECT 1 FROM "Accettazione" x WHERE x."aziendaId" = a.id AND x.tipo = '"'"'CONDIZIONI'"'"') AS firmata
  FROM "Azienda" a ORDER BY a.name'
```

После за избраната фирма (името — точно както го изписа списъкът; трябва да върне `UPDATE 1`):

```bash
sudo docker compose exec -T db psql -U rilievi -d rilievi \
  -c "UPDATE \"Azienda\" SET \"condizioniVersione\" = NULL WHERE name = 'Ascensori Rossi S.r.l.';"
```

Release отпреди нея не чете новите таблици: пропускът изчезва, доказателствата остават.

От 11 до 13 ноември 2026 — миграциите от `20261111090000_comunicazioni` до
`20261113190100_pagamenti_verifica_rimborsi` само добавят (таблици, колони с NULL или константа по подразбиране,
стойности на enum), с две уговорки за връщане назад:

- `20261112230000_quadro_geat` добавя `GEAT` в enum-а `QuadroMarca` — като `ELETTROQUADRI` по-горе: release
  отпреди нея не отваря карта с „Marca quadro: GEAT“. Назад — с `pre-deploy` дъмпа или след смяна на марката
  на тези карти.
- Плащанията (`20261113150000_abbonamento` до `20261113190100_pagamenti_verifica_rimborsi`): на стария код
  `/webhook/revolut` връща 404, а сверката с Revolut (връщането на човека и поддръжката всеки час) е само в
  новия — платени поръчки не активират плана, докато новият код не се върне (тогава сверката ги хваща).
  `20261113190000_pagamenti_stati` добавя `DA_VERIFICARE` и `RIMBORSATO` в enum-а `StatoPagamento`: старият
  код не ги познава (Prisma отказва непозната стойност на enum) и списъкът на плащанията на MASTER не се
  отваря, щом има такова плащане. `20261113190100_pagamenti_verifica_rimborsi` добавя колоните за проверката,
  възстановяванията и фактурата (`fatturataAt`) — старият код не ги чете. Назад при плащания в тези статуси —
  само с `pre-deploy` дъмпа.

### Снимки и клипове

Каченото се пише право в тома `rilievi_media` (`/data/media` в контейнерите): `arrivi/` — докато се
качва, `schede/<карта>/` — компресираното (снимка JPEG до 2560 px, клип H.264 до 1080p, миниатюра за
печата, плочка за галерията). Компресира ги контейнерът `worker` (src/worker.ts): един файл наведнъж,
1 процесор и 1 GB памет, с четвърт от обичайния дял на процесора (`cpu_shares`) — при натоварена
машина сайтовете минават преди него; оригиналът се трие след компресията. Качването спира, когато на диска остават под `MEDIA_MIN_FREE_MB`
(2048 MB). Таваните (`MEDIA_MAX_*`, `.env.example`) — клип над 1024 MB иска и по-висок
`client_max_body_size` във vhost-а (`deploy/nginx/`). Дневникът: `docker compose logs --tail=80 worker`.

## 4. Първият MASTER (веднъж)

```bash
sudo bash /opt/few-few/current/rilievi/deploy/create-master.sh
```

Пита имейл (по подразбиране `admin@carbonstealth.eu`), име и парола (скрито, два пъти; поне 12 знака).
Паролата стига до контейнера през stdin — не остава в историята и не се вижда в `ps`. MASTER е
собственикът на портала и е без фирма. После от портала: **Aziende → Nuova azienda** (име и лого) и
**Utenti → Invita utente** — администраторът на фирмата (роля Amministratore), който после кани хората
си. Всички останали влизат САМО с покана.

## 5. Проверка

```bash
curl -fsS https://rilievi.carbonstealth.eu/health      # {"status":"ok","app":"rilievi"}
curl -sI https://rilievi.carbonstealth.eu/accesso | grep -i -E 'content-security-policy|strict-transport'
curl -fsS https://rilievi.carbonstealth.eu/robots.txt  # Allow само за витрината, накрая Disallow: /
```

След деплой, който променя витрината (текст, `CONTENT_UPDATED`, sitemap), търсачките с IndexNow (Bing,
Yandex, Seznam, Naver, Yep) се известяват от копието на репото, което деплоят разгърна — `current` сочи
корена му (`tools/` е там, не в `/root`); ключът се сервира на `/indexnow-key.txt` и на `/<ключ>.txt`:

```bash
node /opt/few-few/current/tools/seo/indexnow.mjs https://rilievi.carbonstealth.eu
```

`deploy.sh` го прави сам след здрав деплой, щом sitemap-ът е друг от подадения последно (отпечатъкът е в
`/opt/few-few/shared/rilievi/indexnow-sitemap.sha256`; без `node` на хоста — същата заявка с `curl`;
`RILIEVI_INDEXNOW=0` го спира). Провал там е само предупреждение — ръчната команда горе остава за повторение.

Google не поддържа IndexNow — там sitemap-ът се открива сам (`/sitemap.xml`, посочен в robots.txt), а
първия път се добавя в Search Console.

## 6. Бекъпи

- Преди всяка миграция: `/opt/few-few/shared/rilievi/backups/pre-deploy-*.sql.gz` (последните 5).
- Дневно 03:10 UTC: `rilievi-backup.timer` → `deploy/backup.sh` (последните 14 от всяко):
  - базата — `backups/daily/rilievi-*.sql.gz`;
  - снимките и клиповете — `backups/media/<дата>/`: моментна снимка с твърди връзки към тома
    `rilievi_media` (без допълнително място; изтрита снимка, карта или фирма остава в нея 14 дни, колкото
    и в дъмповете). Томът на друг диск — снимка няма, пази ги копието извън сървъра;
  - проверено възстановяване: всеки дъмп се възстановява във временен PostgreSQL без мрежа и се броят
    миграциите, фирмите и картите (`deploy/restore-test.sh`); провал — бекъпът е провал;
  - `backups/ULTIMO_OK` (часът на последния успешен), а при провал — `backups/ULTIMO_ERRORE`, критичен
    ред в журнала (`rilievi-backup-alert.service`) и аларма до `RILIEVI_ALERT_URL`, ако е зададен (по-долу,
    „Аларми в Discord“).

  Ръчно: `sudo bash "$(sudo cat /opt/few-few/shared/rilievi/last-good)/deploy/backup.sh"`.

- **Копие извън сървъра** (бекъп на същия диск не пази от загуба на диска) — веднъж, във файла
  `/opt/few-few/shared/rilievi/backup.env` (600, `root`):

  ```bash
  RILIEVI_OFFSITE=u123456@u123456.your-storagebox.de:rilievi   # папката там я създай веднъж
  RILIEVI_OFFSITE_SSH="-p 23 -i /root/.ssh/rilievi_backup"      # ключ само за това, без парола
  RILIEVI_HEARTBEAT_URL=https://…/push/…   # Uptime Kuma push / Healthchecks: пропуснат ден = аларма
  RILIEVI_ALERT_URL=https://discord.com/api/webhooks/…   # аларма при провал („Аларми в Discord“)
  ```

  Всяка нощ дъмповете (`daily/`) и снимките (`media/`) отиват там по SSH.

- **Тайните не ги изнася нито скриптът, нито агент.** `INTERVENTI_SEAL_KEY` (в
  `/opt/few-few/shared/rilievi/.env`) не е в дъмпа на базата, а без него потвърдените листове за
  интервенция не минават проверката: копирай файла с тайните извън сървъра веднъж, на ръка (ключът не
  се сменя никога), на място, достъпно само за собственика.
- Снимките и клиповете не са в дъмпа на базата (`schede/` в тома; `arrivi/` е временно). Пътят на тома на хоста:
  `sudo docker volume inspect -f '{{.Mountpoint}}' rilievi_media`. Дъмп, възстановен без тях, не
  чупи нищо: липсващ файл е 404 в галерията и не влиза в PDF-а.

Възстановяване — винаги в **празна схема и в една транзакция**. Дъмпът (`--clean --if-exists`) трие само
обектите, които са в него: таблица от по-нова миграция с външен ключ към `Azienda`/`User` (напр. `Pagamento`)
спира `DROP` на средата, а без `--single-transaction` вече изтритото остава — база наполовина изтрита, порталът
спрян (одит, 12 ноември 2026; проверено с PostgreSQL 16 върху миграциите на репото). Тук `DROP SCHEMA` и целият
дъмп са в една транзакция: грешка → нищо не е сменено. `gzip -t` преди това: отрязан дъмп psql би приел за
„край на файла“ и би записал половин база. Не в 03:05–03:40 UTC (дневният бекъп).

```bash
cd "$(sudo cat /opt/few-few/shared/rilievi/last-good)"
# най-новият дневен дъмп; за друг — задай DUMP на ръка с пълния му път
DUMP="$(sudo sh -c 'ls -1t /opt/few-few/shared/rilievi/backups/daily/rilievi-*.sql.gz | head -n 1')"
echo "$DUMP"
sudo gzip -t "$DUMP"
sudo docker compose stop worker app
{ echo 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'; sudo zcat "$DUMP"; } |
  sudo docker compose exec -T db psql --single-transaction -v ON_ERROR_STOP=1 -q -U rilievi -d rilievi
sudo docker compose start app worker
```

При старт `app` прилага миграциите на кода от `last-good`, по-нови от дъмпа (`_prisma_migrations` идва от
дъмпа, затова няма P3018). Проверка: `curl -fsS http://127.0.0.1:4330/health`. Колко трае на тази база —
`restore-test.sh` го печата всяка нощ в журнала (`journalctl -u rilievi-backup.service | grep restore-test`).

**Връщане към по-стар release заедно с данните** (миграция без път назад — `20261109100000_tubo…`): всичко,
въведено след деплоя, се губи. Пак горният ред, но с `pre-deploy` дъмпа на онзи деплой
(`DUMP="$(sudo sh -c 'ls -1t /opt/few-few/shared/rilievi/backups/pre-deploy-*.sql.gz | head -n 1')"`) и от
папката на стария release в `/opt/few-few/releases/`, а вместо `start` —
`sudo RILIEVI_SKIP_BACKUP=1 bash "$PWD/deploy/deploy.sh"` (той записва стария release в `last-good`).

### Аларми в Discord

Провалите на сървърните скриптове отиват в канал на Discord (`deploy/alert.sh`): дневният бекъп (и копието извън
сървъра), проверката на възстановяването (`restore-test.sh`), бекъп, убит преди края
(`rilievi-backup-alert.service`), и деплой, спрял с изход 1 или 4. Успешен деплой не пише (шум). Текстът е само
кой скрипт, кой сървър, какво и кога — напр. `rilievi backup FALLITO su <host>: pg_dump exit 1 — 2026-11-12 03:10
UTC`; без лични данни, пътища и адреси.

1. Webhook-ът (по интерфейса на Discord; официалната помощ не е сверена тук): Server Settings → Integrations →
   Webhooks → New Webhook → избери канала → Copy Webhook URL. Иска правото „Manage Webhooks“ в сървъра.
2. Адресът носи токен — пише се само на сървъра, във файла `/opt/few-few/shared/rilievi/backup.env` (600,
   `root`), никога в репото или в чат:

   ```bash
   sudo nano /opt/few-few/shared/rilievi/backup.env   # ред RILIEVI_ALERT_URL=https://discord.com/api/webhooks/…
   sudo chmod 600 /opt/few-few/shared/rilievi/backup.env
   ```

   Друг адрес (ntfy, Uptime Kuma, Healthchecks `/fail`) също работи: получава текста като тяло, както преди.

3. Проба — едно съобщение в канала; адресът не се печата, при провал излиза само `alert non inviato (curl exit N)`:

   ```bash
   sudo bash -c '. "$(cat /opt/few-few/shared/rilievi/last-good)/deploy/alert.sh" && alert "rilievi: prova allarme da $(hostname -s), nessun guasto"'
   ```

Изтекъл токен (webhook-ът изтрит в Discord): нов webhook, новият адрес на същия ред.

**Версия 4.1 — какво прави деплоят и какво остава за теб.** Двете миграции само добавят; втората отбелязва
всички съществуващи фирми като приели условията 2026-11-14 (без ред в регистъра на приеманията) — хората им
влизат без страницата за подпис, докато пощата не работи. Когато Brevo тръгне (`/master/posta` → пробно писмо):
MASTER → „Contratti“ → „Richiedi la firma“ за всяка фирма — от версия 4.2 веднага, и преди 14 ноември 2026
(администраторът подписва версията 2026-11-14, която влиза в сила в полунощ по Рим; във версия 4.1 конзолата
отказваше до този ден). В „Pagamenti“: раздел „IVA con partita IVA non
valida nel VIES“ (ключът и продажбите извън портала за прага от 10 000 €) и „Note di credito“ (номер и ден на
всяко издадено известие — срок 5 дни от връщането).

**Пощата не тръгва** (13 ноември 2026: пробното писмо — `ETIMEDOUT` на порт 587). От версия 4.2 `/master/posta`
казва стъпката с думи и отговора на SMTP сървъра („Ultima prova“, „Ultima email del portale“); в лога — само
кодовете: `sudo docker compose logs --since 2h app | grep posta.fallita` (`fase`, `code`, `origine`,
`responseCode`).

- `connessione` (`ETIMEDOUT`, `ECONNREFUSED`): връзката не излиза от сървъра. netcup пуска новите сървъри със
  защитна стена в SCP с политика „netcup Mail block“, която спира изходящите пощенски портове (по форума на
  netcup — 25, 465, 587; официален списък няма). **Порт 2525** в `/master/posta` — Brevo го приема и не е
  пощенски порт за стената. Ако и той не отговаря: SCP → сървърът → Firewall → „netcup Mail block“ → Löschen →
  Speichern. Проба на портовете — от хоста и от контейнера на портала:

  ```bash
  for p in 2525 587 465; do timeout 6 bash -c "exec 3<>/dev/tcp/smtp-relay.brevo.com/$p" 2>/dev/null && echo "$p: aperta" || echo "$p: bloccata"; done
  cd "$(sudo cat /opt/few-few/shared/rilievi/last-good)"
  sudo docker compose exec -T app node -e "const net=require('node:net');for(const p of [2525,587,465]){const s=net.connect({host:'smtp-relay.brevo.com',port:p,timeout:6000});s.on('connect',()=>{console.log(p,'aperta');s.destroy()}).on('timeout',()=>{console.log(p,'nessuna risposta');s.destroy()}).on('error',e=>console.log(p,e.code))}"
  ```

  Отворен на хоста, а затворен от контейнера — правило на хоста за мрежата на Docker, не доставчикът.

- `accesso` (535): логинът или SMTP ключът (не API ключът) — ключът се пише наново; 525: в Brevo е включено
  блокирането на непознати IP адреси — адресът на сървъра се добавя в Security → Authorized IPs.
- `mittente` (5xx на MAIL FROM): подателят или домейнът му не е проверен в Brevo.
- „Inviata“, а писмото го няма: Brevo го е приел — гледа се в логовете на транзакционните писма в акаунта.

**Външен монитор на `/health`** (`.github/workflows/rilievi-health.yml`; мъртъв сървър не може да се обади сам).
GitHub Actions пита `https://rilievi.carbonstealth.eu/health` на всеки 10 минути (минути :07, :17 … UTC): здрав
е само HTTP 200 с тяло `"status":"ok"` и `"app":"rilievi"`; 3 опита през ~20 s, преди да се обяви „не отговаря“
(изтекъл TLS сертификат също е „не отговаря“). Аларма само при ПРОМЯНА: при първия провал се отваря issue
„rilievi: il portale non risponde“ (етикет `rilievi-down`; GitHub праща имейл) и се пише в Discord; докато
трае — най-много един коментар на час, без нов Discord; при възстановяване issue-то се затваря и в Discord
излиза „di nuovo raggiungibile“. Текстът е само „HTTP <код|errore di rete> — <UTC>“, без лични данни.

- **Secret:** GitHub → Settings → Secrets and variables → Actions → New repository secret `RILIEVI_ALERT_URL`
  (адресът на Discord webhook, същият вид като на сървъра; не в репото). Без него монитор върви и отваря issue-то,
  а стъпката казва „secret mancante“; адрес, който не е Discord webhook, не се вика. Адресът не се печата в лога.
- **Кога тръгва:** `schedule` върви само от `main` — след merge. Преди това: Actions → „rilievi health“.
- **Проба:** Actions → „rilievi health“ → Run workflow → отметка „prova“: едно пробно съобщение в канала,
  без проверка и без да пипа issue-то.
- **Граници:** „втори чифт очи“, не SLA. Разписанието на GitHub закъснява (минути) и в публично репо се
  изключва след 60 дни без активност в репото (пуска се наново от Actions); ако GitHub е долу, монитор няма.
  `RILIEVI_HEARTBEAT_URL` покрива само пропуснатия бекъп.

Порталът има и свои аларми към същия или друг webhook — настройват се от конзолата на MASTER (`/master/allarmi`:
адресът, паролата ти, „Invia un messaggio di prova“): паднала стъпка на поддръжката, плащане за проверка, спор,
неуспешно връщане, поща, която не тръгва, нов сигнал за незаконно съдържание. Контейнерът трябва да излиза към
`discord.com` (HTTPS). Адресът се пази шифрован с ключ от `INTERVENTI_SEAL_KEY` — при възстановяване на друг
сървър със същия ключ остава валиден.

## 7. Провалена миграция

В `docker compose logs app` има `P3018`, а при всеки следващ старт `P3009`; autodeploy тогава не
връща кода (старият би спрял на същото), а казва къде е дъмпът. От папката на последния работещ release:

```bash
cd "$(sudo cat /opt/few-few/shared/rilievi/last-good)"
sudo docker compose exec -T db psql -U rilievi -d rilievi -c \
  'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL'
# а) данните са цели (PostgreSQL връща паднала миграция цялата) — обичайното:
sudo docker compose run --rm --no-deps --entrypoint ./node_modules/.bin/prisma app \
  migrate resolve --rolled-back <име_на_миграцията>
sudo RILIEVI_SKIP_BACKUP=1 bash "$PWD/deploy/deploy.sh"
```

б) Данните трябва да се върнат — `pre-deploy` дъмпът на този деплой, в празна схема и в една транзакция (като в
т. 6); редът за падналата миграция го няма в дъмпа, затова `migrate resolve` не трябва:

```bash
cd "$(sudo cat /opt/few-few/shared/rilievi/last-good)"
DUMP="$(sudo sh -c 'ls -1t /opt/few-few/shared/rilievi/backups/pre-deploy-*.sql.gz | head -n 1')"
echo "$DUMP"
sudo gzip -t "$DUMP"
sudo docker compose stop worker app
{ echo 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'; sudo zcat "$DUMP"; } |
  sudo docker compose exec -T db psql --single-transaction -v ON_ERROR_STOP=1 -q -U rilievi -d rilievi
sudo RILIEVI_SKIP_BACKUP=1 bash "$PWD/deploy/deploy.sh"
```

## 8. Нов сървър (загубен хост)

Дискът или хостът е загубен; има копие извън сървъра (т. 6) и копие на тайните. **Никога `setup-env.sh`**: той
прави нов `INTERVENTI_SEAL_KEY` и възстановената база става безполезна (2FA, плащания, печати, API ключове —
т. 1). Нужни от копието на тайните, качени на новия сървър в `/root/rilievi-tajni/`: `.env`, `backup.env` и
ключът за Storage Box `rilievi_backup` (без тях — само дъмп без снимки и без ключ, т.е. нищо). Колко трае — да
се измери при първата проба и да се сравни с RTO на `/stato` (8 ч).

1. Сървърът: Docker с compose plugin, nginx, certbot, rsync, `flock` (util-linux) и втвърдяването (ufw 22/80/443,
   SSH само с ключ). DNS още сочи стария IP — сменя се в т. 7 по-долу.
2. Тайните на място, с правата им:

   ```bash
   sudo install -d -m 700 /opt/few-few/shared/rilievi /root/.ssh
   sudo install -m 600 /root/rilievi-tajni/.env /opt/few-few/shared/rilievi/.env
   sudo install -m 600 /root/rilievi-tajni/backup.env /opt/few-few/shared/rilievi/backup.env
   sudo install -m 600 /root/rilievi-tajni/rilievi_backup /root/.ssh/rilievi_backup
   ```

3. Кодът (`.env` вече е там — deploy.sh вдига празна база с миграциите и не пипа ключа):

   ```bash
   curl -fsSL https://codeload.github.com/stefkostefko92-ux/Few-few/tar.gz/main \
     | sudo tar -xz -C /root --strip-components=1 --wildcards '*/deploy/fetch-deploy.sh'
   sudo REF=main PROJECTS="rilievi" bash /root/deploy/fetch-deploy.sh
   ```

4. Дъмповете от копието извън сървъра и спиране на приложението:

   ```bash
   sudo install -d -m 700 /opt/few-few/shared/rilievi/backups/daily
   sudo sh -c '. /opt/few-few/shared/rilievi/backup.env && rsync -a -e "ssh -o BatchMode=yes $RILIEVI_OFFSITE_SSH" "$RILIEVI_OFFSITE/daily/" /opt/few-few/shared/rilievi/backups/daily/'
   cd "$(sudo cat /opt/few-few/shared/rilievi/last-good)"
   sudo docker compose stop worker app
   ```

5. Базата — най-новият дъмп, в празна схема и в една транзакция (т. 6):

   ```bash
   DUMP="$(sudo sh -c 'ls -1t /opt/few-few/shared/rilievi/backups/daily/rilievi-*.sql.gz | head -n 1')"
   echo "$DUMP"
   sudo gzip -t "$DUMP"
   { echo 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'; sudo zcat "$DUMP"; } |
     sudo docker compose exec -T db psql --single-transaction -v ON_ERROR_STOP=1 -q -U rilievi -d rilievi
   ```

6. Снимките и клиповете в тома, със собственика на контейнера (`node`, 1000:1000), после старт:

   ```bash
   MEDIA="$(sudo docker volume inspect -f '{{.Mountpoint}}' rilievi_media)"
   sudo sh -c '. /opt/few-few/shared/rilievi/backup.env && rsync -a -e "ssh -o BatchMode=yes $RILIEVI_OFFSITE_SSH" "$RILIEVI_OFFSITE/media/" "$1/schede/"' rsync-media "$MEDIA"
   sudo chown -R 1000:1000 "$MEDIA/schede"
   sudo docker compose start app worker
   curl -fsS http://127.0.0.1:4330/health
   ```

7. DNS → новият IP, сертификатът (т. 2), после
   `sudo RILIEVI_SKIP_BACKUP=1 bash "$(sudo cat /opt/few-few/shared/rilievi/last-good)/deploy/deploy.sh"` за vhost-а; проверката от т. 5; вход като MASTER с 2FA (ако кодът мине — ключът е верният); един потвърден
   лист за интервенция — печатът е цял; ръчен `backup.sh` → `backups/ULTIMO_OK`.

**Отворено решение на собственика:** копието извън сървъра е по избор — без `RILIEVI_OFFSITE` `backup.sh` само
предупреждава и пише `ULTIMO_OK`, а дъмповете там не са шифровани (korpora ги шифрова). Дали без него бекъпът
да е провал (и аларма), дали дъмповете там да се шифроват и дали RTO 8 ч на `/stato` остава, преди тази
процедура да е измерена — решава собственикът.

## Порт и домейн

Порт `4330` (свободен във флота; `HTTP_PORT` в `.env` го сменя — deploy.sh вписва новия във vhost-а).
Друг домейн = нов vhost `deploy/nginx/<домейн>.conf` в репото + `RILIEVI_DOMAIN=<домейн>` при
`setup-env.sh` и при деплой (+ сертификат за него).
