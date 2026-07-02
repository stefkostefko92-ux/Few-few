import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { CombatHistoryEntry, CombatReplay } from '../lib/types';
import CombatScene from '../combat/CombatScene';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

export default function History(): React.ReactElement {
  const { t } = useTranslation();
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
        toast(t('history.replayUnavailable'), 'error');
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
              <h2 className="panel-title">{t('history.replayTitle')}</h2>
              <div className="panel-subtitle">
                {t('history.vs')} <strong>{replay.opponent}</strong> · {labelForKind(replay.kind, t)} · {new Date(replay.created_at).toLocaleString()}
              </div>
            </div>
            <div className="flex gap-sm">
              <button className="btn" onClick={() => setReplayKey((k) => k + 1)}>{t('history.restartReplay')}</button>
              <button className="btn btn-primary" onClick={() => setReplay(null)}>{t('history.backToHistory')}</button>
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
          introTitle={t('history.vsTitle', { hero: replay.hero.name, foe: replay.foe.name })}
        />
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{t('history.title')}</h2>
          <div className="panel-subtitle">{t('history.subtitle')}</div>
        </div>
        <button className="btn" onClick={load} disabled={loading}>{t('history.refresh')}</button>
      </div>
      {entries.length === 0 ? (
        <div className="muted">{t('history.empty')}</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th>{t('history.thWhen')}</Th>
              <Th>{t('history.thOpponent')}</Th>
              <Th>{t('history.thType')}</Th>
              <Th>{t('history.thResult')}</Th>
              <Th>{t('history.thXp')}</Th>
              <Th>{t('history.thGold')}</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} style={{ borderTop: '1px solid var(--border-1)' }}>
                <Td className="muted text-sm">{relative(e.created_at, t)}</Td>
                <Td><strong>{e.opponent}</strong></Td>
                <Td>{labelForKind(e.kind, t)}</Td>
                <Td><span className={`tag ${e.result === 'win' ? 'emerald' : 'crimson'}`}>{t(`history.result.${e.result}`, { defaultValue: e.result })}</span></Td>
                <Td className="gold">{e.xp_gained > 0 ? `+${e.xp_gained}` : '—'}</Td>
                <Td className="gold">{e.gold_gained > 0 ? `+${e.gold_gained}` : '—'}</Td>
                <Td><button className="btn btn-sm btn-primary" onClick={() => watch(e.id)}>{t('history.watch')}</button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function labelForKind(k: string, t: Translate): string {
  if (k === 'quest' || k === 'pvp' || k === 'pve') return t(`history.kind.${k}`);
  return k;
}

function relative(ts: number, t: Translate): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return t('history.secondsAgo', { n: Math.floor(diff) });
  if (diff < 3600) return t('history.minutesAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('history.hoursAgo', { n: Math.floor(diff / 3600) });
  return new Date(ts).toLocaleDateString();
}

function Th({ children }: any) { return <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)' }}>{children}</th>; }
function Td({ children, ...rest }: any) { return <td style={{ padding: '12px 16px' }} {...rest}>{children}</td>; }
