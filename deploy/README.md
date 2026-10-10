# Автоматизиран деплой (`deploy/autodeploy.sh`)

Деплой на монорепото до жив сървър — едно действие.

## Работен поток (репото е публично — сървърът си взема архива сам)

`deploy/fetch-deploy.sh` сваля **неизменяем архив за точен ref** и го подава на
`autodeploy.sh`. Това НЕ е `git pull` на кутията (няма работно дърво, няма `.git` за
поддържане) и НЕ е CI/CD push — пускаш го ти, когато решиш.

Първият път скриптът го няма на сървъра, затова се взима от самото репо:

```bash
ssh root@СЪРВЪР
curl -fsSL https://codeload.github.com/stefkostefko92-ux/Few-few/tar.gz/main \
  | tar -xz -C /root --strip-components=1 --wildcards '*/deploy/fetch-deploy.sh'
sudo bash /root/deploy/fetch-deploy.sh
```

След първия успешен деплой той живее в текущия release:

```bash
sudo bash /opt/few-few/current/deploy/fetch-deploy.sh                 # main, всички продукти
sudo PROJECTS="piuma" bash /opt/few-few/current/deploy/fetch-deploy.sh
sudo REF=claude/<клон> bash /opt/few-few/current/deploy/fetch-deploy.sh
sudo REF=v1.4.0 bash /opt/few-few/current/deploy/fetch-deploy.sh      # таг
sudo REF=09597af… bash /opt/few-few/current/deploy/fetch-deploy.sh    # точен комит
```

Оттук нататък всичко е автоматично: разопаковане в нов release → билд → миграции →
сийд (само първия път) → health check → презареждане на прокси/TLS.

`fetch-deploy.sh` проверява, че сваленото наистина е това репо, преди да пусне скрипт
от него като root; пази последните два свалени архива (всеки е ~250 MB — без чистене
дискът свършва мълчаливо); и подава `ARCHIVE=` изрично, за да не изпревари ръчно качен
ZIP отпреди месец.

## Работен поток (резервен — ръчно качен архив)

Когато сървърът няма изходяща мрежа към GitHub:

1. В GitHub → **Code → Download ZIP** (или `tar.gz` от Releases).
2. Качи архива в **`/root`** (напр. `scp Few-few.zip root@СЪРВЪР:/root/`).
3. ```bash
   cd /root && unzip -o Few-few.zip >/dev/null   # само за да стигнеш до скрипта
   sudo bash /root/few-few-*/deploy/autodeploy.sh
   ```

## Какво прави

- Намира най-новия архив в `/root`, разопакова го в `/opt/few-few/releases/<час>` и
  нормализира GitHub горната папка (`few-few-*`).
- **zabobovdol:** `.env` идва от стабилния дом `/opt/few-few/shared/zabobovdol/.env` (600) →
  `current` → най-новия release, който го има; липсва ли навсякъде, а има дъмп/volume от
  предишна инсталация — **спира** (нов `.env` = нова парола за съществуваща база). После
  `scripts/deploy.sh` (Docker Compose билд + вдигане + миграции, сийд само при първо пускане).
  Сонда на `/api/health` (`SELECT 1` към базата, маркер `"ok":true`); при провал — автоматичен
  откат на **кода** към предишния release (базата не се пипа: миграциите са адитивни). При
  успех — IndexNow (`ZBD_INDEXNOW=0` го спира).
- **medqr:** rsync в `/opt/medqr` (без `data/`, `.env`), `npm ci --omit=dev`,
  `systemctl restart medqr`; при провал — автоматичен rollback към предишния код. Health гейтът
  пита `/healthz` (минава преди HTTPS редиректа) и иска маркера `"app":"medqr"`
  (`MEDQR_HEALTH_URL` / `MEDQR_HEALTH_EXPECT`).
- **mastilko:** rsync в `/opt/mastilko` (без `.env`), `npm ci` + `npm run build`
  (Next.js се билдва на сървъра) + `npm prune --omit=dev`, самоинсталиращ се
  systemd unit (`mastilko/deploy/mastilko.service`, порт `127.0.0.1:3200`),
  `systemctl restart mastilko`; при провал — автоматичен rollback. Еднократно:
  Nginx vhost + TLS → `mastilko/deploy/DEPLOY.md`.
