import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { InventoryItem } from '../lib/types';
import Sprite, { spriteForItem } from '../components/Sprite';
import '../styles/inventory.css';

const SLOT_ORDER = ['weapon', 'offhand', 'helm', 'amulet', 'armor', 'gloves', 'boots', 'ring'] as const;
type SlotKey = (typeof SLOT_ORDER)[number];

const SLOT_LABEL: Record<SlotKey, string> = {
  weapon: 'Weapon',
  offhand: 'Offhand',
  helm: 'Helm',
  amulet: 'Amulet',
  armor: 'Armor',
  gloves: 'Gloves',
  boots: 'Boots',
  ring: 'Ring',
};

const CATEGORIES = [
  { key: 'all',     label: 'All' },
  { key: 'weapon',  label: 'Weapons' },
  { key: 'armor',   label: 'Armor' },
  { key: 'helm',    label: 'Helms' },
  { key: 'shield',  label: 'Shields' },
  { key: 'ring',    label: 'Rings' },
  { key: 'amulet',  label: 'Amulets' },
  { key: 'potion',  label: 'Potions' },
] as const;

const ICON_BY_CATEGORY: Record<string, string> = {
  weapon: '⚔', shield: '🛡', armor: '🧥', helm: '⛑', amulet: '📿',
  ring: '💍', gloves: '🧤', boots: '🥾', potion: '🧪', misc: '🎒',
};

interface Buff { stat: string; percent: number; expires_at: number }

