import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import LandingEffects from '../components/LandingEffects';
import CinematicIntro from '../components/CinematicIntro';
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
        <span key={wi} className="word">
          {Array.from(w).map((ch) => {
            const i = idx++;
            return (
              <span key={i} className="letter" style={{ animationDelay: `${0.25 + i * 0.04}s` }}>
                {ch}
              </span>
            );
          })}
          {wi < words.length - 1 && ' '}
        </span>
      ))}
    </>
  );
}

export default function Landing(): React.ReactElement {
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
          <a href="#features">Features</a>
          <a href="#classes">Classes</a>
          <a href="#sets">Item Sets</a>
          <a href="#guilds">Guilds</a>
          <a href="#world">World</a>
          <a href="#roadmap">Roadmap</a>
        </nav>
        <div className="landing-nav-cta">
          <Link to="/login" className="btn btn-ghost">Sign In</Link>
          <Link to="/register" className="btn btn-primary">Play Free</Link>
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
          <div className="hero-eyebrow">A Browser MMORPG · Free to Play · No Download</div>
          <h1 className="hero-title">
            <SplitText text="Nexus Dominion" />
            <em><SplitText text="A realm with a long memory." /></em>
          </h1>
          <p className="hero-subtitle" data-reveal>
            Four classes. Fifteen regions to push through. Ten tiers of gear, an ELO arena, an
            auction house that runs in real time, and a Tower of Trials whose leaderboard updates
            while you sleep. Free, browser-based, no installer. Sign up takes thirty seconds.
          </p>
          <div className="hero-cta" data-reveal>
            <Link to="/register" className="btn btn-primary btn-hero">Take Up The Sword</Link>
            <a href="#features" className="btn btn-hero">See How It Plays</a>
          </div>
          <div className="hero-credit">
            Footage by Llywelyn2000 · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="stats-strip" data-reveal data-reveal-stagger>
        <Stat num="4" label="Classes" />
        <Stat num="8" label="Item Sets" />
        <Stat num="12+12" label="Cosmetics" />
        <Stat num="∞" label="Guild Wars" />
        <Stat num="3" label="Raid Bosses" />
        <Stat num="27" label="Achievements" />
      </section>

      {/* Features */}
      <section id="features" className="section">
        <div className="section-eyebrow" data-reveal>What you actually do</div>
        <h2 className="section-title" data-reveal>Twelve loops, all running at once.</h2>
        <p className="section-lead" data-reveal>
          You log in for ten minutes and have to choose: clear a dungeon stage, settle an auction
          listing, push the daily bounty, or finish a tower run before the leaderboard rolls
          over. Every loop pays out separately, every loop matters.
        </p>
        <div className="feature-grid" data-reveal-stagger>
          <FeatureCard iconSrc="/assets/icons/sword-t6.jpg" title="Combat that respects your time">
            Server-authoritative turn-based duels resolved in under thirty seconds, with a 3D
            stage, real particle bursts, and a damage-scaled screen shake. Replays available
            after every fight.
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/shield-t6.jpg" title="Guilds that change the math">
            Five guild tiers, each multiplying member XP, gold, crit, and dodge. Officers can
            declare 24-hour wars on rivals; raid bosses scale to your roster size and pay every
            participant.
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/dagger-t4.jpg" title="Quests with consequences">
            Sixteen scripted quest lines across five regions. Outcomes you choose alter rewards,
            unlock follow-ups, and feed into Bestiary completion.
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/icon-portal.jpg" title="Chained dungeon runs">
            Four scripted dungeons plus ten procedural high-tier bands. Bring potions, eat
            damage between rooms, take the guaranteed clear drop home.
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/cloak-t8.jpg" title="Cosmetics you earn">
            Twelve hand-painted avatars and twelve rarity-tinted frames, each tied to a real
            achievement. No frame is for sale.
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/helm-t6.jpg" title="Profiles other players can read">
            Bio, avatar, frame, title, public combat history. Easy to look up, harder to forge a
            reputation on.
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/bow-t6.jpg" title="Hunting that fills the Bestiary">
            Pick a region, pick a window. Each kill rolls a 22% drop and counts toward bounty,
            battle pass, and weekly trial in one go.
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/sword-t10.jpg" title="ELO arena, real ladder">
            Matchmade duels against fifteen NPC trainers and every player at your rating band.
            K=32, so a streak shows up fast.
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/icon-flame.jpg" title="Daily tribute that rewards habit">
            Seven-day streak cycle with gem milestones at day fourteen and thirty. Miss a day
            and the streak resets; nothing is sold back to you.
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/icon-vortex.jpg" title="One spin a day, no shop">
            The wheel pays in gold, XP, potions, energy, or a 500-gold jackpot. It's not a
            lootbox; it's a budgeted bonus.
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/gem-t8.jpg" title="Twenty-seven achievements, twelve titles">
            "The Worldslayer", "Hero of the Realm", "Loremaster". Titles render next to your
            name across the realm.
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/ring-t8.jpg" title="Eight themed sets to chase">
            From the Wayfarer's Garb to Solar Mythwoven. Two-, four-, and six-piece bonuses
            reshape a build; mixing tiers is encouraged.
          </FeatureCard>
        </div>
      </section>

      {/* Classes */}
      <section id="classes" className="section">
        <div className="section-eyebrow" data-reveal>Pick a kit</div>
        <h2 className="section-title" data-reveal>Four classes, with the math written down.</h2>
        <p className="section-lead" data-reveal>
          Each class has a stat ramp, a weapon skill tree, a damage type, and its own impact
          effects in combat. You re-allocate stat points every level; you re-spec the build
          whenever the season changes.
        </p>
        <div className="class-grid" data-reveal-stagger>
          <ClassCard portrait="/assets/icons/class-warrior.jpg" name="Warrior" tagline="Eats hits, returns them with interest. Sword and shield, plate, calm under pressure." stats={[['STR', 9], ['CON', 8], ['DEX', 5]]} />
          <ClassCard portrait="/assets/icons/class-ranger.jpg"  name="Ranger"  tagline="Hits first, harder than you expected, from where you weren't looking. Bow, leather, fast hands." stats={[['DEX', 9], ['CON', 6], ['WIS', 5]]} />
          <ClassCard portrait="/assets/icons/class-mage.jpg"    name="Mage"    tagline="Slow opener, large finisher. Burns mana fast, ends fights faster. Staff, robes, library card." stats={[['INT', 9], ['WIS', 8], ['CON', 5]]} />
          <ClassCard portrait="/assets/icons/class-rogue.jpg"   name="Rogue"   tagline="Crit-heavy duelist. Dodges everything until it can't. Dagger, dark cloth, no questions." stats={[['DEX', 8], ['CON', 6], ['CHA', 6]]} />
        </div>
      </section>

      {/* Item Sets */}
      <section id="sets" className="section">
        <div className="section-eyebrow" data-reveal>Sets, not collectibles</div>
        <h2 className="section-title" data-reveal>Eight themed sets. Every piece dropped, never bought.</h2>
        <p className="section-lead" data-reveal>
          Wear the same set to unlock two-, four- and six-piece bonuses. Mix tiers for hybrid
          builds. Nothing in this section is on the gem shop.
        </p>
        <div className="set-grid" data-reveal-stagger>
          <SetCard rarity="common"    name="Wayfarer's Garb"     tier="Tier 1 · Starter"    iconSrc="/assets/icons/boots-t1.jpg"  lore="Boiled leather and stitched hide. Every hero's first kit." bonuses={[['2', '+8 HP, +1 DEX'], ['4', '+18 HP, +2 DEX, +2 DEF']]} />
          <SetCard rarity="uncommon"  name="Ironguard Plate"     tier="Tier 2 · Warrior"    iconSrc="/assets/icons/armor-t2.jpg"  lore="Issue of the Iron Watch. Standard for bridge and tollroad duty." bonuses={[['2', '+25 HP, +2 STR'], ['4', '+55 HP, +6 DEF, +3 STR'], ['6', '+100 HP, +12 DEF, +5 STR, +4 ATK']]} />
          <SetCard rarity="uncommon"  name="Sylvan Marshal"      tier="Tier 2 · Ranger"     iconSrc="/assets/icons/bow-t2.jpg"    lore="Forest-dyed leathers worn by the marshals of the Whispering Woods." bonuses={[['2', '+3 DEX, +3% Crit'], ['4', '+5 DEX, +4% Dodge, +3 ATK']]} />
          <SetCard rarity="uncommon"  name="Arcane Conclave"     tier="Tier 2 · Mage"       iconSrc="/assets/icons/staff-t2.jpg"  lore="Spell-thread robes granted to junior members of the Conclave at Aedric." bonuses={[['2', '+25 MP, +3 INT'], ['4', '+50 MP, +5 INT, +3 WIS']]} />
          <SetCard rarity="uncommon"  name="Nightveil"           tier="Tier 2 · Rogue"      iconSrc="/assets/icons/dagger-t2.jpg" lore="A killer's wardrobe. Charcoal hood, black-dyed plate, soft-sole boots." bonuses={[['2', '+3 DEX, +4% Dodge'], ['4', '+5 DEX, +5% Crit, +3 ATK']]} />
          <SetCard rarity="rare"      name="Sunforged Champion"  tier="Tier 3 · Warrior"    iconSrc="/assets/icons/sword-t6.jpg"  lore="Quenched in the Ember Spire kilns. The plate has burn marks the smith did not put there." bonuses={[['2', '+80 HP, +4 STR'], ['4', '+180 HP, +18 DEF, +6 STR, +8 ATK']]} />
          <SetCard rarity="epic"      name="Voidshard Adept"     tier="Tier 4 · Mage"       iconSrc="/assets/icons/staff-t8.jpg"  lore="Robes embroidered with shards of cooled void-glass. The hem hums when read aloud." bonuses={[['2', '+60 MP, +6 INT'], ['4', '+120 MP, +10 INT, +8 WIS'], ['6', '+220 MP, +16 INT, +14 WIS, +16 ATK, +8% Crit']]} />
          <SetCard rarity="legendary" name="Solar Mythwoven"     tier="Tier 5 · Legendary"  iconSrc="/assets/icons/sword-t10.jpg" lore="Worn by the first Hero of the Realm. Found three centuries later in a sealed barrow." bonuses={[['2', '+150 HP, +6 STR'], ['4', '+320 HP, +24 DEF, +10 STR, +14 ATK'], ['6', '+600 HP, +50 DEF, +18 STR, +30 ATK, +10% Crit, +5% Dodge']]} />
        </div>
      </section>

      {/* Mid-page rhythm break — second cinematic plate.
          Working blacksmith at Möhkö Ironworks (CC BY 3.0, Wikimedia
          Commons; see /assets/video/CREDITS.md). 21:9 stripe so it
          reads as a band, not a second hero. Looped, muted, no audio
          decoded. */}
      <section className="forge-band" aria-label="The Forge">
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
          <div className="section-eyebrow">The Forge</div>
          <h2 className="section-title">Spend gold, get sharper.</h2>
          <p className="forge-band-lead">
            Drop a piece on the anvil and pay gold to raise its stats. The cost ramps; the
            failure rate is published; pity-protection guarantees a success after enough
            attempts. Higher tiers unlock sockets and rerolls. Nothing is hidden behind a wall
            of premium currency.
          </p>
          <div className="forge-band-credit">
            Footage by Antti Makkonen · <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>
          </div>
        </div>
      </section>

      {/* Guilds */}
      <section id="guilds" className="section">
        <div className="section-eyebrow" data-reveal>Guilds</div>
        <h2 className="section-title" data-reveal>A guild is the cheapest power upgrade in the game.</h2>
        <p className="section-lead" data-reveal>
          1,000 gold to found. Up to thirty members at tier five. Five tiers of multipliers on
          XP, gold, crit, dodge, HP, charisma. Donate gold to climb officer track, declare a
          24-hour war against a rival, raid a server boss with thirty friends and split the
          pot.
        </p>
        <div className="feature-grid" data-reveal-stagger>
          <FeatureCard iconSrc="/assets/icons/shield-t8.jpg" title="Five tiers of multipliers">
            Tier one to tier five. Each tier widens the roster (ten to thirty members) and
            multiplies XP, gold, crit, dodge, and HP for everyone wearing the crest.
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/amulet-t5.jpg" title="Chat that doesn't lag">
            Polled every four seconds, avatars rendered inline, leader and officer roles with
            kick, promote, demote. No external app needed.
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/axe-t7.jpg" title="Wars on the clock">
            Officers declare a 24-hour war for 500 guild gold. Members hit enemies for score.
            Higher score at the deadline wins, both rosters get a payout, nobody gets banned.
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/monster-dragon.jpg" title="Raids that scale">
            Sentinel of Dawn, Maw of Voidshade, Colossus Unbound. Boss HP scales with active
            roster. Each member's damage is logged; cleared raid pays everyone proportionally.
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/shield-t10.jpg" title="Your crest, your colour">
            Two-to-five-character tag, a hex-picked crest colour, an optional motto. Renders
            next to every member's name in every public list.
          </FeatureCard>
          <FeatureCard iconSrc="/assets/icons/icon-coin.jpg" title="Treasury that earns you rank">
            Donate gold; each piece is one guild XP and one contribution point. Officer track is
            opened by total contribution, not by who knows the leader.
          </FeatureCard>
        </div>
      </section>

      {/* World */}
      <section id="world" className="section">
        <div className="section-eyebrow" data-reveal>The map</div>
        <h2 className="section-title" data-reveal>Five hand-built regions, ten procedural high-tier bands.</h2>
        <p className="section-lead" data-reveal>
          Five named regions take you from level one to twenty-four. Past that, ten procedural
          bands carry you to three hundred and fifty, each with its own monster roster, drop
          table, and small named dungeon.
        </p>
        <div className="region-row" data-reveal-stagger>
          <RegionCard color="#3f6a2c" art="/assets/regions/whispering_woods.jpg" name="Whispering Woods" range="Lv 1 – 5">Goblins, dire wolves, the rats under the inn. The first place you draw a sword.</RegionCard>
          <RegionCard color="#6e7a5c" art="/assets/regions/mistmoor_hills.jpg"   name="Mistmoor Hills"   range="Lv 6 – 10">Fog-laced highlands where the orcs raid down for cattle and the trolls don't bother hiding.</RegionCard>
          <RegionCard color="#6aa7ff" art="/assets/regions/crystal_caverns.jpg"  name="Crystal Caverns"  range="Lv 10 – 15">A dwarven dig that broke into something it shouldn't have. The Overlord sleeps at the bottom.</RegionCard>
          <RegionCard color="#c7641a" art="/assets/regions/ashen_wastes.jpg"     name="Ashen Wastes"     range="Lv 15 – 22">Burned earth from a god's argument. Revenants walk it because nothing else will.</RegionCard>
          <RegionCard color="#6f3fb6" art="/assets/regions/shadowfell.jpg"       name="The Shadowfell"   range="Lv 24+">The Shadow Lord's territory. The road keeps going past here, into the procedural bands.</RegionCard>
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="section">
        <div className="section-eyebrow" data-reveal>Roadmap</div>
        <h2 className="section-title" data-reveal>Shipped, in flight, queued.</h2>
        <div className="roadmap-track" data-reveal>
          <RoadmapStop state="shipped" when="Shipped" what="Core game">
            Four classes, 200 items, eight themed sets, 350 levels of monster roster, 16 named
            quests, four scripted dungeons plus ten procedural bands, ELO arena, daily and
            weekly loops, achievements, bestiary, replays.
          </RoadmapStop>
          <RoadmapStop state="shipped" when="Shipped" what="Profile and cosmetics">
            Twelve avatars, twelve rarity-tinted frames, bios, name change, public profile
            pages, title selector. All cosmetics are earned in play.
          </RoadmapStop>
          <RoadmapStop state="shipped" when="Shipped" what="Guilds">
            Five-tier guild system, live chat, declared wars, scaling raid bosses, donation
            ledger, treasury, member management, crest editor.
          </RoadmapStop>
          <RoadmapStop state="now" when="In flight" what="Cinematic combat 2.0">
            Three.js stage with EffectComposer post-processing, hit-flash, HP-bar drain, hit-stop
            on crits, damage-scaled screen shake. Reduced-motion respected throughout.
          </RoadmapStop>
          <RoadmapStop state="soon" when="Next" what="Crafting and enchanting">
            Smithy, alchemy, gem socketing, recipe drops from elite kills. Same anti-paywall
            policy: no recipe behind premium currency.
          </RoadmapStop>
          <RoadmapStop state="later" when="Later" what="World events">
            Weekend boss invasions, faction wars, server-wide tournaments. Prize pools paid in
            earned gold. No premium currency, ever.
          </RoadmapStop>
        </div>
      </section>

      {/* Final CTA */}
      <div className="final-cta" data-reveal="scale">
        <h2>Sign up. The watch needs another sword.</h2>
        <p>No installer, no paywall. Thirty seconds and you're in Aedric.</p>
        <div className="hero-cta">
          <Link to="/register" className="btn btn-primary btn-hero">Create Your Hero</Link>
          <Link to="/login" className="btn btn-hero">I Already Play</Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-grid">
          <div>
            <Logo size={40} withWordmark />
            <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, maxWidth: 320 }}>
              A modern, server-authoritative browser MMORPG. Free to play. No premium currency.
            </p>
          </div>
          <div>
            <h4>Game</h4>
            <a href="#features">Features</a>
            <a href="#classes">Classes</a>
            <a href="#sets">Item Sets</a>
            <a href="#guilds">Guilds</a>
            <a href="#world">World</a>
            <a href="#roadmap">Roadmap</a>
          </div>
          <div>
            <h4>Account</h4>
            <Link to="/register">Sign Up</Link>
            <Link to="/login">Sign In</Link>
          </div>
          <div>
            <h4>Studio</h4>
            <a href="#">About</a>
            <a href="#">Press Kit</a>
            <a href="#">Terms</a>
            <a href="#">Privacy</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© Nexus Dominion. A free-to-play browser MMORPG.</span>
          <span>Made with care for hero-class storytelling.</span>
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
  return (
    <div className="feature-card" data-tilt>
      <div className="feature-icon feature-icon-img">
        <img src={iconSrc} alt={`${title} icon`} loading="lazy" />
      </div>
      <h3 className="feature-title">{title}</h3>
      <p className="feature-desc">{children}</p>
    </div>
  );
}

function ClassCard({ portrait, name, tagline, stats }: { portrait: string; name: string; tagline: string; stats: [string, number][] }) {
  return (
    <div className="class-card class-card-portrait" data-tilt>
      <div className="class-portrait-frame">
        {/* HD public-domain painting matched to the class (Vasnetsov
            Knight at the Crossroads / Waterhouse Magic Circle / Pyle
            Robin Hood plate / Frith Highwayman). Same images that
            drive the in-game Hero card, so the marketing surface and
            the gameplay surface share their visual identity. */}
        <img src={portrait} alt={`${name} portrait`} loading="lazy" />
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
  return (
    <div className="set-card" data-rarity={rarity} data-tilt>
      <div className="set-header">
        <div className="set-icon set-icon-img">
          <img src={iconSrc} alt={`${name} icon`} loading="lazy" />
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
  return (
    <div className="region-card" data-tilt style={{ borderColor: color }}>
      {/* Painted region plate (Corot / Friedrich / Wright of Derby /
          John Martin), centre-cropped 1440×900 — see
          /assets/regions/CREDITS.md for full attribution. */}
      <div className="region-art">
        <img src={art} alt={`${name} landscape`} loading="lazy" />
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
