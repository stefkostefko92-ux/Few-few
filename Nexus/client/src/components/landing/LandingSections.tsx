import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KeyArt } from './KeyArt';
import { REGIONS, regionArt, dangerOf, KEY_ART } from '../../lib/regions';

/** Заглавен блок по шаблона: kicker + двуредово заглавие (втори ред приглушен) + кратък лийд. */
function Heading({ kicker, a, b, lead }: { kicker: string; a: string; b: string; lead: string }): React.ReactElement {
  return (
    <div className="nd-heading reveal">
      <div><div className="nd-kicker">{kicker}</div><h2>{a}<br /><span>{b}</span></h2></div>
      <p>{lead}</p>
    </div>
  );
}

export function WorldSection(): React.ReactElement {
  const { t } = useTranslation();
  const feats = [1, 2, 3] as const;
  return (
    <section className="nd-section nd-world" id="world">
      <Heading kicker={t('nd.world.kicker')} a={t('nd.world.h2a')} b={t('nd.world.h2b')} lead={t('nd.world.lead')} />
      <div className="nd-world-showcase reveal">
        <div className="nd-world-image">
          <KeyArt alt={t('nd.hero.artAlt')} />
          <div className="nd-image-vignette" aria-hidden />
          <span className="nd-image-coordinate">{t('nd.world.coord')}</span>
        </div>
        <div className="nd-world-panel">
          <div className="nd-panel-topline"><span>{t('nd.world.report')}</span><span className="nd-tiny-status"><i />{t('nd.world.status')}</span></div>
          <h3>{t('nd.world.h3a')}<br />{t('nd.world.h3b')}</h3>
          <p>{t('nd.world.body')}</p>
          <div className="nd-feature-list">
            {feats.map((n) => (
              <div key={n}>
                <span className="nd-feature-number">0{n}</span>
                <span><strong>{t(`nd.world.f${n}t`)}</strong><small>{t(`nd.world.f${n}d`)}</small></span>
                <span className="nd-list-arrow" aria-hidden>↗</span>
              </div>
            ))}
          </div>
          <a className="nd-text-link" href="#systems">{t('nd.world.link')} <span aria-hidden>→</span></a>
        </div>
      </div>
    </section>
  );
}

const CLASSES = [
  { id: 'warrior', glyph: '✧', tone: 'cyan', stats: 'STR 9 · CON 8 · DEX 5' },
  { id: 'ranger', glyph: '⌁', tone: 'jade', stats: 'DEX 9 · CON 6 · WIS 5' },
  { id: 'mage', glyph: '◈', tone: 'violet', stats: 'INT 9 · WIS 8 · CON 5' },
  { id: 'rogue', glyph: '◇', tone: 'gold', stats: 'DEX 8 · CON 6 · CHA 6' },
] as const;

const TAGLINE_KEY: Record<string, string> = {
  warrior: 'landing.classWarriorTagline', ranger: 'landing.classRangerTagline', mage: 'landing.classMageTagline', rogue: 'landing.classRogueTagline',
};

