import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Sprite from '../components/Sprite';

const SPRITE_BY_SLUG: Record<string, string> = {
  fishing: 'camp-fish',
  foraging: 'camp-forest',
  mining: 'camp-mine',
  hunting: 'camp-hunt',
  scouting: 'camp-scout',
};

interface TaskDef {
  slug: string;
  name: string;
  description: string;
  icon: string;
  gold_per_hour: number;
  xp_per_hour: number;
}
interface Current {
  slug: string;
  started_at: number;
  ends_at: number;
  duration_hr: number;
  def: TaskDef;
}

export default function Camp(): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const showLevelUp = useStore((s) => s.showLevelUp);
  const [tasks, setTasks] = useState<TaskDef[]>([]);
  const [durations, setDurations] = useState<number[]>([1, 4, 8, 24]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [picked, setPicked] = useState<{ slug: string; hours: number } | null>(null);
  const [now, setNow] = useState(Date.now());

  async function load() {
    try {
      const r = await api.get('/camp/status');
      setTasks(r.tasks);
      setDurations(r.durations);
      setCurrent(r.current);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function start() {
    if (!picked) return;
    try {
      await api.post('/camp/start', picked);
      toast(t('camp.taskStarted'), 'success');
      setPicked(null);
      await load();
    } catch (e: any) { toast(e.message, 'error'); }
  }
  async function claim() {
    try {
      const r = await api.post('/camp/claim');
      const lootStr = r.loot && r.loot.length ? t('camp.lootSuffix', { items: r.loot.join(', ') }) : '';
      toast(t('camp.claimToast', { gold: r.gold, xp: r.xp, loot: lootStr }), 'success');
      if (r.levelUp) showLevelUp(r.levelUp);
      await Promise.all([load(), refresh()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  const remaining = current ? Math.max(0, current.ends_at - now) : 0;
  const remTotal = current ? current.ends_at - current.started_at : 1;
  const pct = current ? Math.min(100, ((current.ends_at - current.started_at - remaining) / remTotal) * 100) : 0;
  const hrs = Math.floor(remaining / 3_600_000);
  const min = Math.floor((remaining % 3_600_000) / 60_000);
  const sec = Math.floor((remaining % 60_000) / 1000);

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('camp.title')}</h2>
            <div className="panel-subtitle">{t('camp.subtitle')}</div>
          </div>
        </div>

        {current ? (
          <div className="card" style={{ padding: 18, position: 'relative', overflow: 'hidden' }}>
            <div className="ambient-stars" />
            <div className="flex" style={{ gap: 18, position: 'relative', alignItems: 'center' }}>
              <div style={{ width: 64, height: 64, display: 'grid', placeItems: 'center', background: 'radial-gradient(circle, var(--surface-2), transparent)', borderRadius: 12 }}>
                <Sprite name={SPRITE_BY_SLUG[current.slug] || 'camp-fire'} tone="camp" size={56} />
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)', fontSize: 22 }}>
                  {current.def?.name || current.slug}
                </strong>
                <div className="muted text-sm" style={{ marginTop: 4 }}>{current.def?.description}</div>
                <div style={{ marginTop: 10 }} className="bar">
                  <div className="bar-fill xp" style={{ width: `${pct}%`, transition: 'width 1s linear' }} />
                </div>
                <div className="flex between" style={{ marginTop: 8 }}>
                  <span className="muted text-sm">{t('camp.hourTask', { n: current.duration_hr })}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: remaining === 0 ? 'var(--emerald-1)' : 'var(--gold-1)' }}>
                    {remaining === 0 ? t('camp.ready') : t('camp.timeLeft', { h: hrs, m: min, s: sec })}
                  </span>
                </div>
              </div>
              <button className="btn btn-primary" disabled={remaining > 0} onClick={claim}>
                {remaining > 0 ? t('camp.inProgress') : t('camp.claimReward')}
              </button>
            </div>
          </div>
        ) : (
          <div className="muted">{t('camp.noTask')}</div>
        )}
      </div>

      {!current && (
        <div className="grid-cards">
          {tasks.map((task) => (
            <div key={task.slug} className="card" data-tilt style={{ position: 'relative' }}>
              <div className="flex" style={{ gap: 14, alignItems: 'flex-start' }}>
                <Sprite name={SPRITE_BY_SLUG[task.slug] || 'camp-fire'} tone="camp" size={44} />
                <div style={{ flex: 1 }}>
                  <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>{task.name}</strong>
                  <div className="muted text-sm" style={{ marginTop: 4 }}>{task.description}</div>
                </div>
              </div>
              <div className="flex gap-sm" style={{ marginTop: 10, fontFamily: 'var(--font-mono)' }}>
                <span className="tag gold">{t('camp.goldPerHour', { n: task.gold_per_hour })}</span>
                <span className="tag emerald">{t('camp.xpPerHour', { n: task.xp_per_hour })}</span>
              </div>
              <div className="flex gap-sm" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                {durations.map((h) => (
                  <button
                    key={h}
                    className={`btn btn-sm ${picked?.slug === task.slug && picked.hours === h ? 'btn-primary' : ''}`}
                    onClick={() => setPicked({ slug: task.slug, hours: h })}
                  >
                    {t('camp.hours', { n: h })}
                  </button>
                ))}
              </div>
              {picked?.slug === task.slug && (
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 12, width: '100%' }}
                  onClick={start}
                >
                  {t('camp.beginTask', { hours: picked.hours, gold: task.gold_per_hour * picked.hours, xp: task.xp_per_hour * picked.hours })}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
