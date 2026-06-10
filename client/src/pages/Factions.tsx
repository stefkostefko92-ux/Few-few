import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

/**
 * Factions — three reputation tracks (Iron Watch, Conclave, Wyrmkin)
 * with six rep tiers each (Stranger → Exalted). Tier-gated vendor
 * stock per faction.
 */
export default function Factions(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const [state, setState] = useState<any>(null);
  const [activeVendor, setActiveVendor] = useState<string | null>(null);
  const [vendorState, setVendorState] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/faction/').then(setState).catch((e) => toast(e.message, 'error'));
  }, [toast]);

  async function openVendor(slug: string) {
    setActiveVendor(slug);
    try {
      const r = await api.get(`/faction/${slug}/vendor`);
      setVendorState(r);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  async function buy(itemSlug: string) {
    if (!activeVendor || busy) return;
    setBusy(true);
    try {
      await api.post(`/faction/${activeVendor}/vendor/buy`, { slug: itemSlug });
      toast(`Bought ${itemSlug}.`, 'success');
      await openVendor(activeVendor);
      refresh();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  if (!state) return <div className="page"><div className="muted">Loading factions…</div></div>;

  return (
    <div className="page factions-page">
      <header className="page-header">
        <h1>Factions</h1>
        <span className="muted">Hit the matching enemy family to climb each track.</span>
      </header>

      <div className="faction-grid">
        {state.factions.map((f: any) => {
          const pct = f.next_tier_rep ? (f.rep / f.next_tier_rep) * 100 : 100;
          return (
            <div key={f.slug} className="card faction-card">
              <h2>{f.name}</h2>
              <div className="muted faction-motto">"{f.motto}"</div>
              <div className="faction-tier">
                <span className="tag emerald">{f.tier_name}</span>
                <span className="muted">Tier {f.tier} / 5</span>
              </div>
              <div className="rep-bar">
                <div className="rep-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <div className="rep-text">
                <strong>{f.rep.toLocaleString()}</strong> rep
                {f.next_tier_rep && (
                  <span className="muted"> · {(f.next_tier_rep - f.rep).toLocaleString()} to {f.next_tier_name}</span>
                )}
              </div>
              <button className="btn" onClick={() => openVendor(f.slug)}>Open vendor</button>
            </div>
          );
        })}
      </div>

      {activeVendor && vendorState && (
        <section className="card vendor-card">
          <div className="vendor-head">
            <h2>{state.factions.find((f: any) => f.slug === activeVendor)?.name} · Vendor</h2>
            <button className="btn btn-sm" onClick={() => setActiveVendor(null)}>Close</button>
          </div>
          <div className="muted vendor-rep">Your rep: <strong>{vendorState.rep.toLocaleString()}</strong> ({vendorState.tier_name})</div>
          <table className="data-table">
            <thead><tr><th>Item</th><th>Unlock</th><th>Cost</th><th></th></tr></thead>
            <tbody>
              {vendorState.stock.map((s: any) => {
                const tierName = state.tiers.find((t: any) => t.tier === s.tier)?.name || 'Stranger';
                return (
                  <tr key={s.slug}>
                    <td>
                      <strong>{s.slug}</strong>
                      {s.note && <div className="muted text-sm">{s.note}</div>}
                    </td>
                    <td><span className="tag">{tierName}</span></td>
                    <td>{s.gold > 0 ? `${s.gold}g` : `${s.gems} 💎`}</td>
                    <td>
                      <button className="btn btn-sm btn-primary" disabled={busy || !s.unlocked} onClick={() => buy(s.slug)}>
                        {s.unlocked ? 'Buy' : 'Locked'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
