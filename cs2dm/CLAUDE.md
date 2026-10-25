# cs2dm/ — „CarbonStealth.eu | Dust2 DM“ (CS2 сървър)

CS2 общностен сървър: **само de_dust2, Deathmatch (FFA)**, по-късно с наши плъгини
(CounterStrikeSharp), уеб сайт + панел с пълен контрол и Discord с VIP роли. Root правилата живеят
в кореновия `CLAUDE.md`. Пълното проучване и решенията на собственика:
`research/cs2-dust2-dm/README.md` (в отделния PR на проучването).

_Сега: **фаза 1** (ванилов сървър под systemd на сегашния VPS) + **фаза 2** (Metamod 2.0 +
CounterStrikeSharp + DM плъгин на NockyCZ + проверени модове — ServerListPlayersFix, Quake Sounds, лъч при
смърт, SourceTV демота, Cheater Troll, MetaBlock — всички заковани по sha256) + **фаза 3** (нашият C# плъгин
CarbonStealth на PostgreSQL: банове, админ меню, статистики/XP, банери, реклами, мост към сайта) +
**сайтът, етап 1** (`app/` — публичната част: статус, класация, профили, банлист, VIP, правни страници;
Express + EJS + Prisma + Redis + BullMQ) + **агентът на хоста** (`server/agent/`, CONTRACT §9 — ръцете на
панела върху systemd, без root) + **уеб панелът, етап 2** (`app/src/admin`, `/admin`: вход със Steam,
задължителен TOTP, права по §1, мостът към плъгина и агентът) + **живи настройки** (`server_settings`,
CONTRACT §11 — реклами, патрони, ботове, XP множител, поздрав; панел ↔ игра) + **събития по график**
(`events`, §12 — XP уикенд/режим/общностно; панел → плъгин на 30 s → начална страница + JSON-LD) + **картата на
мача** (`matches`, §13 — топ 3 в чата, `/{език}/match/:id`, последните мачове; 90 дни). Следва: Discord бот, формите за играчите.
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
(само проверки); агентът — `sudo bash server/agent/install-agent.sh` (идемпотентен, накрая самопроверка).
`test/agent.test.mjs` ползва фалшив RESP сървър (CI е без Redis); ако има Redis на `127.0.0.1:6379`
(`CS2DM_TEST_REDIS_PORT`), тича и срещу него — база 14, канали `cs2dm-test:<uuid>:…`, чисти след себе си. Без `DATABASE_URL` интеграционните тестове се пропускат чисто; със — създават само
SteamID-та `76561190000990xxx` (панелът — `991xxx`…`995xxx`, настройките — `996xxx`, статистиките и SQL-ът на плъгина — `997xxx`,
събитията — `998xxx`; те трият и своите събития) и ги трият преди и след себе си; одитът
остава (веригата не се реже). Локално: `REDIS_TEST_URL=redis://127.0.0.1:6379/<база>`.

## Структура

