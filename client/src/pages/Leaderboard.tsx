import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function Leaderboard(): React.ReactElement {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get('/arena/leaderboard').then((r) => setRows(r.leaderboard)).catch((e: any) => setErr(e.message || 'Failed to load'));
  }, []);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Hall of Fame</h2>
        <div className="panel-subtitle">The greatest of Nexus Dominion, ranked by arena valor.</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <Th>#</Th>
            <Th>Name</Th>
            <Th>Class</Th>
            <Th>Level</Th>
            <Th>Rating</Th>
            <Th>Wins</Th>
            <Th>Losses</Th>
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
                {r.is_npc ? <span className="tag" style={{ marginLeft: 8 }}>NPC</span> : null}
              </Td>
              <Td style={{ textTransform: 'capitalize' }}>{r.class}</Td>
              <Td>{r.level}</Td>
              <Td><span className="gold">{r.arena_rating}</span></Td>
              <Td className="emerald">{r.wins}</Td>
              <Td className="crimson">{r.losses}</Td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={7} className="muted" style={{ padding: 24, textAlign: 'center' }}>
              {err ? `Couldn’t load the rankings: ${err}` : 'The hall waits to be filled.'}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: any) { return <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)' }}>{children}</th>; }
function Td({ children, ...rest }: any) { return <td style={{ padding: '12px 16px' }} {...rest}>{children}</td>; }
