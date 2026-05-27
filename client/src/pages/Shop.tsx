import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { Item } from '../lib/types';
import { itemSummary } from './Inventory';

export default function Shop(): React.ReactElement {
  const refresh = useStore((s) => s.refreshCharacter);
  const char = useStore((s) => s.character);
  const toast = useStore((s) => s.toast);
  const [items, setItems] = useState<Item[]>([]);
  const [cat, setCat] = useState<string>('all');

  async function load() {
    try {
      const r = await api.get('/shop');
      setItems(r.items);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }
  useEffect(() => { load(); }, []);

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category))).sort(), [items]);
  const filtered = items.filter((i) => cat === 'all' || i.category === cat);

  async function buy(id: number) {
    try {
      await api.post('/shop/buy', { itemId: id, quantity: 1 });
      await refresh();
      toast('Purchase complete.', 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">The Merchant of Oaken Hollow</h2>
            <div className="panel-subtitle">"Coin for steel, coin for cloth. A fair exchange."</div>
          </div>
          <div className="tag gold" style={{ fontSize: 14 }}>{char?.gold.toLocaleString() || 0} gold</div>
        </div>
        <div className="flex gap-sm" style={{ flexWrap: 'wrap', marginBottom: 18 }}>
          <Pill active={cat === 'all'} onClick={() => setCat('all')}>All</Pill>
          {categories.map((c) => (
            <Pill key={c} active={cat === c} onClick={() => setCat(c)}>{prettyCategory(c)}</Pill>
          ))}
        </div>
        <div className="grid-cards">
          {filtered.map((it) => (
            <div key={it.id} className={`card rarity-border-${it.rarity}`}>
              <div className="flex between">
                <div>
                  <div className={`rarity-${it.rarity}`} style={{ fontWeight: 700 }}>{it.name}</div>
                  <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {it.category} {it.sub_type ? `· ${it.sub_type}` : ''} · Lv {it.level_req}
                  </div>
                </div>
                <span className={`tag rarity-${it.rarity}`}>{it.rarity}</span>
              </div>
              <div className="muted text-sm" style={{ marginTop: 8 }}>{it.description}</div>
              <div style={{ marginTop: 10, fontSize: 13 }}>{itemSummary(it)}</div>
              <div className="flex between" style={{ marginTop: 12 }}>
                <span className="gold">{it.buy_price} gold</span>
                <button className="btn btn-primary btn-sm" disabled={!char || char.gold < it.buy_price} onClick={() => buy(it.id)}>
                  Buy
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Pill({ children, active, onClick }: any) {
  return (
    <button className={`btn btn-sm ${active ? 'btn-primary' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

function prettyCategory(c: string): string {
  return c[0].toUpperCase() + c.slice(1);
}
