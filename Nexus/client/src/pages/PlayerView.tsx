import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Avatar from '../components/Avatar';
import ReportModal, { type ReportTarget } from '../components/ReportModal';

/**
 * Read-only профил на друг играч. Достига се от класациите/арената
 * (`/app/player/:name`). Ползва публичния endpoint `/profile/character/:id`.
 * Има и „Report" контрол (DSA чл. 16 — докладване на име/профил).
 */
export default function PlayerView(): React.ReactElement {
  const { name } = useParams<{ name: string }>();
  const { t } = useTranslation();
  const me = useStore((s) => s.character);
  const [p, setP] = useState<any>(null);
  const [err, setErr] = useState('');
  const [report, setReport] = useState<ReportTarget | null>(null);

  useEffect(() => {
    setP(null); setErr('');
    api.get(`/profile/character/${encodeURIComponent(name || '')}`)
      .then(setP)
      .catch((e: any) => setErr(e.message || 'Not found'));
  }, [name]);

  if (err) return <div className="panel"><p className="muted">{err}</p><Link className="btn" to="/app/leaderboard">← {t('common.back', { defaultValue: 'Back' })}</Link></div>;
  if (!p) return <div className="panel"><p className="muted">{t('common.loading', { defaultValue: 'Loading…' })}</p></div>;

  const isSelf = me?.id === p.id;
  const stat = (label: string, value: any) => (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
    </div>
  );

  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Avatar avatar={p.avatar} frame={p.frame_slug} size={72} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0 }}>
            {p.name} {p.is_npc ? <span className="muted" style={{ fontSize: 13 }}>· NPC</span> : null}
          </h2>
          <div className="muted">
            {t('common.lv', { defaultValue: 'Lv' })} {p.level} · {t(`common.class.${p.class}`, { defaultValue: p.class })}
            {p.current_title ? ` · ${p.current_title}` : ''}
          </div>
          {p.guild && (
            <div className="muted" style={{ fontSize: 13 }}>
              &lt;{p.guild.tag}&gt; {p.guild.name}
            </div>
          )}
        </div>
        {!isSelf && !p.is_npc && (
          <button
            className="btn btn-sm"
            onClick={() => setReport({ contentKind: 'character_name', contentRef: `char:${p.name}`, label: `Player ${p.name}` })}
          >⚑ {t('common.report', { defaultValue: 'Report' })}</button>
        )}
      </div>

      {p.bio && <p style={{ marginTop: 16, whiteSpace: 'pre-wrap' }}>{p.bio}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 10, marginTop: 16 }}>
        {stat(t('leaderboard.rating', { defaultValue: 'Arena' }), p.arena_rating)}
        {stat(t('common.wins', { defaultValue: 'Wins' }), p.wins)}
        {stat(t('common.losses', { defaultValue: 'Losses' }), p.losses)}
        {stat(t('common.slain', { defaultValue: 'Slain' }), p.monsters_slain)}
        {stat(t('common.dungeons', { defaultValue: 'Dungeons' }), p.dungeons_cleared)}
      </div>

      <div style={{ marginTop: 16 }}>
        <Link className="btn btn-sm" to="/app/leaderboard">← {t('common.back', { defaultValue: 'Back' })}</Link>
      </div>

      {report && <ReportModal target={report} onClose={() => setReport(null)} />}
    </div>
  );
}
