import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

export default function Leaderboard(): React.ReactElement {
  const { t } = useTranslation();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    api.get('/arena/leaderboard').then((r) => setRows(r.leaderboard)).catch(() => {});
  }, []);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">{t('leaderboard.title')}</h2>
        <div className="panel-subtitle">{t('leaderboard.subtitle')}</div>
      </div>
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
                <strong style={{ color: 'var(--text-1)' }}>{r.name}</strong>
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
  );
}

function Th({ children }: any) { return <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)' }}>{children}</th>; }
function Td({ children, ...rest }: any) { return <td style={{ padding: '12px 16px' }} {...rest}>{children}</td>; }
