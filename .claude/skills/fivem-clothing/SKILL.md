---
name: fivem-clothing
description: >-
  Води addon дрехи (clothing, EUP) за FiveM freemode ped-ове mp_m_freemode_01 и mp_f_freemode_01:
  ydd и ytd по компоненти и пол, именуване, shop meta и ymt/creaturemetadata, data_file записи,
  лимити на номерацията и текстурите, проверка със stream-lint и тест на локален FXServer. Ползвай когато
  потребителят каже „направи дрехи за FiveM“, „addon clothes“, „EUP пакет“, „freemode дреха“, „ydd
  ytd именуване“, „дрехата е невидима или е с грешна текстура“, „shop meta“. Различен от fivem-mlo
  (интериори, ytyp, ymap) и fivem-livery (ливреи на коли, carcols) — за тях ползвай тях. Без реални
  марки и лога; само собствени или лицензирани активи; нищо не се качва и не се продава от агент.
---

# FiveM дрехи — ydd/ytd до `ensure`

Едно нещо: addon дрехи за freemode персонажи. Магазини/гардероб (Lua) са на `geymara`.

## Наши предпазители (не се договарят)

- **Само собствено или с лиценз.** Без дрехи/текстури от други игри или от чужди пакети; без „ripped“ EUP.
  Всеки външен актив — ред в `ATTRIBUTION.txt` (автор, лиценз, URL).
- **Само измислени марки и ведомства — без реални марки, лога, спонсори, емблеми на реални служби и без червен кръст/полумесец/кристал.** Спонсорски и рекламни мотиви: лиценз от марката не стига — нужни са отделни изрични писмени условия с Rockstar (PLA §3.1(7) и последната алинея). Всяка друга реална марка: §2.2(1) + юрист.
- **Минимум Rockstar данни в пакета.** По подразбиране дрехата е изцяло собствен меш и собствени текстури; нито
  оригинален `.ydd`/`.ytd`, нито копие на скелет. Туториалът на Sollumz редактира оригинален `jbib_007_u.ydd` —
  само за обучение и вътрешен тест, не за продукт (PLA §2.2, §2.5, §3.1(4)). Производно на Rockstar → Правния Разбирач.
- **Продажба само през Tebex** (docs.fivem.net, Asset Escrow: „escrowed assets can only be distributed via a Tebex package“; docs.fivem.net, Tebex Store: „exclusive monetization partner of FiveM“) **+ писмено потвърждение от Cfx.re преди първата продажба.** Правила, лицензи на чужди активи, EULA: [`references/legal.md`](references/legal.md).
- **Агентът нищо не качва, не публикува, не продава и не плаща.** Правна преценка → Правния Разбирач.

## Какво трябва да е вярно накрая

Ресурсът тръгва без грешки; всяка дреха се вижда на правилния пол с всичките си текстури; номерацията няма
празнини; `stream-lint` няма ERROR; няма oversized.

## Стъпки

1. **Бриф.** Пол (`mp_m_freemode_01` и/или `mp_f_freemode_01` — отделни колекции), компоненти, брой, откъде е
   всеки актив. _Изход:_ таблица „компонент → брой“ + `ATTRIBUTION.txt`.
2. **Инструменти (сверени 02.11.2026).** Blender 4.2+ със Sollumz 2.9.0 (README: „Blender 4.0 or newer“;
   инсталация през `https://repo.sollumz.org/`) и CodeWalker (RPF Explorer). _Изход:_ `blender --version`.
3. **Модел — собствен меш по подразбиране.** Скелетът `mp_m_freemode_01.yft` (CodeWalker → експорт XML) се
   импортира в Blender само като РИГ за работа („Import External Skeleton“) и **не се пакетира**; собственият ти
   меш се тегли към кости `SKEL_*` (vertex groups). Sollumz поддържа кости и тегла (README, GitHub); официален
   туториал за дреха от нулата няма — docs.sollumz.org/tutorials/basic-clothes-editing показва само редакция на
   оригинал (експорт на `jbib_007_u.ydd`). Костите проверяваш по имена (`SKEL_L_Hand`, не `UNK.001`), три LOD
   (high, medium, low). Ограничения без източник → **за проверка**: дали експортираният `.ydd` вгражда скелет
   (docs.sollumz.org, Drawable Dictionary: „Skeleton (sometimes, mostly seen on ped components)“ — проверка в
   CodeWalker; вгражда ли → юрист), дали дрехата с cloth физика иска `.yld` (вторичен източник: Sollumz 2.7.2). _Изход:_
   костите са наименувани; в мениджъра на файлове няма нито един оригинален Rockstar файл за пакета.
