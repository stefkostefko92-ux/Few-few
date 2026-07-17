import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

interface Listing {
  listing_id: number;
  price_gold: number;
  listed_at: number;
  sold_at?: number;
  status?: string;
  seller_id?: number;
  seller_name?: string;
  seller_class?: string;
  seller_level?: number;
  buyer_name?: string;
  // Item fields (flattened)
  id: number;
  slug: string;
  name: string;
  category: string;
  sub_type: string;
  tier: number;
  rarity: string;
  level_req: number;
  atk_min: number;
  atk_max: number;
  defense: number;
  hp_bonus: number;
  mp_bonus: number;
  str_bonus: number;
  dex_bonus: number;
  con_bonus: number;
  int_bonus: number;
  wis_bonus: number;
  description: string;
  // Ценова интелигентност (от сървъра)
  cheapest_active?: number | null;
  last_sold_price?: number | null;
}

const CATEGORIES = ['all', 'weapon', 'armor', 'helm', 'shield', 'ring', 'amulet', 'gloves', 'boots'];

export default function Market(): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const char = useStore((s) => s.character);
  const refresh = useStore((s) => s.refreshCharacter);
  const [tab, setTab] = useState<'browse' | 'mine'>('browse');
  const [listings, setListings] = useState<Listing[]>([]);
  const [mine, setMine] = useState<Listing[]>([]);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');

  async function loadBrowse() {
    try {
      const params = new URLSearchParams();
      if (cat !== 'all') params.set('category', cat);
      if (q) params.set('q', q);
      const r = await api.get(`/market?${params.toString()}`);
      setListings(r.listings);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  async function loadMine() {
    try {
      const r = await api.get('/market/mine');
      setMine(r.listings);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  useEffect(() => { loadBrowse(); loadMine(); }, []);
  useEffect(() => { loadBrowse(); }, [cat, q]);

  async function buy(l: Listing) {
    if (!confirm(t('market.confirmBuy', { name: l.name, price: l.price_gold }))) return;
    try {
      await api.post('/market/buy', { listingId: l.listing_id });
      toast(t('market.boughtToast', { name: l.name, price: l.price_gold }), 'success');
      await Promise.all([loadBrowse(), loadMine(), refresh()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  async function cancel(l: Listing) {
    if (!confirm(t('market.confirmCancel', { name: l.name }))) return;
    try {
      await api.post('/market/cancel', { listingId: l.listing_id });
      toast(t('market.cancelledToast'), 'info');
      await Promise.all([loadBrowse(), loadMine()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('market.title')}</h2>
            <div className="panel-subtitle">
              {t('market.subtitle')}
            </div>
          </div>
          <div className="flex gap-sm">
            <span className="tag gold" style={{ fontFamily: 'var(--font-mono)' }}>{char?.gold.toLocaleString() || 0}g</span>
          </div>
        </div>
        <div className="guild-tabs">
          <div className={`guild-tab ${tab === 'browse' ? 'active' : ''}`} onClick={() => setTab('browse')}>{t('market.tabs.browse')}</div>
          <div className={`guild-tab ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>{t('market.tabs.mine', { count: mine.filter((m) => m.status === 'active').length })}</div>
        </div>

        {tab === 'browse' && (
          <div>
            <div className="flex gap-sm" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
              {CATEGORIES.map((c) => (
                <button key={c} className={`btn btn-sm ${cat === c ? 'btn-primary' : ''}`} onClick={() => setCat(c)}>
                  {t(`market.categories.${c}`)}
                </button>
              ))}
              <input
                placeholder={t('market.searchPlaceholder')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ flex: 1, minWidth: 200, marginLeft: 'auto' }}
              />
            </div>
            <table className="admin-table">
              <thead>
                <tr><th>{t('market.table.item')}</th><th>{t('market.table.seller')}</th><th>{t('market.table.lv')}</th><th>{t('market.table.tier')}</th><th>{t('market.table.stats')}</th><th>{t('market.table.listed')}</th><th>{t('market.table.price')}</th><th></th></tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.listing_id}>
                    <td>
                      <strong className={`rarity-${l.rarity}`}>{l.name}</strong>
                      <div className="muted text-sm" style={{ textTransform: 'capitalize' }}>{l.category}{l.sub_type ? ` · ${l.sub_type}` : ''}</div>
                    </td>
                    <td className="muted">{l.seller_name} <span style={{ color: 'var(--text-4)' }}>· {t('market.lv', { n: l.seller_level })}</span></td>
                    <td>{l.level_req}</td>
                    <td>{l.tier}</td>
                    <td className="muted text-sm">{statSummary(l)}</td>
                    <td className="muted text-sm" style={{ fontFamily: 'var(--font-mono)' }}>{relative(l.listed_at, t)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      <span className="gold">{l.price_gold.toLocaleString()}g</span>
                      {/* Ценова интелигентност: „най-добра цена" badge, ако това е
                          най-евтиният активен листинг; иначе показва колко е
                          най-евтиният конкурент. Последно продадена цена = котва. */}
                      {l.cheapest_active != null && l.cheapest_active >= l.price_gold && (
                        <span className="tag" style={{ marginLeft: 6, fontSize: 10, color: 'var(--green-1, #6ad8a4)', borderColor: 'var(--green-1, #6ad8a4)' }}>
                          {t('market.bestPrice', { defaultValue: 'best price' })}
                        </span>
                      )}
                      <div className="muted" style={{ fontSize: 11 }}>
                        {l.cheapest_active != null && l.cheapest_active < l.price_gold && (
                          <span>{t('market.cheapest', { n: l.cheapest_active.toLocaleString(), defaultValue: 'cheapest: {{n}}g' })} · </span>
                        )}
                        {l.last_sold_price != null && (
                          <span>{t('market.lastSold', { n: l.last_sold_price.toLocaleString(), defaultValue: 'last sold: {{n}}g' })}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={!char || char.gold < l.price_gold || (l.seller_id === char?.id) || l.level_req > (char?.level ?? 0)}
                        onClick={() => buy(l)}
                      >
                        {t('market.buy')}
                      </button>
                    </td>
                  </tr>
                ))}
                {listings.length === 0 && (
                  <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 28 }}>{t('market.noListings')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'mine' && (
          <table className="admin-table">
            <thead>
              <tr><th>{t('market.table.item')}</th><th>{t('market.table.tier')}</th><th>{t('market.table.status')}</th><th>{t('market.table.price')}</th><th>{t('market.table.listed')}</th><th>{t('market.table.buyer')}</th><th></th></tr>
            </thead>
            <tbody>
              {mine.map((m) => (
                <tr key={m.listing_id}>
                  <td><strong className={`rarity-${m.rarity}`}>{m.name}</strong></td>
                  <td>{m.tier}</td>
                  <td>
                    <span className={`tag ${m.status === 'sold' ? 'emerald' : m.status === 'cancelled' ? 'crimson' : 'gold'}`}>
                      {t(`market.status.${m.status}`, { defaultValue: m.status })}
                    </span>
                  </td>
                  <td className="gold" style={{ fontFamily: 'var(--font-mono)' }}>{m.price_gold.toLocaleString()}g</td>
                  <td className="muted text-sm">{relative(m.listed_at, t)}</td>
                  <td className="muted text-sm">{m.buyer_name || '—'}</td>
                  <td>
                    {m.status === 'active' && (
                      <button className="btn btn-sm btn-danger" onClick={() => cancel(m)}>{t('market.cancel')}</button>
                    )}
                  </td>
                </tr>
              ))}
              {mine.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 28 }}>{t('market.noMine')}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function statSummary(it: Listing): string {
  const parts: string[] = [];
  if (it.atk_max > 0) parts.push(`ATK ${it.atk_min}-${it.atk_max}`);
  if (it.defense > 0) parts.push(`DEF +${it.defense}`);
  if (it.hp_bonus > 0) parts.push(`HP +${it.hp_bonus}`);
  if (it.str_bonus > 0) parts.push(`STR +${it.str_bonus}`);
  if (it.dex_bonus > 0) parts.push(`DEX +${it.dex_bonus}`);
  if (it.int_bonus > 0) parts.push(`INT +${it.int_bonus}`);
  return parts.join(' · ');
}

function relative(ts: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return t('market.time.secondsAgo', { n: Math.floor(diff) });
  if (diff < 3600) return t('market.time.minutesAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('market.time.hoursAgo', { n: Math.floor(diff / 3600) });
  return t('market.time.daysAgo', { n: Math.floor(diff / 86400) });
}
