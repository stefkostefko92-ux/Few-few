import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { Achievement } from '../lib/types';

export default function Achievements(): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const [list, setList] = useState<Achievement[]>([]);
  const [earned, setEarned] = useState(0);
  const [total, setTotal] = useState(0);
  const [titles, setTitles] = useState<string[]>([]);
  const [currentTitle, setCurrentTitle] = useState('');

  async function load() {
    const r = await api.get('/achievements');
    setList(r.achievements);
    setEarned(r.earned);
    setTotal(r.total);
    setTitles(r.available_titles);
    setCurrentTitle(r.current_title);
  }
  useEffect(() => { load(); }, []);

  async function setTitle(title: string) {
    try {
      await api.post('/achievements/title', { title });
      setCurrentTitle(title);
      toast(title ? t('achievements.titleSet', { title }) : t('achievements.titleCleared'), 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  const pct = total ? Math.round((earned / total) * 100) : 0;

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('achievements.title')}</h2>
            <div className="panel-subtitle">{t('achievements.progress', { earned, total, pct })}</div>
          </div>
        </div>
        <div className="bar" style={{ height: 14 }}>
          <div className="bar-fill xp" style={{ width: `${pct}%` }} />
          <div className="bar-label">{pct}%</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{t('achievements.activeTitle')}</h2>
        </div>
        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${currentTitle === '' ? 'btn-primary' : ''}`} onClick={() => setTitle('')}>{t('achievements.none')}</button>
          {titles.length === 0 && <span className="muted">{t('achievements.earnHint')}</span>}
          {titles.map((title) => (
            <button key={title} className={`btn btn-sm ${currentTitle === title ? 'btn-primary' : ''}`} onClick={() => setTitle(title)}>{title}</button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{t('achievements.all')}</h2>
        </div>
        <div className="grid-cards">
          {list.map((a) => (
            <div key={a.slug} className="card" style={{ opacity: a.unlocked ? 1 : 0.5, borderColor: a.unlocked ? 'var(--gold-2)' : undefined }}>
              <div className="flex" style={{ gap: 12 }}>
                <div style={{ fontSize: 32, filter: a.unlocked ? undefined : 'grayscale(1)' }}>{a.icon}</div>
                <div className="grow">
                  <strong style={{ color: a.unlocked ? 'var(--gold-1)' : 'var(--text-3)' }}>{a.name}</strong>
                  <div className="muted text-sm">{a.description}</div>
                  <div style={{ marginTop: 6 }}>
                    {a.title && <span className="tag amethyst" style={{ marginRight: 6 }}>"{a.title}"</span>}
                    {a.goldReward > 0 && <span className="tag gold" style={{ marginRight: 6 }}>+{a.goldReward}g</span>}
                    {a.xpReward > 0 && <span className="tag gold">+{a.xpReward} XP</span>}
                  </div>
                </div>
              </div>
              {a.unlocked && a.unlocked_at && (
                <div className="muted text-sm" style={{ marginTop: 8 }}>
                  {t('achievements.unlockedOn', { date: new Date(a.unlocked_at).toLocaleDateString() })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