- **SupremeDiscordBot** (Supreme Bot): пренася четирите `.env` файла (`SupremeDiscordBot/.env`,
  `backend/.env`, `bot/.env`, `frontend/.env`) — източникът се **търси**: `current` →
  `/opt/few-few/shared/SupremeDiscordBot/` (стабилно огледало, 700/600, обновява се при всеки
  пробег) → най-новият release, който ги има; липсват ли навсякъде, спира **преди** `pg_dump` с
  инструкция за възстановяване (`SupremeDiscordBot/deploy/RELEASE-3.4.0.md` §6), никога
  „`cp .env.example`". После `SupremeDiscordBot/deploy.sh` (Docker Compose
  билд + вдигане; миграциите се пускат от backend entrypoint-а; регистрира slash командите).
  Health на публичния frontend порт `127.0.0.1:8080`; останалите services са вътрешни.
  **Бекъпи:** `pg_dump` ПРЕДИ миграциите в `/var/backups/supreme/pre-deploy-<TS>.dump`
  (провал на дъмпа спира деплоя), а след успешен health се инсталира дневният
  криптиран бекъп (`supreme-backup.timer`, 03:00 UTC, 30 дни задържане — DPA §5.1).
  Еднократно ръчно: паролата `/root/.supreme-backup-pass` + първи тестов restore →
  `SupremeDiscordBot/deploy/BACKUP.md`.
- **eternaltouch** (Eternal Touch): пренася `eternaltouch/.env` (или го генерира с random
  secrets при пръв деплой — `SMTP_PASS` остава `CHANGE_ME` за ръчно попълване веднъж),
  после `eternaltouch/deploy.sh` (Docker Compose билд + вдигане; схемата се пуска от
  `docker-startup.sh`; идемпотентен seed; Nginx + certbot с auto-reload hook). Health на
  `127.0.0.1:4300/healthz`; app + postgres слушат само на localhost зад Nginx.
- **adblock** (Supreme AdBlock): ЧИСТ СТАТИЧЕН сайт — без билд, Node или база. Копира
  обслужваните файлове (`adblock/server/{index.html,privacy.html,robots.txt,sitemap.xml,
  llms.txt,*.png,*.webp}`) в `/var/www/adblock`. `filters.json` се публикува САМО заедно с
  валидния си Ed25519 подпис (подписва се в staging, после `mv` на двойката); без ключ
  (`/etc/caddy/adblock-signing.key`) старата подписана двойка остава и деплоят
  сигнализира — Chrome 137+ иначе отхвърля всички live ъпдейти. Без access логове (Caddy
  без `log`, nginx `access_log off`) — това обещава политиката за поверителност.
  Инсталира/обновява Caddy сайт-блока (`adblock/server/Caddyfile` →
  `/etc/caddy/sites/adblock.caddy` + `import sites/*.caddy` в главния Caddyfile),
  `caddy validate` **преди** reload (нула downtime; при невалиден конфиг — връща стария
  блок и не презарежда). Разширението тегли `filters.json`; `index.html` е витрина, а
  `/privacy` (rewrite към `privacy.html`) е политиката за поверителност от Web Store.
  Health-ът е best-effort HTTPS на публичния адрес — минава едва след като **DNS A/AAAA
  за `adblock.carbonstealth.eu` сочи VPS-а** (ръчна стъпка) и Caddy издаде TLS; провал тук
  е предупреждение, не блокира деплоя. Няма тайни (чисто статично).
  Само adblock: `sudo bash deploy/adblock-site.sh` — обвивка, която вика същия път с
  `PROJECTS="adblock"` (през `fetch-deploy.sh`, или `autodeploy.sh` при подаден `ARCHIVE=`);
  втора реализация вече няма, защото старата изостана от тази.
- **ospedali** (Ospedali Trasparenti): systemd модел като medqr/vizitka, **но БЕЗ
  `npm ci` и БЕЗ билд** — лек Node сервиз с нула зависимости обслужва предбилднатия
  статичен сайт от `site/` (вече в git). `rsync ospedalitrasparenti/ → /opt/ospedali` (изключва
  `server/.env`, `server/.state/` — тайни + рънтайм състояние оцеляват), самоинсталиращ
  се systemd unit (`ospedalitrasparenti/deploy/systemd/ospedali.service`, порт `127.0.0.1:8788`,
  User=`www-data`), `systemctl restart ospedali`; при провал — автоматичен rollback.
  Health на `127.0.0.1:8788/healthz`. Еднократно: DNS A запис, `.env` с
  `OSPEDALI_ADMIN_PASSWORD`+`OSPEDALI_SESSION_SECRET`, Nginx vhost + certbot →
  `ospedalitrasparenti/deploy/DEPLOY.md`.
