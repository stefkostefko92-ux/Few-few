import React from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';

interface Region {
  slug: string;
  name: string;
  level: string;
  minLevel: number;
  lore: string;
  flavor: string;
  x: number; y: number;
  color: string;
}

const REGIONS: Region[] = [
  { slug: 'whispering_woods', name: 'Whispering Woods', level: '1-5', minLevel: 1, lore: 'A green wood near Oaken Hollow.', flavor: '🌲', x: 18, y: 70, color: '#3f6a2c' },
  { slug: 'mistmoor_hills', name: 'Mistmoor Hills', level: '6-10', minLevel: 6, lore: 'Fog-laced highlands stalked by orcs.', flavor: '⛰', x: 36, y: 50, color: '#6e7a5c' },
  { slug: 'crystal_caverns', name: 'Crystal Caverns', level: '10-15', minLevel: 10, lore: 'Glittering tunnels far beneath the mountains.', flavor: '💎', x: 56, y: 60, color: '#6aa7ff' },
  { slug: 'ashen_wastes', name: 'Ashen Wastes', level: '15-22', minLevel: 15, lore: 'Burned plains roamed by drakes and revenants.', flavor: '🔥', x: 74, y: 40, color: '#c7641a' },
  { slug: 'shadowfell', name: 'The Shadowfell', level: '24+', minLevel: 24, lore: 'The Shadow Lord\'s domain. Bring everything.', flavor: '☠', x: 88, y: 22, color: '#6f3fb6' },
];

export default function World(): React.ReactElement {
  const char = useStore((s) => s.character);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Map of Nexus</h2>
          <div className="panel-subtitle">From Oaken Hollow to the Shadowfell — the long road of a hero.</div>
        </div>
      </div>
      <div
        style={{
          position: 'relative',
          aspectRatio: '16/9',
          background:
            'radial-gradient(circle at 20% 90%, rgba(63,106,44,.4), transparent 35%), ' +
            'radial-gradient(circle at 80% 30%, rgba(199,100,26,.35), transparent 30%), ' +
            'radial-gradient(circle at 95% 10%, rgba(111,63,182,.4), transparent 30%), ' +
            'linear-gradient(180deg, #0b0d12, #11141b)',
          border: '1px solid var(--border-3)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}
      >
        {/* SVG paths */}
        <svg viewBox="0 0 100 56" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="road" x1="0" x2="1">
              <stop offset="0%" stopColor="#d6a13d" stopOpacity=".2" />
              <stop offset="50%" stopColor="#d6a13d" stopOpacity=".8" />
              <stop offset="100%" stopColor="#d6a13d" stopOpacity=".2" />
            </linearGradient>
          </defs>
          <path d="M 18 39 Q 26 35 36 28" stroke="url(#road)" strokeWidth="1.5" strokeDasharray="2 1" fill="none" />
          <path d="M 36 28 Q 48 32 56 33" stroke="url(#road)" strokeWidth="1.5" strokeDasharray="2 1" fill="none" />
          <path d="M 56 33 Q 66 28 74 22" stroke="url(#road)" strokeWidth="1.5" strokeDasharray="2 1" fill="none" />
          <path d="M 74 22 Q 82 16 88 12" stroke="url(#road)" strokeWidth="1.5" strokeDasharray="2 1" fill="none" />
        </svg>

        {/* Markers */}
        {REGIONS.map((r) => {
          const locked = char ? char.level < r.minLevel - 1 : false;
          return (
            <div
              key={r.slug}
              style={{
                position: 'absolute',
                left: `${r.x}%`,
                top: `${r.y}%`,
                transform: 'translate(-50%, -50%)',
                width: 180,
              }}
            >
              <div
                style={{
                  background: 'linear-gradient(180deg, rgba(0,0,0,.7), rgba(0,0,0,.85))',
                  border: `1px solid ${r.color}`,
                  borderRadius: 12,
                  padding: 10,
                  boxShadow: `0 0 18px ${r.color}66`,
                  opacity: locked ? .55 : 1,
                }}
              >
                <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 24 }}>{r.flavor}</span>
                  <div>
                    <strong style={{ color: 'var(--gold-1)' }}>{r.name}</strong>
                    <div className="muted text-sm">Lv {r.level}</div>
                  </div>
                </div>
                <div className="muted text-sm" style={{ marginTop: 6 }}>{r.lore}</div>
                {!locked && (
                  <Link to={`/app/quests`} className="btn btn-sm btn-primary" style={{ marginTop: 8, width: '100%', display: 'flex', justifyContent: 'center' }}>
                    Quests Here
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
