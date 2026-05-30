#!/usr/bin/env bash
# Downloads a curated set of CC-BY-3.0 SVG icons from game-icons.net (Lorc's
# pack, mirrored on GitHub). Drops them into client/public/sprites/ so the
# client can <img src="/sprites/{slug}.svg" /> them directly.
#
# Attribution: every icon used here is by Lorc — http://lorcblog.blogspot.com
# License: CC BY 3.0 — https://creativecommons.org/licenses/by/3.0/
# See client/public/sprites/CREDITS.md for the full list.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/client/public/sprites"
BASE="https://raw.githubusercontent.com/game-icons/icons/master/lorc"

mkdir -p "$OUT"

# slug-on-disk : remote-slug
declare -a MAP=(
  # Weapons
  "sword:broadsword"
  "dagger:stiletto"
  "bow:bowman"
  "staff:wizard-staff"
  "axe:stone-axe"
  "mace:spiked-mace"
  # Armor
  "shield:checked-shield"
  "shield-magic:magic-shield"
  "helm:barbute"
  "helm-visored:visored-helm"
  "armor:breastplate"
  "armor-leather:leather-vest"
  "gloves:mailed-fist"
  "boots:leather-boot"
  # Trinkets
  "ring:gem-pendant"
  "amulet:emerald"
  "gem:crystal-shine"
  # Consumables
  "potion-red:potion-ball"
  "potion-blue:fizzing-flask"
  "potion-green:round-bottom-flask"
  "potion-purple:drink-me"
  # Class avatars
  "class-warrior:muscle-up"
  "class-ranger:chained-arrow-heads"
  "class-mage:crystal-ball"
  "class-rogue:stiletto"
  # Monsters / bestiary
  "monster-wolf:wolf-head"
  "monster-spider:scorpion"
  "monster-goblin:imp"
  "monster-skeleton:skeleton-inside"
  "monster-orc:barbed-spear"
  "monster-bat:evil-bat"
  "monster-dragon:wyvern"
  "monster-hydra:hydra"
  "monster-ghost:spectre"
  "monster-mushroom:mushroom"
  "monster-tinker:tinker"
  # Idle / camp activities
  "camp-fish:fishing-net"
  "camp-mine:stone-block"
  "camp-forest:treasure-map"
  "camp-hunt:arrow-flights"
  "camp-scout:treasure-map"
  "camp-fire:fire-bowl"
  # UI flourishes
  "icon-portal:magic-portal"
  "icon-coin:crowned-explosion"
  "icon-skull:skull-bolt"
)

ok=0
fail=0
for entry in "${MAP[@]}"; do
  local_slug="${entry%%:*}"
  remote_slug="${entry#*:}"
  url="$BASE/$remote_slug.svg"
  out_path="$OUT/$local_slug.svg"
  if curl -sLf --max-time 8 "$url" -o "$out_path"; then
    ok=$((ok + 1))
  else
    fail=$((fail + 1))
    echo "[miss] $local_slug ($remote_slug)"
    rm -f "$out_path"
  fi
done

cat > "$OUT/CREDITS.md" <<CREDITS
# Sprite credits

All SVGs in this folder are by [Lorc](http://lorcblog.blogspot.com), via
[game-icons.net](https://game-icons.net), licensed under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

No modifications beyond renaming the file. Each \`*.svg\` originally lived at
\`https://game-icons.net/icons/lorc/originals/svg/<remote-slug>.svg\`.

Fetched: $(date -u +%Y-%m-%dT%H:%M:%SZ)
CREDITS

echo
echo "Fetched $ok sprites, $fail missed."