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
се показват на екрана за копиране. Съществуващ `.env` не се пипа — промяна: `sudoedit
/opt/few-few/shared/rilievi/.env`.

`INTERVENTI_SEAL_KEY` е ключът на печата на потвърдените листове за интервенция (HMAC). Машина отпреди
листовете няма такъв ключ — `deploy.sh` го създава веднъж в същия `.env` и казва това в изхода. **Не се
сменя никога** и се пази заедно с бекъпа на тайните (копие на `.env` извън сървъра): сменен или загубен
ключ значи, че нито един потвърден лист не минава проверката — страницата му го казва, а PDF и имейл
спират. Дъмпът на базата без ключа не стига за възстановяване на листовете. Липсва ли редът, а в базата
вече има запечатани листове, `deploy.sh` НЕ създава нов ключ: спира (изход 1, работещото не е пипано) и
казва да се върне старият от бекъпа на тайните.

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

1. `.env` от `/opt/few-few/shared/rilievi/` в release-а; проверка на паролата и ключа;
2. `docker compose build app worker` (приложението и фоновият процес на снимките — той с ffmpeg) —
   провал тук не пипа работещите контейнери (код 1);
3. бекъп на базата ПРЕДИ миграцията (`backups/pre-deploy-*.sql.gz`, последните 5) — без бекъп няма
   миграция;
4. `docker compose up` — entrypoint-ът пуска `prisma migrate deploy` (никога `db push`);
5. чака `/health` да върне `{"status":"ok","app":"rilievi"}`; иначе код 4 и autodeploy връща
   последния работещ release;
6. записва release-а в `/opt/few-few/shared/rilievi/last-good`; проверява, че фоновият процес на
   снимките (`worker`) върви — без него порталът работи, но каченото чака в опашката (предупреждение,
   не провал); слага дневния бекъп и vhost-а в nginx (`nginx -t`, после reload; при грешка връща
   стария).

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

Google не поддържа IndexNow — там sitemap-ът се открива сам (`/sitemap.xml`, посочен в robots.txt), а
първия път се добавя в Search Console.

## 6. Бекъпи

- Преди всяка миграция: `/opt/few-few/shared/rilievi/backups/pre-deploy-*.sql.gz` (последните 5).
- Дневно 03:10 UTC: `rilievi-backup.timer` → `backups/daily/rilievi-*.sql.gz` (последните 14).
  Ръчно: `sudo bash "$(sudo cat /opt/few-few/shared/rilievi/last-good)/deploy/backup.sh"`.
- Бекъп на същия диск не пази от загуба на диска: копирай `backups/daily/` извън сървъра (VPS
  Dashboard, Storage Box или `rsync` към друг сървър).
- `INTERVENTI_SEAL_KEY` (в `/opt/few-few/shared/rilievi/.env`) не е в дъмпа на базата, а без него
  потвърдените листове за интервенция не минават проверката: копието на `.env` стои извън сървъра,
  заедно с бекъпите.
- Снимките и клиповете НЕ са в дъмпа на базата — те са в тома `rilievi_media` и се копират извън
  сървъра отделно (само `schede/`; `arrivi/` е временно). Пътят на тома на хоста:
  `sudo docker volume inspect -f '{{.Mountpoint}}' rilievi_media`. Дъмп, възстановен без тях, не
  чупи нищо: липсващ файл е 404 в галерията и не влиза в PDF-а.

Възстановяване (дъмпът е с `--clean --if-exists` — заменя съществуващите таблици):

```bash
cd "$(sudo cat /opt/few-few/shared/rilievi/last-good)"
sudo docker compose stop worker app
zcat /opt/few-few/shared/rilievi/backups/daily/rilievi-<дата>.sql.gz |
  sudo docker compose exec -T db psql -v ON_ERROR_STOP=1 -q -U rilievi -d rilievi
sudo docker compose start app worker
```

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
# б) данните трябва да се върнат: възстановяване от pre-deploy дъмпа (т. 6), после същото.
```

## Порт и домейн

Порт `4330` (свободен във флота; `HTTP_PORT` в `.env` го сменя — deploy.sh вписва новия във vhost-а).
Друг домейн = нов vhost `deploy/nginx/<домейн>.conf` в репото + `RILIEVI_DOMAIN=<домейн>` при
`setup-env.sh` и при деплой (+ сертификат за него).
