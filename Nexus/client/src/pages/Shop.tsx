import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { Item } from '../lib/types';
import { itemSummary } from './Inventory';
import Sprite, { spriteForItem } from '../components/Sprite';

export default function Shop(): React.ReactElement {
  const { t } = useTranslation();
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
      toast(t('shop.purchaseComplete'), 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('shop.title')}</h2>
            <div className="panel-subtitle">{t('shop.subtitle')}</div>
          </div>
          <div className="tag gold" style={{ fontSize: 14 }}>{t('shop.goldAmount', { n: char?.gold.toLocaleString() || 0 })}</div>
        </div>
        <div className="flex gap-sm" style={{ flexWrap: 'wrap', marginBottom: 18 }}>
          <Pill active={cat === 'all'} onClick={() => setCat('all')}>{t('shop.all')}</Pill>
          {categories.map((c) => (
            <Pill key={c} active={cat === c} onClick={() => setCat(c)}>{prettyCategory(c)}</Pill>
          ))}
        </div>
        <div className="grid-cards">
          {filtered.map((it) => (
            <div key={it.id} className={`card rarity-border-${it.rarity}`}>
              <div className="flex between" style={{ gap: 12 }}>
                <div className="flex" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <Sprite {...spriteForItem(it)} size={42} />
                  <div>
                    <div className={`rarity-${it.rarity}`} style={{ fontWeight: 700 }}>{it.name}</div>
                    <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      {it.category} {it.sub_type ? `· ${it.sub_type}` : ''} · {t('shop.lv', { n: it.level_req })}
                    </div>
                  </div>
                </div>
                <span className={`tag rarity-${it.rarity}`}>{it.rarity}</span>
              </div>
              <div className="muted text-sm" style={{ marginTop: 8 }}>{it.description}</div>
              <div style={{ marginTop: 10, fontSize: 13 }}>{itemSummary(it, t)}</div>
              <div className="flex between" style={{ marginTop: 12 }}>
                <span className="gold">{t('shop.goldAmount', { n: it.buy_price })}</span>
                <button className="btn btn-primary btn-sm" disabled={!char || char.gold < it.buy_price} onClick={() => buy(it.id)}>
                  {t('shop.buy')}
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
