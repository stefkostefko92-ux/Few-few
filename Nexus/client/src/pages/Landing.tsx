import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Logo from '../components/Logo';
import LandingEffects from '../components/LandingEffects';
import CinematicIntro from '../components/CinematicIntro';
import LanguageSelector from '../components/LanguageSelector';
import '../styles/landing.css';

// Per-locale page titles + descriptions. Picked up at mount based on
// ?lang= or the user's browser language, and written into the actual
// document <title> / <meta name="description"> so search engines and AI
// crawlers serving Italian / Bulgarian queries see locale-targeted copy
// rather than the English default.
const LOCALES: Record<string, { html: string; title: string; description: string }> = {
  en: {
    html: 'en',
    title: 'Nexus Dominion — Free Browser MMORPG',
    description: 'Server-authoritative turn-based MMORPG. Four classes, 350 levels of roster, ELO arena, real-time auction, five-tier guilds. Free, browser-based, no installer.',
  },
  it: {
    html: 'it-IT',
    title: 'Nexus Dominion — MMORPG da browser, gratuito',
    description: "MMORPG con combattimenti a turni validati dal server. Quattro classi, 350 livelli di mostri, arena ELO, casa d'aste in tempo reale, gilde a cinque livelli. Gratuito, senza installazione.",
  },
  bg: {
    html: 'bg-BG',
    title: 'Nexus Dominion — Безплатна браузърна ММОРПГ',
    description: 'Пошагова ММОРПГ, валидирана на сървъра. Четири класа, 350 нива монстри, ELO арена, аукцион в реално време, гилдии на пет нива. Безплатна, без инсталация.',
  },
};

function pickLocale(): string {
  if (typeof window === 'undefined') return 'en';
  const q = new URLSearchParams(window.location.search).get('lang');
  if (q && LOCALES[q]) return q;
  const nav = navigator.language?.slice(0, 2).toLowerCase();
  if (nav && LOCALES[nav]) return nav;
  return 'en';
}

function SplitText({ text }: { text: string }) {
  const words = text.split(' ');
  let idx = 0;
  return (
    <>
      {words.map((w, wi) => (
        // Интервалът е margin, не текстов възел — в flex контейнер голият
        // ' ' между inline-block думите се колабира (виж БГ „Кралство с…").
        <span key={wi} className="word" style={wi < words.length - 1 ? { marginRight: '0.28em' } : undefined}>
          {Array.from(w).map((ch) => {
            const i = idx++;
            return (
              <span key={i} className="letter" style={{ animationDelay: `${0.25 + i * 0.04}s` }}>
                {ch}
              </span>
            );
          })}
          {wi < words.length - 1 && ' '}
        </span>
      ))}
    </>
  );
}