```
server/install.sh                    идемпотентен инсталатор (--check · --validate)
server/update.sh                     UpToDateCheck по PatchVersion → steamcmd → cfg → старт
server/a2s.mjs, server/health.mjs    A2S_INFO клиент + CLI за здраве (аналогът на /health)
server/cfg/gamemode_deathmatch_server.cfg   ВСИЧКИ наши настройки (името, ботове, DM)
server/cs2dm-lib.sh                  общи функции: патч на gameinfo.gi, проверка на зареждането, ванилов резерв
server/mods/mods.lock                заковани модове: име · версия · URL · sha256 · метод (tar · zip · cssplugin)
server/mods/install-mods.sh          фаза 2: сваля, проверява sha256, инсталира, рестартира (--status · --disable)
server/mods/mods-lib.sh              чистите решения: addon-и (+ звуците), CS2DM_SKIP_MODS, пътища и конфиги на мод
server/mods/demos-clean.sh           SourceTV демотата: по-стари от 14 дни + таван в GB (вика го таймерът)
server/mods/plugins-apply.sh         плъгините от панела (CONTRACT §14), root: <op>-<id> → местене / install-mods.sh
server/mods/config/                  core.json (CSS) · Deathmatch.json (генериран от типовете на плъгина) ·
                                     QuakeSounds · Cosmetics · DemoRecorder · MetaBlock (.json — наши, презаписват се,
                                     освен ако панелът ги е редактирал; копие като <К>.default.json)
server/systemd/                      cs2.service · cs2-update.service/.timer · cs2-demos-clean.service/.timer ·
                                     cs2-plugins@.service (плъгините от панела, §14)
server/cs2.env.example               шаблон за /etc/cs2/cs2.env (GSLT, IP, порт, слотове)
server/mods/install-plugins.sh       фаза 3: билд на CarbonStealth (dotnet или SDK контейнер по digest) → инсталиране → конфиг 0600
server/mods/plugin-config.mjs        конфигът на плъгина от /etc/cs2/cs2.env (валидира, нищо тайно в изхода)
server/agent/cs2-agent.mjs           агентът за панела (CONTRACT §9): подписани команди от Redis → status · start · stop · restart ·
                                     update · logs · plugins · plugin; A2S → cs2dm:a2s на 10 s; собствен RESP клиент (zero-dep)
server/agent/agent-plugins.mjs       плъгините в агента (§14): каталог, състояние от файловете (само чете), cs2-plugins@ аргументи
server/agent/cs2-agent.service       unit: cs2agent, без root и без запис (ProtectSystem=strict, ProtectProc=invisible…)
server/agent/50-cs2dm-agent.rules    polkit: cs2agent САМО start/stop/restart cs2.service · start cs2-update.service ·
                                     start cs2-plugins@(install|remove|enable|disable)-<id>.service, иначе NO
server/agent/install-agent.sh        потребител · файлове · ключове (agent.env + app.env) · unit · polkit · самопроверка
plugins/src/CarbonStealth.Logic/     чиста логика без CSS (XP, роли, срокове, мост/HMAC, банери, CSS права,
                                     AFK/пинг, настройки, събития, карта на мача, каталог на плъгините) — xunit тестове (един файл
                                     с тестове на тема)
plugins/src/CarbonStealth/           плъгинът: един partial клас по тема (Admin, AdminMenu, Banners, Adverts = живите
                                     настройки + рекламите, BridgeCommands, Chat, Connection, Stats, CssFlags, FairPlay,
                                     Events, Match, MatchEnd, PluginsBridge = плъгините от панела) + Data/ (Npgsql) + lang/ (en, bg)
plugins/scripts/build.sh             тестове + publish в plugins/out/; DeathmatchAPI.dll от архива в mods.lock
addon/                               банери-картинки: build_textures.py → PNG, OBJ плоскости, Workshop стъпки
CONTRACT.md                          роли, наказания, XP, heatmap, мост, одит, срокове, банери
test/                                node --test: A2S протокол + конфиг/unit/скриптове + плъгин (конфиг, lang) + агентът +
                                     модовете (modpack: mods-lib, конфигите, демотата, GSLT)

app/                                 сайтът cs2.carbonstealth.eu (етап 1) + панелът /admin (етап 2) — Node 22 · TS strict ESM
  prisma/schema.prisma + migrations/ ЕДИНСТВЕНИЯТ източник на схемата (C# плъгинът пише по @map имената)
  src/index.ts · src/worker.ts       уеб процесът · BullMQ работникът (чистене по CONTRACT §7, на 6 ч)
  src/server.ts                      Express 5: helmet (строг CSP с nonce), rate limit, pino без IP, 404/500
  src/routes/pages.ts                /{bg|en|it}/: начало, leaderboard, player/:steamId64, bans, vip, правни
  src/routes/matches.ts              /{bg|en|it}/matches и /match/:id (§13) · match-view.ts · event-seo.ts (§12 JSON-LD)
  src/routes/root.ts                 / → език · robots.txt · sitemap.xml · llms.txt · IndexNow · /bans без език
  src/routes/health.ts               /health — база + Redis, JSON, 200/503
  src/data/repo.ts                   интерфейсът (само публичните полета) · prisma-repo.ts · cached-repo.ts
  src/levels.ts · mastery.ts · heatmap.ts   формулите от CONTRACT §3–4 (тестови стойности в tests/)
  src/settings.ts                    живите настройки (§11): ключове, строги zod схеми, стойности по подразбиране
  src/events.ts                      събитията (§12): видове, тавани, местно време ↔ UTC (DISPLAY_TZ, без библиотека)
  src/data/public-extra.ts           публичното четене след етап 1 (събития, мачове) — PrismaRepo само препраща
  src/live.ts                        `cs2dm:live` (< 60 s) → `cs2dm:a2s` (< 30 s, агентът) → НЕИЗВЕСТЕН; списъкът за панела
  src/admin/                         панелът /admin (етап 2): index.ts сглобява · routes/ (един файл на раздел) ·
                                     sessions · totp(-service) · steam-openid · rbac (§1) · guards (CSRF, лимити) ·
                                     commands + signing (мостът/агентът) · punish · audit (+ проверка на веригата)
  views/admin/ · public/admin*.css   изгледите и стиловете на панела — отделно от публичната част; admin.js = потвърждения
  src/seo.ts · content.ts            canonical/hreflang/OG/JSON-LD · дати на промяна, срокове, разделите
  locales/{bg,en,it}.json            всички текстове (bg = източник; паритетът е тест)
  views/                             EJS: partials/head.ejs (целият SEO head) · страниците · error.ejs
  public/                            визията „Dust2 field edition“ (по дизайна на собственика): base · atoms · chrome (горе/долу) ·
                                     home-* (началото) · pages · tables · profile (.css, всеки ≤ 300 реда) · img/ (WebP: печатната
                                     карта, Mid вратите, фонът на вътрешните страници) · app.js (меню + „Копирай“) · Sofia Sans (OFL) · og.png
  scripts/og.py                      прави og.png и apple-touch-icon.png (Pillow) при смяна на визията
  Dockerfile · docker-compose.yml    db + redis + web + worker; портове САМО на 127.0.0.1 (4350/5442/6392)
  deploy/nginx/cs2.carbonstealth.eu.conf   TLS + HSTS + прокси към 127.0.0.1:4350
```

