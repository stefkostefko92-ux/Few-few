import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

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
      toast('Task started.', 'success');
      setPicked(null);
      await load();
    } catch (e: any) { toast(e.message, 'error'); }
  }
  async function claim() {
    try {
      const r = await api.post('/camp/claim');
      const lootStr = r.loot && r.loot.length ? ` · loot: ${r.loot.join(', ')}` : '';
      toast(`+${r.gold}g · +${r.xp} XP${lootStr}`, 'success');
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
            <h2 className="panel-title">Camp</h2>
            <div className="panel-subtitle">Set a task. Come back later. Gold and XP accrue while you're away.</div>
          </div>
        </div>

        {current ? (
          <div className="card" style={{ padding: 18, position: 'relative', overflow: 'hidden' }}>
            <div className="ambient-stars" />
            <div className="flex" style={{ gap: 18, position: 'relative', alignItems: 'center' }}>
              <div style={{ fontSize: 56, lineHeight: 1 }}>{current.def?.icon || '⏳'}</div>
              <div style={{ flex: 1 }}>
                <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)', fontSize: 22 }}>
                  {current.def?.name || current.slug}
                </strong>
                <div className="muted text-sm" style={{ marginTop: 4 }}>{current.def?.description}</div>
                <div style={{ marginTop: 10 }} className="bar">
                  <div className="bar-fill xp" style={{ width: `${pct}%`, transition: 'width 1s linear' }} />
                </div>
                <div className="flex between" style={{ marginTop: 8 }}>
                  <span className="muted text-sm">{current.duration_hr}h task</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: remaining === 0 ? 'var(--emerald-1)' : 'var(--gold-1)' }}>
                    {remaining === 0 ? 'Ready!' : `${hrs}h ${min}m ${sec}s`}
                  </span>
                </div>
              </div>
              <button className="btn btn-primary" disabled={remaining > 0} onClick={claim}>
                {remaining > 0 ? 'In progress' : 'Claim reward'}
              </button>
            </div>
          </div>
        ) : (
          <div className="muted">No task running. Pick one below.</div>
        )}
      </div>

      {!current && (
        <div className="grid-cards">
          {tasks.map((t) => (
            <div key={t.slug} className="card" data-tilt style={{ position: 'relative' }}>
              <div className="flex" style={{ gap: 14, alignItems: 'flex-start' }}>
                <div style={{ fontSize: 40, lineHeight: 1 }}>{t.icon}</div>
                <div style={{ flex: 1 }}>
                  <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>{t.name}</strong>
                  <div className="muted text-sm" style={{ marginTop: 4 }}>{t.description}</div>
                </div>
              </div>
              <div className="flex gap-sm" style={{ marginTop: 10, fontFamily: 'var(--font-mono)' }}>
                <span className="tag gold">+{t.gold_per_hour}g/h</span>
                <span className="tag emerald">+{t.xp_per_hour} XP/h</span>
              </div>
              <div className="flex gap-sm" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                {durations.map((h) => (
                  <button
                    key={h}
                    className={`btn btn-sm ${picked?.slug === t.slug && picked.hours === h ? 'btn-primary' : ''}`}
                    onClick={() => setPicked({ slug: t.slug, hours: h })}
                  >
                    {h}h
                  </button>
                ))}
              </div>
              {picked?.slug === t.slug && (
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 12, width: '100%' }}
                  onClick={start}
                >
                  Begin {picked.hours}h task · +{t.gold_per_hour * picked.hours}g, +{t.xp_per_hour * picked.hours} XP
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
