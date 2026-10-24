# Банери-картинки в de_dust2 (Workshop addon)

Текстовите банери (`!banner add carbonstealth`, `!banner add adblock`) работят веднага — те са
`point_worldtext` и не искат нищо от играчите. **Картинките** (логото на Carbon Stealth VCC и снимките
от Chrome Web Store) са модели, които всеки клиент трябва да има → минават през Workshop addon,
който MultiAddonManager сваля на играча при първото влизане.

| Ключ | Текстура | Плоскост | Какво е |
|------|----------|----------|---------|
| `cs_logo` | 1024×1024 | `banner_square.obj` (128×128) | официалното лого „CARBON STEALTH VCC“ + carbonstealth.eu |
| `cs_wide` | 2048×1024 | `banner_wide.obj` (256×128) | логото + „Websites · E-commerce · Apps · ERP“ |
| `adblock_shot1` | 2048×1024 | `banner_wide.obj` | снимка 1 от магазина + adblock.carbonstealth.eu |
| `adblock_shot2` | 2048×1024 | `banner_wide.obj` | снимка 2 (YouTube) + адреса |
| `adblock_marquee` | 2048×1024 | `banner_wide.obj` | щитът от магазина + „Supreme AdBlock“ + адреса |

## 1. Текстурите (Linux или Windows)

```bash
cd cs2dm/addon
python3 build_textures.py     # Pillow + шрифт Inter → out/materials/carbonstealth/ + out/preview.png
```

`out/` не влиза в git — генерира се. Източници: `src/` (официалното лого и OG картинката от
carbonstealth.eu) и `adblock/store/` (снимките на магазина).

## 2. Addon-ът (само Windows — CS2 Workshop Tools)

> ⚠️ Стъпките с Workshop Tools не са проверени на живо (документацията на Valve е зад вход).
> Всяка стъпка има проверка — ако нещо се различава, пиши ми какво виждаш.

1. Steam → Counter-Strike 2 → Свойства → DLC → включи **Counter-Strike 2 Workshop Tools**.
2. Пусни „CS2 Workshop Tools“ → **Create New Addon** → име `carbonstealth_banners`.
3. Копирай файловете в съдържанието на addon-а (пътят е в папката на играта):
   - `out/materials/carbonstealth/*.png` → `content\csgo_addons\carbonstealth_banners\materials\carbonstealth\`
   - `models/*.obj` → `content\csgo_addons\carbonstealth_banners\models\carbonstealth\`
4. **Material Editor**, по един материал на текстура (5 бр.):
   - Shader: **Csgo Complex** ⚠️ (ако го няма в списъка — „Csgo Unlit Generic“, тогава без маска);
   - Color → `<име>_color.png`; включи **Self Illum** → маска `<име>_selfillum.png` (бяла = свети и в сянка);
   - запиши като `materials/carbonstealth/<име>.vmat`.
   - Проверка: прегледът в редактора показва картинката, ярка и без тайлинг.
5. **ModelDoc** → New → **Add Render Mesh File** → съответният `.obj` → в Material Remap замени
   `banner` с материала от т. 4. **Без Physics** (иначе банерът спира куршуми). Запиши като
   `models/carbonstealth/<име>.vmdl` → Compile.
   - Проверка: лицето на плоскостта сочи по оста +X (червената стрелка) и картинката не е огледална.
     Ако е обърната — завърти в ModelDoc, не в плъгина.
6. **Workshop Manager** → `carbonstealth_banners` → **Publish**, видимост **Public** ⚠️ (клиентите трябва
   да могат да го свалят). Запиши **Workshop ID**-то от адреса на страницата.

## 3. Сървърът

В `/etc/cs2/cs2.env`:

```bash
CS2_WORKSHOP_ADDONS=<Workshop ID>
CS2DM_BANNER_MODELS=cs_logo=models/carbonstealth/cs_logo.vmdl,cs_wide=models/carbonstealth/cs_wide.vmdl,adblock_shot1=models/carbonstealth/adblock_shot1.vmdl,adblock_shot2=models/carbonstealth/adblock_shot2.vmdl,adblock_marquee=models/carbonstealth/adblock_marquee.vmdl
```

```bash
sudo bash cs2dm/server/mods/install-mods.sh              # слага MultiAddonManager + неговия cfg
sudo bash cs2dm/server/mods/install-plugins.sh --config  # ключовете стават достъпни за !banner
```

В играта (HEADADMIN+): гледай към стена → `!banner add cs_logo`. `!banner list` · `!banner remove [id]`.
Банерите се пазят в базата по карта и се връщат след всеки рестарт.

**Цена за играча:** при първото влизане клиентът сваля addon-а (няколко MB) и се свързва наново
веднъж; `mm_cache_clients_with_addons 1` помни, че го има, и после влизането е нормално.

## Правила

- Само наши марки и наши продукти. Нищо, което прилича на предмет или ранг от CS2 (правилата на
  Valve за GSLT — виж `../CLAUDE.md`).
- Нова картинка = нова функция в `build_textures.py` + ред в таблицата + материал и модел в addon-а
  + нов ключ в `CS2DM_BANNER_MODELS`. Публикуването на нова версия на addon-а не сменя ID-то.
