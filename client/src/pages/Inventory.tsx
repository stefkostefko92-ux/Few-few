import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { InventoryItem } from '../lib/types';

const SLOT_ORDER = ['weapon', 'offhand', 'helm', 'armor', 'gloves', 'boots', 'ring', 'amulet'];
const SLOT_LABEL: Record<string, string> = {
  weapon: 'Weapon',
  offhand: 'Offhand',
  helm: 'Helm',
  armor: 'Armor',
  gloves: 'Gloves',
  boots: 'Boots',
  ring: 'Ring',
  amulet: 'Amulet',
};

export default function Inventory(): React.ReactElement {
  const refresh = useStore((s) => s.refreshCharacter);
  const char = useStore((s) => s.character);
  const toast = useStore((s) => s.toast);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'gear' | 'potions'>('all');

  async function load() {
    try {
      const r = await api.get('/inventory');
      setItems(r.items);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }
  useEffect(() => { load(); }, []);

  const equipped = items.filter((i) => i.equipped);
  const unEquipped = items.filter((i) => !i.equipped);

  const filtered = unEquipped.filter((it) => {
    if (filter === 'gear') return it.category !== 'potion';
    if (filter === 'potions') return it.category === 'potion';
    return true;
  });

  async function action(path: string, body: any) {
    try {
      await api.post(path, body);
      await Promise.all([load(), refresh()]);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Equipped</h2>
          <div className="muted">{char ? `${char.gold.toLocaleString()} gold` : ''}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {SLOT_ORDER.map((slot) => {
            const it = equipped.find((e) => e.slot === slot);
            return (
              <div key={slot} className="card" style={{ minHeight: 96, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.08em' }}>
                  {SLOT_LABEL[slot]}
                </div>
                {it ? (
                  <div className={`rarity-${it.rarity}`}>
                    <strong>{it.name}</strong>
                    <div className="text-sm muted">{itemSummary(it)}</div>
                    <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => action('/inventory/unequip', { inventoryId: it.inv_id })}>
                      Unequip
                    </button>
                  </div>
                ) : (
                  <div className="muted text-sm">— empty —</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Bag</h2>
          <div className="flex gap-sm">
            <button className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : ''}`} onClick={() => setFilter('all')}>All</button>
            <button className={`btn btn-sm ${filter === 'gear' ? 'btn-primary' : ''}`} onClick={() => setFilter('gear')}>Gear</button>
            <button className={`btn btn-sm ${filter === 'potions' ? 'btn-primary' : ''}`} onClick={() => setFilter('potions')}>Potions</button>
          </div>
        </div>
        <div className="grid-cards">
          {filtered.map((it) => (
            <div key={it.inv_id} className={`card rarity-border-${it.rarity}`}>
              <div className="flex between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className={`rarity-${it.rarity}`} style={{ fontWeight: 700 }}>{it.name}{it.quantity > 1 && ` × ${it.quantity}`}</div>
                  <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {it.category} {it.sub_type ? `· ${it.sub_type}` : ''} · Lv {it.level_req}
                  </div>
                </div>
                <span className={`tag rarity-${it.rarity}`}>{it.rarity}</span>
              </div>
              <div className="muted text-sm" style={{ marginTop: 8 }}>{it.description}</div>
              <div style={{ marginTop: 10, fontSize: 13 }}>{itemSummary(it)}</div>
              <div className="flex gap-sm" style={{ marginTop: 12 }}>
                {it.category === 'potion' ? (
                  <button className="btn btn-sm btn-primary" onClick={() => action('/inventory/use', { inventoryId: it.inv_id })}>Use</button>
                ) : (
                  <button className="btn btn-sm btn-primary" onClick={() => action('/inventory/equip', { inventoryId: it.inv_id })}>Equip</button>
                )}
                <button className="btn btn-sm" onClick={() => action('/inventory/sell', { inventoryId: it.inv_id })}>
                  Sell ({it.sell_price}g)
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="muted">Nothing here. Defeat enemies and visit the merchant.</div>}
        </div>
      </div>
    </div>
  );
}

export function itemSummary(it: InventoryItem | any): string {
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
