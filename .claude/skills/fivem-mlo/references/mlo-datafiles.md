# MLO: елементи на ytyp и data_file записи

Сверено 02.11.2026 с docs.sollumz.org (Creating Interiors → Creating ytyp) и
docs.fivem.net/docs/game-references/data-files/ и /docs/scripting-reference/resource-manifest/.

## Елементи на MLO archetype (Sollumz, раздел YTYPS)

| Елемент | Какво е | Бележка |
|---|---|---|
| Limbo room | Стаята „навън“; създава се първа | задължително по туториала |
| Room | Обем, ограден от 4 върха на колизията; „Set Bounds From Selection“ | по една на помещение |
| Portal | Врата/прозорец между две стаи; 4 ъгъла; посока отвътре навън; „Flip Direction“ | обърнат портал = мигащо |
| Entity | Drawable, добавен с „Add Object(s) as Entity“, закачен към стая | |
| Entity set | Именуван набор от обекти, които се включват по желание (мебели, варианти) | Sollumz страницата не го покрива → за проверка |
| Flags / Timecycle | На стая и портал; може и в CodeWalker | детайли: за проверка |

## Манифест записи, свързани с карти и мета

| Директива / тип | Смисъл | Източник |
|---|---|---|
| `this_is_a_map 'yes'` | „Marks this resource as being a GTA map, and reloads the map storage“ (стойността е произволна) | resource-manifest |
| `DLC_ITYP_REQUEST` | ytyp през DLC системата (пример от играта `dummy/v_common.ityp`) | data-files |
| `TIMECYCLEMOD_FILE` | timecycle модификатор (XML) | data-files |
| `GTXD_PARENTING_DATA` | TXD родител/дете за карти | data-files |
| `AUDIO_GAMEDATA` / `AUDIO_SOUNDDATA` / `AUDIO_DYNAMIXDATA` / `AUDIO_SYNTHDATA` | audio метаданни | data-files |
| `AUDIO_WAVEPACK` | `data_file 'AUDIO_WAVEPACK' 'audio/mywaves'` | resource-manifest |

Синтаксис (resource-manifest): `data_file 'ТИП' 'път'`, поддържа globbing. Файловете извън `stream/` се
изброяват и във `files { }`, иначе клиентът не ги получава (`stream-lint`: `not-in-files`).

## Occlusion

- Occlusion (ymap occluder-и) — режат невидимото; редактор: CodeWalker (за проверка кой режим).
- Audio occlusion — заглушава звука между стаите; инструментът и форматът са за проверка (не са покрити от docs.sollumz.org).
