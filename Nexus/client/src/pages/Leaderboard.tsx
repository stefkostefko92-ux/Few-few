import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

interface SeasonRow { character_id: number; points: number; name: string; class: string; level: number; }
interface SeasonData {
  season_key: string;
  ends_at: number;
  top: SeasonRow[];
  my_points: number;
  my_rank: number | null;
  last_season: { season_key: string; podium: Array<{ rank: number; name: string; points: number; title: string }> };
}

export default function Leaderboard(): React.ReactElement {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'arena' | 'season'>('arena');
  const [rows, setRows] = useState<any[]>([]);
  const [season, setSeason] = useState<SeasonData | null>(null);
  useEffect(() => {
    api.get('/arena/leaderboard').then((r) => setRows(r.leaderboard)).catch(() => {});
    api.get('/season').then(setSeason).catch(() => {});
  }, []);

  const daysLeft = season ? Math.max(0, Math.ceil((season.ends_at - Date.now()) / 86_400_000)) : 0;

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{t('leaderboard.title')}</h2>
          <div className="panel-subtitle">{t('leaderboard.subtitle')}</div>
        </div>
        <div className="flex gap-sm">
          <button className={`btn btn-sm ${tab === 'arena' ? 'btn-primary' : ''}`} onClick={() => setTab('arena')}>{t('leaderboard.tabArena', { defaultValue: 'Arena' })}</button>
          <button className={`btn btn-sm ${tab === 'season' ? 'btn-primary' : ''}`} onClick={() => setTab('season')}>{t('leaderboard.tabSeason', { defaultValue: 'Season' })}</button>
        </div>
      </div>

      {tab === 'arena' && (
        <div className="table-scroll">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>{t('leaderboard.th.name')}</Th>
              <Th>{t('leaderboard.th.class')}</Th>
              <Th>{t('leaderboard.th.level')}</Th>
              <Th>{t('leaderboard.th.rating')}</Th>
              <Th>{t('leaderboard.th.wins')}</Th>
              <Th>{t('leaderboard.th.losses')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border-1)' }}>
                <Td>
                  <span style={{ color: i < 3 ? 'var(--gold-1)' : 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
                    {i + 1}
                  </span>
                </Td>
                <Td>
                  <Link to={`/app/player/${encodeURIComponent(r.name)}`} style={{ color: 'var(--text-1)', textDecoration: 'none' }}>
                    <strong style={{ color: 'var(--text-1)' }}>{r.name}</strong>
                  </Link>
                  {r.is_npc ? <span className="tag" style={{ marginLeft: 8 }}>{t('leaderboard.npc')}</span> : null}
                </Td>
                <Td style={{ textTransform: 'capitalize' }}>{t(`common.class.${r.class}`, { defaultValue: r.class })}</Td>
                <Td>{r.level}</Td>
                <Td><span className="gold">{r.arena_rating}</span></Td>
                <Td className="emerald">{r.wins}</Td>
                <Td className="crimson">{r.losses}</Td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="muted" style={{ padding: 24, textAlign: 'center' }}>{t('leaderboard.empty')}</td></tr>
            )}
          </tbody>
        </table>
        </div>
      )}

      {tab === 'season' && season && (
        <div>
          {/* Сезонна лента: моят ранг + оставащо време + наградите на върха. */}
          <div className="card" style={{ marginBottom: 14, borderColor: 'var(--gold-3)', background: 'rgba(214,161,61,.05)' }}>
            <div className="flex between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong style={{ color: 'var(--gold-1)' }}>🏆 {t('leaderboard.seasonTitle', { key: season.season_key, defaultValue: 'Season {{key}}' })}</strong>
                <div className="muted text-sm">
                  {t('leaderboard.seasonMine', { points: season.my_points, rank: season.my_rank ?? '—', defaultValue: 'Your points: {{points}} · rank #{{rank}}' })}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="muted text-sm">{t('leaderboard.seasonEnds', { days: daysLeft, defaultValue: 'Ends in {{days}} days' })}</div>
                <div className="muted text-sm">{t('leaderboard.seasonRewards', { defaultValue: '#1: 1000💎 +100k g + title · top 10: 200💎 · top 10%: 50💎' })}</div>
              </div>
            </div>
          </div>
          {season.last_season.podium.length > 0 && (
            <div className="muted text-sm" style={{ marginBottom: 10 }}>
              {t('leaderboard.lastSeason', { key: season.last_season.season_key, defaultValue: 'Last season ({{key}}):' })}{' '}
              {season.last_season.podium.map((p) => `#${p.rank} ${p.name}`).join(' · ')}
            </div>
          )}
          <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>{t('leaderboard.th.name')}</Th>
                <Th>{t('leaderboard.th.class')}</Th>
                <Th>{t('leaderboard.th.level')}</Th>
                <Th>{t('leaderboard.th.points', { defaultValue: 'Points' })}</Th>
              </tr>
            </thead>
            <tbody>
              {season.top.map((r, i) => (
                <tr key={r.character_id} style={{ borderTop: '1px solid var(--border-1)' }}>
                  <Td>
                    <span style={{ color: i < 3 ? 'var(--gold-1)' : 'var(--text-3)', fontFamily: 'var(--font-display)' }}>{i + 1}</span>
                  </Td>
                  <Td>
                    <Link to={`/app/player/${encodeURIComponent(r.name)}`} style={{ color: 'var(--text-1)', textDecoration: 'none' }}>
                      <strong style={{ color: 'var(--text-1)' }}>{r.name}</strong>
                    </Link>
                  </Td>
                  <Td style={{ textTransform: 'capitalize' }}>{t(`common.class.${r.class}`, { defaultValue: r.class })}</Td>
                  <Td>{r.level}</Td>
                  <Td><span className="gold">{r.points.toLocaleString()}</span></Td>
                </tr>
              ))}
              {season.top.length === 0 && (
                <tr><td colSpan={5} className="muted" style={{ padding: 24, textAlign: 'center' }}>{t('leaderboard.seasonEmpty', { defaultValue: 'No points yet this season. Go hunt!' })}</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: any) { return <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)' }}>{children}</th>; }
function Td({ children, ...rest }: any) { return <td style={{ padding: '12px 16px' }} {...rest}>{children}</td>; }
