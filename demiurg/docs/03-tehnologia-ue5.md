# 03 · Unreal Engine 5 — техническо проучване (voxel, мултиплейър, `.exe`)

> Кратко: технически е възможно да построим красив sandbox на UE5, но **UE не е естествено
> пригоден за voxel светове** — Nanite/Lumen работят срещу разрушаема геометрия, а voxel
> мултиплейър репликацията е custom работа. Реалистичен MVP: **6–12 мес., 4–8 души.**

---

## 1. Версия — препоръка **UE 5.6**

Първата линия с целенасочени оптимизации за „голям динамичен open-world при 60 Hz“.

| Функция | Състояние | Релевантност за нас |
|---|---|---|
| **Nanite** | зрял; 5.6 добавя Nanite Foliage, „Nanite Voxels“ (tech demo) | Само за **статичен** далечен детайл; **проблемен за динамична промяна** |
| **Lumen** | зрял; 5.6 ускорен HWRT | Динамично GI без bake — идеално за копаем/строим свят, но **скъп на GPU** |
| **World Partition** | production | **Задължителен** за голям стрийминг-свят |
| **PCG Framework** | production (2× по-бърз в 5.6), GPU path | Процедурно генериране на terrain/биоми |
| **Mass Entity (ECS)** | experimental (в продукция) | Масови NPC/тълпи; **не** за самите блокове |
| **IoStore / .pak / DLC cooker** | зрял | Основа на модинг/UGC pipeline |

### ⚠ Критичното ограничение: Nanite/Lumen срещу voxel

- **Nanite работи само на static mesh.** Всяка промяна на chunk = re-mesh → сблъсква с
  Nanite pipeline-а. Nanite не поддържа добре skeletal анимация и прозрачни материали
  (стъкло/вода).
- **Lumen е скъп** — „по-добра графика“ = Lumen ON = сериозен GPU бюджет = по-високи минимални
  изисквания за играча.
- Работещите демота са **хибрид:** Voxel Plugin (разрушаема геометрия) + Nanite (далечен
  статичен детайл) + Lumen (осветление), не „чист Nanite voxel свят“.

**Следствие за дизайна (важно):** ако правим истинска Minecraft-стил кубична деструкция —
това е борба срещу енджина. Успешните sandbox са почти всички на собствени/леки енджини;
EverQuest Next (Sony) се провали точно на voxel-мащаба. **Препоръка:** low-poly/stylized
survival (тип Valheim/Enshrouded), където UE5 блести, с **ограничена/чанк-базирана**
деструкция — не деформация на всеки блок в реално време. Виж `05` за дизайн-следствията.

## 2. Voxel/terrain архитектура — два пътя

### Път A: Voxel Plugin 2 (Phyronnaz) — **препоръчан старт за MVP**

