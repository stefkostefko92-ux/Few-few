import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Sprite from '../components/Sprite';

interface Status {
  current_floor: number;
  next_floor: number;
  best_floor: number;
  energy: number;
  energy_cost: number;
  next_reward: { gold: number; xp: number; vault: boolean };
}
interface Leader {
  name: string;
  class: string;
  level: number;
  tower_best_floor: number;
}

export default function Tower(): React.ReactElement {
  const { t } = useTranslation();
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
        const vaultMsg = r.vault ? t('tower.vaultSuffix') : '';
        toast(t('tower.clearedToast', { floor: r.floor, gold: r.gold, xp: r.xp, vault: vaultMsg }), 'success');
        if (r.levelUp) showLevelUp(r.levelUp);
      } else {
        toast(t('tower.fellToast', { floor: r.floor, best: r.best_floor }), 'error');
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
            <h2 className="panel-title">{t('tower.title')}</h2>
            <div className="panel-subtitle">{t('tower.subtitle')}</div>
          </div>
          {status && (
            <div className="flex gap-sm">
              <span className="tag gold">{t('tower.bestTag', { n: status.best_floor })}</span>
              <span className="tag" style={{ background: 'var(--surface-2)' }}>{t('tower.energyTag', { n: status.energy })}</span>
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
                <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.12em' }}>{t('tower.nextGate')}</div>
                <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--gold-1)' }}>
                  {t('tower.floor', { n: status.next_floor })}
                  {status.next_reward.vault && <span className="tag gold" style={{ marginLeft: 12, fontSize: 11 }}>{t('tower.vault')}</span>}
                </h2>
                <div className="muted text-sm" style={{ marginTop: 6 }}>
                  {t('tower.reward', { gold: status.next_reward.gold, xp: status.next_reward.xp })}{status.next_reward.vault ? t('tower.doubled') : ''}
                </div>
                <div className="muted text-sm">
                  {t('tower.cost', { n: status.energy_cost })}
                </div>
              </div>
              <button className="btn btn-primary" onClick={climb} disabled={climbing || status.energy < status.energy_cost} style={{ fontSize: 16 }}>
                {climbing ? t('tower.climbing') : status.energy < status.energy_cost ? t('tower.needEnergy') : t('tower.climb')}
              </button>
            </div>
          </div>
        )}

        {lastResult && (
          <div className={`card`} style={{ padding: 14, marginTop: 12, borderLeft: `3px solid ${lastResult.success ? 'var(--emerald-1)' : 'var(--crimson-1)'}` }}>
            <strong style={{ color: lastResult.success ? 'var(--emerald-1)' : 'var(--crimson-1)' }}>
              {lastResult.success ? t('tower.floorCleared', { n: lastResult.floor }) : t('tower.fallenOn', { n: lastResult.floor })}
            </strong>
            <div className="muted text-sm" style={{ marginTop: 6 }}>{t('tower.roundsInfo', { n: lastResult.rounds.length })} {lastResult.success && t('tower.gains', { gold: lastResult.gold, xp: lastResult.xp })}</div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-title" style={{ fontSize: 16, marginBottom: 12 }}>{t('tower.hallTitle')}</div>
        {leaders.length === 0 ? (
          <div className="muted">{t('tower.beFirst')}</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>#</th><th>{t('tower.thHero')}</th><th>{t('tower.thClass')}</th><th>{t('tower.thLv')}</th><th style={{ textAlign: 'right' }}>{t('tower.thBestFloor')}</th></tr></thead>
            <tbody>
              {leaders.map((row, i) => (
                <tr key={row.name} className={row.name === char?.name ? 'highlight' : ''}>
                  <td style={{ width: 30, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                  <td>{row.name}</td>
                  <td className="muted">{row.class}</td>
                  <td>{row.level}</td>
                  <td style={{ textAlign: 'right', color: 'var(--gold-1)', fontFamily: 'var(--font-mono)' }}>{t('tower.floorShort', { n: row.tower_best_floor })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
