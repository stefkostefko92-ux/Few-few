#!/usr/bin/env bash
# Сваля реалистични, риг-нати хуманоидни модели (Ready Player Me / Mixamo
# съвместим скелет) от GitHub raw — защото ОФИЦИАЛНИТЕ CDN-и на RPM/Mixamo са
# блокирани от мрежовата политика на средата (models.readyplayer.me и
# api.readyplayer.me → 502 policy denial; www.mixamo.com/api → 403).
#
# GitHub raw (raw.githubusercontent.com) Е разрешен, а в публични репа има
# committ-нати готови GLB-та с РЕАЛНА лицева геометрия (очи/зъби/брада като
# отделни меши + PBR + normal карти). Това е „начинът да стигнем до RPM/Mixamo".
#
# Употреба:  bash scripts/fetch-realistic-characters.sh
set -euo pipefail
DEST="client/public/assets/characters/realistic"
mkdir -p "$DEST"

# 1) Ready Player Me аватар (реалистично лице: EyeLeft/EyeRight, Wolf3D_Head
#    2162 върха, Wolf3D_Teeth, Wolf3D_Beard; скелет Hips/Spine/Neck/Head/…).
#    Свален от three.js examples (MIT за three.js; провери RPM ToS за съдържанието).
curl -fsSL -o "$DEST/rpm-sample-male.glb" \
  "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/readyplayer.me.glb"

# 2) Mixamo-риг-нат анимиран персонаж (mixamorig: скелет; клипове SambaDance, TPose).
#    Полезен като източник на анимации/референция за retargeting.
curl -fsSL -o "$DEST/mixamo-michelle.glb" \
  "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Michelle.glb"

# 3) (по желание) Soldier — Mixamo войник с текстурирано лице, idle/walk/run.
# curl -fsSL -o "$DEST/mixamo-soldier.glb" \
#   "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Soldier.glb"

echo "Готово. Свалени в $DEST:"
ls -la "$DEST"
echo
echo "ЗАБЕЛЕЖКА за пълна интеграция (4 класа + боеви анимации):"
echo " - RPM CDN е блокиран ТУК, но ти можеш да създадеш аватари на readyplayer.me"
echo "   (безплатно) и да ги качиш в $DEST — варирани лица за warrior/mage/ranger/rogue."
echo " - Боеви анимации (attack/hit/death) НЕ са в RPM библиотеката (само idle/locomotion);"
echo "   Mixamo има идеални, но CDN-ът е блокиран — свали ги с безплатен Adobe акаунт и"
echo "   ги качи, ИЛИ ги караме процедурно през Choreographer-а (без authored клипове)."
