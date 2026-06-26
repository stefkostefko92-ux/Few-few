import React from 'react';

/**
 * Renders a CC-BY-3.0 SVG sprite from /public/sprites/ as a CSS mask.
 *
 * The sprites are post-processed by scripts/fetch-sprites.sh so they ship
 * as bare silhouettes (no background, fill="currentColor"). We render them
 * via -webkit-mask so we can paint the shape with any gradient — rarity
 * gradient by default — and float an enchant halo behind it without
 * touching the bitmap.
 *
 * Props:
 *   name      sprite slug (e.g. "sword-t3")
 *   tier      item tier 1..5 (resolves "sword" → "sword-t3" automatically)
 *   subType   weapon sub-type (sword/bow/staff/axe/dagger/mace)
 *   category  shop category (weapon/shield/helm/armor/...)
 *   rarity    paints the tint: common steel → legendary gold
 *   enchant   adds a rotating glow halo, 1..5 increasing in intensity
 *   size      px square
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

const RARITY_GRADIENT: Record<Rarity, string> = {
  common:    'linear-gradient(135deg, #c7c8d6 0%, #7c7d83 60%, #4a4d56 100%)',
  uncommon:  'linear-gradient(135deg, #b7f0c8 0%, #6ad8a4 60%, #2f8a5c 100%)',
  rare:      'linear-gradient(135deg, #b9d8ff 0%, #6aa7ff 55%, #2c5fb8 100%)',
  epic:      'linear-gradient(135deg, #e6c8ff 0%, #c294ff 55%, #6a3fb8 100%)',
  legendary: 'linear-gradient(135deg, #ffefa8 0%, #ffd34d 50%, #d6a13d 100%)',
};

// Tones used when there's no clear rarity (camp activities, UI flourishes,
// monsters, class avatars).
const TONE_GRADIENT: Record<string, string> = {
  // weapons / tools
  weapon: RARITY_GRADIENT.legendary,
  potion: 'linear-gradient(135deg, #ffe88a 0%, #ff7468 60%, #7a1a13 100%)',
  // armor family
  shield: RARITY_GRADIENT.rare,
  helm:   RARITY_GRADIENT.rare,
  armor:  RARITY_GRADIENT.rare,
  gloves: RARITY_GRADIENT.rare,
  boots:  RARITY_GRADIENT.rare,
  // trinkets
  ring:   RARITY_GRADIENT.uncommon,
  amulet: RARITY_GRADIENT.uncommon,
  gem:    RARITY_GRADIENT.epic,
  // others
  warrior: 'linear-gradient(135deg, #ffefa8, #d6a13d 70%, #7a1a13)',
  ranger:  'linear-gradient(135deg, #b7f0c8, #6ad8a4 70%, #1f5a3a)',
  mage:    'linear-gradient(135deg, #e6c8ff, #c294ff 70%, #4a1a8a)',
  rogue:   'linear-gradient(135deg, #ffd0c8, #e85a4f 70%, #3a0808)',
  monster: 'linear-gradient(135deg, #e5b3a5, #c7641a 60%, #5c0a08)',
  camp:    'linear-gradient(135deg, #f5d088, #d6a13d 60%, #6a4012)',
  ui:      'linear-gradient(135deg, #ffefa8, #d6a13d 60%, #7a4f12)',
};

// Enchant halo: rotating soft ring + drop-shadow. Each level escalates the
// intensity and shifts hue so collectors can read enchant level at a glance.
const ENCHANT_STYLE: Record<number, { color: string; shadow: string }> = {
  1: { color: 'rgba(199,200,214,.7)', shadow: '0 0 8px rgba(199,200,214,.5)' },                    // silver
  2: { color: 'rgba(106,216,164,.85)', shadow: '0 0 10px rgba(106,216,164,.7)' },                  // emerald
  3: { color: 'rgba(106,167,255,.95)', shadow: '0 0 14px rgba(106,167,255,.8)' },                  // azure
  4: { color: 'rgba(194,148,255,1)',   shadow: '0 0 18px rgba(194,148,255,.9)' },                  // arcane
  5: { color: 'rgba(255,232,138,1)',   shadow: '0 0 22px rgba(255,232,138,1), 0 0 40px rgba(255,177,89,.6)' }, // mythic
};

interface Props {
  name?: string;
  category?: string;
  subType?: string;
  tier?: number;
  rarity?: Rarity;
  enchant?: number;
  tone?: string;
  size?: number;
  title?: string;
  className?: string;
}

/** Resolve a base slug (without -tN suffix) into a tier-aware slug, falling
 *  back gracefully when the asset isn't available. */
function resolveSlug(name?: string, category?: string, subType?: string, tier?: number): string {
  if (name && !name.match(/^(sword|dagger|bow|staff|axe|mace|shield|helm|armor|gloves|boots|ring|amulet|gem)$/)) {
    return name; // already specific (e.g. "monster-wolf", "camp-fish")
  }
  const base =
    name ||
    (category === 'weapon' ? (subType || 'sword') :
     category && CATEGORY_BASES[category] ? CATEGORY_BASES[category] : 'sword');
  const t = Math.min(10, Math.max(1, tier || 1));
  if (TIERED_BASES.has(base)) return `${base}-t${t}`;
  return base;
}

