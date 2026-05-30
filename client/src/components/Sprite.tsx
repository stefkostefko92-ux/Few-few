import React from 'react';

/**
 * Renders a CC-BY-3.0 SVG sprite from /public/sprites/.
 *
 * The sprite name maps to client/public/sprites/{name}.svg, which is
 * populated by `scripts/fetch-sprites.sh` from Lorc's pack on
 * game-icons.net. See client/public/sprites/CREDITS.md.
 *
 * `tone` paints the sprite via a CSS filter. The source SVGs are mostly
 * single-color silhouettes on a black square, so we drop the background
 * with mix-blend-mode and tint via a hue-rotate / drop-shadow combo.
 */

const TONE: Record<string, string> = {
  // weapon: warm gold
  weapon: 'sepia(.5) saturate(2) hue-rotate(-10deg) brightness(1.15)',
  // defense: cool steel
  shield: 'sepia(.2) saturate(1.4) hue-rotate(170deg) brightness(1.4)',
  helm: 'sepia(.3) saturate(1.2) hue-rotate(180deg) brightness(1.3)',
  armor: 'sepia(.3) saturate(1.2) hue-rotate(180deg) brightness(1.3)',
  gloves: 'sepia(.3) saturate(1.2) hue-rotate(180deg) brightness(1.3)',
  boots: 'sepia(.3) saturate(1.2) hue-rotate(180deg) brightness(1.3)',
  // trinkets: emerald
  ring: 'sepia(.5) saturate(2) hue-rotate(70deg) brightness(1.4)',
  amulet: 'sepia(.5) saturate(2) hue-rotate(70deg) brightness(1.4)',
  gem: 'sepia(.5) saturate(2.4) hue-rotate(220deg) brightness(1.5)',
  // potions
  potion: 'saturate(2) brightness(1.4)',
  // class / portrait
  warrior: 'sepia(.4) saturate(2) hue-rotate(-10deg) brightness(1.3)',
  ranger: 'sepia(.4) saturate(2) hue-rotate(70deg) brightness(1.3)',
  mage: 'sepia(.5) saturate(2.4) hue-rotate(220deg) brightness(1.4)',
  rogue: 'sepia(.4) saturate(2.2) hue-rotate(320deg) brightness(1.3)',
  // monsters / camp
  monster: 'sepia(.6) saturate(1.8) hue-rotate(330deg) brightness(1.15)',
  camp: 'sepia(.5) saturate(1.6) hue-rotate(20deg) brightness(1.25)',
  ui: 'sepia(.5) saturate(2) hue-rotate(-10deg) brightness(1.4)',
};

interface Props {
  name: string;
  tone?: keyof typeof TONE | string;
  size?: number;
  title?: string;
  className?: string;
}

export default function Sprite({ name, tone = 'weapon', size = 32, title, className }: Props): React.ReactElement {
  const filter = TONE[tone] || TONE.weapon;
  return (
    <span
      className={`sprite ${className || ''}`}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        lineHeight: 0,
      }}
      title={title}
      aria-label={title}
    >
      <img
        src={`/sprites/${name}.svg`}
        alt={title || name}
        width={size}
        height={size}
        style={{
          width: '100%',
          height: '100%',
          // The source SVGs ship with an opaque black background — knock it out
          // via mix-blend-mode so the silhouette shines through the panel.
          mixBlendMode: 'screen',
          filter,
        }}
        onError={(e) => {
          // Quietly hide if the sprite is missing
          (e.currentTarget as HTMLImageElement).style.opacity = '0';
        }}
      />
    </span>
  );
}

/** Pick a sprite name for an item record using either its `icon` or `category`. */
export function spriteForItem(icon: string, category: string): { name: string; tone: string } {
  // Items in seed use icon names like "sword", "potion_red", which already match our sprite slugs.
  const slugMap: Record<string, string> = {
    sword: 'sword',
    dagger: 'dagger',
    bow: 'bow',
    staff: 'staff',
    axe: 'axe',
    mace: 'mace',
    shield: 'shield',
    helm: 'helm',
    armor: 'armor',
    gloves: 'gloves',
    boots: 'boots',
    ring: 'ring',
    amulet: 'amulet',
    potion_red: 'potion-red',
    potion_blue: 'potion-blue',
    potion_green: 'potion-green',
    potion_purple: 'potion-purple',
  };
  const name = slugMap[icon] || category;
  const tone = category === 'potion' ? 'potion' : (TONE[category] ? category : 'weapon');
  return { name, tone };
}
