# cs2dm/ — „CarbonStealth.eu | Dust2 DM“ (CS2 сървър)

CS2 общностен сървър: **само de_dust2, Deathmatch (FFA)**, по-късно с наши плъгини
(CounterStrikeSharp), уеб сайт + панел с пълен контрол и Discord с VIP роли. Root правилата живеят
в кореновия `CLAUDE.md`. Пълното проучване и решенията на собственика:
`research/cs2-dust2-dm/README.md` (в отделния PR на проучването).

_Сега: **фаза 1 — ванилов сървър** (вграденият DM режим, без плъгини) под systemd на сегашния VPS.
Стек на тази фаза: bash + systemd + zero-dep Node ESM (проверка на здравето през A2S)._

## Команди (quality gate)

```bash
cd cs2dm
npm run gate      # lint (bash -n, node --check) + node --test + tools/vps/deploy-check.mjs
```

Нула зависимости → без `npm ci`. На сървъра: `sudo bash server/install.sh --check` (само проверки).

## Структура

```
server/install.sh                    идемпотентен инсталатор (--check · --validate)
server/update.sh                     UpToDateCheck по PatchVersion → steamcmd → cfg → старт
server/a2s.mjs, server/health.mjs    A2S_INFO клиент + CLI за здраве (аналогът на /health)
server/cfg/gamemode_deathmatch_server.cfg   ВСИЧКИ наши настройки (името, ботове, DM)
server/systemd/                      cs2.service · cs2-update.service · cs2-update.timer
server/cs2.env.example               шаблон за /etc/cs2/cs2.env (GSLT, IP, порт, слотове)
test/                                node --test: A2S протокол + конфиг/unit/скриптове
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
- Споделен VPS: `CPUWeight=1000` + `Nice=-5`; закрепване към ядра (`AllowedCPUs=`) само след измерване,
  в drop-in. Изходен план: всичко е преносимо на отделна машина.
