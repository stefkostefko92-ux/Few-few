import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

/**
 * Mythic+ Dungeons — endless tier-scaled re-runs of scripted dungeons.
 * Each tier scales monster stats by 12%; every tenth tier guarantees
 * a loot-pool drop. Five consecutive fails pity-unlock the next tier.
 */
export default function MythicPlus(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const [state, setState] = useState<any>(null);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setState(await api.get('/mythic-plus/')); }
    catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function enter(slug: string, tier: number) {
    if (busy) return;
    setBusy(true);
    try {
      await api.post('/mythic-plus/enter', { slug, tier });
      toast(`Entered ${slug} on Mythic+${tier}.`, 'success');
      setActive(slug);
      await load();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function strike(slug: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post('/mythic-plus/strike', { slug });
      if (r.success) {
        if (r.next_stage >= r.total_stages) toast('Final stage cleared! Claim your reward.', 'success');
        else toast(`Stage cleared — ${r.next_stage} / ${r.total_stages}.`, 'success');
      } else {
        toast(r.pity_unlocked ? 'Pity unlock — next tier opened.' : 'Wiped. The run resets.', 'info');
      }
      await load();
      refresh();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function claim(slug: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post('/mythic-plus/claim', { slug });
      const drop = r.milestoneDrop ? ` · Drop: ${r.milestoneDrop}` : '';
      toast(`M+${r.tier} cleared! +${r.gold}g · +${r.xp} XP${drop}`, 'success');
      setActive(null);
      await load();
      refresh();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  if (!state) return <div className="page"><div className="muted">Loading Mythic+…</div></div>;

  return (
    <div className="page mythic-plus-page">
      <header className="page-header">
        <h1>Mythic+ Dungeons</h1>
        <span className="muted">Endless tiers. {state.tier_scale_pct}% scaling per tier.</span>
      </header>

      <p className="muted" style={{ marginBottom: 18 }}>
        Clear a scripted dungeon to unlock its Mythic+ track. Pick a tier and run it; each clear
        unlocks the next tier. Five consecutive failures pity-unlock the next tier so the climb
        never stalls. Every tenth tier guarantees a tier-9 loot-pool drop.
      </p>

      <div className="dungeon-grid">
        {state.dungeons.map((d: any) => {
          const isActive = active === d.slug;
          const inProgress = d.current_stage > 0 || isActive;
          const cleared = d.current_stage >= d.stages && d.current_stage > 0;
          return (
            <div key={d.slug} className="card dungeon-card">
              <h3>{d.name}</h3>
              <div className="muted text-sm">{d.region} · Lv {d.level_req}</div>
              <div className="mythic-stats">
                <div><div className="muted text-sm">Best M+</div><div className="num">{d.best_tier}</div></div>
                <div><div className="muted text-sm">Stages</div><div className="num">{d.stages}</div></div>
                {d.consecutive_fails > 0 && (
                  <div><div className="muted text-sm">Fails</div><div className="num">{d.consecutive_fails} / 5</div></div>
                )}
              </div>
              {inProgress && (
                <div className="mythic-progress">
                  <strong>In progress · M+{d.current_tier}</strong>
                  <div className="muted text-sm">Stage {d.current_stage} / {d.stages}</div>
                </div>
              )}
              {!inProgress && (
                <div className="mythic-tier-buttons">
                  {[d.best_tier, d.best_tier + 1].map((t) => (
                    t > 0 && (
                      <button key={t} className="btn btn-sm" disabled={busy} onClick={() => enter(d.slug, t)}>
                        Enter M+{t}
                      </button>
                    )
                  ))}
                  {d.best_tier === 0 && (
                    <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => enter(d.slug, 1)}>
                      Enter M+1
                    </button>
                  )}
                </div>
              )}
              {inProgress && !cleared && (
                <button className="btn btn-primary" disabled={busy} onClick={() => strike(d.slug)}>
                  Strike next stage
                </button>
              )}
              {cleared && (
                <button className="btn btn-primary" disabled={busy} onClick={() => claim(d.slug)}>
                  Claim reward
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
