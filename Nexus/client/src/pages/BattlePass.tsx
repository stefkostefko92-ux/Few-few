import React, { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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

const TASK_KINDS = [
  'hunt_kill', 'bounty_claim', 'tower_clear', 'tower_vault', 'forge_enchant', 'forge_high_enchant',
  'arena_win', 'camp_claim', 'daily_claim', 'wheel_spin', 'guild_donate', 'quest_complete',
  'market_sale', 'dungeon_clear', 'trial_token_earned',
];

export default function BattlePass(): React.ReactElement {
  const { t } = useTranslation();
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
      toast(t('battlePass.claimedToast', { task: task.text }), 'success');
      if (r.levelUp) showLevelUp(r.levelUp);
      await Promise.all([load(), refresh()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  async function unlockPremium() {
    try {
      await api.post('/battlepass/unlock-premium', {});
      toast(t('battlePass.premiumUnlockedToast'), 'success');
      await Promise.all([load(), refresh()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  const completedCount = useMemo(() => status?.tasks.filter((task) => task.done >= task.required).length ?? 0, [status]);

  if (!status) return <div className="muted">{t('battlePass.loading')}</div>;

  const ms = Math.max(0, status.resets_at - now);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('battlePass.title')} · {status.month_key}</h2>
            <div className="panel-subtitle">
              {t('battlePass.subtitle')}{' '}
              <Trans
                i18nKey="battlePass.resetsIn"
                values={{ days, hours }}
                components={{ time: <span style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-mono)' }} /> }}
              />{' '}
              <Trans
                i18nKey="battlePass.completed"
                values={{ count: completedCount }}
                components={{ done: <strong style={{ color: 'var(--emerald-1)' }} /> }}
              />
            </div>
          </div>
          <div className="flex gap-sm">
            {status.premium_unlocked ? (
              <span className="tag" style={{ background: 'linear-gradient(135deg, rgba(255,232,138,.2), rgba(255,177,89,.2))', color: 'var(--gold-1)', fontFamily: 'var(--font-display)', letterSpacing: '.12em' }}>
                {t('battlePass.premiumActive')}
              </span>
            ) : (
              <button className="btn btn-primary" onClick={unlockPremium}>
                {t('battlePass.unlockPremium', { cost: status.premium_unlock_cost })}
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
              <th style={{ width: 90 }}>{t('battlePass.table.loop')}</th>
              <th>{t('battlePass.table.task')}</th>
              <th style={{ width: 120 }}>{t('battlePass.table.progress')}</th>
              <th style={{ width: 280 }}>{t('battlePass.table.freeReward')}</th>
              <th style={{ width: 280 }}>{t('battlePass.table.premiumReward')}</th>
            </tr>
          </thead>
          <tbody>
            {status.tasks.map((task, i) => {
              const ready = task.done >= task.required;
              const pct = Math.min(100, (task.done / task.required) * 100);
              return (
                <tr key={task.id}>
                  <td className="muted" style={{ fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                  <td><span className="tag" style={{ fontSize: 10 }}>{TASK_KINDS.includes(task.kind) ? t(`battlePass.kinds.${task.kind}`) : task.kind}</span></td>
                  <td>{task.text}</td>
                  <td>
                    <div className="bp-progress">
                      <div className="bp-progress-fill" style={{ width: `${pct}%`, background: ready ? 'var(--emerald-1)' : 'var(--azure-1)' }} />
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: ready ? 'var(--emerald-1)' : 'var(--text-3)', marginTop: 2 }}>
                      {task.done} / {task.required}
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-sm" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                      {fmtReward(task.free)}
                      <button
                        className="btn btn-sm"
                        disabled={!ready || task.claimed.free}
                        onClick={() => claim(task, 'free')}
                      >
                        {task.claimed.free ? '✓' : t('battlePass.claim')}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-sm" style={{ flexWrap: 'wrap', alignItems: 'center', opacity: status.premium_unlocked ? 1 : 0.4 }}>
                      {fmtReward(task.premium)}
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={!ready || task.claimed.premium || !status.premium_unlocked}
                        onClick={() => claim(task, 'premium')}
                      >
                        {task.claimed.premium ? '✓' : status.premium_unlocked ? t('battlePass.claim') : '🔒'}
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
