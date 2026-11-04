---
name: fivem-mlo
description: >-
  Води един MLO (интериор) за FiveM от Blender до работещ ресурс: Sollumz или CodeWalker, ytyp с MLO
  archetype (rooms, portals, entity sets), ybn колизии, ymap разполагане, occlusion, timecycle и audio
  occlusion, fxmanifest с this_is_a_map и data_file, проверка с stream-lint и тест на локален FXServer.
  Ползвай когато потребителят каже „направи MLO“, „интериор за FiveM“, „mlo ресурс“, „портали и стаи“,
  „ytyp ymap ybn“, „интериорът е черен или пада през пода“, „oversized предупреждение на карта“.
  Различен от fivem-clothing (дрехи, ydd, freemode) и fivem-livery (ливреи, carcols) — за тях ползвай
  тях. Само собствени или лицензирани активи; нищо не се качва и не се продава от агент.
---

# FiveM MLO — от Blender до `ensure`

Едно нещо: превръща интериор в зареждащ се ресурс. Скриптовете (Lua) са на `geymara`; тук е 3D активът.

## Наши предпазители (не се договарят)

- **Само собствено или с писмен лиценз.** Без модели, текстури, звуци или планове, извадени от други игри
  или от чужд ресурс; без „ripped“ активи. Всеки външен актив има ред в `ATTRIBUTION.txt` (автор, лиценз, URL).
- **Само измислени марки и ведомства — без реални марки, лога, спонсори, емблеми на реални служби и без червен кръст/полумесец/кристал.** Спонсорски и рекламни мотиви: лиценз от марката не стига — нужни са отделни изрични писмени условия с Rockstar (PLA §3.1(7) и последната алинея). Всяка друга реална марка: §2.2(1) + юрист.
- **Без оригинални Rockstar `.ydr`/`.ytd`/`.ytyp`/`.ymap` в пакета.** Позоваване на ванилов prop по име на archetype е допустимо; копирането на файла — не (PLA §2.2, §2.5).
- **Продажба само през Tebex** (docs.fivem.net, Asset Escrow: „escrowed assets can only be distributed via a Tebex package“; docs.fivem.net, Tebex Store: „exclusive monetization partner of FiveM“) **+ писмено потвърждение от Cfx.re преди първата продажба.** Правила, лицензи на чужди активи, EULA: [`references/legal.md`](references/legal.md).
- **Агентът нищо не качва, не публикува, не продава и не плаща.** Подготвя ресурс и доклад; човекът качва.
- Лицензирана музика в аудиото е забранена (PLA §2.4). Правна преценка → Правния Разбирач, не е правен съвет.
- Тайни (ключове, лицензи) никога в ресурса.

## Какво трябва да е вярно накрая

Ресурсът се зарежда без грешки в конзолата, интериорът се вижда отвън и отвътре, подът държи, `stream-lint`
няма ERROR, а на локалния сървър няма червени oversized предупреждения.

## Стъпки

1. **Бриф и лиценз.** Запиши: размер, брой стаи, координати на входа, откъде е всеки актив. Липсва
   лиценз на актив → спри, не го слагай. _Изход:_ `ATTRIBUTION.txt` без празни редове.
2. **Инструменти (сверени 02.11.2026).** Sollumz последна версия 2.9.0 (GitHub releases; дата на
   публикуване „за проверка“); README иска „Blender 4.0 or newer“, а инсталацията като extension е за
   Blender 4.2+ през `https://repo.sollumz.org/` (docs.sollumz.org/getting-started/installation).
   CodeWalker (Windows, .NET 4.5+, PC копие на GTA V) е за RPF Explorer, конвертиране XML → бинарно и
   ymap. Пусни `blender --version`. _Изход:_ версия ≥ 4.2 и Sollumz се вижда в Preferences.
3. **Моделиране и колизии.** Следвай docs.sollumz.org/tutorials/creating-interiors (planning, modeling,
   texturing, collisions). Колизията е отделно тяло (Bound Composite → геометрия), не дубликат на
   видимия модел. _Изход:_ в Blender обектите са Drawable + Bound, без скрити обекти (скритите не се
   експортират).
