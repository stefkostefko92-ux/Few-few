import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { WarriorSprite, RangerSprite, MageSprite, RogueSprite } from '../combat/sprites';
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
    title: 'Nexus Dominion — Free Browser MMORPG · No Download',
    description: 'A fully animated free browser MMORPG. Forge a hero across four classes, climb the Tower of Trials, found a guild, and trade with players. No download, plays in any browser.',
  },
  it: {
    html: 'it-IT',
    title: 'Nexus Dominion — MMORPG gratuito da browser · Senza download',
    description: 'Un MMORPG fantasy completamente animato, gratuito, giocabile direttamente nel browser. Forgia il tuo eroe, scala la Torre delle Prove, fonda una gilda. Niente download — gioca da qualsiasi browser, anche dall\'Italia.',
  },
  bg: {
    html: 'bg-BG',
    title: 'Nexus Dominion — Безплатна браузърна ММОРПГ · Без сваляне',
    description: 'Изцяло анимирана фентъзи ММОРПГ игра, която върви директно в браузъра. Изкови героя си, изкачи Кулата на изпитанията, основи гилдия. Без сваляне — играй откъдето и да си в България.',
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
            <em><SplitText text="Where Legends Are Forged." /></em>
          </h1>
          <p className="hero-subtitle" data-reveal>
            Build a hero. Climb the Tower of Trials. Strike the Forge until your blade screams.
            Found a guild, declare war, raid a god. Fifteen regions through level 350, four classes,
            ten tiers of gear, a marketplace where heroes barter steel for gold — and an endless
            arena waiting for a new king. Free. Browser. No download.
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
        <div className="section-eyebrow" data-reveal>What Awaits</div>
        <h2 className="section-title" data-reveal>A World Made for the Long Haul.</h2>
        <p className="section-lead" data-reveal>
          Every hour deepens your hero and widens the story. From your first cellar rat to the
          last stand against the Shadow Lord, there is always one more thing worth doing.
        </p>
        <div className="feature-grid" data-reveal-stagger>
          <FeatureCard icon="⚔" title="Cinematic Combat">
            Every fight plays as a fully animated duel — damage-scaled screen shake, hit-flash
            overlays, HP-drain trails, particle bursts, hit-stop on crits, and class-specific
            impact effects.
          </FeatureCard>
          <FeatureCard icon="🛡" title="Guilds & Wars">
            Found a guild, recruit officers, donate to the treasury. Declare war on rivals
            and raid bosses cooperatively. Live chat, member promotions, 5-tier upgrades.
          </FeatureCard>
          <FeatureCard icon="🗡" title="Quests & Story">
            16 hand-written quests across five regions. Branching outcomes, named foes,
            real rewards.
          </FeatureCard>
          <FeatureCard icon="🏰" title="Multi-Stage Dungeons">
            Four chained dungeon runs from the Forgotten Crypt to the Pilgrimage of Ash.
            Mid-run drops, escalating bosses, guaranteed loot at the end.
          </FeatureCard>
          <FeatureCard icon="🎭" title="Cosmetics & Frames">
            12 avatars and 12 rarity-tinted frames, all earned through play. Mythwoven and
            Eternal Crown frames glow and rotate cosmic patterns.
          </FeatureCard>
          <FeatureCard icon="📖" title="Profile & Title">
            Bio, avatar, frame, title — your hero's identity. Public profile pages
            so the realm can see your legend.
          </FeatureCard>
          <FeatureCard icon="🎯" title="Hunting Grounds">
            Two-energy random encounters per region. Always something to do — and every kill
            advances your Bestiary.
          </FeatureCard>
          <FeatureCard icon="🏆" title="ELO Arena">
            Matchmade duels against 15 NPC trainers and a growing roster of player heroes.
            Climb the rating. Carry your title.
          </FeatureCard>
          <FeatureCard icon="🔥" title="Daily Tribute & Streaks">
            7-day login cycle with stacking rewards, plus 14- and 30-day milestones.
          </FeatureCard>
          <FeatureCard icon="🎰" title="Wheel of Fortune">
            One animated spin every 24 hours. Coins, XP, potions, rings, energy, or the
            500-gold royal jackpot.
          </FeatureCard>
          <FeatureCard icon="⭐" title="27 Achievements + Titles">
            Earn titles like “the Worldslayer”, “Hero of the Realm”, “Loremaster”.
          </FeatureCard>
          <FeatureCard icon="💍" title="8 Themed Item Sets">
            Wayfarer through Solar Mythwoven — collect set pieces to stack 2-, 4- and 6-piece
            bonuses that reshape your build.
          </FeatureCard>
        </div>
      </section>

      {/* Classes */}
      <section id="classes" className="section">
        <div className="section-eyebrow" data-reveal>Choose Your Path</div>
        <h2 className="section-title" data-reveal>Four Classes. Four Stories.</h2>
        <p className="section-lead" data-reveal>
          Each class has its own stat curve, weapon skills, sprite, and impact effects.
          Re-allocate every level. Switch builds when the moment calls.
        </p>
        <div className="class-grid" data-reveal-stagger>
          <ClassCard sprite={<WarriorSprite />} name="Warrior" tagline="Steel and oath. The shield of the realm." stats={[['STR', 9], ['CON', 8], ['DEX', 5]]} />
          <ClassCard sprite={<RangerSprite />} name="Ranger" tagline="The arrow finds what the eye sees." stats={[['DEX', 9], ['CON', 6], ['WIS', 5]]} />
          <ClassCard sprite={<MageSprite />} name="Mage" tagline="The world bends to the disciplined mind." stats={[['INT', 9], ['WIS', 8], ['CON', 5]]} />
          <ClassCard sprite={<RogueSprite />} name="Rogue" tagline="The unseen blade. The patient hand." stats={[['DEX', 8], ['CON', 6], ['CHA', 6]]} />
        </div>
      </section>

      {/* Item Sets */}
      <section id="sets" className="section">
        <div className="section-eyebrow" data-reveal>Collect. Combine. Conquer.</div>
        <h2 className="section-title" data-reveal>Eight Themed Item Sets.</h2>
        <p className="section-lead" data-reveal>
          Equip pieces from the same set to unlock 2-, 4- and 6-piece bonuses. Mix and match
          tiers to build the hero you want. Every set is loot — never sold for premium currency.
        </p>
        <div className="set-grid" data-reveal-stagger>
          <SetCard rarity="common" name="Wayfarer's Garb" tier="Tier 1 · Starter" icon="🥾" lore="Boiled leather and stitched hide. Every hero's first kit." bonuses={[['2', '+8 HP, +1 DEX'], ['4', '+18 HP, +2 DEX, +2 DEF']]} />
          <SetCard rarity="uncommon" name="Ironguard Plate" tier="Tier 2 · Warrior" icon="🛡" lore="Issue of the Iron Watch. Standard for bridge and tollroad duty." bonuses={[['2', '+25 HP, +2 STR'], ['4', '+55 HP, +6 DEF, +3 STR'], ['6', '+100 HP, +12 DEF, +5 STR, +4 ATK']]} />
          <SetCard rarity="uncommon" name="Sylvan Marshal" tier="Tier 2 · Ranger" icon="🏹" lore="Forest-dyed leathers worn by the marshals of the Whispering Woods." bonuses={[['2', '+3 DEX, +3% Crit'], ['4', '+5 DEX, +4% Dodge, +3 ATK']]} />
          <SetCard rarity="uncommon" name="Arcane Conclave" tier="Tier 2 · Mage" icon="✨" lore="Spell-thread robes granted to junior members of the Conclave at Aedric." bonuses={[['2', '+25 MP, +3 INT'], ['4', '+50 MP, +5 INT, +3 WIS']]} />
          <SetCard rarity="uncommon" name="Nightveil" tier="Tier 2 · Rogue" icon="🗡" lore="A killer's wardrobe — charcoal hood, black plates, dyed leather." bonuses={[['2', '+3 DEX, +4% Dodge'], ['4', '+5 DEX, +5% Crit, +3 ATK']]} />
          <SetCard rarity="rare" name="Sunforged Champion" tier="Tier 3 · Warrior" icon="🔥" lore="Forged in the kilns of the Ember Spires. Lava titans cannot crush it." bonuses={[['2', '+80 HP, +4 STR'], ['4', '+180 HP, +18 DEF, +6 STR, +8 ATK']]} />
          <SetCard rarity="epic" name="Voidshard Adept" tier="Tier 4 · Mage" icon="🌌" lore="Robes woven with crystallised dark. Whispers of dead empires cling to the cloth." bonuses={[['2', '+60 MP, +6 INT'], ['4', '+120 MP, +10 INT, +8 WIS'], ['6', '+220 MP, +16 INT, +14 WIS, +16 ATK, +8% Crit']]} />
          <SetCard rarity="legendary" name="Solar Mythwoven" tier="Tier 5 · Legendary" icon="☀" lore="A regalia thought lost with the first Hero of the Realm." bonuses={[['2', '+150 HP, +6 STR'], ['4', '+320 HP, +24 DEF, +10 STR, +14 ATK'], ['6', '+600 HP, +50 DEF, +18 STR, +30 ATK, +10% Crit, +5% Dodge']]} />
        </div>
      </section>

      {/* Guilds */}
      <section id="guilds" className="section">
        <div className="section-eyebrow" data-reveal>Strength in Numbers</div>
        <h2 className="section-title" data-reveal>Guilds. Wars. Raid Bosses.</h2>
        <p className="section-lead" data-reveal>
          Found a guild for 1,000 gold. Recruit up to 30 members at the top tier. Donate to the
          treasury to power upgrades. Chat in real time. Declare war on rival guilds. Raid
          server-tier bosses cooperatively.
        </p>
        <div className="feature-grid" data-reveal-stagger>
          <FeatureCard icon="🏛" title="Five-Tier Progression">
            Levels 1 to 5. Each level lifts member slots (10 → 30) and stacks XP, gold, crit,
            dodge, and HP multipliers for every member.
          </FeatureCard>
          <FeatureCard icon="💬" title="Live Guild Chat">
            Polled every 4 seconds. Avatars next to every message. Leader and officer roles
            with kick / promote / demote.
          </FeatureCard>
          <FeatureCard icon="⚔" title="Guild Wars">
            Officers declare 24-hour wars for 500 guild gold. Members strike enemy heroes for
            score; the higher score at the end wins.
          </FeatureCard>
          <FeatureCard icon="🐲" title="Raid Bosses">
            Three cooperative bosses — Sentinel of Dawn, Maw of Voidshade, Colossus Unbound.
            HP scales with guild size. Every member contributes strikes. Cleared raids reward
            the entire roster.
          </FeatureCard>
          <FeatureCard icon="🏆" title="Crest & Identity">
            Pick a 2-5 character tag, a custom hex color crest, a motto. Your crest renders
            beside your hero across the realm.
          </FeatureCard>
          <FeatureCard icon="🪙" title="Treasury & Donations">
            Each donated gold equals one guild XP plus contribution toward your hero's role.
            Climb to officer through tangible effort.
          </FeatureCard>
        </div>
      </section>

      {/* World */}
      <section id="world" className="section">
        <div className="section-eyebrow" data-reveal>The Lands of Nexus</div>
        <h2 className="section-title" data-reveal>From Oaken Hollow to the Shadowfell.</h2>
        <p className="section-lead" data-reveal>
          Five regions, each with its own monsters, dungeon, and legend.
        </p>
        <div className="region-row" data-reveal-stagger>
          <RegionCard color="#3f6a2c" flavor="🌲" name="Whispering Woods" range="Levels 1 – 5">Goblins, wolves, and cellar rats.</RegionCard>
          <RegionCard color="#6e7a5c" flavor="⛰" name="Mistmoor Hills" range="Levels 6 – 10">Fog-laced highlands of orcs and trolls.</RegionCard>
          <RegionCard color="#6aa7ff" flavor="💎" name="Crystal Caverns" range="Levels 10 – 15">Glittering tunnels and the Overlord.</RegionCard>
          <RegionCard color="#c7641a" flavor="🔥" name="Ashen Wastes" range="Levels 15 – 22">Burned plains and the revenant dead.</RegionCard>
          <RegionCard color="#6f3fb6" flavor="☠" name="The Shadowfell" range="Level 24+">The Shadow Lord's domain.</RegionCard>
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="section">
        <div className="section-eyebrow" data-reveal>The Road Ahead</div>
        <h2 className="section-title" data-reveal>A Living Game.</h2>
        <div className="roadmap-track" data-reveal>
          <RoadmapStop state="shipped" when="Shipped" what="Core MMORPG">
            Four classes, 37 items, eight themed sets, 17 monsters, 16 quests, four dungeons,
            ELO arena, daily tribute, wheel of fortune, achievements, bestiary, replays.
          </RoadmapStop>
          <RoadmapStop state="shipped" when="Shipped" what="Profile & Cosmetics">
            12 avatars, 12 rarity-tinted frames, bios, name change, public profile pages,
            title selector.
          </RoadmapStop>
          <RoadmapStop state="shipped" when="Shipped" what="Guilds">
            Five-tier guild system, chat, wars, raid bosses, donations, treasury, member
            management, crests.
          </RoadmapStop>
          <RoadmapStop state="now" when="Live This Month" what="Cinematic Combat 2.0">
            Damage-scaled screen shake, hit-flash overlays, HP-bar drain, particle bursts,
            hit-stop on crits, region-themed backdrops.
          </RoadmapStop>
          <RoadmapStop state="soon" when="Next" what="Crafting & Enchanting">
            Smithy, alchemy, and gem-socketing. Recipe drops from elite kills.
          </RoadmapStop>
          <RoadmapStop state="later" when="Later" what="World Events">
            Weekend boss invasions, faction wars, server-wide tournaments — prize pools paid
            in earned gold (no premium currency, ever).
          </RoadmapStop>
        </div>
      </section>

      {/* Final CTA */}
      <div className="final-cta" data-reveal="scale">
        <h2>The Realm Awaits.</h2>
        <p>No download. No paywall. Sign up in thirty seconds.</p>
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

function FeatureCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="feature-card" data-tilt>
      <div className="feature-icon">{icon}</div>
      <h3 className="feature-title">{title}</h3>
      <p className="feature-desc">{children}</p>
    </div>
  );
}

function ClassCard({ sprite, name, tagline, stats }: { sprite: React.ReactElement; name: string; tagline: string; stats: [string, number][] }) {
  return (
    <div className="class-card" data-tilt>
      <div className="sprite">{sprite}</div>
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

function SetCard({ rarity, name, tier, icon, lore, bonuses }: { rarity: string; name: string; tier: string; icon: string; lore: string; bonuses: [string, string][] }) {
  return (
    <div className="set-card" data-rarity={rarity} data-tilt>
      <div className="set-header">
        <div className="set-icon">{icon}</div>
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

function RegionCard({ color, flavor, name, range, children }: { color: string; flavor: string; name: string; range: string; children: React.ReactNode }) {
  return (
    <div className="feature-card" data-tilt style={{ borderColor: color }}>
      <div className="feature-icon" style={{ background: `linear-gradient(135deg, ${color}33, ${color}11)`, borderColor: `${color}55` }}>
        <span style={{ fontSize: 28 }}>{flavor}</span>
      </div>
      <h3 className="feature-title">{name}</h3>
      <div className="tag" style={{ marginBottom: 10 }}>{range}</div>
      <p className="feature-desc">{children}</p>
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