export default function Landing(): React.ReactElement {
  const { t } = useTranslation();
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return sessionStorage.getItem('nd_intro_seen') !== '1'; } catch { return true; }
  });
  // Locale: pick from ?lang= → browser default → English, then rewrite
  // <html lang>, <title> and <meta name="description"> so search engines and
  // share previews pick up the right language for IT / BG visitors.
  useEffect(() => {
    const loc = LOCALES[pickLocale()];
    document.documentElement.lang = loc.html;
    document.title = loc.title;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', loc.description);
  }, []);
  return (
    <div className="landing">
      {showIntro && <CinematicIntro onDone={() => setShowIntro(false)} />}
      <LandingEffects />

      {/* Top nav */}
      <header className="landing-nav">
        <Logo size={36} withWordmark />
        <nav className="landing-nav-links">
          <a href="#features">{t('landing.navFeatures')}</a>
          <a href="#classes">{t('landing.navClasses')}</a>
          <a href="#sets">{t('landing.navSets')}</a>
          <a href="#endgame">{t('landing.navEndgame')}</a>
          <a href="#guilds">{t('landing.navGuilds')}</a>
          <a href="#world">{t('landing.navWorld')}</a>
          <a href="#roadmap">{t('landing.navRoadmap')}</a>
        </nav>
        <div className="landing-nav-cta">
          <LanguageSelector />
          <Link to="/login" className="btn btn-ghost">{t('nav.login')}</Link>
          <Link to="/register" className="btn btn-primary">{t('landing.playFree')}</Link>
        </div>
      </header>

      {/* HERO — full-bleed video background instead of SVG sprites.
          Drone aerial of Rhuddlan Castle (CC BY-SA 4.0, Wikimedia
          Commons; see /assets/video/CREDITS.md). poster fallback for
          autoplay-restricted iOS. */}
      <section className="hero hero-video">
        <video
          className="hero-video-bg"
          src="/assets/video/hero.mp4"
          poster="/assets/video/hero-poster.jpg"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-hidden
        >
          <source src="/assets/video/hero.webm" type="video/webm" />
          <source src="/assets/video/hero.mp4"  type="video/mp4" />
        </video>
        <div className="hero-video-shade" aria-hidden />
        <div className="hero-video-vignette" aria-hidden />

        <div className="hero-content">
          <div className="hero-logo" data-parallax="20">
            <Logo size={120} />
          </div>
          <div className="hero-eyebrow">{t('landing.heroEyebrow')}</div>
          <h1 className="hero-title">
            <SplitText text="Nexus Dominion" />
            <em><SplitText text={t('landing.heroTagline')} /></em>
          </h1>
          <p className="hero-subtitle" data-reveal>
            {t('landing.heroSubtitle')}
          </p>
          <div className="hero-cta" data-reveal>
            <Link to="/register" className="btn btn-primary btn-hero">{t('landing.heroCtaPlay')}</Link>
            <a href="#features" className="btn btn-hero">{t('landing.heroCtaHow')}</a>
          </div>
          <div className="hero-credit">
            {t('landing.footageBy', { author: 'Llywelyn2000' })} · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="stats-strip" data-reveal data-reveal-stagger>
        <Stat num="4" label={t('landing.statClasses')} />
        <Stat num="8" label={t('landing.statSets')} />
        <Stat num="12+12" label={t('landing.statCosmetics')} />
        <Stat num="∞" label={t('landing.statGuildWars')} />
        <Stat num="3" label={t('landing.statRaidBosses')} />
        <Stat num="27" label={t('landing.statAchievements')} />
      </section>

      {/* Features */}
      <section id="features" className="section">
        <div className="section-eyebrow" data-reveal>{t('landing.featuresEyebrow')}</div>
        <h2 className="section-title" data-reveal>{t('landing.featuresTitle')}</h2>
        <p className="section-lead" data-reveal>
          {t('landing.featuresLead')}
        </p>
        <div className="feature-grid" data-reveal-stagger>
          <FeatureCard iconSrc="/assets/icons/sword-t6.jpg" title={t('landing.featCombatTitle')}>
            {t('landing.featCombatBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/shield-t6.jpg" title={t('landing.featGuildsTitle')}>
            {t('landing.featGuildsBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/dagger-t4.jpg" title={t('landing.featQuestsTitle')}>
            {t('landing.featQuestsBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/icon-portal.jpg" title={t('landing.featDungeonsTitle')}>
            {t('landing.featDungeonsBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/cloak-t8.jpg" title={t('landing.featCosmeticsTitle')}>
            {t('landing.featCosmeticsBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/helm-t6.jpg" title={t('landing.featProfilesTitle')}>
            {t('landing.featProfilesBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/bow-t6.jpg" title={t('landing.featHuntingTitle')}>
            {t('landing.featHuntingBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/sword-t10.jpg" title={t('landing.featArenaTitle')}>
            {t('landing.featArenaBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/icon-flame.jpg" title={t('landing.featDailyTitle')}>
            {t('landing.featDailyBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/icon-vortex.jpg" title={t('landing.featWheelTitle')}>
            {t('landing.featWheelBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/gem-t8.jpg" title={t('landing.featAchievementsTitle')}>
            {t('landing.featAchievementsBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/ring-t8.jpg" title={t('landing.featSetsTitle')}>
            {t('landing.featSetsBody')}
          </FeatureCard>
        </div>
      </section>

      {/* Classes */}
      <section id="classes" className="section">
        <div className="section-eyebrow" data-reveal>{t('landing.classesEyebrow')}</div>
        <h2 className="section-title" data-reveal>{t('landing.classesTitle')}</h2>
        <p className="section-lead" data-reveal>
          {t('landing.classesLead')}
        </p>
        <div className="class-grid" data-reveal-stagger>
          <ClassCard portrait="/assets/icons/class-warrior.jpg" name={t('charCreate.classes.warrior.name')} tagline={t('landing.classWarriorTagline')} stats={[['STR', 9], ['CON', 8], ['DEX', 5]]} />
          <ClassCard portrait="/assets/icons/class-ranger.jpg"  name={t('charCreate.classes.ranger.name')}  tagline={t('landing.classRangerTagline')} stats={[['DEX', 9], ['CON', 6], ['WIS', 5]]} />
          <ClassCard portrait="/assets/icons/class-mage.jpg"    name={t('charCreate.classes.mage.name')}    tagline={t('landing.classMageTagline')} stats={[['INT', 9], ['WIS', 8], ['CON', 5]]} />
          <ClassCard portrait="/assets/icons/class-rogue.jpg"   name={t('charCreate.classes.rogue.name')}   tagline={t('landing.classRogueTagline')} stats={[['DEX', 8], ['CON', 6], ['CHA', 6]]} />
        </div>
      </section>

      {/* Item Sets — имената на комплектите са игрови данни и не се превеждат. */}
      <section id="sets" className="section">
        <div className="section-eyebrow" data-reveal>{t('landing.setsEyebrow')}</div>
        <h2 className="section-title" data-reveal>{t('landing.setsTitle')}</h2>
        <p className="section-lead" data-reveal>
          {t('landing.setsLead')}
        </p>
        <div className="set-grid" data-reveal-stagger>
          <SetCard rarity="common"    name="Wayfarer's Garb"     tier={t('landing.setWayfarerTier')}  iconSrc="/assets/icons/boots-t1.jpg"  lore={t('landing.setWayfarerLore')} bonuses={[['2', '+8 HP, +1 DEX'], ['4', '+18 HP, +2 DEX, +2 DEF']]} />
          <SetCard rarity="uncommon"  name="Ironguard Plate"     tier={t('landing.setIronguardTier')} iconSrc="/assets/icons/armor-t2.jpg"  lore={t('landing.setIronguardLore')} bonuses={[['2', '+25 HP, +2 STR'], ['4', '+55 HP, +6 DEF, +3 STR'], ['6', '+100 HP, +12 DEF, +5 STR, +4 ATK']]} />
          <SetCard rarity="uncommon"  name="Sylvan Marshal"      tier={t('landing.setSylvanTier')}    iconSrc="/assets/icons/bow-t2.jpg"    lore={t('landing.setSylvanLore')} bonuses={[['2', '+3 DEX, +3% Crit'], ['4', '+5 DEX, +4% Dodge, +3 ATK']]} />
          <SetCard rarity="uncommon"  name="Arcane Conclave"     tier={t('landing.setArcaneTier')}    iconSrc="/assets/icons/staff-t2.jpg"  lore={t('landing.setArcaneLore')} bonuses={[['2', '+25 MP, +3 INT'], ['4', '+50 MP, +5 INT, +3 WIS']]} />
          <SetCard rarity="uncommon"  name="Nightveil"           tier={t('landing.setNightveilTier')} iconSrc="/assets/icons/dagger-t2.jpg" lore={t('landing.setNightveilLore')} bonuses={[['2', '+3 DEX, +4% Dodge'], ['4', '+5 DEX, +5% Crit, +3 ATK']]} />
          <SetCard rarity="rare"      name="Sunforged Champion"  tier={t('landing.setSunforgedTier')} iconSrc="/assets/icons/sword-t6.jpg"  lore={t('landing.setSunforgedLore')} bonuses={[['2', '+80 HP, +4 STR'], ['4', '+180 HP, +18 DEF, +6 STR, +8 ATK']]} />
          <SetCard rarity="epic"      name="Voidshard Adept"     tier={t('landing.setVoidshardTier')} iconSrc="/assets/icons/staff-t8.jpg"  lore={t('landing.setVoidshardLore')} bonuses={[['2', '+60 MP, +6 INT'], ['4', '+120 MP, +10 INT, +8 WIS'], ['6', '+220 MP, +16 INT, +14 WIS, +16 ATK, +8% Crit']]} />
          <SetCard rarity="legendary" name="Solar Mythwoven"     tier={t('landing.setSolarTier')}     iconSrc="/assets/icons/sword-t10.jpg" lore={t('landing.setSolarLore')} bonuses={[['2', '+150 HP, +6 STR'], ['4', '+320 HP, +24 DEF, +10 STR, +14 ATK'], ['6', '+600 HP, +50 DEF, +18 STR, +30 ATK, +10% Crit, +5% Dodge']]} />
        </div>
      </section>

      {/* Endgame loops */}
      <section id="endgame" className="section">
        <div className="section-eyebrow" data-reveal>{t('landing.endgameEyebrow')}</div>
        <h2 className="section-title" data-reveal>{t('landing.endgameTitle')}</h2>
        <p className="section-lead" data-reveal>
          {t('landing.endgameLead')}
        </p>
        <div className="feature-grid" data-reveal-stagger>
          <FeatureCard iconSrc="/assets/icons/monster-dragon.jpg" title={t('landing.egRealmBossTitle')}>
            {t('landing.egRealmBossBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/icon-coin.jpg" title={t('landing.egFactionTitle')}>
            {t('landing.egFactionBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/sword-t10.jpg" title={t('landing.egApexTitle')}>
            {t('landing.egApexBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/icon-flame.jpg" title={t('landing.egTowerTitle')}>
            {t('landing.egTowerBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/gem-t8.jpg" title={t('landing.egCacheTitle')}>
            {t('landing.egCacheBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/icon-vortex.jpg" title={t('landing.egAuctionTitle')}>
            {t('landing.egAuctionBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/icon-portal.jpg" title={t('landing.egMythicTitle')}>
            {t('landing.egMythicBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/icon-flame.jpg" title={t('landing.egEventsTitle')}>
            {t('landing.egEventsBody')}
          </FeatureCard>
        </div>
      </section>

      {/* Mid-page rhythm break — second cinematic plate.
          Working blacksmith at Möhkö Ironworks (CC BY 3.0, Wikimedia
          Commons; see /assets/video/CREDITS.md). 21:9 stripe so it
          reads as a band, not a second hero. Looped, muted, no audio
          decoded. */}
      <section className="forge-band" aria-label={t('landing.forgeName')}>
        <video
          className="forge-band-bg"
          src="/assets/video/forge.mp4"
          poster="/assets/video/forge-poster.jpg"
          autoPlay loop muted playsInline preload="metadata"
          aria-hidden
        >
          <source src="/assets/video/forge.webm" type="video/webm" />
          <source src="/assets/video/forge.mp4"  type="video/mp4" />
        </video>
        <div className="forge-band-shade" aria-hidden />
        <div className="forge-band-copy">
          <div className="section-eyebrow">{t('landing.forgeName')}</div>
          <h2 className="section-title">{t('landing.forgeTitle')}</h2>
          <p className="forge-band-lead">
            {t('landing.forgeLead')}
          </p>
          <div className="forge-band-credit">
            {t('landing.footageBy', { author: 'Antti Makkonen' })} · <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>
          </div>
        </div>
      </section>

      {/* Guilds */}
      <section id="guilds" className="section">
        <div className="section-eyebrow" data-reveal>{t('landing.guildsEyebrow')}</div>
        <h2 className="section-title" data-reveal>{t('landing.guildsTitle')}</h2>
        <p className="section-lead" data-reveal>
          {t('landing.guildsLead')}
        </p>
        <div className="feature-grid" data-reveal-stagger>
          <FeatureCard iconSrc="/assets/icons/shield-t8.jpg" title={t('landing.gTiersTitle')}>
            {t('landing.gTiersBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/amulet-t5.jpg" title={t('landing.gChatTitle')}>
            {t('landing.gChatBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/axe-t7.jpg" title={t('landing.gWarsTitle')}>
            {t('landing.gWarsBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/monster-dragon.jpg" title={t('landing.gRaidsTitle')}>
            {t('landing.gRaidsBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/shield-t10.jpg" title={t('landing.gCrestTitle')}>
            {t('landing.gCrestBody')}
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/icon-coin.jpg" title={t('landing.gTreasuryTitle')}>
            {t('landing.gTreasuryBody')}
          </FeatureCard>
        </div>
      </section>

      {/* World — имената на регионите са игрови данни и не се превеждат. */}
      <section id="world" className="section">
        <div className="section-eyebrow" data-reveal>{t('landing.worldEyebrow')}</div>
        <h2 className="section-title" data-reveal>{t('landing.worldTitle')}</h2>
        <p className="section-lead" data-reveal>
          {t('landing.worldLead')}
        </p>
        <div className="region-row" data-reveal-stagger>
          <RegionCard color="#3f6a2c" art="/assets/regions/whispering_woods.jpg" name="Whispering Woods" range="Lv 1 – 5">{t('landing.regionWhisperingBody')}</RegionCard>
          <RegionCard color="#6e7a5c" art="/assets/regions/mistmoor_hills.jpg"   name="Mistmoor Hills"   range="Lv 6 – 10">{t('landing.regionMistmoorBody')}</RegionCard>
          <RegionCard color="#6aa7ff" art="/assets/regions/crystal_caverns.jpg"  name="Crystal Caverns"  range="Lv 10 – 15">{t('landing.regionCrystalBody')}</RegionCard>
          <RegionCard color="#c7641a" art="/assets/regions/ashen_wastes.jpg"     name="Ashen Wastes"     range="Lv 15 – 22">{t('landing.regionAshenBody')}</RegionCard>
          <RegionCard color="#6f3fb6" art="/assets/regions/shadowfell.jpg"       name="The Shadowfell"   range="Lv 24 – 25">{t('landing.regionShadowfellBody')}</RegionCard>
          <RegionCard color="#c7411a" art="/assets/regions/ashen_wastes.jpg"     name="Emberreach"       range="Lv 26 – 50">{t('landing.regionEmberreachBody')}</RegionCard>
          <RegionCard color="#7a5a3a" art="/assets/regions/crystal_caverns.jpg"  name="Hammerhand Pass"  range="Lv 50 – 75">{t('landing.regionHammerhandBody')}</RegionCard>
          <RegionCard color="#9a5ad0" art="/assets/regions/shadowfell.jpg"       name="Conclave of Aedric" range="Lv 75 – 105">{t('landing.regionConclaveBody')}</RegionCard>
          <RegionCard color="#3f8a6a" art="/assets/regions/mistmoor_hills.jpg"   name="Saltmarsh"         range="Lv 105 – 140">{t('landing.regionSaltmarshBody')}</RegionCard>
          <RegionCard color="#9ac7ff" art="/assets/regions/crystal_caverns.jpg"  name="Frostvale"         range="Lv 140 – 175">{t('landing.regionFrostvaleBody')}</RegionCard>
          <RegionCard color="#3a1a1a" art="/assets/regions/ashen_wastes.jpg"     name="Black Spire"       range="Lv 175 – 200">{t('landing.regionBlackSpireBody')}</RegionCard>
          <RegionCard color="#6aa7ff" art="/assets/regions/mistmoor_hills.jpg"   name="The Stormpeaks"    range="Lv 201 – 230">{t('landing.regionStormpeaksBody')}</RegionCard>
          <RegionCard color="#5a2c8a" art="/assets/regions/shadowfell.jpg"       name="Voidshade Hollow"  range="Lv 231 – 260">{t('landing.regionVoidshadeBody')}</RegionCard>
          <RegionCard color="#a0b8d0" art="/assets/regions/crystal_caverns.jpg"  name="Mooncradle"        range="Lv 261 – 290">{t('landing.regionMooncradleBody')}</RegionCard>
          <RegionCard color="#8a6a3a" art="/assets/regions/ashen_wastes.jpg"     name="The Worldspine"    range="Lv 291 – 320">{t('landing.regionWorldspineBody')}</RegionCard>
          <RegionCard color="#1a1a1a" art="/assets/regions/shadowfell.jpg"       name="The Eternal Throne" range="Lv 321 – 350">{t('landing.regionEternalBody')}</RegionCard>
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="section">
        <div className="section-eyebrow" data-reveal>{t('landing.roadmapEyebrow')}</div>
        <h2 className="section-title" data-reveal>{t('landing.roadmapTitle')}</h2>
        <div className="roadmap-track" data-reveal>
          <RoadmapStop state="shipped" when={t('landing.whenShipped')} what={t('landing.rmCoreTitle')}>
            {t('landing.rmCoreBody')}
          </RoadmapStop>
          <RoadmapStop state="shipped" when={t('landing.whenShipped')} what={t('landing.rmProfileTitle')}>
            {t('landing.rmProfileBody')}
          </RoadmapStop>
          <RoadmapStop state="shipped" when={t('landing.whenShipped')} what={t('landing.rmGuildsTitle')}>
            {t('landing.rmGuildsBody')}
          </RoadmapStop>
          <RoadmapStop state="now" when={t('landing.whenNow')} what={t('landing.rmCombatTitle')}>
            {t('landing.rmCombatBody')}
          </RoadmapStop>
          <RoadmapStop state="soon" when={t('landing.whenNext')} what={t('landing.rmCraftTitle')}>
            {t('landing.rmCraftBody')}
          </RoadmapStop>
          <RoadmapStop state="later" when={t('landing.whenLater')} what={t('landing.rmEventsTitle')}>
            {t('landing.rmEventsBody')}
          </RoadmapStop>
        </div>
      </section>

      {/* Final CTA */}
      <div className="final-cta" data-reveal="scale">
        <h2>{t('landing.finalTitle')}</h2>
        <p>{t('landing.finalBody')}</p>
        <div className="hero-cta">
          <Link to="/register" className="btn btn-primary btn-hero">{t('landing.finalCreate')}</Link>
          <Link to="/login" className="btn btn-hero">{t('landing.finalAlready')}</Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-grid">
          <div>
            <Logo size={40} withWordmark />
            <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, maxWidth: 320 }}>
              {t('landing.footerTagline')}
            </p>
          </div>
          <div>
            <h4>{t('landing.footerGame')}</h4>
            <a href="#features">{t('landing.navFeatures')}</a>
            <a href="#classes">{t('landing.navClasses')}</a>
            <a href="#sets">{t('landing.navSets')}</a>
            <a href="#guilds">{t('landing.navGuilds')}</a>
            <a href="#world">{t('landing.navWorld')}</a>
            <a href="#roadmap">{t('landing.navRoadmap')}</a>
          </div>
          <div>
            <h4>{t('landing.footerAccount')}</h4>
            <Link to="/register">{t('nav.register')}</Link>
            <Link to="/login">{t('nav.login')}</Link>
          </div>
          <div>
            <h4>{t('landing.footerStudio')}</h4>
            <Link to="/terms">{t('footer.terms')}</Link>
            <Link to="/privacy">{t('footer.privacy')}</Link>
            <a href="mailto:info@carbonstealth.eu">{t('footer.contactSupport')}</a>
            {/* GDPR Art. 7(3) + ePrivacy Art. 7 — withdrawal must be as easy
                as granting consent. Re-opens the cookie banner with the
                current state so the user can flip categories or reject all. */}
            <button
              type="button"
              onClick={() => { try { window.dispatchEvent(new CustomEvent('nd:open-cookie-banner')); } catch {} }}
              style={{ background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', textDecoration: 'underline', cursor: 'pointer', textAlign: 'left' }}
            >
              {t('footer.cookieSettings')}
            </button>
          </div>
        </div>
        <div className="footer-bottom">
          <span>{t('landing.footerCopyright')}</span>
          <span>{t('landing.footerMade')}</span>
        </div>
      </footer>
    </div>
  );
}

function Stat({ num, label }: { num: string; label: string }) {
  return (
    <div className="stat-pill">
      <div className="num">{num}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function FeatureCard({ iconSrc, title, children }: { iconSrc: string; title: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="feature-card" data-tilt>
      <div className="feature-icon feature-icon-img">
        <img src={iconSrc} alt={t('landing.iconAlt', { title })} loading="lazy" />
      </div>
      <h3 className="feature-title">{title}</h3>
      <p className="feature-desc">{children}</p>
    </div>
  );
}

function ClassCard({ portrait, name, tagline, stats }: { portrait: string; name: string; tagline: string; stats: [string, number][] }) {
  const { t } = useTranslation();
  return (
    <div className="class-card class-card-portrait" data-tilt>
      <div className="class-portrait-frame">
        {/* HD public-domain painting matched to the class (Vasnetsov
            Knight at the Crossroads / Waterhouse Magic Circle / Pyle
            Robin Hood plate / Frith Highwayman). Same images that
            drive the in-game Hero card, so the marketing surface and
            the gameplay surface share their visual identity. */}
        <img src={portrait} alt={t('landing.portraitAlt', { name })} loading="lazy" />
        <div className="class-portrait-shade" aria-hidden />
      </div>
      <h3>{name}</h3>
      <div className="tagline">{tagline}</div>
      <div className="stat-row">
        {stats.map(([k, v]) => (
          <div className="item" key={k}>
            <div className="label">{k}</div>
            <div className="val">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SetCard({ rarity, name, tier, iconSrc, lore, bonuses }: { rarity: string; name: string; tier: string; iconSrc: string; lore: string; bonuses: [string, string][] }) {
  const { t } = useTranslation();
  return (
    <div className="set-card" data-rarity={rarity} data-tilt>
      <div className="set-header">
        <div className="set-icon set-icon-img">
          <img src={iconSrc} alt={t('landing.iconAlt', { title: name })} loading="lazy" />
        </div>
        <div>
          <div className="set-name">{name}</div>
          <div className="set-tier">{tier}</div>
        </div>
      </div>
      <div className="set-lore">{lore}</div>
      <div className="set-bonuses">
        {bonuses.map(([n, b]) => (
          <div key={n} className="bonus-row">
            <div className="badge">{n}</div>
            <div className="text">{b}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegionCard({ color, art, name, range, children }: { color: string; art: string; name: string; range: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="region-card" data-tilt style={{ borderColor: color }}>
      {/* Painted region plate (Corot / Friedrich / Wright of Derby /
          John Martin), centre-cropped 1440×900 — see
          /assets/regions/CREDITS.md for full attribution. */}
      <div className="region-art">
        <img src={art} alt={t('landing.landscapeAlt', { name })} loading="lazy" />
        <div className="region-art-shade" style={{ background: `linear-gradient(180deg, transparent 35%, ${color}22 70%, rgba(11,13,18,.95) 100%)` }} aria-hidden />
      </div>
      <div className="region-body">
        <h3 className="feature-title">{name}</h3>
        <div className="tag" style={{ marginBottom: 10 }}>{range}</div>
        <p className="feature-desc">{children}</p>
      </div>
    </div>
  );
}

function RoadmapStop({ state, when, what, children }: { state: 'shipped' | 'now' | 'soon' | 'later'; when: string; what: string; children: React.ReactNode }) {
  return (
    <div className="roadmap-stop" data-state={state}>
      <div className="when">{when}</div>
      <div className="what">{what}</div>
      <div className="detail">{children}</div>
    </div>
  );
}
