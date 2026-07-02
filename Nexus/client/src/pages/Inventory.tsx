import React, { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { InventoryItem } from '../lib/types';
import Sprite, { spriteForItem } from '../components/Sprite';
import '../styles/inventory.css';

const SLOT_ORDER = ['weapon', 'offhand', 'helm', 'amulet', 'armor', 'gloves', 'boots', 'ring'] as const;

const CATEGORY_KEYS = ['all', 'weapon', 'armor', 'helm', 'shield', 'ring', 'amulet', 'potion'] as const;

const ICON_BY_CATEGORY: Record<string, string> = {
  weapon: '⚔', shield: '🛡', armor: '🧥', helm: '⛑', amulet: '📿',
  ring: '💍', gloves: '🧤', boots: '🥾', potion: '🧪', misc: '🎒',
};

interface Buff { stat: string; percent: number; expires_at: number }

export default function Inventory(): React.ReactElement {
  const { t } = useTranslation();
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
      toast(t('inventory.toasts.listedFor', { price: listPrice }), 'success');
      setSellPriceFor(null);
      await load();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('inventory.title')}</h2>
            <div className="panel-subtitle">{t('inventory.subtitle', { equipped: equipped.length, bag: bag.length })}</div>
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
          <h3>{t('inventory.equipment')}</h3>
          <div className="doll-grid">
            {SLOT_ORDER.map((slot) => {
              const it = equipped.find((e) => e.slot === slot);
              return (
                <div
                  key={slot}
                  className={`slot s-${slot} ${it ? `rarity-${it.rarity}` : ''}`}
                  data-empty={it ? '0' : '1'}
                  data-label={t(`inventory.slots.${slot}`)}
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
            {CATEGORY_KEYS.map((key) => {
              const n = key === 'all' ? bag.length : bag.filter((i) => i.category === key).length;
              return (
                <div
                  key={key}
                  className={`bag-tab ${tab === key ? 'active' : ''}`}
                  onClick={() => setTab(key)}
                >
                  {t(`inventory.categories.${key}`)}
                  <span className="count">{n}</span>
                </div>
              );
            })}
          </div>
          {filtered.length === 0 ? (
            <div className="muted" style={{ padding: 32, textAlign: 'center' }}>
              {t('inventory.emptyBag')}
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
                  {it.soul_bound ? <span className="badge-bound">{t('inventory.bound')}</span> : null}
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
            {hover.item.category}{hover.item.sub_type ? ` · ${hover.item.sub_type}` : ''} · {t('inventory.lv', { n: hover.item.level_req })} · {hover.item.rarity}
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
                {hover.item.atk_max > 0 && <D k="atk_max" label={t('inventory.stats.attack')} v={`${hover.item.atk_min}-${hover.item.atk_max}`} e={eq('atk_max')} />}
                {hover.item.defense > 0 && <D k="defense" label={t('inventory.stats.defense')} v={`+${hover.item.defense}`} e={eq('defense')} />}
                {hover.item.hp_bonus > 0 && <D k="hp_bonus" label={t('inventory.stats.hp')} v={`+${hover.item.hp_bonus}`} e={eq('hp_bonus')} />}
                {hover.item.mp_bonus > 0 && <D k="mp_bonus" label={t('inventory.stats.mp')} v={`+${hover.item.mp_bonus}`} e={eq('mp_bonus')} />}
                {hover.item.str_bonus > 0 && <D k="str_bonus" label={t('inventory.stats.strength')} v={`+${hover.item.str_bonus}`} e={eq('str_bonus')} />}
                {hover.item.dex_bonus > 0 && <D k="dex_bonus" label={t('inventory.stats.dexterity')} v={`+${hover.item.dex_bonus}`} e={eq('dex_bonus')} />}
                {hover.item.con_bonus > 0 && <D k="con_bonus" label={t('inventory.stats.constitution')} v={`+${hover.item.con_bonus}`} e={eq('con_bonus')} />}
                {hover.item.int_bonus > 0 && <D k="int_bonus" label={t('inventory.stats.intelligence')} v={`+${hover.item.int_bonus}`} e={eq('int_bonus')} />}
                {hover.item.wis_bonus > 0 && <D k="wis_bonus" label={t('inventory.stats.wisdom')} v={`+${hover.item.wis_bonus}`} e={eq('wis_bonus')} />}
                {hover.item.cha_bonus > 0 && <D k="cha_bonus" label={t('inventory.stats.charisma')} v={`+${hover.item.cha_bonus}`} e={eq('cha_bonus')} />}
                {hover.item.heal_hp > 0 && <Stat k={t('inventory.stats.restores')} v={`${hover.item.heal_hp} HP`} />}
                {hover.item.heal_mp > 0 && <Stat k={t('inventory.stats.restores')} v={`${hover.item.heal_mp} MP`} />}
                {eqSlot && (
                  <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,.08)', fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                    {t('inventory.vsEquipped', { name: eqSlot.name })}
                  </div>
                )}
              </div>
            );
          })()}
          {hover.item.enchant_count && hover.item.enchant_count > 0 ? (() => {
            const bonuses: Record<string, number> = JSON.parse(hover.item.enchant_bonuses_json || '{}');
            return (
              <>
                <div className="divider" />
                <div className="enchant-line">
                  <span className={`enchant-badge e${hover.item.enchant_count}`}>{t(`inventory.enchantTiers.${hover.item.enchant_count}`)} +{hover.item.enchant_count}</span>
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
              <div className="actions-hint" style={{ color: 'var(--amethyst-1)' }}>{t('inventory.soulBound')}</div>
            </>
          ) : null}
          <div className="divider" />
          <div className="actions-hint">{t('inventory.sellHint', { price: hover.item.sell_price })}</div>
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
              <button onClick={() => act('/inventory/unequip', { inventoryId: actions.item.inv_id }, t('inventory.toasts.unequipped'))}>{t('inventory.actions.unequip')}</button>
            ) : actions.item.category === 'potion' ? (
              <button onClick={() => act('/inventory/use', { inventoryId: actions.item.inv_id }, t('inventory.toasts.used'))}>{t('inventory.actions.use')}</button>
            ) : (
              <button onClick={() => act('/inventory/equip', { inventoryId: actions.item.inv_id }, t('inventory.toasts.equipped'))}>{t('inventory.actions.equip')}</button>
            )}
            {!actions.item.equipped && !actions.item.soul_bound && actions.item.category !== 'potion' && (
              <button
                onClick={() => {
                  setListPrice(Math.max(1, actions.item.sell_price * 5));
                  setSellPriceFor(actions.item);
                  setActions(null);
                }}
              >
                {t('inventory.actions.list')}
              </button>
            )}
            {!actions.item.equipped && (
              <button className="danger" onClick={() => act('/inventory/sell', { inventoryId: actions.item.inv_id }, t('inventory.toasts.soldFor', { price: actions.item.sell_price }))}>
                {t('inventory.actions.sell', { price: actions.item.sell_price })}
              </button>
            )}
            <button onClick={() => setActions(null)}>{t('inventory.actions.cancel')}</button>
          </div>
        </>
      )}

      {sellPriceFor && (
        <>
          <div className="admin-overlay" onClick={() => setSellPriceFor(null)} />
          <div className="admin-editor" style={{ width: 380 }}>
            <h3>{t('inventory.actions.list')}</h3>
            <p className="muted">
              <Trans i18nKey="inventory.listDialog.body" values={{ name: sellPriceFor.name }}>
                Set a price for <strong>{'{{name}}'}</strong>. The market takes a 5% fee on sale.
              </Trans>
            </p>
            <div className="field">
              <label>{t('inventory.listDialog.priceLabel')}</label>
              <input
                type="number"
                min={1}
                max={1_000_000}
                value={listPrice}
                onChange={(e) => setListPrice(Math.max(1, Number(e.target.value) || 0))}
                style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
              />
              <div className="muted text-sm" style={{ marginTop: 6 }}>
                {t('inventory.listDialog.feeNote', { net: Math.max(0, listPrice - Math.ceil(listPrice * 0.05)) })}
              </div>
            </div>
            <div className="actions">
              <button className="btn" onClick={() => setSellPriceFor(null)}>{t('inventory.actions.cancel')}</button>
              <button className="btn btn-primary" onClick={listOnMarket}>{t('inventory.listDialog.confirm', { price: listPrice })}</button>
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

export function itemSummary(it: any, t: (key: string, opts?: Record<string, unknown>) => string): string {
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
  if (it.heal_hp) parts.push(t('inventory.summary.heal', { n: it.heal_hp }));
  if (it.heal_mp) parts.push(t('inventory.summary.restore', { n: it.heal_mp }));
  return parts.join('  ·  ');
}
