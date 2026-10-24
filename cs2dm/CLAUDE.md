# cs2dm/ — „CarbonStealth.eu | Dust2 DM“ (CS2 сървър)

CS2 общностен сървър: **само de_dust2, Deathmatch (FFA)**, по-късно с наши плъгини
(CounterStrikeSharp), уеб сайт + панел с пълен контрол и Discord с VIP роли. Root правилата живеят
в кореновия `CLAUDE.md`. Пълното проучване и решенията на собственика:
`research/cs2-dust2-dm/README.md` (в отделния PR на проучването).

_Сега: **фаза 1** (ванилов сървър под systemd на сегашния VPS) + **фаза 2** (Metamod 2.0 +
CounterStrikeSharp + DM плъгин на NockyCZ, заковани по sha256) + **фаза 3** (нашият C# плъгин
CarbonStealth на PostgreSQL: банове, админ меню, статистики/XP, банери, реклами, мост към сайта) +
**сайтът, етап 1** (`app/` — публичната част: статус, класация, профили, банлист, VIP, правни страници;
Express + EJS + Prisma + Redis + BullMQ). Следва: уеб панел и вход със Steam (етап 2), Discord бот.
Банове и класация — **публични на сайта** (решение на
собственика), затова админ системата е наша на Postgres, не CS2-SimpleAdmin (MySQL + три
неподдържани меню зависимости). Договорът между плъгин и сайт: `CONTRACT.md`._

## Команди (quality gate)

```bash
cd cs2dm
npm run gate      # сървърът: lint (bash -n, node --check) + node --test + tools/vps/deploy-check.mjs
npm run plugins   # C# плъгинът: тестове на логиката + Release билд (warnings-as-errors, заключени пакети); .NET SDK 10

cd cs2dm/app      # сайтът — СВОЙ гейт и свои зависимости (CI: задачи `app` + `app-integration`)
npm ci && npm run typecheck && npm run format:check && npm test && npm run build
DATABASE_URL=postgresql://… npm test   # + интеграционните (истинска база + Redis на REDIS_TEST_URL, /15)
npm run dev                            # локално на :4330 (DATABASE_URL, REDIS_URL от .env)
```

Сървърът е с нула зависимости → без `npm ci`. На сървъра: `sudo bash server/install.sh --check`
(само проверки). Без `DATABASE_URL` интеграционните тестове се пропускат чисто; със — създават само
SteamID-та `76561190000990xxx` и ги трият преди и след себе си.

## Структура

```
server/install.sh                    идемпотентен инсталатор (--check · --validate)
server/update.sh                     UpToDateCheck по PatchVersion → steamcmd → cfg → старт
server/a2s.mjs, server/health.mjs    A2S_INFO клиент + CLI за здраве (аналогът на /health)
server/cfg/gamemode_deathmatch_server.cfg   ВСИЧКИ наши настройки (името, ботове, DM)
server/cs2dm-lib.sh                  общи функции: патч на gameinfo.gi, проверка на зареждането, ванилов резерв
server/mods/mods.lock                заковани модове: име · версия · URL · sha256 · метод
server/mods/install-mods.sh          фаза 2: сваля, проверява sha256, инсталира, рестартира (--status · --disable)
server/mods/config/                  core.json (CSS) · Deathmatch.json (генериран от типовете на плъгина)
server/systemd/                      cs2.service · cs2-update.service · cs2-update.timer
server/cs2.env.example               шаблон за /etc/cs2/cs2.env (GSLT, IP, порт, слотове)
server/mods/install-plugins.sh       фаза 3: билд на CarbonStealth (dotnet или SDK контейнер по digest) → инсталиране → конфиг 0600
server/mods/plugin-config.mjs        конфигът на плъгина от /etc/cs2/cs2.env (валидира, нищо тайно в изхода)
plugins/src/CarbonStealth.Logic/     чиста логика без CSS (XP, роли, срокове, мост/HMAC, банери) — xunit тестове
plugins/src/CarbonStealth/           плъгинът: един partial клас по тема (Admin, AdminMenu, Banners, Adverts,
                                     BridgeCommands, Chat, Connection, Stats) + Data/ (Npgsql) + lang/ (en, bg)
plugins/scripts/build.sh             тестове + publish в plugins/out/; DeathmatchAPI.dll от архива в mods.lock
addon/                               банери-картинки: build_textures.py → PNG, OBJ плоскости, Workshop стъпки
CONTRACT.md                          роли, наказания, XP, heatmap, мост, одит, срокове, банери
test/                                node --test: A2S протокол + конфиг/unit/скриптове + плъгин (конфиг, lang)

app/                                 публичният сайт cs2.carbonstealth.eu (етап 1) — Node 22 · TS strict ESM
  prisma/schema.prisma + migrations/ ЕДИНСТВЕНИЯТ източник на схемата (C# плъгинът пише по @map имената)
  src/index.ts · src/worker.ts       уеб процесът · BullMQ работникът (чистене по CONTRACT §7, на 6 ч)
  src/server.ts                      Express 5: helmet (строг CSP с nonce), rate limit, pino без IP, 404/500
  src/routes/pages.ts                /{bg|en|it}/: начало, leaderboard, player/:steamId64, bans, vip, правни
  src/routes/root.ts                 / → език · robots.txt · sitemap.xml · llms.txt · IndexNow · /bans без език
  src/routes/health.ts               /health — база + Redis, JSON, 200/503
  src/data/repo.ts                   интерфейсът (само публичните полета) · prisma-repo.ts · cached-repo.ts
  src/levels.ts · mastery.ts · heatmap.ts   формулите от CONTRACT §3–4 (тестови стойности в tests/)
  src/live.ts                        `cs2dm:live` от Redis → статус (липсва/повреден/стар = НЕИЗВЕСТЕН)
  src/seo.ts · content.ts            canonical/hreflang/OG/JSON-LD · дати на промяна, срокове, разделите
  locales/{bg,en,it}.json            всички текстове (bg = източник; паритетът е тест)
  views/                             EJS: partials/head.ejs (целият SEO head) · страниците · error.ejs
  public/                            site.css · app.js (само „Копирай“) · шрифтове Sofia Sans (OFL) · og.png
  scripts/og.py                      прави og.png и apple-touch-icon.png (Pillow) при смяна на визията
  Dockerfile · docker-compose.yml    db + redis + web + worker; портове САМО на 127.0.0.1 (4330/5442/6392)
  deploy/nginx/cs2.carbonstealth.eu.conf   TLS + HSTS + прокси към 127.0.0.1:4330
```