const CATEGORY_BASES: Record<string, string> = {
  shield: 'shield', helm: 'helm', armor: 'armor', gloves: 'gloves', boots: 'boots',
  ring: 'ring', amulet: 'amulet', potion: 'potion-red', cloak: 'cloak', gem: 'gem',
};
/* Equipment slots that ship 10 tier variants per slot (T1 crude iron →
   T10 divine radiance). Sprite resolves `${base}-t${tier}.jpg` when a
   tier is supplied; missing tier files fall through to the bare
   `${base}.jpg` thanks to the onError handler below. */
const TIERED_BASES = new Set<string>([
  'sword', 'axe', 'bow', 'dagger', 'mace', 'staff', 'spear',
  'armor', 'helm', 'boots', 'gloves', 'shield', 'cloak',
  'amulet', 'ring', 'gem',
]);

/** Rarity → frame border colour. Photos are shown un-tinted; the badge
 *  frame around them communicates rarity instead of recolouring the art. */
const RARITY_FRAME: Record<Rarity, { border: string; glow: string }> = {
  common:    { border: '#7c7d83', glow: 'rgba(199,200,214,.35)' },
  uncommon:  { border: '#6ad8a4', glow: 'rgba(106,216,164,.40)' },
  rare:      { border: '#6aa7ff', glow: 'rgba(106,167,255,.50)' },
  epic:      { border: '#c294ff', glow: 'rgba(194,148,255,.55)' },
  legendary: { border: '#ffd34d', glow: 'rgba(255,211,77,.65)' },
};

export default function Sprite({
  name, category, subType, tier, rarity, enchant = 0, tone, size = 32, title, className,
}: Props): React.ReactElement {
  const slug = resolveSlug(name, category, subType, tier);
  const e = enchant > 0 ? ENCHANT_STYLE[Math.min(5, enchant)] : null;
  const frame = rarity ? RARITY_FRAME[rarity] : RARITY_FRAME.common;
  // SVG tint gradient kept as a fallback for slugs where we don't yet
  // ship a photo (custom items, future slots, error states).
  const fallbackGradient =
    rarity ? RARITY_GRADIENT[rarity] :
    tone && TONE_GRADIENT[tone] ? TONE_GRADIENT[tone] :
    category && TONE_GRADIENT[category] ? TONE_GRADIENT[category] :
    TONE_GRADIENT.weapon;

  return (
    <span
      className={`sprite-wrap ${className || ''} ${e ? `sprite-enchant sprite-enchant-${enchant}` : ''}`}
      style={{
        width: size, height: size, position: 'relative', display: 'inline-block', lineHeight: 0,
        borderRadius: Math.max(6, size * 0.18),
        overflow: 'hidden',
        border: `1.5px solid ${frame.border}`,
        boxShadow:
          `inset 0 0 0 1px rgba(0,0,0,.35), ` +
          `0 0 ${Math.max(6, size * 0.25)}px ${frame.glow}, ` +
          (e ? e.shadow : '0 2px 4px rgba(0,0,0,.45)'),
        background: 'linear-gradient(180deg, rgba(20,12,4,.55), rgba(8,4,2,.85))',
      }}
      title={title}
      aria-label={title}
    >
      {e && (
        <span
          className="sprite-halo"
          style={{
            position: 'absolute', inset: -2, borderRadius: 'inherit',
            boxShadow: `inset 0 0 ${Math.max(8, size * 0.4)}px ${e.color}`,
            pointerEvents: 'none', zIndex: 3,
          }}
        />
      )}
      {/* HD photo of the actual item / class / monster. If the photo is
          not present we fall through to the SVG silhouette so the icon
          system degrades gracefully. */}
      <img
        src={`/assets/icons/${slug}.jpg`}
        alt=""
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center',
          filter: 'saturate(.95) contrast(1.06)',
          zIndex: 1,
        }}
        onError={(ev) => {
          const img = ev.currentTarget as HTMLImageElement;
          img.style.display = 'none';
          const fb = img.nextElementSibling as HTMLElement | null;
          if (fb) fb.style.display = 'block';
        }}
        loading="lazy"
      />
      <span
        className="sprite-shape"
        style={{
          display: 'none',
          position: 'absolute', inset: '12%', width: '76%', height: '76%',
          background: fallbackGradient,
          WebkitMask: `url(/sprites/${slug}.svg) center/contain no-repeat`,
          mask: `url(/sprites/${slug}.svg) center/contain no-repeat`,
          filter: 'drop-shadow(0 1px 0 rgba(0,0,0,.4))',
          zIndex: 2,
        }}
      />
    </span>
  );
}

/** Pick sprite props for an item record. */
export function spriteForItem(
  item: { icon?: string; category?: string; sub_type?: string; tier?: number; rarity?: string }
): { name?: string; category?: string; subType?: string; tier?: number; rarity?: Rarity } {
  return {
    name: item.icon && item.icon.startsWith('potion_') ? `potion-${item.icon.slice(7)}` : undefined,
    category: item.category,
    subType: item.sub_type,
    tier: item.tier,
    rarity: (item.rarity as Rarity) || 'common',
  };
}
