# Ливреи: метаданни, слотове, бюджет

Сверено 02.11.2026. Статус: потвърдено · общностно · за проверка. Най-силният източник е оригиналният файл на
подобна кола, отворен в CodeWalker (RPF Explorer) — не този скелет.

## Потвърдено (жив източник)

| Факт | Източник |
|---|---|
| `VMT_LIVERY_MOD = 48` в списъка на `SET_VEHICLE_MOD` | raw.githubusercontent.com/citizenfx/natives/master/VEHICLE/SetVehicleMod.md |
| `void SET_VEHICLE_LIVERY(Vehicle vehicle, int livery);` | …/VEHICLE/SetVehicleLivery.md (без описание) |
| `data_file` тип `CARCOLS_FILE` („Vehicle model variation data“), пример `dlcmpheist:/common/data/carcols.meta` | docs.fivem.net/docs/game-references/data-files/ |
| `data_file` тип `VEHICLE_VARIATION_FILE`, пример `carvariations.meta` | същото |
| `VEHICLE_METADATA_FILE` / `HANDLING_FILE` + синтаксис `files { }` + `data_file` | docs.fivem.net/docs/scripting-reference/resource-manifest/ |
| Не всички шейдъри на превозно средство са боядисваеми; `matDiffuseColor` дава цвета при „Custom - Not Paintable“ | docs.sollumz.org/documentation/fragments.yft/vehicle-setup/paint-colors |

## Двата механизма

| | Вградена ливрея | Livery mod |
|---|---|---|
| Native | `SetVehicleLivery(vehicle, livery)` | `SetVehicleMod(vehicle, 48, index, false)` |
| Къде се дефинира | `carvariations.meta` (имена) + текстурен слот в ytd | modkit в `carcols.meta` (`<Kits>`) |
| Изборът в игра | пряко с native | през мод магазин/гараж |

Колоната „Къде се дефинира“ е общностна практика → за проверка срещу оригинален файл.

## Скелет (за проверка срещу оригинал)

```xml
<!-- carvariations.meta -->
<CVehicleModelInfoVarGlobal>
  <Variations>
    <Item>
      <modelName>име_на_модела</modelName>
      <kits><Item>имеkit_modkit</Item></kits>
    </Item>
  </Variations>
</CVehicleModelInfoVarGlobal>
```

```xml
<!-- carcols.meta -->
<CVehicleModelInfoVarGlobal>
  <Kits>
    <Item>
      <kitName>имеkit_modkit</kitName>
      <liveryMods>
        <Item><modShopLabel>КЛЮЧ_1</modShopLabel><textureEffect>.. по оригинал ..</textureEffect></Item>
      </liveryMods>
    </Item>
  </Kits>
</CVehicleModelInfoVarGlobal>
```

Имената на елементите са от паметта на общността; задължително сверете с оригинален файл преди ползване.

## Текстури

| Тема | Правило | Статус |
|---|---|---|
| Формат | DDS: DXT1 без алфа, DXT5 с алфа, BC7 рядко | общностно |
| Размер | 1024 или 2048 (степен на 2) | общностно |
| Mipmaps | включени | общностно |
| ytd | `модел.ytd`; възможно и `модел_hi.ytd` | общностно, за проверка |
| Бюджет | под 16 MiB физическа памет на актив (общностна тема, 2020) | виж fivem-mlo/references/streaming-budget.md |
| Разделяне | при голям ytd — по ливреи в отделни ресурси/файлове | общностно |

## Ливрея и шаблон

UV шаблонът се прави от собствения модел (Blender → UV Layout). Шаблони от чужди пакети — само с лиценз.
