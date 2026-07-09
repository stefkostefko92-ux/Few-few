import React from 'react';

/**
 * Profile avatar — class-themed silhouette with rarity-tinted frame.
 * Avatars are referenced by slug (e.g. 'warrior_02'); each slug picks a
 * class glyph and a palette variation.
 */

interface Props {
  avatar: string;
  frame: string;
  size?: number;
  ring?: boolean;
}

const AVATAR_PALETTES: Record<string, { bg: string; fg: string; accent: string; glyph: string }> = {
  warrior_01: { bg: '#3a2812', fg: '#d6a13d', accent: '#7a1a13', glyph: 'warrior' },
  warrior_02: { bg: '#2a0a06', fg: '#ff7468', accent: '#3a4250', glyph: 'warrior' },
  warrior_03: { bg: '#1a1c2a', fg: '#e8e7e1', accent: '#d6a13d', glyph: 'warrior' },
  ranger_01:  { bg: '#1a2a14', fg: '#6ad8a4', accent: '#3a5a2a', glyph: 'ranger' },
  ranger_02:  { bg: '#0a1218', fg: '#8be8d2', accent: '#1f3815', glyph: 'ranger' },
  ranger_03:  { bg: '#16223a', fg: '#7eb6ff', accent: '#6ad8a4', glyph: 'ranger' },
  mage_01:    { bg: '#1d0f3a', fg: '#c294ff', accent: '#28184a', glyph: 'mage' },
  mage_02:    { bg: '#0c0420', fg: '#9050d0', accent: '#3a1660', glyph: 'mage' },
  mage_03:    { bg: '#142048', fg: '#e8c5ff', accent: '#7eb6ff', glyph: 'mage' },
  rogue_01:   { bg: '#13070f', fg: '#e85a4f', accent: '#2a1f2c', glyph: 'rogue' },
  rogue_02:   { bg: '#080208', fg: '#c294ff', accent: '#13070f', glyph: 'rogue' },
  rogue_03:   { bg: '#1a1416', fg: '#ffb159', accent: '#7e1812', glyph: 'rogue' },
};

const FRAME_PALETTES: Record<string, { border: string; glow: string; pattern: string }> = {
  plain:         { border: '#3a4460', glow: 'transparent',                pattern: 'plain' },
  verdant:       { border: '#6ad8a4', glow: 'rgba(106,216,164,.4)',        pattern: 'engraved' },
  iron:          { border: '#7c7d83', glow: 'rgba(124,125,131,.35)',       pattern: 'engraved' },
  silver:        { border: '#c7c8d6', glow: 'rgba(199,200,214,.4)',        pattern: 'engraved' },
  sapphire:      { border: '#6aa7ff', glow: 'rgba(106,167,255,.5)',        pattern: 'runic' },
  arcane:        { border: '#c294ff', glow: 'rgba(194,148,255,.55)',       pattern: 'runic' },
  ember:         { border: '#ffb159', glow: 'rgba(255,177,89,.55)',        pattern: 'flame' },
  crimson:       { border: '#e85a4f', glow: 'rgba(232,90,79,.55)',         pattern: 'flame' },
  voidlace:      { border: '#9050d0', glow: 'rgba(144,80,208,.6)',         pattern: 'cosmic' },
  sunforged:     { border: '#ffd34d', glow: 'rgba(255,211,77,.65)',        pattern: 'cosmic' },
  mythwoven:     { border: '#ffe88a', glow: 'rgba(255,232,138,.7)',        pattern: 'cosmic' },
  crown_eternal: { border: '#ffe88a', glow: 'rgba(255,232,138,.8)',        pattern: 'cosmic' },
};

/** Premium class silhouette — painted from the matching game-icons.net
 *  SVG (CC-BY 3.0, see /public/sprites/CREDITS.md) via CSS mask so the
 *  glyph picks up the avatar's class-themed colour. */
function ClassGlyph({ glyph, color, size }: { glyph: string; color: string; size: number }): React.ReactElement {
  return (
    <span
      aria-hidden
      style={{
        display: 'block',
        width: Math.round(size * 0.78),
        height: Math.round(size * 0.78),
        background: `linear-gradient(160deg, ${color} 0%, ${color} 35%, color-mix(in srgb, ${color} 55%, #1a1408) 100%)`,
        WebkitMask: `url(/sprites/class-${glyph}.svg) center/contain no-repeat`,
        mask: `url(/sprites/class-${glyph}.svg) center/contain no-repeat`,
        filter: `drop-shadow(0 1px 0 rgba(0,0,0,.55)) drop-shadow(0 0 6px color-mix(in srgb, ${color} 40%, transparent))`,
      }}
    />
  );
}

export default function Avatar({ avatar, frame, size = 80, ring = true }: Props): React.ReactElement {
  const a = AVATAR_PALETTES[avatar] || AVATAR_PALETTES.warrior_01;
  const f = FRAME_PALETTES[frame] || FRAME_PALETTES.plain;

  return (
    <div
      className={`nd-avatar nd-avatar-${f.pattern}`}
      style={{
        width: size,
        height: size,
        position: 'relative',
        borderRadius: '50%',
        background: `radial-gradient(circle at 35% 25%, ${a.fg}33, ${a.bg} 60%)`,
        // Ring + glow are INSET only — box-shadow normally renders outside the
        // element (it ignores overflow:hidden), which made the frame ring poke
        // out of its square. Keeping everything inset guarantees containment.
        boxShadow: ring ? `inset 0 0 0 2px ${f.border}, inset 0 0 16px ${f.glow}, inset 0 1px 0 rgba(255,255,255,.08)` : 'none',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Decorative ring depending on frame pattern */}
      {f.pattern !== 'plain' && (
        <div
          className="nd-avatar-ring"
          style={{
            position: 'absolute',
            inset: 4,
            borderRadius: '50%',
            border: `1px dashed ${f.border}66`,
            pointerEvents: 'none',
          }}
        />
      )}
      {f.pattern === 'runic' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background:
              `conic-gradient(from 0deg, transparent 0deg, ${f.border}44 5deg, transparent 10deg,
               transparent 80deg, ${f.border}44 85deg, transparent 90deg,
               transparent 170deg, ${f.border}44 175deg, transparent 180deg,
               transparent 260deg, ${f.border}44 265deg, transparent 270deg)`,
            pointerEvents: 'none',
            animation: 'nd-runic-spin 14s linear infinite',
          }}
        />
      )}
      {f.pattern === 'cosmic' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: `conic-gradient(from 0deg, ${f.border}, transparent 25%, ${f.border} 50%, transparent 75%, ${f.border})`,
            filter: 'blur(6px)',
            opacity: 0.4,
            pointerEvents: 'none',
            animation: 'nd-cosmic-spin 8s linear infinite',
          }}
        />
      )}
      {f.pattern === 'flame' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            boxShadow: `inset 0 -${size * 0.2}px ${size * 0.3}px ${f.border}66`,
            pointerEvents: 'none',
            animation: 'nd-flame-pulse 1.8s ease-in-out infinite',
          }}
        />
      )}

      <div style={{ position: 'relative', zIndex: 2, display: 'grid', placeItems: 'center', width: '100%', height: '100%' }}>
        <ClassGlyph glyph={a.glyph} color={a.fg} size={size} />
      </div>
    </div>
  );
}