4. **Експорт и конвертиране.** Експорт като Codewalker XML → импорт в CodeWalker RPF → `.ydd`.
   _Изход:_ `.ydd` отваря се в CodeWalker без грешка; XML-ите остават извън пакета.
5. **Текстури — само наши.** Диффузна текстура — `.ytd` с нарисувани от нас изображения; до 26 ytd на ydd
   (букви A–Z); за `_r` дрехи квадратна, степен на двойката (256/512), UV на кожата не се мърдат; вградени
   `component_normal/spec_NNN` (напр. `jbib_normal_000`) също наши. Компресия DXT1/DXT5 с mipmaps —
   [`references/naming-and-meta.md`](references/naming-and-meta.md). _Изход:_ ytd по размер.
6. **Именуване по шаблона** (проверява го `stream-lint`):
   `[колекция^]компонент_NNN_u.ydd` и `[колекция^]компонент_diff_NNN_буква_раса.ytd`, напр.
   `jbib_007_u.ydd`, `jbib_diff_007_a_uni.ytd` (Sollumz docs). Префиксът `mp_m_freemode_01_пакет^` е
   конвенция на общността — различни ръководства дават различно име → за проверка; избери един стил и
   го дръж еднакъв в `files`, `data_file` и имената. _Изход:_ `stream-lint` без `clothing-name`.
7. **Meta и манифест.** Shop meta: `SHOP_PED_APPAREL_META_FILE` (тип от docs.fivem.net data-files);
   татуировки: `PED_OVERLAY_FILE`. ymt/creaturemetadata — [`references/naming-and-meta.md`](references/naming-and-meta.md).
   ```lua
   fx_version 'cerulean'
   game 'gta5'
   author 'Carbon Stealth'
   description 'Дрехи: име'
   version '1.0.0'
   files { 'mp_m_freemode_01_пакет_shop.meta' }
   data_file 'SHOP_PED_APPAREL_META_FILE' 'mp_m_freemode_01_пакет_shop.meta'
   ```
   Без `lua54 'yes'` (остарял — docs.fivem.net, 02.11.2026). _Изход:_ `manifest-lint` exit 0.
8. **Гейт.** `node tools/fivem/stream-lint.mjs ресурс`. _Изход:_ `0 ERROR`; WARN `clothing-gap`/`clothing-orphan`
   разгледани един по един.
9. **Тест на локален FXServer** (оттук няма сървър). `ensure ресурс`, влез с freemode персонаж, смени
   компонента (`SetPedComponentVariation`), провери всяка текстура и броя варианти с
   `GetNumberOfPedDrawableVariations` (имена на natives — сверявай в docs.fivem.net/natives).
   _Изход:_ броят съвпада със стъпка 1; няма невидими части, няма „бяла“ текстура.

## Грешки

| Симптом | Причина | Поправка |
|---|---|---|
| Дрехата е невидима | Името не следва шаблона или `files`/`data_file` сочи друго име | `stream-lint` (`clothing-name`, `meta-no-data-file`); еднакъв стил навсякъде |
| Дрехата е с чужда текстура/бяла | Липсва ytd за този номер или буква | `clothing-orphan`; провери буквите A–Z |
| Част от варианти липсват | Празнина в номерацията | `clothing-gap`: номерацията започва от 000 и е плътна |
| Мрежата се разкъсва по ставите | Кости `UNK.001` или не е външен скелет | Стъпка 3: „Import External Skeleton“ със същия yft |
| Текстурата е размазана на кожата | Мърдани UV на кожата или не-квадратна `_r` | Върни UV; квадрат 256/512 |
| `oversized` | Много ytd или големи текстури | streaming-budget; DXT, по-малко/по-малки текстури |
| Дреха за мъже на жена | Грешна колекция (`mp_m` срещу `mp_f`) | Отделен ресурс/колекция за всеки пол |

## Кой довършва какво

Магазин, гардероб, цени, инвентар (Lua) → Геймъра. Правно → Правния Разбирач.
