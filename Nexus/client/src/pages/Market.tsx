import React, { useEffect, useState } from 'react';
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
}

const CATEGORIES = ['all', 'weapon', 'armor', 'helm', 'shield', 'ring', 'amulet', 'gloves', 'boots'];

export default function Market(): React.ReactElement {
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
    if (!confirm(`Buy ${l.name} for ${l.price_gold}g? It will become soul-bound.`)) return;
    try {
      await api.post('/market/buy', { listingId: l.listing_id });
      toast(`Bought ${l.name} for ${l.price_gold}g.`, 'success');
      await Promise.all([loadBrowse(), loadMine(), refresh()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  async function cancel(l: Listing) {
    if (!confirm(`Cancel listing for ${l.name}?`)) return;
    try {
      await api.post('/market/cancel', { listingId: l.listing_id });
      toast('Listing cancelled.', 'info');
      await Promise.all([loadBrowse(), loadMine()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Player Marketplace</h2>
            <div className="panel-subtitle">
              Buy from other heroes · sell from your bag (Inventory page) · 5% market fee on sale · purchased items become soul-bound
            </div>
          </div>
          <div className="flex gap-sm">
            <span className="tag gold" style={{ fontFamily: 'var(--font-mono)' }}>{char?.gold.toLocaleString() || 0}g</span>
          </div>
        </div>
        <div className="guild-tabs">
          <div className={`guild-tab ${tab === 'browse' ? 'active' : ''}`} onClick={() => setTab('browse')}>Browse</div>
          <div className={`guild-tab ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>My Listings ({mine.filter((m) => m.status === 'active').length})</div>
        </div>

        {tab === 'browse' && (
          <div>
            <div className="flex gap-sm" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
              {CATEGORIES.map((c) => (
                <button key={c} className={`btn btn-sm ${cat === c ? 'btn-primary' : ''}`} onClick={() => setCat(c)}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
              <input
                placeholder="Search by name…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ flex: 1, minWidth: 200, marginLeft: 'auto' }}
              />
            </div>
            <table className="admin-table">
              <thead>
                <tr><th>Item</th><th>Seller</th><th>Lv</th><th>Tier</th><th>Stats</th><th>Listed</th><th>Price</th><th></th></tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.listing_id}>
                    <td>
                      <strong className={`rarity-${l.rarity}`}>{l.name}</strong>
                      <div className="muted text-sm" style={{ textTransform: 'capitalize' }}>{l.category}{l.sub_type ? ` · ${l.sub_type}` : ''}</div>
                    </td>
                    <td className="muted">{l.seller_name} <span style={{ color: 'var(--text-4)' }}>· Lv {l.seller_level}</span></td>
                    <td>{l.level_req}</td>
                    <td>{l.tier}</td>
                    <td className="muted text-sm">{statSummary(l)}</td>
                    <td className="muted text-sm" style={{ fontFamily: 'var(--font-mono)' }}>{relative(l.listed_at)}</td>
                    <td className="gold" style={{ fontFamily: 'var(--font-mono)' }}>{l.price_gold.toLocaleString()}g</td>
                    <td>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={!char || char.gold < l.price_gold || (l.seller_id === char?.id) || l.level_req > (char?.level ?? 0)}
                        onClick={() => buy(l)}
                      >
                        Buy
                      </button>
                    </td>
                  </tr>
                ))}
                {listings.length === 0 && (
                  <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 28 }}>No listings match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'mine' && (
          <table className="admin-table">
            <thead>
              <tr><th>Item</th><th>Tier</th><th>Status</th><th>Price</th><th>Listed</th><th>Buyer</th><th></th></tr>
            </thead>
            <tbody>
              {mine.map((m) => (
                <tr key={m.listing_id}>
                  <td><strong className={`rarity-${m.rarity}`}>{m.name}</strong></td>
                  <td>{m.tier}</td>
                  <td>
                    <span className={`tag ${m.status === 'sold' ? 'emerald' : m.status === 'cancelled' ? 'crimson' : 'gold'}`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="gold" style={{ fontFamily: 'var(--font-mono)' }}>{m.price_gold.toLocaleString()}g</td>
                  <td className="muted text-sm">{relative(m.listed_at)}</td>
                  <td className="muted text-sm">{m.buyer_name || '—'}</td>
                  <td>
                    {m.status === 'active' && (
                      <button className="btn btn-sm btn-danger" onClick={() => cancel(m)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
              {mine.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 28 }}>You haven't listed anything yet. Visit Inventory and pick "List on Marketplace".</td></tr>
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

function relative(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
