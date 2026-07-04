# demiurg/game — Unreal Engine 5.6 проект (voxel спайк)

Скелет на играта + **първият voxel spike** (собственият C++ chunk engine — кандидат от
[`../docs/07`](../docs/07-faza1-tehnicheski-plan.md) §1). Целта на спайка: докажи, че кубично
копаене/строене през chunk-ове с face culling е стабилно и се усеща добре.

> ⚠ **Кодът НЕ е компилиран** — писан е в среда без Unreal Engine (Linux CI контейнер). Писан е
> срещу UE **5.6** API и трябва да се отвори/компилира в редактора от разработчик. Възможни са
> дребни корекции (напр. реда на триъгълниците за посоката на лицата — виж по-долу).

## Изисквания

- **Unreal Engine 5.6** (Epic Games Launcher или от source).
- Windows + Visual Studio 2022 (workload „Game development with C++“), или Rider.
- **Git LFS**: `git lfs install` веднъж, преди да добавяш `.uasset/.umap` (виж `.gitattributes`).

## Първо отваряне

1. Десен клик на `Demiurg.uproject` → **Generate Visual Studio project files**.
2. Отвори `Demiurg.sln`, build конфигурация **Development Editor**, компилирай.
3. Отвори `Demiurg.uproject` в редактора.

## Как да видиш voxel света (ръчен спайк тест)

1. Създай празна карта (`/Game/Maps/Valley`), сложи я като default map в
   `Config/DefaultEngine.ini`.
2. Плъзни **`VoxelWorld`** actor в сцената. (По избор: задай `ChunkMaterial` — прост material с
   **Vertex Color → Base Color**, за да видиш цветовете на блоковете; без него ще е default сив.)
3. Сложи Pawn/PlayerStart + осветление (Directional Light + Sky). Play.
4. Ще видиш мрежа `(2·ViewRadiusChunks+1)²` chunk-а процедурен терен (placeholder sine
   heightmap — заменя се с PCG японска долина).

## Как да закачиш копаене/поставяне

`AVoxelWorld::EditBlockAtWorld(WorldPos, NewBlock)` е готова (BlueprintCallable). В Blueprint на
PlayerController/Pawn:

- **Копаене:** `LineTraceByChannel` от камерата → вземи `HitLocation` и `HitNormal` →
  извикай `EditBlockAtWorld(HitLocation - HitNormal * 50, EVoxelBlock::Air)`.
  *(50 = половин блок; BlockSize = 100 uu.)*
- **Поставяне:** `EditBlockAtWorld(HitLocation + HitNormal * 50, EVoxelBlock::Stone)`.

Свържи ги към Enhanced Input действия (ляв/десен бутон).

## Структура

```
Demiurg.uproject          конфигурация на проекта (UE 5.6, ProceduralMesh + EnhancedInput)
Config/                   DefaultEngine.ini (Lumen), DefaultGame.ini
Source/
  Demiurg.Target.cs       Game target
  DemiurgEditor.Target.cs  Editor target
  Demiurg/
    Demiurg.Build.cs      зависимости на модула (вкл. ProceduralMeshComponent)
    Demiurg.{h,cpp}       примарен game модул
    Voxel/
      VoxelTypes.h        EVoxelBlock enum + константи (ChunkSize=32, BlockSize=100)
      VoxelChunk.{h,cpp}  chunk данни + face-culling meshing (ProceduralMeshComponent)
      VoxelWorld.{h,cpp}  спавн на мрежа chunk-ове + EditBlockAtWorld (копай/постави)
```

## Известни спайк-ограничения (нарочни, за следващи стъпки)

- **Face culling, не greedy meshing** — greedy е следващата оптимизация (`VoxelChunk.cpp` TODO).
- **Cross-chunk culling липсва** — граничните лица се рендерират; терен е безшевен (височината е
  по world координати), но има лек overdraw по границите. Ще се реши с neighbour query.
- **Единичен вертикален слой** (Z=0), височина ≤ ChunkSize. Вертикално стифане — по-късно.
- **Синхронен re-mesh** — при много бързо копаене може да има hitch; async през Task Graph е TODO.
- **Placeholder heightmap** (sine) — заменя се с PCG японска долина (`docs/07` седмица 5).
- **Посока на лицата:** ако рендерират наопаки, обърни реда на триъгълниците в `RebuildMesh()`
  (маркирано в кода).

Пълен план на Фаза 1 → [`../docs/07-faza1-tehnicheski-plan.md`](../docs/07-faza1-tehnicheski-plan.md).