export default function Inventory(): React.ReactElement {
  const refresh = useStore((s) => s.refreshCharacter);
  const char = useStore((s) => s.character);
  const toast = useStore((s) => s.toast);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [buffs, setBuffs] = useState<Buff[]>([]);
  const [tab, setTab] = useState<string>('all');
  const [hover, setHover] = useState<{ item: InventoryItem | null; x: number; y: number }>({ item: null, x: 0, y: 0 });
  const [actions, setActions] = useState<{ item: InventoryItem; x: number; y: number } | null>(null);
  const [sellPriceFor, setSellPriceFor] = useState<InventoryItem | null>(null);
  const [listPrice, setListPrice] = useState(50);

  async function load() {
    try {
      const [inv, buf] = await Promise.all([api.get('/inventory'), api.get('/inventory/buffs')]);
      setItems(inv.items);
      setBuffs(buf.buffs || []);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }
  useEffect(() => { load(); }, []);

  // Live-tick buff bar
  const [, force] = useState(0);
  useEffect(() => {
    if (!buffs.length) return;
    const id = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [buffs.length]);

  const equipped = items.filter((i) => i.equipped);
  const bag = items.filter((i) => !i.equipped && !i.listed);

  const filtered = bag.filter((it) =>
    tab === 'all' ? true : tab === 'potion' ? it.category === 'potion' : tab === 'shield' ? it.category === 'shield' : it.category === tab,
  );

  function tip(it: InventoryItem, e: React.MouseEvent) {
    setHover({ item: it, x: e.clientX + 16, y: e.clientY + 16 });
  }

  async function act(path: string, body: any, successMsg: string) {
    try {
      await api.post(path, body);
      toast(successMsg, 'success');
      setActions(null);
      await Promise.all([load(), refresh()]);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  async function listOnMarket() {
    if (!sellPriceFor) return;
    try {
      await api.post('/market/sell', { inventoryId: sellPriceFor.inv_id, priceGold: listPrice });
      toast(`Listed for ${listPrice}g.`, 'success');
      setSellPriceFor(null);
      await load();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Inventory</h2>
            <div className="panel-subtitle">{equipped.length} equipped · {bag.length} in bag</div>
          </div>
          <div className="flex gap-sm">
            <span className="tag gold" style={{ fontFamily: 'var(--font-mono)' }}>{char?.gold.toLocaleString() || 0}g</span>
          </div>
        </div>
        {buffs.length > 0 && (
          <div className="buff-bar">
            {buffs.map((b, i) => {
              const remaining = Math.max(0, Math.floor((b.expires_at - Date.now()) / 1000));
              const mm = Math.floor(remaining / 60);
              const ss = (remaining % 60).toString().padStart(2, '0');
              return (
                <div key={i} className="buff-chip">
                  ✨ +{b.percent}% {cap(b.stat)} <span className="sec">{mm}:{ss}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="inv-shell">
        {/* Equipment doll */}
        <div className="equip-doll">
          <h3>Equipment</h3>
          <div className="doll-grid">
            {SLOT_ORDER.map((slot) => {
              const it = equipped.find((e) => e.slot === slot);
              return (
                <div
                  key={slot}
                  className={`slot s-${slot} ${it ? `rarity-${it.rarity}` : ''}`}
                  data-empty={it ? '0' : '1'}
                  data-label={SLOT_LABEL[slot]}
                  onMouseEnter={(e) => it && tip(it, e)}
                  onMouseLeave={() => setHover({ item: null, x: 0, y: 0 })}
                  onMouseMove={(e) => it && tip(it, e)}
                  onClick={(e) => it && setActions({ item: it, x: e.clientX, y: e.clientY })}
                >
                  <div className="glyph">{it ? <Sprite {...spriteForItem(it)} size={44} enchant={it.enchant_count} /> : '·'}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bag */}
        <div className="bag-panel">
          <div className="bag-tabs">
            {CATEGORIES.map((c) => {
              const n = c.key === 'all' ? bag.length : bag.filter((i) => i.category === c.key).length;
              return (
                <div
                  key={c.key}
                  className={`bag-tab ${tab === c.key ? 'active' : ''}`}
                  onClick={() => setTab(c.key)}
                >
                  {c.label}
                  <span className="count">{n}</span>
                </div>
              );
            })}
          </div>
          {filtered.length === 0 ? (
            <div className="muted" style={{ padding: 32, textAlign: 'center' }}>
              Nothing here. Hunt or visit the merchant.
            </div>
          ) : (
            <div className="bag-grid">
              {filtered.map((it) => (
                <div
                  key={it.inv_id}
                  className={`bag-cell rarity-${it.rarity}`}
                  onMouseEnter={(e) => tip(it, e)}
                  onMouseLeave={() => setHover({ item: null, x: 0, y: 0 })}
                  onMouseMove={(e) => tip(it, e)}
                  onClick={(e) => setActions({ item: it, x: e.clientX, y: e.clientY })}
                >
                  <span><Sprite {...spriteForItem(it)} size={36} enchant={it.enchant_count} /></span>
                  {it.quantity > 1 && <span className="qty">×{it.quantity}</span>}
                  {it.soul_bound ? <span className="badge-bound">BOUND</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {hover.item && (
        <div className="item-tip" style={{ left: hover.x, top: hover.y }}>
          <div className={`name rarity-${hover.item.rarity}`}>{hover.item.name}</div>
          <div className="meta">
            {hover.item.category}{hover.item.sub_type ? ` · ${hover.item.sub_type}` : ''} · Lv {hover.item.level_req} · {hover.item.rarity}
          </div>
          {hover.item.description && <div className="desc">"{hover.item.description}"</div>}
          {(() => {
            // Compare-to-equipped diff. Find the equipped item that occupies
            // the same slot so the player sees +/- numbers on hover instead
            // of needing to mentally subtract the two stat blocks.
            const h = hover.item!;
            const eqSlot = (() => {
              if (h.equipped) return null; // already equipped — no diff vs itself
              if (h.category === 'weapon') return equipped.find((e) => e.slot === 'weapon');
              if (h.category === 'shield') return equipped.find((e) => e.slot === 'offhand');
              return equipped.find((e) => e.slot === h.category);
            })();
            const eq = (k: string) => Number((eqSlot as any)?.[k] || 0);
            const D = ({ k, label, v, e }: { k: string; label: string; v: string; e: number; }) => {
              const cur = Number((hover.item as any)[k] || 0);
              const diff = eqSlot ? cur - e : 0;
              return (
                <Stat k={label} v={(
                  <span>{v}{eqSlot && diff !== 0 ? (
                    <span style={{ marginLeft: 8, color: diff > 0 ? '#6ad8a4' : '#e85a4f', fontSize: 11 }}>
                      ({diff > 0 ? '+' : ''}{diff})
                    </span>
                  ) : null}</span>
                ) as any} />
              );
            };
            return (
              <div className="stats">
                {hover.item.atk_max > 0 && <D k="atk_max" label="Attack" v={`${hover.item.atk_min}-${hover.item.atk_max}`} e={eq('atk_max')} />}
                {hover.item.defense > 0 && <D k="defense" label="Defense" v={`+${hover.item.defense}`} e={eq('defense')} />}
                {hover.item.hp_bonus > 0 && <D k="hp_bonus" label="HP" v={`+${hover.item.hp_bonus}`} e={eq('hp_bonus')} />}
                {hover.item.mp_bonus > 0 && <D k="mp_bonus" label="MP" v={`+${hover.item.mp_bonus}`} e={eq('mp_bonus')} />}
                {hover.item.str_bonus > 0 && <D k="str_bonus" label="Strength" v={`+${hover.item.str_bonus}`} e={eq('str_bonus')} />}
                {hover.item.dex_bonus > 0 && <D k="dex_bonus" label="Dexterity" v={`+${hover.item.dex_bonus}`} e={eq('dex_bonus')} />}
                {hover.item.con_bonus > 0 && <D k="con_bonus" label="Constitution" v={`+${hover.item.con_bonus}`} e={eq('con_bonus')} />}
                {hover.item.int_bonus > 0 && <D k="int_bonus" label="Intelligence" v={`+${hover.item.int_bonus}`} e={eq('int_bonus')} />}
                {hover.item.wis_bonus > 0 && <D k="wis_bonus" label="Wisdom" v={`+${hover.item.wis_bonus}`} e={eq('wis_bonus')} />}
                {hover.item.cha_bonus > 0 && <D k="cha_bonus" label="Charisma" v={`+${hover.item.cha_bonus}`} e={eq('cha_bonus')} />}
                {hover.item.heal_hp > 0 && <Stat k="Restores" v={`${hover.item.heal_hp} HP`} />}
                {hover.item.heal_mp > 0 && <Stat k="Restores" v={`${hover.item.heal_mp} MP`} />}
                {eqSlot && (
                  <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,.08)', fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                    vs equipped: {eqSlot.name}
                  </div>
                )}
              </div>
            );
          })()}
          {hover.item.enchant_count && hover.item.enchant_count > 0 ? (() => {
            const bonuses: Record<string, number> = JSON.parse(hover.item.enchant_bonuses_json || '{}');
            const ENCHANT_LABEL = ['', 'Silver', 'Emerald', 'Azure', 'Arcane', 'Mythic'];
            return (
              <>
                <div className="divider" />
                <div className="enchant-line">
                  <span className={`enchant-badge e${hover.item.enchant_count}`}>{ENCHANT_LABEL[hover.item.enchant_count]} +{hover.item.enchant_count}</span>
                  {Object.entries(bonuses).map(([k, v]) => (
                    <span key={k} className="enchant-bonus">+{v} {k.replace('_bonus', '').replace('atk_max', 'attack')}</span>
                  ))}
                </div>
              </>
            );
          })() : null}
          {hover.item.soul_bound ? (
            <>
              <div className="divider" />
              <div className="actions-hint" style={{ color: 'var(--amethyst-1)' }}>Soul-bound — cannot be re-listed.</div>
            </>
          ) : null}
          <div className="divider" />
          <div className="actions-hint">Sell · {hover.item.sell_price}g</div>
        </div>
      )}

      {actions && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setActions(null)} />
          <div
            className="item-actions"
            style={{ left: Math.min(actions.x, window.innerWidth - 200), top: Math.min(actions.y, window.innerHeight - 220) }}
          >
            <div style={{ padding: '4px 8px', fontSize: 12, color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>
              {actions.item.name}
            </div>
            <div style={{ height: 1, background: 'var(--border-1)', margin: '2px 0' }} />
            {actions.item.equipped ? (
              <button onClick={() => act('/inventory/unequip', { inventoryId: actions.item.inv_id }, 'Unequipped')}>Unequip</button>
            ) : actions.item.category === 'potion' ? (
              <button onClick={() => act('/inventory/use', { inventoryId: actions.item.inv_id }, 'Used')}>Use</button>
            ) : (
              <button onClick={() => act('/inventory/equip', { inventoryId: actions.item.inv_id }, 'Equipped')}>Equip</button>
            )}
            {!actions.item.equipped && !actions.item.soul_bound && actions.item.category !== 'potion' && (
              <button
                onClick={() => {
                  setListPrice(Math.max(1, actions.item.sell_price * 5));
                  setSellPriceFor(actions.item);
                  setActions(null);
                }}
              >
                List on Marketplace
              </button>
            )}
            {!actions.item.equipped && (
              <button className="danger" onClick={() => act('/inventory/sell', { inventoryId: actions.item.inv_id }, `Sold for ${actions.item.sell_price}g`)}>
                Sell to Merchant ({actions.item.sell_price}g)
              </button>
            )}
            <button onClick={() => setActions(null)}>Cancel</button>
          </div>
        </>
      )}

      {sellPriceFor && (
        <>
          <div className="admin-overlay" onClick={() => setSellPriceFor(null)} />
          <div className="admin-editor" style={{ width: 380 }}>
            <h3>List on Marketplace</h3>
            <p className="muted">
              Set a price for <strong>{sellPriceFor.name}</strong>. The market takes a 5% fee on sale.
            </p>
            <div className="field">
              <label>Price (gold)</label>
              <input
                type="number"
                min={1}
                max={1_000_000}
                value={listPrice}
                onChange={(e) => setListPrice(Math.max(1, Number(e.target.value) || 0))}
                style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
              />
              <div className="muted text-sm" style={{ marginTop: 6 }}>
                You'll receive {Math.max(0, listPrice - Math.ceil(listPrice * 0.05))}g after the 5% fee.
              </div>
            </div>
            <div className="actions">
              <button className="btn" onClick={() => setSellPriceFor(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={listOnMarket}>List for {listPrice}g</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="stat-line">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function cap(s: string) { return s[0].toUpperCase() + s.slice(1); }

export function itemSummary(it: any): string {
  const parts: string[] = [];
  if (it.atk_min || it.atk_max) parts.push(`ATK ${it.atk_min}-${it.atk_max}`);
  if (it.defense) parts.push(`DEF +${it.defense}`);
  if (it.hp_bonus) parts.push(`HP +${it.hp_bonus}`);
  if (it.mp_bonus) parts.push(`MP +${it.mp_bonus}`);
  if (it.str_bonus) parts.push(`STR +${it.str_bonus}`);
  if (it.dex_bonus) parts.push(`DEX +${it.dex_bonus}`);
  if (it.con_bonus) parts.push(`CON +${it.con_bonus}`);
  if (it.int_bonus) parts.push(`INT +${it.int_bonus}`);
  if (it.wis_bonus) parts.push(`WIS +${it.wis_bonus}`);
  if (it.heal_hp) parts.push(`Heal +${it.heal_hp} HP`);
  if (it.heal_mp) parts.push(`Restore +${it.heal_mp} MP`);
  return parts.join('  ·  ');
}
