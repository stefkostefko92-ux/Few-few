import React, { useEffect, useState } from 'react';
import Sprite from './Sprite';
import type { ItemLike } from '../lib/itemTypes';

/**
 * Mid-combat loot reveal. Renders a glowing reward card that fades in over
 * the combat field for ~2.6s when an item drops. Drops above tier 5 also
 * spawn a brief gold sparkle ring so legendary loot feels different.
 */

interface Props {
  item: ItemLike;
  onDone?: () => void;
}

const RARITY_COLOR: Record<string, string> = {
  common: '#c7c8d6', uncommon: '#6ad8a4', rare: '#6aa7ff',
  epic: '#c294ff', legendary: '#ffd34d',
};

export default function LootDropOverlay({ item, onDone }: Props): React.ReactElement {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');
  // Audit NIT #15: keep the latest onDone in a ref so changing it
  // doesn't restart the 2.6 s timeline. The fade timers are wall-clock
  // events; the overlay should run them once on mount regardless of
  // whether the parent re-renders.
  const onDoneRef = React.useRef(onDone);
  React.useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase('hold'), 280);
    const t2 = window.setTimeout(() => setPhase('out'), 1800);
    const t3 = window.setTimeout(() => onDoneRef.current?.(), 2600);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
  }, []);

  const rarity = item.rarity || 'common';
  const color = RARITY_COLOR[rarity] || RARITY_COLOR.common;

  return (
    <div
      className="loot-drop-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 15,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, rgba(20,14,8,.97), rgba(10,6,4,.99))',
          border: `2px solid ${color}`,
          borderRadius: 16,
          padding: '14px 22px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          boxShadow: `0 0 32px ${color}, 0 0 80px ${color}66, 0 18px 36px rgba(0,0,0,.8)`,
          opacity: phase === 'in' ? 0 : phase === 'out' ? 0 : 1,
          transform: phase === 'in'
            ? 'translateY(20px) scale(.85)'
            : phase === 'out'
              ? 'translateY(-30px) scale(1.05)'
              : 'translateY(0) scale(1)',
          transition: phase === 'in'
            ? 'opacity .35s ease-out, transform .35s cubic-bezier(.2,.9,.25,1)'
            : 'opacity .6s ease-in, transform .6s ease-in',
        }}
      >
        <Sprite name={item.icon} tier={item.tier} rarity={rarity as any} size={72} />
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.18em', color: color }}>
            Loot Acquired
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: color, marginTop: 4 }}>
            {item.name}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4, textTransform: 'uppercase', letterSpacing: '.1em' }}>
            {rarity} · Tier {item.tier || 1}
          </div>
        </div>
      </div>
    </div>
  );
}