- **panev** (Panev Ascensori): systemd модел като medqr/vizitka. `rsync panev/ → /opt/panev`
  (изключва `data/` — SQLite базата, `node_modules/`, `.env`), `npm ci --omit=dev`,
  сийд **само при липсваща база** (админ + каталог за `/admin`), снимка на базата преди
  рестарт, самоинсталиращ се systemd unit (`panev/deploy/systemd/panev.service`, порт
  `127.0.0.1:4102`, User=`panev`), `systemctl restart panev`; при провал — автоматичен
  rollback на кода **и** на базата. Health на `127.0.0.1:4102/api/health`. Тайните са в
  `/etc/panev/panev.env` (systemd `EnvironmentFile`, права 600) — при пръв деплой се
  генерира с random `JWT_SECRET` (без него приложението спира в продукция), `SMTP_PASS`
  остава `CHANGE_ME`. Еднократно: DNS, nginx vhost (301 `www.` → каноничния non-www) +
  certbot, ufw, бекъп cron → `panev/DEPLOY.md`.
- **piuma** (Instagram контент-двигател): Docker Compose (app + worker + db + redis + вътрешен
  nginx). `.env` идва от `PIUMA_ENV` и **не се генерира** — IG ключовете идват от конзолата на
  Meta; без него piuma се пропуска като „още ненастроен“, не като провал. `pg_dump` бекъп преди
  миграцията (последните 5, до `.env`; провален дъмп спира деплоя), `docker compose build` +
  `up -d` (миграциите — от entrypoint-а, `prisma migrate deploy`). Health + отделна проверка, че
  **работникът** тича; при празна база напомня `npm run owner:create` (собственикът не се създава
  автоматично) → `piuma/DEPLOY.md`.
- **korpora** (мебели в 3D, разкрой, CNC): Docker Compose (db + app на `127.0.0.1:4320`).
  Стъпките са в `korpora/deploy/deploy.sh` — същият скрипт и за ръчния деплой: тайните от
  `/opt/few-few/shared/korpora/.env` (не се генерират; без тях korpora се пропуска като „още
  ненастроен“), `build`, `pg_dump` точно преди смяната (последните 5; провален дъмп спира деплоя),
  `up -d` (миграциите — от entrypoint-а), сонда с маркер `"app":"korpora"`, vhost-ът от репото
  в nginx щом има сертификат, IndexNow само при променен sitemap. Ако новият код не отговори,
  `autodeploy.sh` пуска `deploy.sh` на последния работещ release (`KORPORA_LAST_GOOD`; чистенето
  на releases не го трие) с `KORPORA_SKIP_BACKUP=1` — откатът не изтласква дъмпа отпреди
  миграцията. Изключение: провалена миграция (`P3018`/`P3009` в лога на app) — старият код спира на
  същото, затова откат няма; скриптът сочи последния дъмп и вика човек → `korpora/DEPLOY.md`:
  обикновено `migrate resolve --rolled-back` (PostgreSQL е върнал миграцията цялата), а
  възстановяване от дъмпа — само ако данните трябва да се върнат.
- **chatchat** (AI поддръжка за табла на асансьори): Docker Compose (db с pgvector + clamav + app на
  `127.0.0.1:4330`). Моделът на korpora — стъпките са в `chatchat/deploy/deploy.sh` (и за ръчния деплой):
  тайните от `/opt/few-few/shared/chatchat/.env` (не се генерират; без тях chatchat се пропуска като „още
  ненастроен“ — само `ATTACHMENT_URL_KEY`/`MFA_ENC_KEY` се раждат на сървъра, ако липсват), папката за
  прикачените файлове (`shared/chatchat/attachments`, uid 1000, 700), `build`, образите на db/clamav —
  само ако ги няма, `pg_dump` точно преди смяната (последните 5; провален дъмп спира деплоя), еднократно
  преминаване на базата към pgvector с `REINDEX`, `up -d` (миграциите — от entrypoint-а), сонда на
  `/readyz`, дневният шифрован бекъп (база + файлове, age) и ретенцията като systemd таймери, vhost-ът от
  репото щом има сертификат. Ако новият код не отговори — `deploy.sh` на `CHATCHAT_LAST_GOOD` с
  `CHATCHAT_SKIP_BACKUP=1`; без откат при провалена миграция (`P3018`/`P3009`) и към release отпреди
  pgvector, щом базата вече е минала — вика човек → `chatchat/DEPLOY.md`.
