import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

export default function Stats(): React.ReactElement {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.get('/stats').then(setData).catch(() => {});
  }, []);

  if (!data) return <div className="muted">{t('common.loading')}</div>;

  const c = data.character;
  const l = data.lifetime;
  const j = data.journey;

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('stats.title')}</h2>
            <div className="panel-subtitle">{c.name}{c.current_title && `, ${c.current_title}`} — {t(`common.class.${c.class}`, { defaultValue: c.class })} · {t('common.lv')} {c.level}</div>
          </div>
          <div className="tag gold" style={{ fontSize: 14 }}>{t('stats.joined', { date: new Date(c.created_at).toLocaleDateString() })}</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <h3 style={{ marginBottom: 12 }}>{t('stats.combat')}</h3>
          <StatList rows={[
            [t('stats.battlesFought'), l.battles],
            [t('stats.battlesWon'), l.battles_won],
            [t('stats.battlesLost'), l.battles_lost],
            [t('stats.winRate'), l.battles ? `${Math.round((l.battles_won / l.battles) * 100)}%` : '—'],
            [t('stats.monstersSlain'), l.monsters_slain],
            [t('stats.dungeonsCleared'), l.dungeons_cleared],
            [t('stats.questsCompleted'), l.quests_completed],
          ]} />
        </div>
        <div className="panel">
          <h3 style={{ marginBottom: 12 }}>{t('stats.wealth')}</h3>
          <StatList rows={[
            [t('stats.currentGold'), c.gold.toLocaleString()],
            [t('stats.lifetimeGold'), l.total_gold_earned.toLocaleString()],
            [t('stats.lifetimeXp'), l.total_xp_earned.toLocaleString()],
            [t('stats.avgGoldBattle'), l.battles ? Math.round(l.total_gold_earned / l.battles) : '—'],
            [t('stats.avgXpBattle'), l.battles ? Math.round(l.total_xp_earned / l.battles) : '—'],
          ]} />
        </div>
        <div className="panel">
          <h3 style={{ marginBottom: 12 }}>{t('stats.arena')}</h3>
          <StatList rows={[
            [t('stats.currentRating'), c.arena_rating],
            [t('stats.arenaWins'), l.arena_wins],
            [t('stats.arenaLosses'), l.arena_losses],
            [t('stats.winRate'), (l.arena_wins + l.arena_losses) ? `${Math.round((l.arena_wins / (l.arena_wins + l.arena_losses)) * 100)}%` : '—'],
          ]} />
        </div>
        <div className="panel">
          <h3 style={{ marginBottom: 12 }}>{t('stats.journey')}</h3>
          <StatList rows={[
            [t('stats.daysPlayed'), j.days_played],
            [t('stats.currentStreak'), t('stats.days', { count: j.streak })],
            [t('stats.longestStreak'), t('stats.days', { count: j.longest_streak })],
            [t('stats.bestiaryDiscoveries'), j.bestiary_unique],
            [t('stats.totalKills'), j.bestiary_kills_total],
            [t('stats.achievementsEarned'), j.achievements],
          ]} />
        </div>
      </div>
    </div>
  );
}

function StatList({ rows }: { rows: [string, any][] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border-1)' }}>
          <span className="muted">{k}</span>
          <span style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}
