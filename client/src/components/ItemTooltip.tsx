import React, { useEffect, useRef, useState } from 'react';
import Sprite from './Sprite';

/**
 * Hover/focus tooltip for an item card. Shows the full stat block with a
 * side-by-side delta against the currently-equipped item in the same slot
 * (when `equipped` is passed). The tooltip is teleported into a fixed
 * overlay so it can escape parent overflow:hidden containers.
 */

export interface ItemLike {
  id?: number;
  slug?: string;
  name: string;
  category?: string;
  sub_type?: string;
  tier?: number;
  rarity?: string;
  level_req?: number;
  atk_min?: number;
  atk_max?: number;
  defense?: number;
  hp_bonus?: number;
  mp_bonus?: number;
  str_bonus?: number;
  dex_bonus?: number;
  con_bonus?: number;
  int_bonus?: number;
  cha_bonus?: number;
  wis_bonus?: number;
  phys_dmg_bonus?: number;
  phys_def_bonus?: number;
  mag_dmg_bonus?: number;
  mag_def_bonus?: number;
  buy_price?: number;
  sell_price?: number;
  icon?: string;
  description?: string;
}

interface Props {
  /** The item the user is hovering / focusing. */
  item: ItemLike;
  /** Currently-equipped item in the same slot (for the diff). */
  equipped?: ItemLike | null;
  /** Optional override class for the wrapper. */
  children: React.ReactNode;
}

const STAT_KEYS: Array<[keyof ItemLike, string]> = [
  ['atk_min', 'ATK Min'], ['atk_max', 'ATK Max'], ['defense', 'DEF'],
  ['hp_bonus', 'HP'], ['mp_bonus', 'MP'],
  ['str_bonus', 'STR'], ['dex_bonus', 'DEX'], ['con_bonus', 'CON'],
  ['int_bonus', 'INT'], ['wis_bonus', 'WIS'], ['cha_bonus', 'CHA'],
  ['phys_dmg_bonus', 'P-DMG'], ['phys_def_bonus', 'P-DEF'],
  ['mag_dmg_bonus', 'M-DMG'], ['mag_def_bonus', 'M-DEF'],
];

const RARITY_COLOR: Record<string, string> = {
  common: '#c7c8d6', uncommon: '#6ad8a4', rare: '#6aa7ff',
  epic: '#c294ff', legendary: '#ffd34d',
};

export default function ItemTooltip({ item, equipped, children }: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const wrapRef = useRef<HTMLSpanElement>(null);

  // Position the tooltip near the hovered element on open.
  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const tooltipW = 320;
    const tooltipH = 380;
    let x = r.right + 12;
    let y = r.top;
    if (x + tooltipW > window.innerWidth) x = r.left - tooltipW - 12;
    if (y + tooltipH > window.innerHeight) y = window.innerHeight - tooltipH - 12;
    if (y < 12) y = 12;
    setPos({ x, y });
  }, [open]);

  const rarityColor = RARITY_COLOR[item.rarity || 'common'] || RARITY_COLOR.common;

  return (
    <span
      ref={wrapRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      style={{ display: 'inline-block' }}
    >
      {children}
      {open && (
        <div
          className="item-tooltip"
          style={{
            position: 'fixed', left: pos.x, top: pos.y, width: 320, zIndex: 9999,
            background: 'linear-gradient(180deg, rgba(20, 14, 8, .98), rgba(10, 8, 4, .99))',
            border: `1px solid ${rarityColor}`,
            boxShadow: `0 0 24px ${rarityColor}40, 0 18px 36px rgba(0,0,0,.7)`,
            borderRadius: 10,
            padding: 14,
            color: '#f4e4ba',
            pointerEvents: 'none',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Sprite name={item.icon} tier={item.tier} rarity={item.rarity as any} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: rarityColor, fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: 15, letterSpacing: '.02em' }}>
                {item.name}
              </div>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.1em', marginTop: 2 }}>
                {item.rarity || 'common'} · Tier {item.tier || 1}{item.level_req ? ` · Lv ${item.level_req}` : ''}
              </div>
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${rarityColor}33`, paddingTop: 8 }}>
            {STAT_KEYS.map(([key, label]) => {
              const v = Number(item[key] || 0);
              const ev = equipped ? Number(equipped[key] || 0) : 0;
              if (v === 0 && ev === 0) return null;
              const diff = v - ev;
              return (
                <div key={key as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span className="muted">{label}</span>
                  <span>
                    <strong>{v > 0 ? `+${v}` : v}</strong>
                    {equipped && diff !== 0 && (
                      <span style={{ marginLeft: 8, color: diff > 0 ? '#6ad8a4' : '#e85a4f', fontSize: 11 }}>
                        ({diff > 0 ? '+' : ''}{diff})
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          {item.description && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${rarityColor}33`, fontStyle: 'italic', color: 'rgba(244, 228, 186, .65)', fontSize: 12 }}>
              {item.description}
            </div>
          )}
          {(item.buy_price || item.sell_price) && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(214, 161, 61, .8)' }}>
              {item.buy_price ? `Buy ${item.buy_price}g` : null}
              {item.buy_price && item.sell_price ? ' · ' : ''}
              {item.sell_price ? `Sell ${item.sell_price}g` : null}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
