import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { WarriorSprite, RangerSprite, MageSprite, RogueSprite } from '../combat/sprites';

// Име/девиз/описание идват от i18n (charCreate.classes.<key>.*).
const CLASSES = [
  {
    key: 'warrior',
    sprite: <WarriorSprite />,
    stats: { STR: 9, DEX: 5, CON: 8, INT: 3, WIS: 4 },
  },
  {
    key: 'ranger',
    sprite: <RangerSprite />,
    stats: { STR: 5, DEX: 9, CON: 6, INT: 4, WIS: 5 },
  },
  {
    key: 'mage',
    sprite: <MageSprite />,
    stats: { STR: 3, DEX: 4, CON: 5, INT: 9, WIS: 8 },
  },
  {
    key: 'rogue',
    sprite: <RogueSprite />,
    stats: { STR: 5, DEX: 8, CON: 6, INT: 5, WIS: 4 },
  },
] as const;

export default function CharacterCreate(): React.ReactElement {
  const { t } = useTranslation();
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
      toast(t('charCreate.stepsIntoWorld', { name }), 'success');
      navigate('/app');
    } catch (ex: any) {
      setErr(ex.message || t('charCreate.createFailed'));
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
            <h1 className="panel-title">{t('charCreate.title')}</h1>
            <div className="panel-subtitle">{t('charCreate.subtitle')}</div>
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
                <h3 style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>{t(`charCreate.classes.${c.key}.name`)}</h3>
                <p className="muted text-sm" style={{ marginTop: 4 }}>{t(`charCreate.classes.${c.key}.tagline`)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="panel-divider" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <h3 style={{ color: 'var(--text-1)' }}>{t(`charCreate.classes.${choice.key}.name`)}</h3>
            <p className="muted">{t(`charCreate.classes.${choice.key}.desc`)}</p>
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
              <label>{t('charCreate.heroName')}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('charCreate.namePlaceholder')}
                pattern="[a-zA-Z][a-zA-Z0-9_]*"
                minLength={3}
                maxLength={20}
                required
              />
              <div className="muted text-sm">{t('charCreate.nameHint')}</div>
              {err && <div className="error">{err}</div>}
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? t('auth.creatingButton') : t('charCreate.beginTale')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
