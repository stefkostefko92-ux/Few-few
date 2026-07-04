# CLAUDE.md — fivem/ (Балкан)

Насоки за AI асистенти в този продукт. Зарежда се само при работа тук (нулева цена
иначе). Спазвай и root [`../CLAUDE.md`](../CLAUDE.md).

## Какво е това

**Балкан** — FiveM RP сървър (GTA V мултиплейър, CFX/FiveM платформа) на **Qbox + ox**
стек. Продуктова визия и пазарно проучване: [`ПРОУЧВАНЕ-И-КОНЦЕПЦИЯ.md`](ПРОУЧВАНЕ-И-КОНЦЕПЦИЯ.md).
Самият сървър е в [`server/`](server/) — виж [`server/README.md`](server/README.md).

| Папка | Съдържание |
|---|---|
| `ПРОУЧВАНЕ-И-КОНЦЕПЦИЯ.md` | Пазар + концепция (защо съществува проектът) |
| `server/resources/[bg]/` | **Нашите** ресурси (единственият код, който комитваме) |
| `server/sql/` | DB схема за нашите таблици |
| `server/server.cfg`, `setup.sh` | Конфиг + теглене на зависимости |

## Стек и версии

- **Рамка:** Qbox (`qbx_core`) + `ox_lib` + `ox_inventory` + `ox_target` + `oxmysql`.
- **Lua 5.4**, `fx_version 'cerulean'`, OneSync **Infinity** (задължителен).
- **FXServer artifact:** Recommended канал (~build 25770+), **не** Latest.
- `ox_core` НЕ се ползва (още няма стабилен v1.0 към 2026 — breaking changes).

## Твърди правила (за всеки ресурс тук)

1. **Server-authoritative винаги.** Клиентът иска, сървърът решава. Валидирай `source`,
   типове, диапазони, права/собственост на всяко net събитие. Чети пари/предмети/позиция
   от **сървърното състояние**, не от payload-а.
2. **Само параметризиран oxmysql** (`?`). Никакво слепване на SQL.
3. **Rate-limit** на чувствителните събития (`exports.bg_core:RateLimit`).
4. **Кеширай natives** — никакви natives всеки кадър без `Wait`; ползвай `cache.ped`,
   `GlobalState`/state bags вместо `TriggerClientEvent(-1, ...)` в цикъл.
5. **Един източник на истината** за фракции/зони/параметри:
   `server/resources/[bg]/bg_core/shared/config.lua` (`BGConfig`). Не дублирай.
6. **Тайни никога в репото.** Само `server.secret.cfg` на сървъра (mode 600).
   Третостранните ресурси не се комитват (`.gitignore`).
7. **Български коментари и UI** (UTF-8), в стила на съществуващия код.

## Договор между ресурсите

- Споделен конфиг се включва през `shared_scripts { '@bg_core/shared/config.lua' }` →
  глобална `BGConfig` (+ помощници `GetZoneAt`, `GetRepTier`, `IsFaction`, `IsZone`).
- `bg_core` server exports: `Notify`, `RateLimit`, `GetCitizenId`, `GetPlayerFaction`.
- Собствениците на зони се четат от `GlobalState.bg_territory`; пазарните цени от
  `GlobalState.bg_market`; репутационни отстъпки през `exports.bg_reputation:GetDiscount`.
- `bg_core` се `ensure`-ва **пръв** в `server.cfg`.

## Качествена проверка, преди „готово“

- Няма отделен CI за FiveM тук (Lua). Минимум: провери, че всеки `fxmanifest.lua` е валиден
  и че ресурсите се `ensure`-ват без грешки в конзолата на жив/тестов FXServer.
- Реалният тест (`ensure`, `resmon`, exploit fuzz на net събития) е на **жив сървър** —
  статичен преглед не е достатъчен за сигурностни находки.
- Пусни Геймъра (`geymara`) за преглед на нови/променени ресурси.
