import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function Stats(): React.ReactElement {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/stats').then(setData).catch((e: any) => setErr(e.message || 'Failed to load stats'));
  }, []);

  if (err) return <div className="muted">Couldn’t load your statistics: {err}</div>;
  if (!data) return <div className="muted">Loading…</div>;

  const c = data.character;
  const l = data.lifetime;
  const j = data.journey;

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Lifetime Statistics</h2>
            <div className="panel-subtitle">{c.name}{c.current_title && `, ${c.current_title}`} — {prettyClass(c.class)} · Lv {c.level}</div>
          </div>
          <div className="tag gold" style={{ fontSize: 14 }}>Joined {new Date(c.created_at).toLocaleDateString()}</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <h3 style={{ marginBottom: 12 }}>Combat</h3>
          <StatList rows={[
            ['Battles fought', l.battles],
            ['Battles won', l.battles_won],
            ['Battles lost', l.battles_lost],
            ['Win rate', l.battles ? `${Math.round((l.battles_won / l.battles) * 100)}%` : '—'],
            ['Monsters slain', l.monsters_slain],
            ['Dungeons cleared', l.dungeons_cleared],
            ['Quests completed', l.quests_completed],
          ]} />
        </div>
        <div className="panel">
          <h3 style={{ marginBottom: 12 }}>Wealth & XP</h3>
          <StatList rows={[
            ['Current gold', c.gold.toLocaleString()],
            ['Lifetime gold earned', l.total_gold_earned.toLocaleString()],
            ['Lifetime XP earned', l.total_xp_earned.toLocaleString()],
            ['Average gold / battle', l.battles ? Math.round(l.total_gold_earned / l.battles) : '—'],
            ['Average XP / battle', l.battles ? Math.round(l.total_xp_earned / l.battles) : '—'],
          ]} />
        </div>
        <div className="panel">
          <h3 style={{ marginBottom: 12 }}>Arena</h3>
          <StatList rows={[
            ['Current rating', c.arena_rating],
            ['Arena wins', l.arena_wins],
            ['Arena losses', l.arena_losses],
            ['Win rate', (l.arena_wins + l.arena_losses) ? `${Math.round((l.arena_wins / (l.arena_wins + l.arena_losses)) * 100)}%` : '—'],
          ]} />
        </div>
        <div className="panel">
          <h3 style={{ marginBottom: 12 }}>Journey</h3>
          <StatList rows={[
            ['Days played', j.days_played],
            ['Current streak', `${j.streak} days`],
            ['Longest streak', `${j.longest_streak} days`],
            ['Bestiary discoveries', j.bestiary_unique],
            ['Total monster kills', j.bestiary_kills_total],
            ['Achievements earned', j.achievements],
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

function prettyClass(c: string) { return c[0].toUpperCase() + c.slice(1); }
