import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Sprite from '../components/Sprite';

interface Status {
  current_floor: number;
  next_floor: number;
  best_floor: number;
  next_reward: { gold: number; xp: number; vault: boolean };
}
interface Leader {
  name: string;
  class: string;
  level: number;
  tower_best_floor: number;
}

export default function Tower(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const showLevelUp = useStore((s) => s.showLevelUp);
  const char = useStore((s) => s.character);
  const [status, setStatus] = useState<Status | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [climbing, setClimbing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  async function load() {
    try {
      const [s, l] = await Promise.all([api.get('/tower/status'), api.get('/tower/leaderboard')]);
      setStatus(s);
      setLeaders(l.leaderboard || []);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);

  async function climb() {
    setClimbing(true);
    setLastResult(null);
    try {
      const r = await api.post('/tower/climb', {});
      setLastResult(r);
      if (r.success) {
        const vaultMsg = r.vault ? ' · VAULT BONUS!' : '';
        toast(`Floor ${r.floor} cleared · +${r.gold}g · +${r.xp} XP${vaultMsg}`, 'success');
        if (r.levelUp) showLevelUp(r.levelUp);
      } else {
        toast(`Fell on floor ${r.floor}. Best: ${r.best_floor}. Try again.`, 'error');
      }
      await Promise.all([load(), refresh()]);
    } catch (e: any) { toast(e.message, 'error'); }
    setClimbing(false);
  }

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Tower of Trials</h2>
            <div className="panel-subtitle">Endless floors. Every fifth is a Vault — double rewards. Fall, and the climb resets.</div>
          </div>
          {status && (
            <div className="flex gap-sm">
              <span className="tag gold">Best · F{status.best_floor}</span>
            </div>
          )}
        </div>

        {status && (
          <div className="card" style={{ padding: 18, position: 'relative', overflow: 'hidden' }}>
            <div className="ambient-stars" />
            <div className="flex" style={{ gap: 20, position: 'relative', alignItems: 'center' }}>
              <div style={{ width: 80, height: 80, display: 'grid', placeItems: 'center', background: 'radial-gradient(circle, rgba(194,148,255,.22), transparent 70%)', borderRadius: 14 }}>
                <Sprite name="icon-portal" tone="mage" size={64} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.12em' }}>Next gate</div>
                <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--gold-1)' }}>
                  Floor {status.next_floor}
                  {status.next_reward.vault && <span className="tag gold" style={{ marginLeft: 12, fontSize: 11 }}>VAULT</span>}
                </h2>
                <div className="muted text-sm" style={{ marginTop: 6 }}>
                  Reward: +{status.next_reward.gold}g · +{status.next_reward.xp} XP{status.next_reward.vault ? ' (×2)' : ''}
                </div>
              </div>
              <button className="btn btn-primary" onClick={climb} disabled={climbing} style={{ fontSize: 16 }}>
                {climbing ? 'Climbing…' : 'Climb'}
              </button>
            </div>
          </div>
        )}

        {lastResult && (
          <div className={`card`} style={{ padding: 14, marginTop: 12, borderLeft: `3px solid ${lastResult.success ? 'var(--emerald-1)' : 'var(--crimson-1)'}` }}>
            <strong style={{ color: lastResult.success ? 'var(--emerald-1)' : 'var(--crimson-1)' }}>
              {lastResult.success ? `Floor ${lastResult.floor} cleared` : `Fallen on floor ${lastResult.floor}`}
            </strong>
            <div className="muted text-sm" style={{ marginTop: 6 }}>{lastResult.rounds.length} rounds of combat. {lastResult.success && `+${lastResult.gold}g, +${lastResult.xp} XP.`}</div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-title" style={{ fontSize: 16, marginBottom: 12 }}>Hall of the Tower</div>
        {leaders.length === 0 ? (
          <div className="muted">Be the first to climb.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>#</th><th>Hero</th><th>Class</th><th>Lv</th><th style={{ textAlign: 'right' }}>Best floor</th></tr></thead>
            <tbody>
              {leaders.map((row, i) => (
                <tr key={row.name} className={row.name === char?.name ? 'highlight' : ''}>
                  <td style={{ width: 30, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                  <td>{row.name}</td>
                  <td className="muted">{row.class}</td>
                  <td>{row.level}</td>
                  <td style={{ textAlign: 'right', color: 'var(--gold-1)', fontFamily: 'var(--font-mono)' }}>F{row.tower_best_floor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