На машината: играта `/opt/cs2/server` (потребител `cs2`), SteamCMD `/opt/cs2/steamcmd`, скриптовете,
които root пуска — `/usr/local/lib/cs2dm` (извън дома на `cs2`), тайните — `/etc/cs2/cs2.env` (0600).

## Конвенции (важно)

- **Червена линия — правилата на Valve за GSLT:** нищо, което симулира предмети (скинове, ножове,
  ръкавици, агенти) или рангове. Перманентен бан на токена + matchmaking cooldown за собственика.
  `FollowCS2ServerGuidelines` никога `false` (тест го пази).
- **Настройките са само в `gamemode_deathmatch_server.cfg`.** `server.cfg` е в депото на Valve и
  ъпдейт може да го презапише; нашият файл го няма в депото и Valve го изпълнява при всяко зареждане
  на картата. `hostname` е там, никога в shell/env (`|` е pipe).
- **Нов cvar → първо проверка в dump-а** (`SteamDatabase/GameTracking-CS2/DumpSource2/convars.txt`)
  и запис в `KNOWN_CVARS` в `test/config.test.mjs`. Несъществуващ cvar CS2 тихо игнорира.
- **Тайни** (GSLT, по-късно RCON/DB/Discord) — само в `/etc/cs2/cs2.env`. В unit-а проверката за GSLT
  ползва `$$CS2_GSLT` (shell-ът го чете от средата), за да не го впише systemd в командния ред.
- **Винаги през `game/cs2.sh`**, не директно бинарника (задава `LD_LIBRARY_PATH`).
- **Без `MemoryDenyWriteExecute=`** в unit-а — .NET JIT на CounterStrikeSharp (фаза 2) пише
  изпълнима памет.
- Остарял сървър изпада от листинга → `cs2-update.timer` проверява на 10 минути; ъпдейтът рестартира.
- **Модове = един ред в `gameinfo.gi`** (`Game csgo/addons/metamod` под `Game_LowViolence csgo_lv`).
  Всеки ъпдейт на CS2 го трие → `cs2dm_restart_with_mods_or_fallback` го връща и доказва зареждането
  по реда `Finished loading plugin Deathmatch` в journald. Не тръгнат ли — **ванилов старт** (DM е
  вграден), версията в `/var/lib/cs2dm/mods-broken`, нов опит на 6 часа при празен сървър.
- **Нов мод/версия → ред в `mods.lock` с sha256, сметнат от теб върху свален файл**, никога от
  страница. Тестът изисква HTTPS и 64-hex хеш.
- **`Deathmatch.json` без pay-to-win**: VIP = обикновен играч (респаун, HP, ограничения, „Only for
  VIP“); тестът го пази. Генерира се от типовете на плъгина (`DeathmatchConfig` + STJ опциите на
  CSS), не на ръка — при нова версия на плъгина се генерира наново.
- Споделен VPS: `CPUWeight=1000` + `Nice=-5`; закрепване към ядра (`AllowedCPUs=`) само след измерване,
  в drop-in. Изходен план: всичко е преносимо на отделна машина.

### Плъгинът CarbonStealth (C#)

- **Игровите обекти — само в игровата нишка; базата и Redis — само извън нея.** `RunDb(work, onGameThread)`
  връща резултата през `Server.NextFrame`. След асинхронна работа никога не пипай `CommandInfo` или стар
  контролер — пази **слота** и вземи играча наново (`Tell(slot, …)`, `Utilities.GetPlayerFromSlot`).
