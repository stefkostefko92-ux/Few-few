import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

/**
 * Seasonal Events — four UTC windows per year. While a season is
 * active, kills against the target family pay points; points redeem
 * at the season vendor for cosmetics and a tier-9 trophy.
 */
export default function Events(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const [state, setState] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setState(await api.get('/events/')); }
    catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function claim(slug: string) {
    if (busy) return;
    setBusy(true);
    try {
      await api.post('/events/claim', { slug });
      toast('Reward redeemed.', 'success');
      await load();
      refresh();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  if (!state) return <div className="page"><div className="muted">Loading the season…</div></div>;

  if (!state.active) {
    return (
      <div className="page events-page">
        <header className="page-header">
          <h1>Seasonal Events</h1>
        </header>
        <div className="card">
          <h2>Between seasons</h2>
          <p className="muted">
            The realm is between events. Next season: <strong>{state.next_season.name}</strong>,
            opens on <strong>{state.next_season.starts}</strong>.
          </p>
          <p className="muted">
            Four windows per year — Frostmoot in mid-winter, Bloomtide in spring, Sunhigh in
            mid-summer, Emberfall in autumn. Each pays points against a specific enemy family
            and unlocks cosmetics plus a tier-9 season trophy at the vendor.
          </p>
        </div>
      </div>
    );
  }

  const s = state.season;
  return (
    <div className="page events-page">
      <header className="page-header">
        <h1>{s.name}</h1>
        <span className="muted">{s.window.start} → {s.window.end} UTC</span>
      </header>

      <section className="card">
        <p className="event-flavor">"{s.flavor}"</p>
        <div className="event-points">
          <span className="muted">Season points:</span>
          <strong className="event-points-num">{state.points.toLocaleString()}</strong>
        </div>
        <div className="muted text-sm">
          Earn points by hunting: {s.point_families.join(' / ')}. Points scale with monster level.
        </div>
      </section>

      <section className="card">
        <h2>Season vendor</h2>
        <div className="event-rewards">
          {state.rewards.map((r: any) => (
            <div key={r.slug} className={`event-reward ${r.owned ? 'owned' : ''}`}>
              <div className="event-reward-head">
                <span className="tag">{r.kind}</span>
                <span className="event-reward-cost">{r.cost.toLocaleString()} pts</span>
              </div>
              <div className="event-reward-name">{r.name}</div>
              <div className="muted text-sm event-reward-flavor">{r.flavor}</div>
              <button
                className="btn btn-primary"
                disabled={busy || r.owned || state.points < r.cost}
                onClick={() => claim(r.slug)}
              >
                {r.owned ? 'Owned' : (state.points < r.cost ? `Need ${(r.cost - state.points).toLocaleString()} more` : 'Redeem')}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
