import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { WarriorSprite, RangerSprite, MageSprite, RogueSprite } from '../combat/sprites';

const CLASSES = [
  {
    key: 'warrior',
    name: 'Warrior',
    tagline: 'Steel and oath. The shield of the realm.',
    sprite: <WarriorSprite />,
    stats: { STR: 9, DEX: 5, CON: 8, INT: 3, WIS: 4 },
    desc: 'Heavy armor, devastating melee, sturdy. Excels with sword and shield.',
  },
  {
    key: 'ranger',
    name: 'Ranger',
    tagline: 'The arrow finds what the eye sees.',
    sprite: <RangerSprite />,
    stats: { STR: 5, DEX: 9, CON: 6, INT: 4, WIS: 5 },
    desc: 'Fast, precise, deadly at range. Strikes first; dodges what comes back.',
  },
  {
    key: 'mage',
    name: 'Mage',
    tagline: 'The world bends to the disciplined mind.',
    sprite: <MageSprite />,
    stats: { STR: 3, DEX: 4, CON: 5, INT: 9, WIS: 8 },
    desc: 'Fragile of frame, fearsome with spell. Channels arcane fire and storm.',
  },
  {
    key: 'rogue',
    name: 'Rogue',
    tagline: 'The unseen blade. The patient hand.',
    sprite: <RogueSprite />,
    stats: { STR: 5, DEX: 8, CON: 6, INT: 5, WIS: 4 },
    desc: 'Strikes from shadow, slips out of reach. High crit, high evasion.',
  },
] as const;

export default function CharacterCreate(): React.ReactElement {
  const navigate = useNavigate();
  const setCharacter = useStore((s) => s.setCharacter);
  const refresh = useStore((s) => s.refreshCharacter);
  const toast = useStore((s) => s.toast);
  const [chosen, setChosen] = useState<(typeof CLASSES)[number]['key']>('warrior');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api.post('/character/create', { name, class: chosen });
      setCharacter(r.character);
      await refresh();
      toast(`${name} steps into the world.`, 'success');
      navigate('/app');
    } catch (ex: any) {
      setErr(ex.message || 'Could not create character');
    } finally {
      setBusy(false);
    }
  }

  const choice = CLASSES.find((c) => c.key === chosen)!;

  return (
    <div style={{ minHeight: '100vh', padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h1 className="panel-title">Choose Your Path</h1>
            <div className="panel-subtitle">Your class shapes how the world will resist you.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {CLASSES.map((c) => (
            <div
              key={c.key}
              className="card"
              style={{
                cursor: 'pointer',
                borderColor: c.key === chosen ? 'var(--gold-2)' : undefined,
                boxShadow: c.key === chosen ? '0 0 28px rgba(214,161,61,.3)' : undefined,
                background: c.key === chosen ? 'linear-gradient(180deg, #221a0a, #0c0a05)' : undefined,
              }}
              onClick={() => setChosen(c.key)}
            >
              <div style={{ display: 'flex', justifyContent: 'center', height: 180, alignItems: 'flex-end' }}>
                {React.cloneElement(c.sprite, { className: 'fighter-svg' })}
              </div>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>{c.name}</h3>
                <p className="muted text-sm" style={{ marginTop: 4 }}>{c.tagline}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="panel-divider" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <h3 style={{ color: 'var(--text-1)' }}>{choice.name}</h3>
            <p className="muted">{choice.desc}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginTop: 16 }}>
              {Object.entries(choice.stats).map(([k, v]) => (
                <div key={k} className="stat-cell" style={{ flexDirection: 'column', textAlign: 'center' }}>
                  <div className="label">{k}</div>
                  <div className="value">{v}</div>
                </div>
              ))}
            </div>
          </div>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field">
              <label>Hero name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tyrian, Lyra, Vorth…"
                pattern="[a-zA-Z][a-zA-Z0-9_]*"
                minLength={3}
                maxLength={20}
                required
              />
              <div className="muted text-sm">3-20 chars, letters/numbers. Must be unique.</div>
              {err && <div className="error">{err}</div>}
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Forging…' : 'Begin your tale'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