На машината: играта `/opt/cs2/server` (потребител `cs2`), SteamCMD `/opt/cs2/steamcmd`, скриптовете,
които root пуска — `/usr/local/lib/cs2dm` (извън дома на `cs2`), тайните — `/etc/cs2/cs2.env` (0600).
Агентът: `/usr/local/lib/cs2dm/agent/cs2-agent.mjs` (root:root 0644, потребител `cs2agent`), неговият env —
`/etc/cs2/agent.env`; env файлът на сайта (`docker compose --env-file`) — `/etc/cs2/app.env`. Env файловете са 0600 root.

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
  по реда `Finished loading plugin Deathmatch` с час след рестарта в лога на CSS
  (`addons/counterstrikesharp/logs/log-all*.txt`), резервно в journald — stdout на играта към journald
  се буферира и на VPS-а редът не стигна навреме. Не тръгнат ли — **ванилов старт** (DM е
  вграден), версията в `/var/lib/cs2dm/mods-broken`, нов опит на 6 часа при празен сървър.
- **Нов мод/версия → ред в `mods.lock` с sha256, сметнат от теб върху свален файл**, никога от
  страница. Тестът изисква HTTPS и 64-hex хеш. Преди това: **целият код на мода прочетен** (не README-то),
  лиценз, разположение на архива (`tar`/`zip` = с `addons/`; `cssplugin` = папката на плъгина в корена) и
  метаданните на DLL-а — референцията към `CounterStrikeSharp.API` ≤ нашата версия и всеки член съществува в
  нея (четене на метаданни, без изпълнение). После в същия PR: `cs2dm_mod_paths` (какво маха изключването),
  `cs2dm_mod_config` + `config/<Име>.json` (ако го настройваме), ред в таблицата на `README.md`, тест в
  `test/modpack.test.mjs`, **и каталогът на панела на петте места** (CONTRACT §14: `CS2DM_PANEL_MODS`,
  `agent-plugins.mjs`, C# `PluginCatalog`, `app/src/admin/plugins-catalog.ts` + текстът в трите речника, таблицата в
  §14) — `test/plugins-catalog.test.mjs` пада, ако мод от `mods.lock` липсва в панела. Изключване на сървъра:
  `CS2DM_SKIP_MODS` (докато панелът не е решил — после `removed=` в `/var/lib/cs2dm/plugins.state` го замества);
  звуците: `CS2DM_QUAKE_SOUNDS`.