- **$349 USD**, перпетуален лиценз, споделяем в рамките на проект. Включва 1 г. features,
  3 г. bug fixes + engine upgrades. ([voxelplugin.com](https://voxelplugin.com/))
- **⚠ Проекти с бюджет >$100k трябва да договорят custom лиценз** — планирай рано.
- Алтернатива по-евтина/тясна: **Easy Voxels: Cubic** (cubic стил, greedy meshing, LOD).

### Път Б: собствен voxel engine (C++)

Стандартна архитектура: **chunking** (16³/32³, 1 mesh/chunk) · **greedy meshing** (обединяване
на лица) · **face culling** · промяна на блок = **re-mesh на chunk-а** · **streaming/LOD** ·
**многонишково генериране** (Task Graph). Цена: **3–9 месеца само за solid база** преди
геймплей. ([nickmcd.me](https://nickmcd.me/2021/04/04/high-performance-voxel-engine/))

> Voxel Plugin 2 спестява месеци; собствен engine дава IP-контрол и избягва $100k праг.
> За MVP → Voxel Plugin 2, освен ако не сме сигурни, че ще минем $100k рано.

## 3. Мултиплейър — server-authoritative, co-op мащаб

- **Модел:** client-server (никога P2P за sandbox — cheat защита). Actor replication + RPCs
  (`Server`/`Client`/`NetMulticast`); GAS за способности/крафт (мощен, стръмна крива).
- **Проблемът с voxel репликация:** наивният подход (chunk actors с реплициран масив) е
  **бавен** (>1 сек/actor за нов играч). Решение: **не реплицирай целия свят** — прати
  **baseline (seed + списък човешки промени)**, регенерирай свят клиентски от seed,
  реплицирай само **делти** (променен блок: позиция+тип) с delta compression.
  ([forum](https://forums.unrealengine.com/t/replicating-lots-of-data-replication-rpc-or-custom-sockets/384199))
- **Мащаб реалистично:** 16–64 играча/инстанция комфортно; ~100 с сериозна работа по
  replication graph. **„Roblox мащаб“ = sharding** (много инстанции зад load balancer), не
  един гигантски сървър. → **За MVP: co-op ≤16, не MMO.**

### Хостинг на dedicated servers

| Опция | Модел | Ориентир | Бележка |
|---|---|---|---|
| **Edgegap** | just-in-time контейнери | ~$1,968/мес (пример 1000 CCU) | без ръчно fleet управление; добър старт |
| **AWS GameLift** | pre-provisioned fleets | ~$4,614/мес (същия пример) | по-скъп; **AWS вдига цени ~30–40% 2026** |
| **Self-host** (Hetzner/EU) | твой хардуер | най-евтино per-core | ти носиш DDoS/скалиране/DevOps |

## 4. UGC / modding pipeline

- **UEFN/Verse** е екосистемата на **Fortnite**, НЕ за самостоятелна `.exe` игра (Verse се
  компилира само в UEFN). Референтен модел, не опция за нас.
- **Собствен mod SDK (пътят ни):** всеки мод = **Content-Only Plugin** → пакетиран през DLC
  Cooker до `.pak`/IoStore (`.ucas`+`.utoc`) → runtime mount. **mod.io** има готов UE плъгин
  (ModioUGC) с целия pipeline. ([mod.io](https://docs.mod.io/unreal/modio-ugc/packaging-ugc/))
- **Scripting за играчи (да не пишат C++):** **Lua** (LuaMachine/sol2) — лека интеграция,
  познат език. (UnrealEngine-Angelscript е по-мощен, но иска модифициран engine от source.)
- **🔒 Sandboxing (критично):** потребителски скрипт върви само в **ограничен интерпретатор**
  с **whitelisted API** — без файлова система/мрежа/процеси, лимити на CPU/памет/итерации.
  Content-only pak-ове (само данни) са най-безопасни. **Server-authoritative** валидация +
  **pak signing** + EAC.

## 5. Пакетиране и дистрибуция (`.exe` за Windows)

- **Билд:** Target **Win64, конфигурация Shipping** (`<Game>-Win64-Shipping.exe`) през
  Project Launcher / BuildCookRun. Размер: **няколкостотин MB–няколко GB** (Nanite/Lumen асети
  тежат) → asset compression, IoStore, texture streaming.
- **Инсталатор:** UE не генерира готов инсталатор — прави се с **Inno Setup/NSIS** (безплатни)
  или платформата (Steam/EGS) го поема.
- **Дистрибуция:** **Steam** (де-факто стандарт, 30% cut) · Epic Store (12% cut + намален UE
  royalty) · собствен launcher (пълен контрол, но носиш patching/CDN/анти-чийт).
- **Анти-чийт:** **Easy Anti-Cheat** през Epic Online Services — **безплатен**, интегриран с
  UE. Изисква **Pak Signing** включен. Трябва да съжителства с mod-pak-овете (signed/whitelist).

## 6. Лиценз на Unreal Engine (2025/2026)

- **Игри: 5% роялти върху приход над $1M** (първият $1M освободен per продукт); двигателят е
  безплатен. **EGS бонус:** роялти пада на **3.5%** за игри, издадени на Epic Games Store.
- Seat-моделът ($1,850/seat/год.) е за **не-игри** — **не** ни засяга.
- **Voxel Plugin е отделен разход** ($349 + custom лиценз при бюджет >$100k).
  ([UE licensing](https://www.unrealengine.com/license))

## 7. Реалистична оценка (техническа)

- **MVP (vertical slice: движение, копане/строене, малък процедурен свят, 4–16 co-op, save):
  6–12 месеца.** Voxel netcode-ът и „по-добрата графика“ (Nanite/Lumen tuning) изяждат срока.
- **Роли (4–8 души):** gameplay/systems C++ · netcode/multiplayer · tech artist (Nanite/Lumen/
  PCG) · 3D artist · game/level designer · (по избор) UGC/tools инженер · QA/DevOps.

### Обобщени технически рискове

1. **Nanite/Lumen ≠ voxel-friendly** → хибрид + компромиси; „красотата“ вдига мин. изисквания.
2. **Voxel мултиплейър репликацията е custom** — най-подцененият риск.
3. **Мащаб „Roblox“ = sharding + инфраструктура** (повтарящ се месечен разход, расте с играчите).
4. **UGC scripting = сигурностен риск** → задължителен Lua sandbox + server-authoritative + pak signing.
5. **Voxel Plugin >$100k бюджет** → договаряй рано; собствен engine = месеци.

**Прагматичен старт:** UE 5.6 + Voxel Plugin 2 + World Partition + Lumen (Nanite само за
статичен далечен детайл) + EAC + mod.io (по-късно) + Edgegap. Първо **single-player vertical
slice**, после co-op делта-репликация, UGC последно.