export function ClassSection(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <section className="nd-section nd-classes" id="classes">
      <Heading kicker={t('nd.classes.kicker')} a={t('nd.classes.h2a')} b={t('nd.classes.h2b')} lead={t('nd.classes.lead')} />
      <div className="nd-class-grid">
        {CLASSES.map((c, i) => {
          const name = t(`charCreate.classes.${c.id}.name`);
          return (
            <article className="nd-class-card reveal" key={c.id} data-tone={c.tone}>
              <div className="nd-class-top"><span>{t('nd.classes.archetype', { n: `0${i + 1}` })}</span><span className="nd-class-symbol" aria-hidden>✦</span></div>
              <div className="nd-class-emblem" aria-hidden><span>{c.glyph}</span></div>
              <div className="nd-class-meta">{t(`nd.classes.${c.id}Meta`)}</div>
              <h3>{name}</h3>
              <p>{t(TAGLINE_KEY[c.id])}</p>
              <div className="nd-class-tags">
                {(t(`nd.classes.${c.id}Tags`, { returnObjects: true }) as string[]).map((tag) => <span key={tag}>{tag}</span>)}
              </div>
              <div className="nd-class-stats">{c.stats}</div>
              <Link to="/register" className="nd-class-link" aria-label={t('nd.classes.pick', { name })}>↗</Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const ICONS: Record<string, React.ReactElement> = {
  combat: <path d="m14.5 6.5 3-3 3 3-3 3zM4 20l9.7-9.7M8.5 5.5l10 10M5 8l3-3 11 11-3 3z" />,
  dungeon: <><path d="M12 3 20 7.5 12 12 4 7.5 12 3Z" /><path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5" /></>,
  arena: <path d="M12 3 14.8 8.7 21 9.6l-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
  guild: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  auction: <path d="M3 7h18v13H3zM3 7l2-4h14l2 4M8 11h8M8 15h5" />,
  tower: <><path d="M12 3 4 7v5c0 5 3.5 8 8 9 4.5-1 8-4 8-9V7l-8-3Z" /><path d="M8 12h8M12 8v8" /></>,
};

const SYSTEMS = [
  { icon: 'combat', title: 'landing.featCombatTitle', body: 'landing.featCombatBody', href: '#duel' },
  { icon: 'dungeon', title: 'landing.featDungeonsTitle', body: 'landing.featDungeonsBody', href: '/register' },
  { icon: 'arena', title: 'landing.featArenaTitle', body: 'landing.featArenaBody', href: '/register' },
  { icon: 'guild', title: 'landing.featGuildsTitle', body: 'landing.featGuildsBody', href: '/register' },
  { icon: 'auction', title: 'landing.egAuctionTitle', body: 'landing.egAuctionBody', href: '/register' },
  { icon: 'tower', title: 'landing.egTowerTitle', body: 'landing.egTowerBody', href: '/register' },
] as const;

export function SystemsSection(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <section className="nd-features" id="systems">
      <div className="nd-section">
        <Heading kicker={t('nd.systems.kicker')} a={t('nd.systems.h2a')} b={t('nd.systems.h2b')} lead={t('nd.systems.lead')} />
        <div className="nd-feature-grid">
          {SYSTEMS.map((s, i) => (
            <article className="nd-feature-card reveal" key={s.icon}>
              <div className="nd-feature-icon"><svg viewBox="0 0 24 24" aria-hidden>{ICONS[s.icon]}</svg></div>
              <span className="nd-feature-count">{t('nd.systems.label', { n: `0${i + 1}` })}</span>
              <h3>{t(s.title)}</h3>
              <p>{t(s.body)}</p>
              {s.href.startsWith('#')
                ? <a href={s.href} className="nd-feature-more">{t('nd.systems.explore')} <span aria-hidden>↗</span></a>
                : <Link to={s.href} className="nd-feature-more">{t('nd.systems.explore')} <span aria-hidden>↗</span></Link>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RegionsSection(): React.ReactElement {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(0);
  const r = REGIONS[idx];
  const name = t(`world.regions.${r.slug}.name`, { defaultValue: r.name });
  const lore = t(`world.regions.${r.slug}.lore`, { defaultValue: r.lore });
  const danger = dangerOf(r);
  const dangerKey = { low: 'dangerLow', mid: 'dangerMid', high: 'dangerHigh', end: 'dangerEnd' }[danger];
  const num = String(idx + 1).padStart(2, '0');
  return (
    <section className="nd-section nd-regions" id="regions">
      <Heading kicker={t('nd.regions.kicker')} a={t('nd.regions.h2a')} b={t('nd.regions.h2b')} lead={t('nd.regions.lead')} />
      <div className="nd-region-board reveal" style={{ ['--biome' as string]: r.color }}>
        <div className="nd-region-art">
          <img
            key={r.slug}
            src={regionArt(r.slug)}
            alt={t('nd.regions.artAlt', { name })}
            width={1600}
            height={900}
            loading="lazy"
            decoding="async"
            onError={(e) => { const img = e.currentTarget; if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = KEY_ART; } }}
          />
          <div className="nd-region-gradient" aria-hidden />
          <div className="nd-region-label"><span>{t('nd.regions.archive', { n: num })}</span><strong>{name}</strong></div>
          <div className="nd-region-seal" aria-hidden>ND<span>✦</span>{num}</div>
        </div>
        <div className="nd-region-details">
          <div className="nd-region-detail-heading">
            <span className="nd-kicker">{t('nd.regions.dossier')}</span>
            <span className={`nd-danger nd-danger-${danger}`}><i />{t(`nd.regions.${dangerKey}`)}</span>
          </div>
          <h3>{name}</h3>
          <p>{lore}</p>
          <div className="nd-region-stats">
            <div><span>{t('nd.regions.statLevels')}</span><strong>{r.minLevel}–{r.maxLevel}</strong></div>
            <div><span>{t('nd.regions.statOrder')}</span><strong>{num} <small>{t('nd.regions.ofTotal', { total: REGIONS.length })}</small></strong></div>
            <div><span>{t('nd.regions.statAccess')}</span><strong>{t('nd.regions.browser')} <small>{t('nd.regions.browserSub')}</small></strong></div>
          </div>
          <Link to="/register" className="nd-btn nd-btn-outline">{t('nd.regions.prepare')} <span aria-hidden>↗</span></Link>
        </div>
      </div>
      <div className="nd-region-strip reveal" role="tablist" aria-label={t('nd.regions.pickRegion')}>
        {REGIONS.map((reg, i) => (
          <button
            key={reg.slug}
            type="button"
            role="tab"
            aria-selected={i === idx}
            className={i === idx ? 'active' : undefined}
            style={{ ['--biome' as string]: reg.color }}
            onClick={() => setIdx(i)}
          >
            <span className="nd-strip-num">{String(i + 1).padStart(2, '0')}</span>
            <span className="nd-strip-name">{t(`world.regions.${reg.slug}.name`, { defaultValue: reg.name })}</span>
            <span className="nd-strip-lv">{reg.minLevel}–{reg.maxLevel}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function EnterSection(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <section className="nd-enter" id="enter">
      <KeyArt className="nd-enter-art" alt="" />
      <div className="nd-enter-shade" aria-hidden />
      <div className="nd-enter-orbit" aria-hidden />
      <div className="nd-enter-content reveal">
        <div className="nd-kicker">{t('nd.enter.kicker')}</div>
        <h2>{t('nd.enter.h2a')}<br /><span>{t('nd.enter.h2b')}</span></h2>
        <p>{t('nd.enter.body')}</p>
        <div className="nd-hero-buttons">
          <Link className="nd-btn nd-btn-primary nd-btn-large" to="/register"><span>{t('nd.enter.cta')}</span><span className="nd-btn-arrow" aria-hidden>↗</span></Link>
          <a className="nd-btn nd-btn-ghost nd-btn-large" href="#faq">{t('nd.enter.faq')}</a>
        </div>
        <small className="nd-enter-foot">{t('nd.enter.foot')}</small>
      </div>
    </section>
  );
}

export function FaqSection(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <section className="nd-section nd-faq" id="faq">
      <Heading kicker={t('nd.faq.kicker')} a={t('nd.faq.h2a')} b={t('nd.faq.h2b')} lead={t('nd.faq.lead')} />
      <div className="nd-faq-list reveal">
        {[1, 2, 3, 4, 5].map((n) => (
          <details key={n}>
            <summary>{t(`nd.faq.q${n}`)}<span aria-hidden>+</span></summary>
            <p>{t(`nd.faq.a${n}`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
