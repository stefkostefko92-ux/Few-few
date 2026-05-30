import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Sprite, { spriteForItem } from '../components/Sprite';

interface Listing {
  id: number;
  hour_bucket: number;
  item_slug: string;
  starts_at: number;
  ends_at: number;
  starting_bid: number;
  current_bid: number;
  bidder_id: number | null;
  bidder_name: string | null;
  reset_hour: boolean;
  item: any;
}

interface AuctionData {
  listing: Listing | null;
  next_hour_at: number;
  server_now: number;
  recent: { hour_bucket: number; item_name: string; item_slug: string; current_bid: number; bidder_name: string | null }[];
}

function formatTime(ms: number): string {
  if (ms <= 0) return '0:00';
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function Auction(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const char = useStore((s) => s.character);
  const [data, setData] = useState<AuctionData | null>(null);
  const [bid, setBid] = useState<number>(0);
  const [now, setNow] = useState(Date.now());
  const gems = (char as any)?.gems || 0;

  async function load() {
    try {
      const r = await api.get('/auction');
      setData(r);
      if (r.listing) setBid(r.listing.current_bid + 1);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // Auto-reload on the hour boundary so the new listing replaces the old.
  useEffect(() => {
    if (!data?.listing) return;
    const ms = Math.max(0, data.listing.ends_at - now);
    if (ms < 800) {
      const id = setTimeout(load, 1200);
      return () => clearTimeout(id);
    }
  }, [data, now]);

  async function placeBid() {
    if (!data?.listing || bid <= 0) return;
    try {
      await api.post('/auction/bid', { amount: bid });
      toast(`Bid placed: ${bid} gems`, 'success');
      await Promise.all([load(), refresh()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  if (!data) return <div className="muted">Loading auction…</div>;
  if (!data.listing) return <div className="muted">No auction running right now.</div>;
  const l = data.listing;
  const remaining = Math.max(0, l.ends_at - now);
  const isYou = !!(l.bidder_id && char && l.bidder_id === (char as any).id);

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              Auction House
              {l.reset_hour && <span className="tag gold" style={{ marginLeft: 12, fontSize: 11 }}>★ DAILY 20:00 RESET</span>}
            </h2>
            <div className="panel-subtitle">
              One item per hour. Bids are in <strong>gems</strong> only. Outbid? Your gems are refunded immediately.
              Daily 20:00 UTC rotates the premium pool.
            </div>
          </div>
          <span className="tag" style={{ background: 'rgba(106,167,255,.15)', color: 'var(--azure-1)', fontFamily: 'var(--font-mono)' }}>
            💎 {gems}
          </span>
        </div>
      </div>

      <div className="panel">
        <div className="flex" style={{ gap: 20, alignItems: 'center' }}>
          <div style={{ width: 90, height: 90, display: 'grid', placeItems: 'center', background: 'radial-gradient(circle, rgba(255,232,138,.18), transparent 65%)', borderRadius: 14, flexShrink: 0 }}>
            <Sprite {...spriteForItem(l.item)} size={68} />
          </div>
          <div style={{ flex: 1 }}>
            <div className={`rarity-${l.item.rarity}`} style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700 }}>{l.item.name}</div>
            <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
              {l.item.category}{l.item.sub_type ? ` · ${l.item.sub_type}` : ''} · Tier {l.item.tier} · {l.item.rarity}
            </div>
            <div className="muted text-sm">{l.item.description}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.12em' }}>Closes in</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, color: remaining < 60_000 ? 'var(--crimson-1)' : 'var(--gold-1)' }}>
              {formatTime(remaining)}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 18, padding: 18, background: 'rgba(106,167,255,.05)' }}>
          <div className="flex between" style={{ marginBottom: 12 }}>
            <div>
              <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.12em' }}>Current top bid</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--gold-1)' }}>
                💎 {l.current_bid}
              </div>
              <div className="muted text-sm" style={{ marginTop: 4 }}>
                by <strong style={{ color: isYou ? 'var(--emerald-1)' : 'var(--text-2)' }}>{l.bidder_name || 'nobody yet — open for bids'}</strong>
                {isYou && ' (you)'}
              </div>
            </div>
            <div className="flex gap-sm" style={{ alignItems: 'center' }}>
              <input
                type="number"
                value={bid}
                min={l.current_bid + 1}
                onChange={(e) => setBid(Number(e.target.value))}
                style={{ width: 120, fontFamily: 'var(--font-mono)', fontSize: 18, textAlign: 'right' }}
              />
              <button
                className="btn btn-primary"
                disabled={isYou || bid <= l.current_bid || bid > gems}
                onClick={placeBid}
              >
                {isYou ? 'You\'re winning' : bid > gems ? `Need ${bid - gems} more 💎` : `Bid ${bid} 💎`}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title" style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--text-3)', marginBottom: 12 }}>Recent winners</div>
        {data.recent.length === 0 ? <div className="muted">No completed auctions yet.</div> : (
          <table className="data-table">
            <thead><tr><th>Hour</th><th>Item</th><th style={{ textAlign: 'right' }}>Winning bid</th><th>Winner</th></tr></thead>
            <tbody>
              {data.recent.map((r) => (
                <tr key={r.hour_bucket}>
                  <td className="muted" style={{ fontFamily: 'var(--font-mono)' }}>{new Date(r.hour_bucket * 3_600_000).toISOString().slice(0, 13).replace('T', ' ')}:00</td>
                  <td>{r.item_name}</td>
                  <td style={{ textAlign: 'right', color: 'var(--gold-1)', fontFamily: 'var(--font-mono)' }}>💎 {r.current_bid}</td>
                  <td>{r.bidder_name || <span className="muted">— no bidders —</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
