import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';
import { spriteFor } from '../combat/sprites';
import { api } from '../lib/api';

export default function Dashboard(): React.ReactElement {
  const { t } = useTranslation();
  const char = useStore((s) => s.character);
  const derived = useStore((s) => s.derived);
  const [questLog, setQuestLog] = useState<any[]>([]);
  const [mail, setMail] = useState<any[]>([]);

  useEffect(() => {
    api.get('/quest/log').then((r) => setQuestLog(r.entries || [])).catch(() => {});
    api.get('/mail').then((r) => setMail(r.mails || [])).catch(() => {});
  }, []);

  if (!char || !derived) return <div className="muted">{t('common.loading')}</div>;

  const xpForNext = Math.floor(50 * Math.pow(char.level + 1, 1.7));
  const xpCurrent = Math.floor(50 * Math.pow(char.level, 1.7));
  const pct = Math.max(0, Math.min(100, ((char.xp - xpCurrent) / (xpForNext - xpCurrent)) * 100));

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="character-card">
        <div className="portrait portrait-photo">
          {/* HD class portrait — public-domain painting matched to the
              character class. Sized to "cover" the portrait box so the
              figure stays contained instead of bleeding past the frame. */}
          <img
            src={`/assets/icons/class-${char.class}.jpg`}
            alt={t('dashboard.portraitAlt', { className: t(`common.class.${char.class}`, { defaultValue: char.class }) })}
            className="portrait-img"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="portrait-shade" aria-hidden />
          <div className="badge-level">{t('common.lv')} {char.level}</div>
        </div>
        <div className="col">
          <div className="flex between" style={{ alignItems: 'center' }}>
            <div>
              <h1 style={{ color: 'var(--gold-1)' }}>{char.name}</h1>
              <div className="muted" style={{ textTransform: 'uppercase', letterSpacing: '.12em', fontSize: 12 }}>
                {t(`common.class.${char.class}`, { defaultValue: char.class })} · {t('dashboard.heroOfTheRealm')}
              </div>
            </div>
            <div className="flex gap-md" style={{ flexWrap: 'wrap' }}>
              <div className="tag gold">⚔ {derived.atk_min}-{derived.atk_max}</div>
              <div className="tag emerald">🛡 {derived.defense}</div>
              <div className="tag sapphire">⚡ {t('dashboard.critTag', { pct: Math.round(derived.crit_chance * 100) })}</div>
              <div className="tag amethyst">🌀 {t('dashboard.dodgeTag', { pct: Math.round(derived.dodge_chance * 100) })}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <div className="tag" style={{ background: 'rgba(232,90,79,.12)', color: 'var(--crimson-1)', textAlign: 'center' }} title={t('dashboard.physDmgTip')}>{t('dashboard.pDmg')} +{derived.phys_dmg || 0}</div>
            <div className="tag" style={{ background: 'rgba(214,161,61,.12)', color: 'var(--gold-1)', textAlign: 'center' }} title={t('dashboard.physDefTip')}>{t('dashboard.pDef')} +{derived.phys_def || 0}</div>
            <div className="tag" style={{ background: 'rgba(194,148,255,.12)', color: '#c294ff', textAlign: 'center' }} title={t('dashboard.magDmgTip')}>{t('dashboard.mDmg')} +{derived.mag_dmg || 0}</div>
            <div className="tag" style={{ background: 'rgba(106,167,255,.12)', color: 'var(--azure-1)', textAlign: 'center' }} title={t('dashboard.magDefTip')}>{t('dashboard.mDef')} +{derived.mag_def || 0}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <BarRow label={t('dashboard.experience')} pct={pct} text={`${char.xp - xpCurrent} / ${xpForNext - xpCurrent}`} kind="xp" />
            <BarRow label={t('dashboard.health')} pct={(char.hp / char.hp_max) * 100} text={`${char.hp} / ${char.hp_max}`} kind="hp" />
            <BarRow label={t('dashboard.mana')} pct={(char.mp / char.mp_max) * 100} text={`${char.mp} / ${char.mp_max}`} kind="mp" />
          </div>

          <div className="stat-grid">
            <StatCell label={t('dashboard.stat.str')} value={char.strength} />
            <StatCell label={t('dashboard.stat.dex')} value={char.dexterity} />
            <StatCell label={t('dashboard.stat.con')} value={char.constitution} />
            <StatCell label={t('dashboard.stat.int')} value={char.intelligence} />
            <StatCell label={t('dashboard.stat.wis')} value={char.wisdom} />
            <StatCell label={t('dashboard.stat.cha')} value={char.charisma} />
          </div>

          {(char.stat_points > 0 || char.skill_points > 0) && (
            <div className="card" style={{ borderColor: 'var(--gold-3)', background: 'rgba(214,161,61,.06)' }}>
              <div className="flex between">
                <div>
                  <strong style={{ color: 'var(--gold-1)' }}>{t('dashboard.unspentTitle')}</strong>
                  <div className="muted text-sm">{t('dashboard.unspentDetail', { stat: char.stat_points, skill: char.skill_points })}</div>
                </div>
                <Link to="/app/character" className="btn btn-primary btn-sm">{t('dashboard.allocate')}</Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">{t('dashboard.recentAdventures')}</h2>
            <Link to="/app/quests" className="btn btn-sm">{t('dashboard.findQuests')}</Link>
          </div>
          {questLog.length === 0 ? (
            <div className="muted">{t('dashboard.noQuests')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {questLog.slice(0, 8).map((e) => (
                <div key={e.id} className="card" style={{ padding: 12 }}>
                  <div className="flex between">
                    <div>
                      <strong style={{ color: 'var(--text-1)' }}>{e.title}</strong>
                      <div className="muted text-sm">{prettyRegion(e.region)}</div>
                    </div>
                    <span className={`tag ${e.result === 'success' ? 'emerald' : 'crimson'}`}>{t(`dashboard.result.${e.result}`, { defaultValue: e.result })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">{t('dashboard.royalDispatches')}</h2>
            <Link to="/app/mail" className="btn btn-sm">{t('dashboard.allMail')}</Link>
          </div>
          {mail.length === 0 ? (
            <div className="muted">{t('dashboard.noMail')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mail.slice(0, 5).map((m) => (
                <div key={m.id} className="card">
                  <div className="flex between">
                    <div>
                      <strong style={{ color: 'var(--text-1)' }}>{m.subject}</strong>
                      <div className="muted text-sm">{t('dashboard.from', { name: m.from_name })}</div>
                    </div>
                    {!m.read_at && <span className="tag gold">{t('dashboard.new')}</span>}
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