- **Логиката без CSS отива в `CarbonStealth.Logic`** и се тества с xunit; плъгинът само я вика.
- **CSS API, Microsoft.Extensions.* и DeathmatchAPI — само за компилиране** (`ExcludeAssets=runtime` /
  `Private=false`). Копие в папката на плъгина = втори тип в процеса → capability-то и DI се чупят.
  `build.sh` го проверява.
- Нов текст в играта → ключ в **двата** `lang/*.json` (тест за паритет и за ключовете в кода).
  Ник/чат/причина минават през `Text.SafeName`/`SafeText` (цветови тагове `{…}`).
- Ново действие на моста → `BridgeProtocol.Actions` + `BridgeCommands.cs` + `CONTRACT.md` §5 едновременно.
- Нова колона/таблица → миграция в `app/prisma` (Prisma е собственикът на схемата), после SQL-а в `Data/`.
- Пакетите са заключени (`packages.lock.json`, `RestoreLockedMode`); нов пакет/версия → `dotnet restore
  --force-evaluate` и lock файлът в същия PR.

## Конвенции на сайта (`app/`)

Моделът е `piuma/` (Express 5 + EJS + TS strict ESM + Prisma 6.19 + ioredis + BullMQ + pino + helmet +
zod); код между продуктите не се споделя — само шаблоните са преписани.

- **Схемата е договор.** `prisma/schema.prisma` и миграциите се пипат само заедно с C# плъгина и
  `CONTRACT.md`, в същия PR. Сайтът на етап 1 само ЧЕТЕ (работникът трие по сроковете).
- **Банлистът показва САМО** `steam_id`, `target_name`, `category`, `created_at`, `expires_at` — и то
  само активните (CONTRACT §2). `PUBLIC_BAN_SELECT` в `prisma-repo.ts` изброява полетата; типът
  `PublicBan` няма `reason`; тестът подава ред С причина, IP и админ и доказва, че не стигат до HTML.
  Банлистът е `noindex` (мета + `X-Robots-Tag`) и не е в sitemap. Нов публичен ред → нов тест.
- **`hidden_from_leaderboards = true`** (чл. 21 GDPR) скрива играча от класацията, профила (404) и sitemap.
- **Статусът на живо никога не се измисля.** Липсващ/повреден/по-стар от 60 s `cs2dm:live` →
  „статусът е неизвестен“ и `GameServer` без `serverStatus`.
- **Heatmap:** само агрегирани клетки 32 px, прозорец 30 дни със закъснение 1 час, наша решетка A–H ×
  1–8; никакъв радар, лого, скин или друго изображение на Valve.
- **Формулите са в един файл** (`levels.ts`, `mastery.ts`, `heatmap.ts`) с тестовите стойности от
  CONTRACT — същите константи като в C#. Промяна → и в плъгина.
- **Текстовете са само в `locales/`** (bg първо; en/it пълен паритет, IT на „Lei“ с «…»). Тестът
  забранява кирилица в шаблоните и маршрутите (освен логове и коментари `<%# %>` / `<!-- ПОТВЪРДИ -->`).
- **SEO на всяка страница:** заглавие < 60, описание < 160, един H1, canonical, hreflang bg/en/it +
  x-default→bg, OG + `summary_large_image`, JSON-LD (Organization + WebSite + WebPage + BreadcrumbList;
  начало: + GameServer + FAQPage), ≥ 5 ключови думи с „Carbon Stealth“, подписът „Created and Designed
  by Carbon Stealth VCC“. `tests/seo.test.ts` обхожда всички страници на трите езика.
- **Без бисквитки, без тракери, без inline стил/скрипт** (CSP `style-src 'self'`; прогрес = `<progress>`).
  Единственият скрипт е `public/app.js` (бутонът „Копирай“). Логовете нямат IP (политиката го обещава).
- **Нула измислени данни:** празна база → празни състояния; фирмените данни и контактът идват от
  `.env` (`COMPANY_*`, `CONTACT_EMAIL`) и при липса се показват като „не е въведено (ПРОМЕНЛИВА)“.
- **Пари:** `vip_tiers.price_cents` — цели евроцентове с ДДС; форматира се само при показ
  (`centsToDecimal` → Intl с точен десетичен низ).
- **Правните текстове са чернова** (обща информация, не правен съвет). Държавата на хостинга и срокът по
  ЗСч са маркирани с `<!-- ПОТВЪРДИ: … -->` в `views/privacy.ejs`. При промяна → дата в `content.ts`.
- **Портовете:** сайт `127.0.0.1:4330`, Postgres `127.0.0.1:5442`, Redis `127.0.0.1:6392` (за плъгина на
  хоста) — никога на всички интерфейси (Docker заобикаля ufw). Тестът `infra.test.ts` го пази.
- SEO промяна след деплой → `node tools/seo/indexnow.mjs https://cs2.carbonstealth.eu` (ключът е в
  `public/indexnow-key.txt`; не е тайна).
