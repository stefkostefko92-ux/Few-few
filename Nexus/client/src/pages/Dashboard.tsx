import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';
import { spriteFor } from '../combat/sprites';
import { api } from '../lib/api';
import { KEY_ART, REGIONS, regionArt, regionForLevel } from '../lib/regions';
import '../styles/hub.css';

export default function Dashboard(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const char = useStore((s) => s.character);
  const derived = useStore((s) => s.derived);
  const [questLog, setQuestLog] = useState<any[]>([]);
  const [mail, setMail] = useState<any[]>([]);

  useEffect(() => {
    api.get('/quest/log').then((r) => setQuestLog(r.entries || [])).catch(() => {});
    api.get('/mail').then((r) => setMail(r.mails || [])).catch(() => {});
  }, []);

  if (!char || !derived) return <div className="muted">{t('common.loading')}</div>;

  // Огледало на сървърната крива (server/src/game/progression.ts) и
  // Sidebar: xpForLevel(1) === 0 — суровата формула на ниво 1 даваше 50 и
  // барът изоставаше от Sidebar-а.
  const xpForLevel = (lvl: number) => (lvl <= 1 ? 0 : Math.floor(50 * Math.pow(lvl, 1.7)));
  const xpForNext = xpForLevel(char.level + 1);
  const xpCurrent = xpForLevel(char.level);
  const pct = Math.max(0, Math.min(100, ((char.xp - xpCurrent) / (xpForNext - xpCurrent)) * 100));
  // char.xp идва от сървъра по собствена крива на нивелиране; тази клиентска
  // формула е само за прогрес-бара и може да не съвпадне 1:1 (напр. herald
  // акаунти със ръчно зададени нива за тест). pct вече е clamp-нат — текстът
  // трябва да е също, иначе играчът вижда "-11100 / 797" вместо реален прогрес.
  const xpIntoLevel = Math.max(0, char.xp - xpCurrent);
  const xpSpan = Math.max(1, xpForNext - xpCurrent);

  const region = regionForLevel(char.level);
  const regionNo = REGIONS.indexOf(region) + 1;
  const regionName = t(`world.regions.${region.slug}.name`, { defaultValue: region.name });
  const regionLore = t(`world.regions.${region.slug}.lore`, { defaultValue: region.lore });
  const today = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="col" style={{ gap: 24 }}>
      <header className="hub-welcome">
        <div className="hub-kicker">{today}<span aria-hidden className="hub-kicker-line" />{t('nd.hub.realm')}</div>
        <h1>{t('nd.hub.welcome')} <em>{char.name}</em></h1>
        <p>{t('nd.hub.sub')}</p>
      </header>

      <section className="hub-hero" aria-label={t('nd.hub.next')}>
        <img
          src={regionArt(region.slug)}
          alt={t('nd.hub.artAlt', { name: regionName })}
          onError={(e) => { const img = e.currentTarget; if (!img.src.endsWith(KEY_ART)) img.src = KEY_ART; }}
        />
        <div className="hub-hero-shade" aria-hidden />
        <div className="hub-hero-content">
          <span className="hub-hero-kicker"><i aria-hidden />{t('nd.hub.next')}</span>
          <h2>{regionName}</h2>
          <p>{regionLore}</p>
          <div className="hub-hero-actions">
            <Link to="/app/hunting" className="nd-app-btn nd-app-btn-primary">{t('nd.hub.hunt')} <span aria-hidden>↗</span></Link>
            <Link to="/app/world" className="nd-app-btn">{t('nd.hub.map')}</Link>
          </div>
        </div>
        <div className="hub-hero-side" aria-hidden>
          <span>{t('nd.hub.expedition', { n: pad(regionNo) })}</span>
          <strong>{t('nd.hub.levels', { min: region.minLevel, max: region.maxLevel })}</strong>
          <i />
        </div>
        <div className="hub-hero-bottom" aria-hidden>
          <span>{t('nd.hub.report')}</span>
          <span>{t('nd.hub.regions', { n: pad(regionNo) })}</span>
        </div>
      </section>

      <section className="hub-stats" aria-label={t('nd.hub.hero')}>
        <HubStat label={t('nd.hub.level')} glyph="♙" value={String(char.level)} note={t('nd.hub.xp', { pct: Math.floor(pct), next: char.level + 1 })} bar={pct} />
        <HubStat label={t('nd.hub.arena')} glyph="✧" value={char.arena_rating.toLocaleString(i18n.language)} note={t('nd.hub.record', { w: char.wins, l: char.losses })} />
        <HubStat label={t('nd.hub.gold')} glyph="◈" value={char.gold.toLocaleString(i18n.language)} note={t('nd.hub.slain', { n: (char.monsters_slain ?? 0).toLocaleString(i18n.language) })} tone="gold" />
        <HubStat label={t('nd.hub.energy')} glyph="⌁" value={`${char.energy}`} note={`${char.energy} / ${char.energy_max}`} bar={(char.energy / Math.max(1, char.energy_max)) * 100} />
      </section>

      <div className="hub-section-kicker">{t('nd.hub.hero')}</div>
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
                {t(`common.class.${char.class}`, { defaultValue: char.class })}{(char as any).current_title ? ` · ${(char as any).current_title}` : ''}
              </div>
            </div>
            <div className="flex gap-md" style={{ flexWrap: 'wrap' }}>
              <div className="tag gold">⚔ {derived.atk_min}-{derived.atk_max}</div>
              <div className="tag emerald">🛡 {derived.defense}</div>
              <div className="tag sapphire">⚡ {t('dashboard.critTag', { pct: Math.round(derived.crit_chance * 100) })}</div>
              <div className="tag amethyst">🌀 {t('dashboard.dodgeTag', { pct: Math.round(derived.dodge_chance * 100) })}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
            <div className="tag" style={{ background: 'rgba(232,90,79,.12)', color: 'var(--crimson-1)', textAlign: 'center' }} title={t('dashboard.physDmgTip')}>{t('dashboard.pDmg')} +{derived.phys_dmg || 0}</div>
            <div className="tag" style={{ background: 'rgba(214,161,61,.12)', color: 'var(--gold-1)', textAlign: 'center' }} title={t('dashboard.physDefTip')}>{t('dashboard.pDef')} +{derived.phys_def || 0}</div>
            <div className="tag" style={{ background: 'rgba(194,148,255,.12)', color: '#c294ff', textAlign: 'center' }} title={t('dashboard.magDmgTip')}>{t('dashboard.mDmg')} +{derived.mag_dmg || 0}</div>
            <div className="tag" style={{ background: 'rgba(106,167,255,.12)', color: 'var(--azure-1)', textAlign: 'center' }} title={t('dashboard.magDefTip')}>{t('dashboard.mDef')} +{derived.mag_def || 0}</div>
          </div>

          <div className="dash-bar-grid">
            <BarRow label={t('dashboard.experience')} pct={pct} text={`${xpIntoLevel} / ${xpSpan}`} kind="xp" />
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

        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="hub-panel-kicker">{t('nd.hub.chronicle')}</span>
              <h2 className="panel-title">{t('dashboard.recentAdventures')}</h2>
            </div>
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
            <div>
              <span className="hub-panel-kicker">{t('nd.hub.dispatch')}</span>
              <h2 className="panel-title">{t('dashboard.royalDispatches')}</h2>
            </div>
            <Link to="/app/mail" className="btn btn-sm">{t('dashboard.allMail')}</Link>
          </div>
          {mail.length === 0 ? (
            <div className="muted">{t('dashboard.noMail')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mail.slice(0, 5).map((m) => (
                <div key={m.id} className="card">
                  {/* align-items: flex-start — .flex.between стяга (stretch) по подразбиране;
                      при дълго заглавие лявата колона расте на 3 реда и "Ново" плочката се
                      разтяга вертикално до овална капсула (потвърдено визуално, мобилен изглед). */}
                  <div className="flex between" style={{ alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ color: 'var(--text-1)' }}>{m.subject}</strong>
                      <div className="muted text-sm">{t('dashboard.from', { name: m.from_name })}</div>
                    </div>
                    {!m.read_at && <span className="tag gold" style={{ flexShrink: 0 }}>{t('dashboard.new')}</span>}
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

function HubStat({ label, glyph, value, note, bar, tone }: { label: string; glyph: string; value: string; note: string; bar?: number; tone?: 'gold' }) {
  return (
    <article className={`hub-stat${tone ? ` hub-stat-${tone}` : ''}`}>
      <div className="hub-stat-top"><span>{label}</span><span className="hub-stat-glyph" aria-hidden>{glyph}</span></div>
      <strong className="hub-stat-value">{value}</strong>
      <small className="hub-stat-note">{note}</small>
      {bar !== undefined && <div className="hub-stat-bar" aria-hidden><i style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} /></div>}
    </article>
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
      <div className="flex between" style={{ marginBottom: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)', flexWrap: 'wrap', gap: '2px 8px' }}>
        <span>{label}</span>
        <span style={{ color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{text}</span>
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