- **Плъгините от панела (§14) — само проверен каталог**, никога линк/качване от сайта (решение на собственика).
  Постоянното е на root (`plugins-apply.sh` през `cs2-plugins@<op>-<id>.service`, инстанцията се проверява наново),
  живото — на нашия плъгин (`css_plugins load|unload`, конфигът в `configs/plugins/<К>/`). Спрян CSS мод е в
  `plugins/disabled/<Име>` (CSS прескача папката), спрян Metamod мод — `<vdf>.disabled` (важи след рестарт).
  `install-mods.sh` пише root копие на `server/` в `/usr/local/lib/cs2dm/server` — оттам тича `cs2-plugins@`.
- **Конфиг на чужд плъгин, който пази данни, не се презаписва** (CheaterTroll — списъкът с читъри е в
  неговия JSON). Нашите конфиги (`QuakeSounds`, `Cosmetics`, `DemoRecorder`, `MetaBlock`) се презаписват при
  всяко `install-mods.sh` — това нулира и `data` на QuakeSounds (SteamID → език/заглушаване), така е обещано.
  **Изключение:** конфиг, редактиран от панела (маркер `.cs2dm-panel` в папката му), остава; нашият е винаги и
  като `<К>.default.json` за „Върни по подразбиране“.
- **Workshop addon-ите са един списък:** `cs2dm_addon_list` = `CS2_WORKSHOP_ADDONS` на собственика + звуците
  на quakesounds накрая, без повторения → `mm_extra_addons`. Нов addon от мод → там, не в env на собственика.
- **Демотата са лични данни:** папка 0750 само за `cs2`, срок **14 дни** = `RETENTION.demosDays`
  (`app/src/content.ts`) = аргументът в `cs2-demos-clean.service` (тест), таван `CS2DM_DEMO_MAX_GB`.
  `tv_relayvoice 0` (без глас), `tv_maxclients 0` (без зрители); `tv_enable` го пуска само DemoRecorder.
  Unit-ът за чистене е без `EnvironmentFile` (не му трябват тайните) и без мрежа.
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
- **WASD менюто (`!admin`)** е HTML в центъра (`AdminHud.cs` — тикове, клавиши, замръзване; `AdminMenu*.cs` —
  страниците; навигацията и рисуването са в `CarbonStealth.Logic/HudMenu.cs` с тестове). Страницата се строи
  наново при всяко рисуване (живи данни) — пази го евтино; всичко от играчи минава през `HudMenuRenderer.Escape`.
  HTML-ът се праща на **всеки тик** и менюто се записва в `MenuManager` на CSS — DM плъгинът не пише в центъра
  на играч с активно меню (иначе пише на всеки тик върху нашето → мигане); CSS не чисти записа при излизане →
  `DropHud`. Админът се държи на място на всеки тик: `VelocityModifier = 0` (клиентът го предсказва) +
  `MOVETYPE_OBSOLETE` (заради noclip) — хваща и тялото след респаун; при затваряне се връщат стойностите отпреди.
  Ново действие = право в `Roles` + метод с одит + ред в менюто + чат команда, ако има смисъл.
- **Права на CSS за чужди плъгини само през `CssFlagMap`** (`CarbonStealth.Logic/CssFlags.cs`, CONTRACT §1):
  `SyncCssFlags` след всяко зареждане на ролята (`ApplySnapshot`), `CssFlagLedger` помни кои права са наши →
  махаме само тях (понижение, излизане, `Unload`); admins.json на собственика не се пипа. **Никога `@css/vip`**
  (DM плъгинът го чете за VIP → pay-to-win) **и `@css/root`** — тест в C# и в node.
- **Честна игра (`FairPlay.cs`) никога не изритва** — само наблюдател. AFK брои секунди без вход (клавиши
  или поглед) само докато е жив; смърт = пауза, не нулиране; след респаун погледът се засича наново. Пинг —
  средно за 30 засичания, предупреждение, още 15 → наблюдател. Изключения: HELPER+ и отворено WASD меню
  (`_huds`); ролята още не е заредена → не пипаме. Праговете: `CS2DM_AFK_SECONDS` / `CS2DM_MAX_PING`.
