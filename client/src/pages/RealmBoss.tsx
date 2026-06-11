import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

/**
 * Weekly Realm Boss — the realm-wide endgame raid.
 *
 * Each ISO week picks one of six bosses on rotation. Every player can
 * strike once per four-hour cooldown; strikes deplete a shared HP pool.
 * The hero who lands the killing blow gets the unique legendary; every
 * contributor settles a proportional payout when the week rolls over.
 */
export default function RealmBoss(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const [state, setState] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await api.get('/realm-boss/');
        if (!cancelled) setState(r);
      } catch (e: any) { toast(e.message, 'error'); }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [toast]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function strike() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post('/realm-boss/strike', {});
      toast(r.cleared
        ? `KILLING BLOW! ${r.damageDealt.toLocaleString()} damage — unique drop awarded.`
        : `Struck for ${r.damageDealt.toLocaleString()} damage.`,
        r.cleared ? 'success' : 'info');
      const next = await api.get('/realm-boss/');
      setState(next);
      refresh();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function claim(wk: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post('/realm-boss/claim', { iso_week: wk });
      toast(`Settlement claimed: +${r.gold}g · +${r.gems} gems · +${r.xp} XP`, 'success');
      const next = await api.get('/realm-boss/');
      setState(next);
      refresh();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  if (!state) return <div className="page"><div className="muted">Loading the realm boss…</div></div>;
  const boss = state.boss;
  const hpPct = boss.hp_max > 0 ? (boss.hp_remaining / boss.hp_max) * 100 : 0;
  const endsIn = Math.max(0, boss.ends_at - now);
  const strikeCooldownLeft = Math.max(0, state.next_strike_at - now);
  const cleared = boss.cleared_at > 0;
  const mine = state.mine;
  const canClaim = mine && !mine.claimed_at && (cleared || boss.ends_at < now);

  return (
    <div className="page realm-boss-page">
      <header className="page-header">
        <h1>Realm Boss · {boss.name}</h1>
        <span className="muted">Week {state.week}</span>
      </header>

      <section className="card boss-card">
        <div className="boss-card-head">
          <div>
            <div className="boss-card-name">{boss.name}</div>
            <div className="boss-card-week">{cleared ? 'Slain this week' : `Resets in ${fmtDuration(endsIn)}`}</div>
          </div>
          {!cleared && (
            <button className="btn btn-primary btn-lg" disabled={busy || strikeCooldownLeft > 0} onClick={strike}>
              {strikeCooldownLeft > 0
                ? `Strike ready in ${fmtDuration(strikeCooldownLeft)}`
                : 'Strike the boss'}
            </button>
          )}
        </div>
        <div className="boss-hp">
          <div className="boss-hp-bar"><div className="boss-hp-fill" style={{ width: `${hpPct}%` }} /></div>
          <div className="boss-hp-text">
            {boss.hp_remaining.toLocaleString()} / {boss.hp_max.toLocaleString()} HP ({hpPct.toFixed(2)}%)
          </div>
        </div>
        {cleared && boss.kill_blow_character_id > 0 && (
          <div className="boss-killshot">
            <strong>Killing blow:</strong> character #{boss.kill_blow_character_id}
          </div>
        )}
      </section>

      {mine && (
        <section className="card">
          <h2>Your contribution</h2>
          <div className="contribution-grid">
            <div><div className="muted text-sm">Damage</div><div className="contrib-num">{mine.damage.toLocaleString()}</div></div>
            <div><div className="muted text-sm">Strikes</div><div className="contrib-num">{mine.strikes}</div></div>
            <div><div className="muted text-sm">Status</div><div className="contrib-num">{mine.claimed_at ? 'Claimed' : (canClaim ? 'Ready to claim' : 'In progress')}</div></div>
          </div>
          {canClaim && (
            <button className="btn btn-primary" onClick={() => claim(state.week)} disabled={busy}>Claim settlement</button>
          )}
        </section>
      )}

      <section className="card">
        <h2>Top contributors</h2>
        {state.top_contributors.length === 0
          ? <div className="muted">Nobody has struck yet this week. Be first.</div>
          : (
            <table className="data-table">
              <thead><tr><th>#</th><th>Hero</th><th>Class · Lv</th><th>Damage</th><th>Strikes</th></tr></thead>
              <tbody>
                {state.top_contributors.map((c: any, i: number) => (
                  <tr key={c.character_id}>
                    <td>{i + 1}</td>
                    <td>{c.name}</td>
                    <td className="muted">{c.class} · {c.level}</td>
                    <td>{c.damage.toLocaleString()}</td>
                    <td>{c.strikes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </section>
    </div>
  );
}

function fmtDuration(ms: number): string {
  if (ms <= 0) return '0s';
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
