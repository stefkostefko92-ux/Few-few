import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { CombatHistoryEntry, CombatReplay } from '../lib/types';
import CombatScene from '../combat/CombatScene';

export default function History(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const [entries, setEntries] = useState<CombatHistoryEntry[]>([]);
  const [replay, setReplay] = useState<CombatReplay | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/combat/history');
      setEntries(r.entries);
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function watch(id: number) {
    try {
      const r = await api.get(`/combat/history/${id}`);
      if (!r.entry?.hero || !r.entry?.foe || !r.entry?.rounds) {
        toast('Replay data not available for that battle.', 'error');
        return;
      }
      setReplay(r.entry);
      setReplayKey((k) => k + 1);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  if (replay) {
    return (
      <div className="col" style={{ gap: 16 }}>
        <div className="panel" style={{ padding: 16 }}>
          <div className="flex between" style={{ alignItems: 'center' }}>
            <div>
              <h2 className="panel-title">Battle Replay</h2>
              <div className="panel-subtitle">
                vs <strong>{replay.opponent}</strong> · {labelForKind(replay.kind)} · {new Date(replay.created_at).toLocaleString()}
              </div>
            </div>
            <div className="flex gap-sm">
              <button className="btn" onClick={() => setReplayKey((k) => k + 1)}>Restart Replay</button>
              <button className="btn btn-primary" onClick={() => setReplay(null)}>Back to history</button>
            </div>
          </div>
        </div>
        <CombatScene
          key={replayKey}
          hero={replay.hero}
          foe={replay.foe}
          rounds={replay.rounds}
          victory={replay.victory}
          reward={{ xp: replay.xp_gained, gold: replay.gold_gained }}
          onReplay={() => setReplayKey((k) => k + 1)}
          onClose={() => setReplay(null)}
          introTitle={`${replay.hero.name}  VS  ${replay.foe.name}`}
        />
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Battle History</h2>
          <div className="panel-subtitle">Replay any of your past fights in full cinematic detail.</div>
        </div>
        <button className="btn" onClick={load} disabled={loading}>Refresh</button>
      </div>
      {entries.length === 0 ? (
        <div className="muted">No battles yet. Fight a quest or arena duel and they'll appear here.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Opponent</Th>
              <Th>Type</Th>
              <Th>Result</Th>
              <Th>XP</Th>
              <Th>Gold</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} style={{ borderTop: '1px solid var(--border-1)' }}>
                <Td className="muted text-sm">{relative(e.created_at)}</Td>
                <Td><strong>{e.opponent}</strong></Td>
                <Td>{labelForKind(e.kind)}</Td>
                <Td><span className={`tag ${e.result === 'win' ? 'emerald' : 'crimson'}`}>{e.result}</span></Td>
                <Td className="gold">{e.xp_gained > 0 ? `+${e.xp_gained}` : '—'}</Td>
                <Td className="gold">{e.gold_gained > 0 ? `+${e.gold_gained}` : '—'}</Td>
                <Td><button className="btn btn-sm btn-primary" onClick={() => watch(e.id)}>Watch</button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function labelForKind(k: string): string {
  if (k === 'quest') return 'Quest';
  if (k === 'pvp') return 'Arena';
  if (k === 'pve') return 'PvE';
  if (k === 'dungeon') return 'Dungeon';
  if (k === 'hunt') return 'Hunt';
  if (k === 'arena') return 'Arena';
  // Fall back to a capitalised label instead of the raw slug.
  return k ? k[0].toUpperCase() + k.slice(1) : k;
}

function relative(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function Th({ children }: any) { return <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)' }}>{children}</th>; }
function Td({ children, ...rest }: any) { return <td style={{ padding: '12px 16px' }} {...rest}>{children}</td>; }
