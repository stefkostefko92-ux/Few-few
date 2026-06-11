#!/usr/bin/env bash
# Downloads CC-BY-3.0 SVG icons from game-icons.net (Lorc's pack, mirrored
# on GitHub) into client/public/sprites/.
#
# Then post-processes every fetched SVG so it works as a CSS mask:
#  - strips the opaque black background rectangle that ships with each icon
#  - replaces `fill="#fff"` with `fill="currentColor"` so the silhouette
#    inherits the element's text color when inlined
#
# This lets the React Sprite component apply rarity-coloured gradients
# and enchant glows without the muddy hue-rotate filter hack.
#
# Attribution: every icon used here is by Lorc — http://lorcblog.blogspot.com
# License: CC BY 3.0 — https://creativecommons.org/licenses/by/3.0/
# See client/public/sprites/CREDITS.md for the full mapping.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/client/public/sprites"
BASE="https://raw.githubusercontent.com/game-icons/icons/master/lorc"

mkdir -p "$OUT"

# local-slug : remote-slug
# Tier suffixes follow weapon/armor categories: T1 (basic) → T5 (legendary).
declare -a MAP=(
  # ─── Swords ────────────────────────────────────────────
  "sword-t1:pointy-sword"
  "sword-t2:broadsword"
  "sword-t3:rune-sword"
  "sword-t4:shining-sword"
  "sword-t5:spinning-sword"
  # ─── Daggers ───────────────────────────────────────────
  "dagger-t1:stiletto"
  "dagger-t2:curvy-knife"
  "dagger-t3:plain-dagger"
  "dagger-t4:shard-sword"
  "dagger-t5:sword-clash"
  # ─── Bows ──────────────────────────────────────────────
  "bow-t1:bowman"
  "bow-t2:arrow-cluster"
  "bow-t3:chained-arrow-heads"
  "bow-t4:arrow-flights"
  "bow-t5:energy-arrow"
  # ─── Staves ────────────────────────────────────────────
  "staff-t1:wizard-staff"
  "staff-t2:harpoon-trident"
  "staff-t3:trident"
  "staff-t4:crystal-ball"
  "staff-t5:magic-portal"
  # ─── Axes ──────────────────────────────────────────────
  "axe-t1:stone-axe"
  "axe-t2:wood-axe"
  "axe-t3:battle-axe"
  "axe-t4:bloody-stash"
  "axe-t5:double-shot"
  # ─── Maces / hammers ───────────────────────────────────
  "mace-t1:spiked-mace"
  "mace-t3:spiked-mace"
  "mace-t5:thunder-skull"
  # ─── Shields ───────────────────────────────────────────
  "shield-t1:checked-shield"
  "shield-t2:edged-shield"
  "shield-t3:magic-shield"
  "shield-t4:magic-shield"
  "shield-t5:magic-shield"
  # ─── Helms ─────────────────────────────────────────────
  "helm-t1:barbute"
  "helm-t2:visored-helm"
  "helm-t3:visored-helm"
  "helm-t4:horned-helm"
  "helm-t5:horned-helm"
  # ─── Body armor ────────────────────────────────────────
  "armor-t1:leather-vest"
  "armor-t2:breastplate"
  "armor-t3:breastplate"
  "armor-t4:spiked-armor"
  "armor-t5:metal-disc"
  # ─── Gloves ────────────────────────────────────────────
  "gloves-t1:mailed-fist"
  "gloves-t2:mailed-fist"
  "gloves-t3:punch"
  "gloves-t4:punch"
  "gloves-t5:shining-claw"
  # ─── Boots ─────────────────────────────────────────────
  "boots-t1:leather-boot"
  "boots-t2:leather-boot"
  "boots-t3:boot-prints"
  "boots-t4:boot-prints"
  "boots-t5:boot-prints"
  # ─── Rings ─────────────────────────────────────────────
  "ring-t1:gem-pendant"
  "ring-t2:gem-pendant"
  "ring-t3:ringed-planet"
  "ring-t4:ringed-planet"
  "ring-t5:ringed-planet"
  # ─── Amulets ───────────────────────────────────────────
  "amulet-t1:emerald"
  "amulet-t2:emerald"
  "amulet-t3:heart-organ"
  "amulet-t4:shining-heart"
  "amulet-t5:crowned-heart"
  # ─── Gems (loose) ──────────────────────────────────────
  "gem-t1:crystal-shine"
  "gem-t3:crystal-cluster"
  "gem-t5:rainbow-star"
  # ─── Potions ───────────────────────────────────────────
  "potion-red:potion-ball"
  "potion-blue:fizzing-flask"
  "potion-green:round-bottom-flask"
  "potion-purple:drink-me"
  # ─── Class avatars ─────────────────────────────────────
  "class-warrior:visored-helm"
  "class-ranger:chained-arrow-heads"
  "class-mage:crystal-ball"
  "class-rogue:stiletto"
  # ─── Monsters ──────────────────────────────────────────
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
  "monster-skull:daemon-skull"
  # ─── Camp activities ───────────────────────────────────
  "camp-fish:fishing-net"
  "camp-mine:stone-block"
  "camp-forest:treasure-map"
  "camp-hunt:arrow-flights"
  "camp-scout:treasure-map"
  "camp-fire:fire-bowl"
  # ─── UI flourishes ─────────────────────────────────────
  "icon-portal:magic-portal"
  "icon-coin:crowned-explosion"
  "icon-skull:skull-bolt"
  "icon-anvil:tinker"
  "icon-flame:celebration-fire"
  "icon-vortex:vortex"
)

ok=0
fail=0
for entry in "${MAP[@]}"; do
  local_slug="${entry%%:*}"
  remote_slug="${entry#*:}"
  url="$BASE/$remote_slug.svg"
  out_path="$OUT/$local_slug.svg"
  if curl -sLf --max-time 8 "$url" -o "$out_path"; then
    # Strip the opaque black background path so the icon renders as a clean
    # silhouette mask. Replace #fff with currentColor so CSS color cascades.
    sed -i \
      -e 's|<path d="M0 0h512v512H0z"/>||g' \
      -e 's|fill="#fff"|fill="currentColor"|g' \
      "$out_path"
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

Each file was downloaded from
\`https://github.com/game-icons/icons/blob/master/lorc/<remote-slug>.svg\`
and post-processed to strip the opaque black background rectangle and
replace its white fill with \`currentColor\` so it can be tinted via CSS.

Fetched: $(date -u +%Y-%m-%dT%H:%M:%SZ)
CREDITS

echo
echo "Fetched $ok sprites, $fail missed."
