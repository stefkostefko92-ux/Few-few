import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Sprite from '../components/Sprite';

interface Reward {
  gold?: number;
  xp?: number;
  gems?: number;
  trial_tokens?: number;
  forge_guarantees?: number;
  item_slug?: string;
}

interface Task {
  id: string;
  kind: string;
  text: string;
  required: number;
  done: number;
  free: Reward;
  premium: Reward;
  claimed: { free: boolean; premium: boolean };
}

interface Status {
  month_key: string;
  resets_at: number;
  premium_unlocked: boolean;
  premium_unlock_cost: number;
  tasks: Task[];
}

function fmtReward(r: Reward): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  if (r.gold) out.push(<span key="g" className="tag gold">+{r.gold}g</span>);
  if (r.xp) out.push(<span key="x" className="tag emerald">+{r.xp} XP</span>);
  if (r.gems) out.push(<span key="m" className="tag" style={{ background: 'rgba(106,167,255,.15)', color: 'var(--azure-1)' }}>+{r.gems} 💎</span>);
  if (r.trial_tokens) out.push(<span key="t" className="tag" style={{ background: 'rgba(255,232,138,.15)', color: 'var(--gold-1)' }}>+{r.trial_tokens} ⬢</span>);
  if (r.forge_guarantees) out.push(<span key="w" className="tag" style={{ background: 'rgba(194,148,255,.15)', color: '#c294ff' }}>+{r.forge_guarantees} ⚒</span>);
  if (r.item_slug) out.push(<span key="i" className="tag">{r.item_slug}</span>);
  return out;
}

const KIND_LABEL: Record<string, string> = {
  hunt_kill: 'Hunting',
  bounty_claim: 'Bounty',
  tower_clear: 'Tower',
  tower_vault: 'Tower Vault',
  forge_enchant: 'Forge',
  forge_high_enchant: 'Forge',
  arena_win: 'Arena',
  camp_claim: 'Camp',
  daily_claim: 'Daily',
  wheel_spin: 'Wheel',
  guild_donate: 'Guild',
  quest_complete: 'Quest',
  market_sale: 'Market',
  dungeon_clear: 'Dungeon',
  trial_token_earned: 'Trial',
};

export default function BattlePass(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const showLevelUp = useStore((s) => s.showLevelUp);
  const char = useStore((s) => s.character);
  const [status, setStatus] = useState<Status | null>(null);
  const [now, setNow] = useState(Date.now());

  async function load() {
    try {
      const r = await api.get('/battlepass');
      setStatus(r);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  async function claim(task: Task, track: 'free' | 'premium') {
    try {
      const r = await api.post('/battlepass/claim', { id: task.id, track });
      toast(`Claimed: ${task.text}`, 'success');
      if (r.levelUp) showLevelUp(r.levelUp);
      await Promise.all([load(), refresh()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  async function unlockPremium() {
    try {
      await api.post('/battlepass/unlock-premium', {});
      toast('Premium track unlocked!', 'success');
      await Promise.all([load(), refresh()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  const completedCount = useMemo(() => status?.tasks.filter((t) => t.done >= t.required).length ?? 0, [status]);

  if (!status) return <div className="muted">Loading…</div>;

  const ms = Math.max(0, status.resets_at - now);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Battle Pass · {status.month_key}</h2>
            <div className="panel-subtitle">
              50 tasks drawn from every loop in the game — hunt, climb, forge, donate, brew, brawl.
              Resets in <span style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-mono)' }}>{days}d {hours}h</span>.
              Completed: <strong style={{ color: 'var(--emerald-1)' }}>{completedCount}/50</strong>
            </div>
          </div>
          <div className="flex gap-sm">
            {status.premium_unlocked ? (
              <span className="tag" style={{ background: 'linear-gradient(135deg, rgba(255,232,138,.2), rgba(255,177,89,.2))', color: 'var(--gold-1)', fontFamily: 'var(--font-display)', letterSpacing: '.12em' }}>
                ★ PREMIUM ACTIVE
              </span>
            ) : (
              <button className="btn btn-primary" onClick={unlockPremium}>
                Unlock Premium · 💎 {status.premium_unlock_cost}
              </button>
            )}
          </div>
        </div>

        <div className="bar" style={{ marginTop: 12 }}>
          <div className="bar-fill xp" style={{ width: `${(completedCount / 50) * 100}%`, transition: 'width .5s ease' }} />
        </div>
      </div>

      <div className="panel">
        <table className="bp-table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>#</th>
              <th style={{ width: 90 }}>Loop</th>
              <th>Task</th>
              <th style={{ width: 120 }}>Progress</th>
              <th style={{ width: 280 }}>Free reward</th>
              <th style={{ width: 280 }}>Premium reward</th>
            </tr>
          </thead>
          <tbody>
            {status.tasks.map((t, i) => {
              const ready = t.done >= t.required;
              const pct = Math.min(100, (t.done / t.required) * 100);
              return (
                <tr key={t.id}>
                  <td className="muted" style={{ fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                  <td><span className="tag" style={{ fontSize: 10 }}>{KIND_LABEL[t.kind] || t.kind}</span></td>
                  <td>{t.text}</td>
                  <td>
                    <div className="bp-progress">
                      <div className="bp-progress-fill" style={{ width: `${pct}%`, background: ready ? 'var(--emerald-1)' : 'var(--azure-1)' }} />
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: ready ? 'var(--emerald-1)' : 'var(--text-3)', marginTop: 2 }}>
                      {t.done} / {t.required}
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-sm" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                      {fmtReward(t.free)}
                      <button
                        className="btn btn-sm"
                        disabled={!ready || t.claimed.free}
                        onClick={() => claim(t, 'free')}
                      >
                        {t.claimed.free ? '✓' : 'Claim'}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-sm" style={{ flexWrap: 'wrap', alignItems: 'center', opacity: status.premium_unlocked ? 1 : 0.4 }}>
                      {fmtReward(t.premium)}
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={!ready || t.claimed.premium || !status.premium_unlocked}
                        onClick={() => claim(t, 'premium')}
                      >
                        {t.claimed.premium ? '✓' : status.premium_unlocked ? 'Claim' : '🔒'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
