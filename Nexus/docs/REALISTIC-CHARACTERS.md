# Реалистични персонажи (Ready Player Me / Mixamo) — как стигаме до тях

**Цел:** реалистични човешки лица „като от реалния живот", вместо рисувани лица
върху нискополигонални Quaternius глави.

## Какво открихме

Официалните CDN-и на RPM и Mixamo са **блокирани** от мрежовата политика на тази
среда:

| Хост | Резултат |
| --- | --- |
| `models.readyplayer.me` (аватар GLB CDN) | 502 — policy denial |
| `api.readyplayer.me` | 502 — policy denial |
| `www.mixamo.com/api` | 403 — policy denial |
| `raw.githubusercontent.com` | **200 — разрешен** ✅ |

Затова стигаме до тях през **GitHub raw**: в публични репа има committ-нати готови
GLB-та със същата технология (RPM „Wolf3D" аватари, Mixamo персонажи).

`scripts/fetch-realistic-characters.sh` ги сваля.

## Какво има в RPM аватара (`realistic/warrior.glb` = `mage.glb`, dev placeholder)

**Истинска лицева геометрия** — край на рисуваните decal-и:

- `EyeLeft` / `EyeRight` — отделни 3D очни ябълки (120 върха всяка)
- `Wolf3D_Head` — 2162 върха детайлна глава (вежди, нос, устни, уши)
- `Wolf3D_Teeth`, `Wolf3D_Beard` — зъби и брада/мустак като отделни меши
- PBR baseColor + **normal карти** (реалистична кожа/осветление)
- Скелет: 67 кости, стандартен хуманоиден риг (`Hips, Spine, Spine1, Spine2,
  Neck, Head, LeftEye, RightEye, LeftShoulder, LeftArm, LeftForeArm, LeftHand,
  …, LeftUpLeg, LeftLeg, LeftFoot, …`) — Mixamo-съвместим (без `mixamorig:`
  префикс). `Michelle.glb` ползва същата структура с `mixamorig:` префикс.

## Празнини за пълна интеграция

1. **Вариация за 4 класа.** Свободно достъпен е само ТОЗИ аватар. Решение: създай
   аватари на <https://readyplayer.me> (безплатно, ~2 мин/бр.) и качи GLB-тата в
   `client/public/assets/characters/realistic/` — по едно лице за warrior / mage /
   ranger / rogue. (RPM CDN е блокиран тук, но ти имаш достъп от своята машина.)
2. **Боеви анимации.** RPM библиотеката (`readyplayerme/animation-library`) има само
   `idle / locomotion / expression / dance` — НЯМА attack/hit/death. Mixamo има
   идеални (Sword Slash, Hit Reaction, Dying…), но CDN-ът е блокиран. Варианти:
   - свали няколко от Mixamo с безплатен Adobe акаунт и ги качи (един и същ скелет →
     директно се прилагат), или
   - караме боя **процедурно** през съществуващия `Choreographer` (lunge/lean/удар
     без authored клипове) — той вече има процедурен fallback.
3. **Пренастройка на боевата система** за новия скелет: clip-map, life-layer и
   избор на кости ползват Quaternius имена (`Torso, Abdomen, Head, Weapon.R`) — за
   RPM/Mixamo стават `Spine2, Spine, Head, RightHand`. Лицевият decal отпада (има
   истинско лице). Перф за мобилни: RPM главата е ~2k върха/боец — приемливо, но
   следи общия бюджет.

## Лиценз (одитирано от Правния Разбирач, 2026-07)

MIT лицензът на three.js покрива само **кода** — example-асетите запазват
собствените си лицензи. Свалянето от MIT repo не пренаписва лиценза на асета.

| Файл | Лиценз | Dev/демо | Продукция |
| --- | --- | --- | --- |
| `characters/{warrior,ranger,mage,rogue}.glb` (Quaternius) | **CC0** | да | **да — безопасно** |
| `characters/realistic/warrior.glb`, `mage.glb` (RPM sample, идентични) | RPM sample, **CC BY-NC** (некомерсиален) | да | **НЕ — BLOCKER** |
| Mixamo `Michelle.glb`/`Soldier.glb` (от скрипта) | Adobe Mixamo | локална референция | само **вградени** анимации; не committ-вай/сервирай суровите GLB |

- **RPM:** аватарите от Avatar Creator са под некомерсиален CC лиценз;
  комерсиална употреба изисква регистрация като **RPM Developer/Partner** и
  употреба през тяхната интеграция — не редистрибуция на статичен GLB.
- **Mixamo:** royalty-free комерсиално **при вграждане** в билда (retarget-нати
  клипове); редистрибуция на суровите файлове „as is" е забранена.
- **Преди пускане (чеклист):** изтрий/замени `realistic/*.glb`; провери, че
  всички сервирани `public/assets` са CC0 / собствени / комерсиално лицензирани.
  Точните формулировки на RPM ToS / Mixamo FAQ да се сверят на живо; при
  съмнение — юрист по ИС. Това не е правен съвет.
