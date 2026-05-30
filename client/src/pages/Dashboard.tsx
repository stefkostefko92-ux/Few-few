import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { spriteFor } from '../combat/sprites';
import { api } from '../lib/api';

export default function Dashboard(): React.ReactElement {
  const char = useStore((s) => s.character);
  const derived = useStore((s) => s.derived);
  const [questLog, setQuestLog] = useState<any[]>([]);
  const [mail, setMail] = useState<any[]>([]);

  useEffect(() => {
    api.get('/quest/log').then((r) => setQuestLog(r.entries || [])).catch(() => {});
    api.get('/mail').then((r) => setMail(r.mails || [])).catch(() => {});
  }, []);

  if (!char || !derived) return <div className="muted">Loading…</div>;

  const xpForNext = Math.floor(50 * Math.pow(char.level + 1, 1.7));
  const xpCurrent = Math.floor(50 * Math.pow(char.level, 1.7));
  const pct = Math.max(0, Math.min(100, ((char.xp - xpCurrent) / (xpForNext - xpCurrent)) * 100));

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="character-card">
        <div className="portrait" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ transform: 'scale(.78) translateY(-6%)', position: 'absolute', bottom: 0 }}>
            {spriteFor(char.class)}
          </div>
          <div className="badge-level">Lv {char.level}</div>
        </div>
        <div className="col">
          <div className="flex between" style={{ alignItems: 'center' }}>
            <div>
              <h1 style={{ color: 'var(--gold-1)' }}>{char.name}</h1>
              <div className="muted" style={{ textTransform: 'uppercase', letterSpacing: '.12em', fontSize: 12 }}>
                {char.class} · Hero of the Realm
              </div>
            </div>
            <div className="flex gap-md" style={{ flexWrap: 'wrap' }}>
              <div className="tag gold">⚔ {derived.atk_min}-{derived.atk_max}</div>
              <div className="tag emerald">🛡 {derived.defense}</div>
              <div className="tag sapphire">⚡ {Math.round(derived.crit_chance * 100)}% crit</div>
              <div className="tag amethyst">🌀 {Math.round(derived.dodge_chance * 100)}% dodge</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <div className="tag" style={{ background: 'rgba(232,90,79,.12)', color: 'var(--crimson-1)', textAlign: 'center' }} title="Physical Damage bonus from gear, mounts, and enchants.">P-DMG +{derived.phys_dmg || 0}</div>
            <div className="tag" style={{ background: 'rgba(214,161,61,.12)', color: 'var(--gold-1)', textAlign: 'center' }} title="Physical Defense bonus.">P-DEF +{derived.phys_def || 0}</div>
            <div className="tag" style={{ background: 'rgba(194,148,255,.12)', color: '#c294ff', textAlign: 'center' }} title="Magical Damage bonus.">M-DMG +{derived.mag_dmg || 0}</div>
            <div className="tag" style={{ background: 'rgba(106,167,255,.12)', color: 'var(--azure-1)', textAlign: 'center' }} title="Magical Defense bonus.">M-DEF +{derived.mag_def || 0}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <BarRow label="Experience" pct={pct} text={`${char.xp - xpCurrent} / ${xpForNext - xpCurrent}`} kind="xp" />
            <BarRow label="Health" pct={(char.hp / char.hp_max) * 100} text={`${char.hp} / ${char.hp_max}`} kind="hp" />
            <BarRow label="Mana" pct={(char.mp / char.mp_max) * 100} text={`${char.mp} / ${char.mp_max}`} kind="mp" />
          </div>

          <div className="stat-grid">
            <StatCell label="STR" value={char.strength} />
            <StatCell label="DEX" value={char.dexterity} />
            <StatCell label="CON" value={char.constitution} />
            <StatCell label="INT" value={char.intelligence} />
            <StatCell label="WIS" value={char.wisdom} />
            <StatCell label="CHA" value={char.charisma} />
          </div>

          {(char.stat_points > 0 || char.skill_points > 0) && (
            <div className="card" style={{ borderColor: 'var(--gold-3)', background: 'rgba(214,161,61,.06)' }}>
              <div className="flex between">
                <div>
                  <strong style={{ color: 'var(--gold-1)' }}>Unspent points available</strong>
                  <div className="muted text-sm">{char.stat_points} stat · {char.skill_points} skill</div>
                </div>
                <Link to="/app/character" className="btn btn-primary btn-sm">Allocate</Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Recent Adventures</h2>
            <Link to="/app/quests" className="btn btn-sm">Find Quests</Link>
          </div>
          {questLog.length === 0 ? (
            <div className="muted">No completed quests yet. Step into the world.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {questLog.slice(0, 8).map((e) => (
                <div key={e.id} className="card" style={{ padding: 12 }}>
                  <div className="flex between">
                    <div>
                      <strong style={{ color: 'var(--text-1)' }}>{e.title}</strong>
                      <div className="muted text-sm">{prettyRegion(e.region)}</div>
                    </div>
                    <span className={`tag ${e.result === 'success' ? 'emerald' : 'crimson'}`}>{e.result}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Royal Dispatches</h2>
            <Link to="/app/mail" className="btn btn-sm">All Mail</Link>
          </div>
          {mail.length === 0 ? (
            <div className="muted">The courier brings no news.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mail.slice(0, 5).map((m) => (
                <div key={m.id} className="card">
                  <div className="flex between">
                    <div>
                      <strong style={{ color: 'var(--text-1)' }}>{m.subject}</strong>
                      <div className="muted text-sm">From {m.from_name}</div>
                    </div>
                    {!m.read_at && <span className="tag gold">New</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-cell">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

function BarRow({ label, pct, text, kind }: { label: string; pct: number; text: string; kind: 'hp' | 'mp' | 'energy' | 'xp' }) {
  return (
    <div>
      <div className="flex between" style={{ marginBottom: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)' }}>
        <span>{label}</span>
        <span style={{ color: 'var(--text-2)' }}>{text}</span>
      </div>
      <div className="bar" style={{ height: 12 }}>
        <div className={`bar-fill ${kind}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function prettyRegion(slug: string): string {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