4. **ytyp с MLO archetype.** В Sollumz → Tools → Archetype Definition: „+“, Auto-Create From Selected, после
   сменяш типа на MLO. Първо „Create Limbo Room“, после по една стая; портал за всяка врата (посока
   отвътре навън; „Flip Direction“ при обратна стрелка); „Add Object(s) as Entity“; entity sets и timecycle
   модификатори — виж [`references/mlo-datafiles.md`](references/mlo-datafiles.md) (entity sets: страницата
   на Sollumz не ги покрива → за проверка). _Изход:_ във всяка стая има поне един entity и всяка стая е
   свързана с поне един портал.
5. **Експорт и конвертиране.** Sollumz Export → XML; в CodeWalker RPF Explorer дръпни XML в целевата
   папка → получаваш ydr/ybn/ytyp. _Изход:_ бинарни файлове до XML-ите; XML-ите остават извън `stream/`.
6. **ymap разполагане.** В CodeWalker (project mode) постави MLO инстанса по координатите от стъпка 1 и
   запази ymap. _Изход:_ във World View интериорът е на мястото; ymap е в `stream/`.
7. **Occlusion, timecycle, audio occlusion.** Occlusion (ymap occluder-и) намалява рендера; timecycle
   модификаторът оправя тъмно/пренаситено осветление; audio occlusion дава заглушаване между стаите. Кой
   инструмент редактира audio occlusion — за проверка (не е в docs на Sollumz; CodeWalker го споменава само за
   timecycle/flags). _Изход:_ интериорът не е плосък/черен вътре.
8. **Структура и манифест.**
   ```
   mlo_име/
     fxmanifest.lua
     ATTRIBUTION.txt
     stream/   (ydr, ybn, ytyp, ymap, ytd)
   ```
   ```lua
   fx_version 'cerulean'
   game 'gta5'
   author 'Carbon Stealth'
   description 'MLO: име'
   version '1.0.0'
   this_is_a_map 'yes'
   -- DLC_ITYP_REQUEST — само ако авторът на ytyp го изисква (за проверка):
   -- data_file 'DLC_ITYP_REQUEST' 'stream/име.ytyp'
   ```
   `lua54 'yes'` не се пише (остарял, docs.fivem.net resource-manifest, 02.11.2026). _Изход:_
   `node tools/fivem/manifest-lint.mjs mlo_име` → exit 0.
9. **Гейт за активи.** `node tools/fivem/stream-lint.mjs mlo_име`. _Изход:_ `0 ERROR`. Праговете са
   прокси по размер на диск (16 MiB предупреждение, 64 MiB грешка по подразбиране — общностна тема, не
   официален лимит); бюджетът е в [`references/streaming-budget.md`](references/streaming-budget.md).
10. **Тест на локален FXServer** (не оттук — тук няма сървър). Копирай ресурса, добави `ensure mlo_име` в
    `server.cfg`, влез, телепортирай се на входа. _Изход:_ конзолата без грешки/oversized; обиколи всички
    стаи, мини през всяка врата, скочи по пода, провери нощем и дневно осветление, проверка на звука.

## Грешки

| Симптом | Причина | Поправка |
|---|---|---|
| Интериорът не се появява | Няма `this_is_a_map`, ytyp не е зареден или ymap е на грешни координати | `stream-lint` (`no-this-is-a-map`); провери `data_file` и координатите в CodeWalker |
| Пада през пода / минава през стени | Липсва или е сбъркана ybn колизия | Стъпка 3: отделен Bound; провери, че ybn е в `stream/` |
| Вътре е черно или сивкаво | Портал/стая без връзка или без timecycle | Стъпка 4: Limbo стая + портали с правилна посока; добави timecycle |
| Обектите мигат отвън | Портал в грешната посока или стая извън границите | „Flip Direction“, „Set Bounds From Selection“ |
| `oversized` / „large“ в таблицата | Прекомерно големи ytd/ydr | Стъпка 9 и streaming-budget: DXT компресия, по-малко текстури, LOD |
| `dup-asset` | Две копия на едно име | Преименувай; сверявай с други MLO ресурси на сървъра |
| `work-file` | `.xml`/`.blend`/`.png` в `stream/` | Премести извън ресурса |
| Сривове при стрийм | Невалиден XML/ytyp при конвертиране | Прекопирай чрез RPF Explorer; лог от конзолата |

## Кой довършва какво

Lua за вратите/мебелите/интеракциите → Геймъра (`geymara`). Правно (лиценз, продажба) → Правния Разбирач.
