# cs2dm/ — „CarbonStealth.eu | Dust2 DM“ (CS2 сървър)

CS2 общностен сървър: **само de_dust2, Deathmatch (FFA)**, по-късно с наши плъгини
(CounterStrikeSharp), уеб сайт + панел с пълен контрол и Discord с VIP роли. Root правилата живеят
в кореновия `CLAUDE.md`. Пълното проучване и решенията на собственика:
`research/cs2-dust2-dm/README.md` (в отделния PR на проучването).

_Сега: **фаза 1** (ванилов сървър под systemd на сегашния VPS) + **фаза 2** (Metamod 2.0 +
CounterStrikeSharp + DM плъгин на NockyCZ, заковани по sha256) + **фаза 3** (нашият C# плъгин
CarbonStealth на PostgreSQL: банове, админ меню, статистики/XP, банери, реклами, мост към сайта).
Следва: сайт + уеб панел (`app/`), Discord бот. Банове и класация — **публични на сайта** (решение на
собственика), затова админ системата е наша на Postgres, не CS2-SimpleAdmin (MySQL + три
неподдържани меню зависимости). Договорът между плъгин и сайт: `CONTRACT.md`._

## Команди (quality gate)

```bash
cd cs2dm
npm run gate      # lint (bash -n, node --check) + node --test + tools/vps/deploy-check.mjs
npm run plugins   # C#: тестове на логиката + Release билд (warnings-as-errors, заключени пакети); нужен .NET SDK 10
```

Нула зависимости → без `npm ci`. На сървъра: `sudo bash server/install.sh --check` (само проверки).

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
app/prisma/                          схемата и миграциите (общи за плъгина и сайта)
CONTRACT.md                          роли, наказания, XP, heatmap, мост, одит, срокове, банери
test/                                node --test: A2S протокол + конфиг/unit/скриптове + плъгин (конфиг, lang)
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
