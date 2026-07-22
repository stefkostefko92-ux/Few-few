# tools/fivem — инженерен поток за FiveM ресурси (Геймъра v2.0)

Превръща писането на ресурси в CI-гейтван процес: статичен анализ, тестове с
мокнати natives, профилиране и сигурност.

## Статичен анализ
```bash
luacheck --config tools/fivem/.luacheckrc .          # FiveM глобали декларирани
selene --config tools/fivem/selene.toml .            # argument/type проверки
```
`.luacheckrc` декларира CitizenFX/ox/framework глобалите — иначе luacheck вдига
фалшиви тревоги (CfxLua ≠ vanilla Lua 5.4: vector3/quat/source и т.н.).

## `manifest-lint.mjs` — zero-dep pre-ship линтер (в агентския гейт)
```bash
node tools/fivem/manifest-lint.mjs path/to/resource
```
Хваща без сървър, без зависимости (за разлика от luacheck/selene, които искат инсталация):
- **HIGH** — непълен `fxmanifest.lua` (липсва `fx_version`); client-authoritative пари/предмети
  без сървърна заявка; сървърен net event handler без проверка на `source`; SQL чрез конкатенация;
  твърдо вписана тайна.
- **MEDIUM** — `__resource.lua` (остарял); липсва `game`; native в плътен цикъл без `Wait`.

Изход: `0` = чисто/само INFO; `1` = има HIGH. Тестван (`manifest-lint.test.mjs`), пуска се и в
агентския sweep. Допълва (не заменя) luacheck/selene/busted по-долу.

## Unit тестове (логика, не natives)
Мокни natives и тествай чистата сървърна логика с **busted**:
```lua
-- spec/shop_spec.lua
_G.RegisterNetEvent = function() end
_G.TriggerClientEvent = function() end
-- … стъбни каквото ползваш, после require-ни server логиката и assert-вай.
```
`busted --verbose`. Натив поведението не се тества тук — дръж и smoke сървър.

## CI
Копирай `ci.example.yml` в `.github/workflows/` на ресурса (lint → test).

## Профилиране (на сървъра)
`resmon` за CPU/кадър; при хитч: конзола `profiler record 100` → `profiler view`.
Цели: 0.00–0.02 ms idle; раздели циклите по честота; oxmysql off-tick; OneSync culling.

## Сигурност (pre-ship гейт)
- Всеки `RegisterNetEvent` валидира `source`, типове/диапазони, права/собственост.
- Чети пари/предмети/позиция от сървърното състояние, не от payload.
- Event-fuzz: заливай хендлърите с невалидни параметри (виж GoblinAC/fs-guard модели).
- Параметризиран oxmysql (`?`); cooldown/rate-limit на чувствителни събития.

## Версиониране
SemVer в `fxmanifest.lua`; `semantic-release` + in-console update notify (`version_control`).