- **Защитата при поява е наша (`SpawnProtection.cs` + `CarbonStealth.Logic/SpawnShield.cs`)**, не на DM: в 1.3.6
  неговата кука проверява `DesignerName == "cs_player_pawn"`, а пешката е `"player"` → никога не тръгва, а
  `mp_respawn_immunitytime` DM го нулира при всяка карта. В `Deathmatch.json` „Spawn Protection Time“ е 0
  (без наслагване). Щета се спира само с `HookResult.Handled` от `OnEntityTakeDamagePre` (CSS 1.0.378 —
  `Damage = 0` + `Continue` не стига). Изстрелът сваля защитата; секундите — `CS2DM_SPAWN_PROTECTION` (0–15).
- Нова колона/таблица → миграция в `app/prisma` (Prisma е собственикът на схемата), после SQL-а в `Data/`.
- **Статистиките са `+=` с епоха (§3).** Нов агрегат → колона + `PlayerDelta` + `StatsWriter` (с
  `WHERE ред.stats_epoch <= EXCLUDED.stats_epoch`) + полето в редактора на панела (`stats-edit.ts`). Партидата
  (`CarbonStealth.Logic/StatsBatch.cs`) се пълни през `Delta(state)` — с епохата на играча, никога без нея.
  `tests/integration-plugin-sql.test.ts` пуска ИСТИНСКИЯ SQL от `StatsWriter.cs` срещу базата (`csharp-sql.ts`
  чете константите в тройни кавички) — нов SQL на плъгина в константа = може да се тества така.
- **Мачът (§13)** се следи в `CarbonStealth.Logic/MatchTracker.cs` (xunit); SQL-ът е в константи в
  `Data/MatchStore.cs` (тестван от `tests/integration-matches.test.ts`). Нищо, което прилича на MVP музика/кит.