- **chatchat-staging** (staging на ChatChat, §17.1) — **само изрично**, не е в `PROJECTS` по подразбиране:
  `sudo REF=<клон> PROJECTS="chatchat-staging" bash /opt/few-few/current/deploy/fetch-deploy.sh`. Стъпките са в
  `chatchat/deploy/staging.sh`: същият `docker-compose.yml` като compose проект `chatchat-staging` (свои
  контейнери, томове, база), тайни в `/opt/few-few/shared/chatchat-staging/.env` (600, собствени — пазачът
  отказва при тайна, порт, адрес или папка на продукцията), работно копие на кода извън `releases/`,
  `127.0.0.1:4331`, vhost `staging-chatchat.carbonstealth.eu` (noindex, парола/allowlist). След сондата —
  оценъчният набор (`evals/`) срещу отделна тестова база `chatchat_eval_test`; червена оценка (изход 5) =
  неуспешен деплой без откат (остава за преглед). Не отговаря (изход 4) → откат към `last-good` на staging
  без нов дъмп и без нова оценка. Пробег **само** със staging не мести `current` → `chatchat/DEPLOY.md`, т. 15.
- **vpsdash** (VPS таблото): systemd модел. `rsync` към `/opt/vps-dashboard` (конфигът
  `/etc/vps-dashboard/config.json` и state `/var/lib/vps-dashboard` са извън release-а и оцеляват;
  `deploy/desktop/desktop.env` се пази), бекъп на кода, рестарт, health на `/api/ping` (401 = жив,
  ping иска сесия), rollback като medqr. Пръв деплой без конфиг: пуска `deploy/install.sh`
  (конфиг + тайни + услуга) → `vpsdash/`.
- Health check на всеки сервис; маркира `current` release; пази последните 5 за връщане назад.

## Конфигурация

Промени блока „КОНФИГУРАЦИЯ“ най-горе в `autodeploy.sh` (или подай env променливи):

| Променлива | По подразбиране | Смисъл |
| --- | --- | --- |
| `PROJECTS` | `zabobovdol medqr nexus SupremeDiscordBot vizitka mastilko eternaltouch adblock ospedali vpsdash panev piuma korpora chatchat` | кои проекти да се разгръщат тук |
| `PANEV_DIR` | `/opt/panev` | път на panev (systemd) |
| `PANEV_ENV` | `/etc/panev/panev.env` | тайните на panev (600, `EnvironmentFile`) |
| `PANEV_HEALTH_URL` | `http://127.0.0.1:4102/api/health` | health на panev |
| `OSPEDALI_DIR` | `/opt/ospedali` | път на ospedali (systemd, без билд) |
| `OSPEDALI_HEALTH_URL` | `http://127.0.0.1:8788/healthz` | health на ospedali |
| `ADBLOCK_WWW` | `/var/www/adblock` | www root на статичния adblock сайт |
| `CADDY_SITES_DIR` / `CADDY_MAIN` | `/etc/caddy/sites` · `/etc/caddy/Caddyfile` | къде се инсталира adblock сайт-блокът + главен Caddyfile |
| `PIUMA_ENV` / `PIUMA_HEALTH_URL` | `/opt/few-few/shared/piuma/.env` · `http://127.0.0.1:4310/health` (портът се чете от `HTTP_PORT` в `.env`) | тайните и health на piuma |
| `KORPORA_LAST_GOOD` | `/opt/few-few/shared/korpora/last-good` | пътят на последния release на korpora, който е отговорил — към него е откатът |
| `KORPORA_SHARED` · `KORPORA_HEALTH_WAIT` · `KORPORA_INDEXNOW` | `/opt/few-few/shared/korpora` · `90` · `1` | тайни/бекъпи/данни (и за `autodeploy.sh`: къде са дъмповете), секунди за сондата, IndexNow |
| `CHATCHAT_SHARED` · `CHATCHAT_LAST_GOOD` | `/opt/few-few/shared/chatchat` · `…/last-good` | тайни/бекъпи/прикачени файлове на ChatChat; последният release, който е отговорил — към него е откатът |
| `CHATCHAT_STAGING_SHARED` · `CHATCHAT_STAGING_LAST_GOOD` | `/opt/few-few/shared/chatchat-staging` · `…/last-good` | тайни/данни/работни копия на staging; последното копие с зелена оценка — към него е откатът |
| `VPSDASH_DIR` / `VPSDASH_SERVICE` / `VPSDASH_HEALTH_URL` | `/opt/vps-dashboard` · `vps-dashboard` · `http://127.0.0.1:7700/api/ping` | път, systemd услуга и health на VPS таблото |
| `ARCHIVE` | (най-новият в `/root`) | конкретен архив |
| `FORCE_SEED` | `0` | принудителен сийд на zabobovdol |
| `ZBD_ENV` | `/opt/few-few/shared/zabobovdol/.env` | стабилният дом на тайните на zabobovdol (600) |
| `ZBD_HEALTH_URL` | `http://127.0.0.1:<HTTP_PORT>/api/health` | сонда на zabobovdol (с базата) |
| `ZBD_INDEXNOW` | `1` | IndexNow след успешен деплой на zabobovdol |
| `MEDQR_DIR` | `/opt/medqr` | път на medqr |
| `*_HEALTH_URL` | localhost | адрес за проверка на здравето |

