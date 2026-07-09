# Реалистични персонажи (Ready Player Me / Mixamo)

> ⚠️ **Лицензен гейт (автоматичен).** RPM sample аватарът е **CC BY-NC
> (некомерсиален)** и е забранен в публичен билд. `scripts/release-gate.sh`
> (пуска се от CI и от autodeploy) **фейлва деплоя**, ако: (а) тук има GLB с
> хеша на sample-а, или (б) GLB, който не е одобрен в `APPROVED-ASSETS.txt`.
> Виж `docs/REALISTIC-CHARACTERS.md` за лицензната таблица.

Сложи тук GLB с **истинско лице** на име `warrior.glb`, `mage.glb`, `ranger.glb`,
`rogue.glb`. Боят автоматично ги предпочита пред нискополигоналните Quaternius
ригове (`../<cls>.glb`) — без промяна в кода (`CombatScene3D.tryLoadRig`).

За dev преглед: `bash scripts/fetch-realistic-characters.sh` сваля sample-а
локално (не го committ-вай — gate-ът ще спре деплоя).

## Одобряване на собствен асет (за продукция)

1. Провери лиценза (собствен RPM аватар като регистриран Developer / купен /
   CC0). 2. Добави ред в `APPROVED-ASSETS.txt`: `<sha256>  <име>.glb`
   (`sha256sum <файл>`). 3. Committ-ни двата файла — gate-ът ще пусне.

## Как да направиш свои (CDN-ите на RPM/Mixamo са блокирани в CI, но ти имаш достъп)

1. Иди на <https://readyplayer.me> → създай аватар за всеки клас (~2 мин/бр).
   Свали `.glb` (full-body). Преименувай на `warrior.glb` / `mage.glb` / …
2. (по желание) Боеви анимации: RPM библиотеката има само idle/locomotion. За
   attack/hit/death свали от Mixamo (безплатен Adobe акаунт) — същият скелет.
   Засега боят се кара **процедурно** (виж `poseHumanoid` в `CombatScene3D.tsx`),
   тъй че authored клипове не са задължителни.
3. Сложи файловете тук и пусни играта.

## Какво прави кодът автоматично за реалистичен риг

- Ползва истинската лицева геометрия (EyeLeft/EyeRight/Wolf3D_Head/…) — **без**
  рисувания face-decal и без head-look-at-camera.
- Кара скелета **процедурно**: `discoverHumanoidBones` + `poseHumanoid` (боен
  стоеж + дишане + десен прав). Знаците на осите са в `HB_AXIS` — ако крайник
  сочи накриво при твой аватар, обърни съответната константа (виж коментарите).
- Маха fresnel rim-а (за low-poly е, на PBR кожа свети неестествено).

Виж `../../../../docs/REALISTIC-CHARACTERS.md` за пълните находки.