- **Живите настройки (§11):** нова група = ключ в `SETTING_KEYS` + строга схема (`app/src/settings.ts`) +
  `ServerSettings.Parse` (C#, с xunit) + форма в `/admin/settings` + CONTRACT §11 — заедно. Невалиден ред в
  базата никога не чупи плъгина: групата пада към конфига. Превключвател в WASD менюто, който съвпада с
  настройка, пише СЪЩИЯ ред (`SaveSetting` → одит `settings.change`), иначе опресняването на 60 s го връща.
- Пакетите са заключени (`packages.lock.json`, `RestoreLockedMode`); нов пакет/версия → `dotnet restore
  --force-evaluate` и lock файлът в същия PR.

### Агентът на сървъра (`server/agent/`, CONTRACT §9)

- **Затворен списък.** Ново действие → `ACTIONS` + диспечерът + (ако пипа systemd) polkit правилото +
  CONTRACT §9 + тест — в същия PR. Изпълнение САМО с `execAllowed` (execFile, `shell: false`, абсолютни
  пътища от `BIN`); аргументите са константи — единственият вход е `lines` (цяло 1…200), `source` и
  `{op, id}` на `plugin` (затворени списъци в `agent-plugins.mjs` → името на `cs2-plugins@<op>-<id>.service`).
- **Подписът е като моста** (`Bridge.cs`: плик `{"p","sig"}`, HMAC върху UTF-8 байтовете на `p`, ±30 s,
  1000 id), но с **отделен** ключ `CS2DM_AGENT_KEY`. Грешките са низовете на C#; отхвърлена команда **няма
  ack** (като плъгина). Тестовият вектор от `Bridge.cs` е в `agent.test.mjs`.
- **Отговорите** (за панела): `status` → `{active, state, since (ms|null), gameVersion, modsLoaded,
  broken (версията, при която модовете са паднали | null), busy ("start"|"stop"|"restart"|"update"|null)}`; `logs` →
  `{source, lines[]}`; провал → `error: "failed"` + `data.detail` (кратко, редактирано); `busy`; `bad args`.
  `restart` чака systemctl (до 120 s), `update` е `--no-block`; `busy` важи и докато тече `cs2-update.service`.
- **`cs2dm:a2s`**: `players` е както в A2S (с ботовете), `bots` отделно; без отговор → `online: false` и
  `null` — никога измислени числа.
- **Всеки ред към панела минава през `redactLines`** (IPv4/IPv6 → `x.x.x.x`, `sv_setsteamaccount`/`logon
  token`/32+ hex/`password=` → `<redacted>`, ANSI и контролни знаци вън, ≤ 1000 знака). Нов източник на
  логове → тест с IP и GSLT. Над-редакцията е приета (версия `1.41.9.2` → `x.x.x.x`), изтичането — не.
- **polkit ≥ 121** (JavaScript правила; Ubuntu 24.04+). На 0.105 инсталаторът отказва — там не може да се
  ограничи по `unit`/`verb`. Правилото е само ES5 (duktape); тестът го пуска във `vm`.
- **Unit-ът не пише никъде** (без `ReadWritePaths`), без `MemoryDenyWriteExecute` (V8 JIT), `StartLimit*` в
  `[Unit]`. Групите `systemd-journal cs2` са само в `SupplementaryGroups=`, не в `/etc/group`.
- **Ключовете — само install-agent.sh**: чете env файловете със `sed` (никога `source` — `;` в Npgsql),
  стойностите стигат до awk през средата, нищо тайно в изхода. `APP_ENC_KEY` се генерира веднъж и **никога**
  не се сменя (шифрира TOTP тайните).

## Конвенции на сайта (`app/`)

Моделът е `piuma/` (Express 5 + EJS + TS strict ESM + Prisma 6.19 + ioredis + BullMQ + pino + helmet +
zod); код между продуктите не се споделя — само шаблоните са преписани.

- **Схемата е договор.** `prisma/schema.prisma` и миграциите се пипат само заедно с C# плъгина и
  `CONTRACT.md`, в същия PR. Публичната част само ЧЕТЕ (работникът трие по сроковете); пише само панелът.
  Колони само за уеба (`web_sessions`, `web_recovery_codes`, `players.totp_last_step`) плъгинът не чете.
- **Банлистът показва САМО** `steam_id`, `target_name`, `category`, `created_at`, `expires_at` — и то
  само активните (CONTRACT §2). `PUBLIC_BAN_SELECT` в `prisma-repo.ts` изброява полетата; типът
  `PublicBan` няма `reason`; тестът подава ред С причина, IP и админ и доказва, че не стигат до HTML.
  Банлистът е `noindex` (мета + `X-Robots-Tag`) и не е в sitemap. Нов публичен ред → нов тест.
- **`hidden_from_leaderboards = true`** (чл. 21 GDPR) скрива играча от класацията, профила (404) и sitemap.
- **Статусът на живо никога не се измисля.** Пресен `cs2dm:live` (< 60 s), иначе `cs2dm:a2s` от агента
  (< 30 s; `online: false` → „изключен“, `OfflineTemporarily`), иначе „неизвестен“ и `GameServer` без
  `serverStatus`. `players` в A2S включва ботовете.
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
  Публичният скрипт е `public/app.js`. Бисквитки има само панелът (`__Host-cs2dm_sid`, `__Host-cs2dm_oid`
  — строго необходими, само за екипа). Логовете нямат IP (политиката го обещава).
- **Нула измислени данни:** празна база → празни състояния; фирмените данни и контактът идват от
  `.env` (`COMPANY_*`, `CONTACT_EMAIL`) и при липса се показват като „не е въведено (ПРОМЕНЛИВА)“.
- **Пари:** `vip_tiers.price_cents` — цели евроцентове с ДДС; форматира се само при показ
  (`centsToDecimal` → Intl с точен десетичен низ).
- **Правните текстове са чернова** (обща информация, не правен съвет). Държавата на хостинга и срокът по
  ЗСч са маркирани с `<!-- ПОТВЪРДИ: … -->` в `views/privacy.ejs`. При промяна → дата в `content.ts`.
- **Портовете:** сайт `127.0.0.1:4350` (в контейнера 4330; 4330 и 4340 на VPS-а са заети, `HTTP_PORT` в `/etc/cs2/app.env`), Postgres `127.0.0.1:5442`, Redis `127.0.0.1:6392` (за плъгина на
  хоста) — никога на всички интерфейси (Docker заобикаля ufw). Тестът `infra.test.ts` го пази.
- SEO промяна след деплой → `node tools/seo/indexnow.mjs https://cs2.carbonstealth.eu` (ключът е в
  `public/indexnow-key.txt`; не е тайна).

### Панелът (`app/src/admin`, `/admin`)

- **Всеки маршрут декларира право** (`AdminRoute.cap` — задължително в типа); `index.ts` слага пред всеки
  `requireCap` + CSRF. Таблицата маршрут → право е в `tests/admin-rbac.test.ts` — промяна там = промяна
  на §1 (и преглед). Действие върху цел: `checkTargetAction` (право + immunity) ПРЕДИ запис и подпис.
- **Тълкуване на §1:** колоната „В играта“ важи и за същите действия от панела (kick/mute/бан…), „В панела“
  добавя само панелните (доклади, обжалвания, режими, VIP, роли, рестарт). `say` — MODERATOR+ (като
  `!csay`); IP и чл. 21 — ADMIN+; банери и одит — HEADADMIN+ (като `!banner`).
- **Писане = транзакция с одит** (`audit()` в същия `tx`, `source = WEB`; hash-а — тригерът). Команда към
  плъгина/агента — след записа; провалена команда не връща записа назад (`recordedNoAck`).
- **Наказание за онлайн играч** → `punish {punishmentId}` (KICK → `kick`, WARN — без команда); офлайн → само
  запис (плъгинът опреснява на 60 s и при влизане). Отмяна → `revoke`. Роли/VIP → `reload`.
- **Статистиките на играч** (`playerData`, HEADADMIN+ и immunity): редакция по сезон/оръжие/време, нулиране
  само с отметнато потвърждение; транзакцията връща всичко назад (вкл. епохата) при „без промяна“ или отказ
  (`Rollback`) — излишна епоха би изхвърлила натрупаното в плъгина. После `player.reload`. „Всичко, което
  пазим“ (`/players/:id/data`) е сурово (имената на колоните), без TOTP тайната, токени и хешове.
- **Събитията** (`/admin/events`, ADMIN+): транзакция с `lockEvents` (advisory lock) → `overlapping` → запис →
  одит; базата пази и сама (EXCLUDE). Завършило/отменено не се редактира (`notActive`). Без команда по моста —
  плъгинът проверява на 30 s.
- **Настройките** (`/admin/settings`, HEADADMIN+): запис → `settings.reload`; без отговор → `recordedNoAck`
  (плъгинът ги взима сам до 60 s). Сравнението before/after е канонично (`canonicalJson` — jsonb пренарежда ключовете).
- **Агентът:** `status`/`logs` (ADMIN+), `start`/`stop`/`restart`/`update` (HEADADMIN+). Старт/спиране/рестарт чакат systemd до 120 s, а
  nginx реже на 30 s → панелът чака 25 s и мълчанието е „още тече“ (`cmdPending`), не грешка.
- **Плъгините** (`/admin/plugins`, право `plugins` = HEADADMIN+, CONTRACT §14): списъкът е от агента (`plugins`);
  спиране = `plugins.unload` по моста (най-добро усилие) → агентът; пускане = агентът → `plugins.load`; без мост
  или Metamod мод → `pluginRestart` (важи след рестарт). Конфигът — само през моста (плъгинът пише файла), JSON
  обект ≤ 32 768 знака (отделен парсер с таван 128 kb на `/plugins/:id/config`); одитът пази размер и sha256,
  никога текста. Ack-ът на моста може да е с `"error": null` (стар плъгин) — `ackSchema` го приема.
- **Резултат след POST = PRG** с `?r=<код>` от затворен списък (`forms.ts` `RESULTS`) — никакъв свободен
  текст в адреса. Нов код → ключ `admin.result.<код>` в трите речника.
- **Ключовете** (`APP_ENC_KEY` 64 hex, `CS2DM_BRIDGE_KEY`/`CS2DM_AGENT_KEY` ≥ 32) се проверяват в
  `admin/keys.ts`; невалиден/липсващ ключ изключва своята част (503/отказ), не сайта.
- **Тестове:** unit без база (`admin-*.test.ts`, вкл. векторите на RFC 6238 и на подписа) + интеграционни
  (`integration-admin-*.test.ts`: двойник на Steam, двойници на плъгина/агента върху истинския pub/sub).