## Портове на машината (регистър — нов продукт взема свободен оттук и го вписва)

Всички са само на `127.0.0.1` зад nginx/Caddy, освен 80/443 (прокси) и 22 (SSH). Източник: подразбиранията в
`autodeploy.sh` и в `docker-compose.yml` на продуктите (живият порт може да е друг — `HTTP_PORT` в `.env`;
провери с `ss -ltnp` преди нов). Към 10.10.2026:

| Порт | Продукт | Порт | Продукт |
| --- | --- | --- | --- |
| 80 | zabobovdol (nginx в compose) | 4310 | piuma |
| 3000 | medqr | 4320 | korpora |
| 3100 | зает от ERP (docker-proxy) | 4330 | chatchat |
| 3105 | vizitka | **4331** | **chatchat-staging** |
| 3200 | mastilko | 5435 / 6381 | SupremeDiscordBot (Postgres / Redis) |
| 4000 | nexus | 5437 | eternaltouch (Postgres) |
| 4102 | panev | 7700 | vpsdash |
| 4300 | eternaltouch | 8080 · 8788 | SupremeDiscordBot (frontend) · ospedali |

`METRICS_PORT` на chatchat/chatchat-staging — празно = случаен порт на `127.0.0.1` (без сблъсък).

## Нов сървър (IaC)

`sudo bash deploy/provision/chatchat-host.sh --check` (само докладва; изход 2 = има разлики), после без
`--check`; `--dns` проверява A/AAAA преди certbot. Идемпотентен, не пипа чужди конфигурации (vhost-ове,
`daemon.json`, чужди правила на ufw), не обновява съществуващ Docker → `chatchat/DEPLOY.md`, т. 13–14.

## Важно

- **Тайните не са в архива.** `zabobovdol/.env`, `/etc/medqr/medqr.env`,
  `/etc/panev/panev.env` (JWT_SECRET + SMTP), `/opt/mastilko/.env` (GEMINI_API_KEY, по желание) и четирите
  `SupremeDiscordBot/*.env` (корен, `backend/`, `bot/`, `frontend/`) живеят на сървъра (права 600).
  Скриптът пренася съществуващите `.env` при всеки деплой.
- **`current` е общ за всички продукти** — мести се при успешен деплой на който и да е от тях.
  Тайни, които се пренасят „от `current`", остават назад в стар release при деплой на друг
  продукт и падат под ножа на `KEEP_RELEASES`. Затова Supreme ги огледава в
  `/opt/few-few/shared/SupremeDiscordBot/` (реален инцидент, 17.09.2026 — гейт
  `tools/vps/autodeploy-env.test.mjs`). Нов продукт с `.env` в release папката трябва да
  следва същия модел, не да пренася само от `current`.
- Скриптът е **идемпотентен** и прави бекъп преди презапис на medqr.
- Първоначалната настройка на сървъра (юзъри, `ufw`, systemd unit, Nginx/Caddy, TLS) се
  прави веднъж — виж `zabobovdol/DEPLOY.md` и `medqr/deploy/DEPLOY.md`.
- Поддържа се от агента **„VPS-аджията“** (`.claude/agents/vps-adjiyata.md`).
