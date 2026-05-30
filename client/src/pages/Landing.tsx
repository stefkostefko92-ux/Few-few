import React from 'react';
import { Link } from 'react-router-dom';
import { WarriorSprite, RangerSprite, MageSprite, RogueSprite } from '../combat/sprites';
import Logo from '../components/Logo';
import '../styles/landing.css';

export default function Landing(): React.ReactElement {
  return (
    <div className="landing">
      {/* Top nav */}
      <header className="landing-nav">
        <Logo size={36} withWordmark />
        <nav className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#classes">Classes</a>
          <a href="#sets">Item Sets</a>
          <a href="#world">World</a>
          <a href="#roadmap">Roadmap</a>
        </nav>
        <div className="landing-nav-cta">
          <Link to="/login" className="btn btn-ghost">Sign In</Link>
          <Link to="/register" className="btn btn-primary">Play Free</Link>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="hero-logo">
          <Logo size={120} />
        </div>
        <div className="hero-eyebrow">A Browser MMORPG · Free to Play · No Download</div>
        <h1 className="hero-title">
          Nexus Dominion<em>Where Legends Are Forged.</em>
        </h1>
        <p className="hero-subtitle">
          A fully animated turn-based fantasy MMORPG. Forge a hero across four classes, hunt
          through five regions, run multi-stage dungeons, climb the ELO arena, complete eight
          themed item sets — and shape your saga across daily rituals and lifetime achievements.
        </p>
        <div className="hero-cta">
          <Link to="/register" className="btn btn-primary btn-hero">Begin Your Saga</Link>
          <a href="#features" className="btn btn-hero">See How It Plays</a>
        </div>

        <div className="hero-fighters">
          <div className="hero-fighter left"><WarriorSprite /></div>
          <div className="hero-fighter center"><MageSprite /></div>
          <div className="hero-fighter right" style={{ transform: 'scaleX(-1)' }}><RangerSprite /></div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="stats-strip">
        <Stat num="4" label="Classes" />
        <Stat num="8" label="Item Sets" />
        <Stat num="17" label="Monsters" />
        <Stat num="16+" label="Quests" />
        <Stat num="5" label="Regions" />
        <Stat num="27" label="Achievements" />
      </section>

      {/* Features */}
      <section id="features" className="section">
        <div className="section-eyebrow">What Awaits</div>
        <h2 className="section-title">A World Made for the Long Haul.</h2>
        <p className="section-lead">
          Every hour deepens your hero and widens the story. From your first cellar rat to the
          last stand against the Shadow Lord, there is always one more thing worth doing.
        </p>
        <div className="feature-grid">
          <FeatureCard icon="⚔" title="Cinematic Combat">
            Every fight plays as a fully animated duel — damage-scaled screen shake, hit-flash
            overlays, HP-drain trails, particle bursts, hit-stop on crits, and class-specific
            impact effects. Pause, slow, speed up, replay any past battle.
          </FeatureCard>
          <FeatureCard icon="🗡" title="Quests & Story">
            16 hand-written quests across five regions tell the realm's slow decay and your
            hero's rising legend. Branching outcomes, named foes, real rewards.
          </FeatureCard>
          <FeatureCard icon="🏰" title="Multi-Stage Dungeons">
            Four chained dungeon runs from the Forgotten Crypt to the Pilgrimage of Ash.
            Mid-run drops, escalating bosses, guaranteed loot at the end.
          </FeatureCard>
          <FeatureCard icon="🎯" title="Hunting Grounds">
            Two-energy random encounters per region. Always something to do — and every kill
            advances your Bestiary catalogue.
          </FeatureCard>
          <FeatureCard icon="🏆" title="ELO Arena">
            Matchmade duels against 15 NPC trainers and a growing roster of player heroes.
            Climb the rating. Carry your title.
          </FeatureCard>
          <FeatureCard icon="📖" title="Living Bestiary">
            Silhouettes until first kill, then full intel. Track kill counts, first-encounter
            dates, region, family. Loremaster fills the codex completely.
          </FeatureCard>
          <FeatureCard icon="🔥" title="Daily Tribute & Streaks">
            A 7-day login cycle with stacking rewards, plus 14- and 30-day milestones. Three
            daily quests rotate at midnight, paying 2× XP and gold.
          </FeatureCard>
          <FeatureCard icon="🎰" title="Wheel of Fortune">
            One animated spin every 24 hours. Coins, XP, potions, rings, energy, or the
            500-gold royal jackpot.
          </FeatureCard>
          <FeatureCard icon="⭐" title="27 Achievements + Titles">
            Earn titles like “the Worldslayer”, “Hero of the Realm”, “Loremaster”. Each unlocks
            a wearable suffix plus a permanent gold and XP payout.
          </FeatureCard>
          <FeatureCard icon="💍" title="8 Themed Item Sets">
            Wayfarer through Solar Mythwoven — collect set pieces to stack 2-, 4- and 6-piece
            bonuses that reshape your build.
          </FeatureCard>
          <FeatureCard icon="📈" title="Stats, Skills & Builds">
            Three stat points and two skill points every level. Train Sword, Bow, Staff,
            Stealth — your numbers, your priorities.
          </FeatureCard>
          <FeatureCard icon="🛡" title="Server-Authoritative Combat">
            Every roll resolved on the server, then replayed cinematically on the client.
            No client cheats, no pay-to-win, no premium currency, ever.
          </FeatureCard>
        </div>
      </section>

      {/* Classes */}
      <section id="classes" className="section">
        <div className="section-eyebrow">Choose Your Path</div>
        <h2 className="section-title">Four Classes. Four Stories.</h2>
        <p className="section-lead">
          Each class has its own stat curve, weapon skills, sprite, and impact effects.
          Re-allocate every level. Switch builds when the moment calls.
        </p>
        <div className="class-grid">
          <ClassCard sprite={<WarriorSprite />} name="Warrior" tagline="Steel and oath. The shield of the realm." stats={[['STR', 9], ['CON', 8], ['DEX', 5]]} />
          <ClassCard sprite={<RangerSprite />} name="Ranger" tagline="The arrow finds what the eye sees." stats={[['DEX', 9], ['CON', 6], ['WIS', 5]]} />
          <ClassCard sprite={<MageSprite />} name="Mage" tagline="The world bends to the disciplined mind." stats={[['INT', 9], ['WIS', 8], ['CON', 5]]} />
          <ClassCard sprite={<RogueSprite />} name="Rogue" tagline="The unseen blade. The patient hand." stats={[['DEX', 8], ['CON', 6], ['CHA', 6]]} />
        </div>
      </section>

      {/* Item Sets */}
      <section id="sets" className="section">
        <div className="section-eyebrow">Collect. Combine. Conquer.</div>
        <h2 className="section-title">Eight Themed Item Sets.</h2>
        <p className="section-lead">
          Equip pieces from the same set to unlock 2-, 4- and 6-piece bonuses. Mix and match
          tiers to build the hero you want. Every set is loot — never sold for premium currency.
        </p>
        <div className="set-grid">
          <SetCard
            rarity="common"
            name="Wayfarer's Garb"
            tier="Tier 1 · Starter"
            icon="🥾"
            lore="Boiled leather and stitched hide. Every hero's first kit."
            bonuses={[['2', '+8 HP, +1 DEX'], ['4', '+18 HP, +2 DEX, +2 DEF']]}
          />
          <SetCard
            rarity="uncommon"
            name="Ironguard Plate"
            tier="Tier 2 · Warrior"
            icon="🛡"
            lore="Issue of the Iron Watch. Standard for bridge and tollroad duty."
            bonuses={[['2', '+25 HP, +2 STR'], ['4', '+55 HP, +6 DEF, +3 STR'], ['6', '+100 HP, +12 DEF, +5 STR, +4 ATK']]}
          />
          <SetCard
            rarity="uncommon"
            name="Sylvan Marshal"
            tier="Tier 2 · Ranger"
            icon="🏹"
            lore="Forest-dyed leathers worn by the marshals of the Whispering Woods."
            bonuses={[['2', '+3 DEX, +3% Crit'], ['4', '+5 DEX, +4% Dodge, +3 ATK']]}
          />
          <SetCard
            rarity="uncommon"
            name="Arcane Conclave"
            tier="Tier 2 · Mage"
            icon="✨"
            lore="Spell-thread robes granted to junior members of the Conclave at Aedric."
            bonuses={[['2', '+25 MP, +3 INT'], ['4', '+50 MP, +5 INT, +3 WIS']]}
          />
          <SetCard
            rarity="uncommon"
            name="Nightveil"
            tier="Tier 2 · Rogue"
            icon="🗡"
            lore="A killer's wardrobe — charcoal hood, black plates, dyed leather."
            bonuses={[['2', '+3 DEX, +4% Dodge'], ['4', '+5 DEX, +5% Crit, +3 ATK']]}
          />
          <SetCard
            rarity="rare"
            name="Sunforged Champion"
            tier="Tier 3 · Warrior"
            icon="🔥"
            lore="Forged in the kilns of the Ember Spires. Lava titans cannot crush it."
            bonuses={[['2', '+80 HP, +4 STR'], ['4', '+180 HP, +18 DEF, +6 STR, +8 ATK']]}
          />
          <SetCard
            rarity="epic"
            name="Voidshard Adept"
            tier="Tier 4 · Mage"
            icon="🌌"
            lore="Robes woven with crystallised dark. Whispers of dead empires cling to the cloth."
            bonuses={[['2', '+60 MP, +6 INT'], ['4', '+120 MP, +10 INT, +8 WIS'], ['6', '+220 MP, +16 INT, +14 WIS, +16 ATK, +8% Crit']]}
          />
          <SetCard
            rarity="legendary"
            name="Solar Mythwoven"
            tier="Tier 5 · Legendary"
            icon="☀"
            lore="A regalia thought lost with the first Hero of the Realm. Drinks sunlight; sheds it as fire."
            bonuses={[['2', '+150 HP, +6 STR'], ['4', '+320 HP, +24 DEF, +10 STR, +14 ATK'], ['6', '+600 HP, +50 DEF, +18 STR, +30 ATK, +10% Crit, +5% Dodge']]}
          />
        </div>
      </section>

      {/* World */}
      <section id="world" className="section">
        <div className="section-eyebrow">The Lands of Nexus</div>
        <h2 className="section-title">From Oaken Hollow to the Shadowfell.</h2>
        <p className="section-lead">
          Five regions, each with its own monsters, dungeon, and legend. Travel the kingdom's
          ancient roads as your hero outgrows them.
        </p>
        <div className="region-row">
          <RegionCard color="#3f6a2c" flavor="🌲" name="Whispering Woods" range="Levels 1 – 5">
            Goblins, wolves, and the cellar rats no one else will hunt.
          </RegionCard>
          <RegionCard color="#6e7a5c" flavor="⛰" name="Mistmoor Hills" range="Levels 6 – 10">
            Fog-laced highlands stalked by orc raiders, hill trolls, and the witch.
          </RegionCard>
          <RegionCard color="#6aa7ff" flavor="💎" name="Crystal Caverns" range="Levels 10 – 15">
            Glittering tunnels. Stone golems, crystal serpents, and the Overlord himself.
          </RegionCard>
          <RegionCard color="#c7641a" flavor="🔥" name="Ashen Wastes" range="Levels 15 – 22">
            Burned plains roamed by drakes, lava titans, and the revenant dead.
          </RegionCard>
          <RegionCard color="#6f3fb6" flavor="☠" name="The Shadowfell" range="Level 24+">
            The Shadow Lord's domain. The kingdom's last test.
          </RegionCard>
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="section">
        <div className="section-eyebrow">The Road Ahead</div>
        <h2 className="section-title">A Living Game.</h2>
        <p className="section-lead">
          What's shipped, what's live this month, and what's already on the workbench.
        </p>
        <div className="roadmap-track">
          <RoadmapStop state="shipped" when="Shipped" what="Core MMORPG">
            Four classes, 37 items, eight themed sets, 17 monsters, 16 quests, four dungeons,
            ELO arena, daily tribute, wheel of fortune, achievements, bestiary, replays.
          </RoadmapStop>
          <RoadmapStop state="shipped" when="Shipped" what="Admin Control">
            Full operator console — items / monsters / quests CRUD, user management, broadcast
            mail, character editor, server telemetry.
          </RoadmapStop>
          <RoadmapStop state="now" when="Live This Month" what="Cinematic Combat 2.0">
            Damage-scaled screen shake, hit-flash overlays, HP-bar drain trails, particle
            bursts, hit-stop on crits, region-themed backdrops.
          </RoadmapStop>
          <RoadmapStop state="soon" when="Next" what="Guilds & Trading">
            Clans with shared chat and treasury. Player auction house. Co-op dungeon parties.
          </RoadmapStop>
          <RoadmapStop state="soon" when="Next" what="Crafting & Enchanting">
            Smithy, alchemy, and gem-socketing. Recipe drops from elite kills. Refine your gear
            into a personal masterwork.
          </RoadmapStop>
          <RoadmapStop state="later" when="Later" what="World Events">
            Weekend boss invasions, faction wars, server-wide tournaments with prize pools paid
            in earned gold (no premium currency, ever).
          </RoadmapStop>
        </div>
      </section>

      {/* Daily engagement */}
      <section className="section">
        <div className="section-eyebrow">Every Day, Something New</div>
        <h2 className="section-title">A Realm That Rewards You for Coming Back.</h2>
        <p className="section-lead">
          Nexus Dominion isn't a grind — it's a rhythm. Log in, claim your tribute, finish
          the day's quests, spin the wheel, take one dungeon run. Bigger triumphs every week.
        </p>
        <div className="feature-grid">
          <FeatureCard icon="🌅" title="Daily Tribute">
            Climb the 7-day cycle for stacking gold and XP. 14- and 30-day rewards are royal.
          </FeatureCard>
          <FeatureCard icon="📜" title="Daily Quests">
            Three quests rotate every morning. Complete them through normal play for 2× rewards.
          </FeatureCard>
          <FeatureCard icon="🎰" title="Wheel of Fortune">
            One spin every 24 hours. Coin, XP, rings, potions, energy — or the royal jackpot.
          </FeatureCard>
        </div>
      </section>

      {/* Final CTA */}
      <div className="final-cta">
        <h2>The Realm Awaits.</h2>
        <p>
          No download. No paywall. Sign up in thirty seconds and your hero will stand at the
          gates of Oaken Hollow before the kettle whistles.
        </p>
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
              Every item, title, and reward is earnable.
            </p>
          </div>
          <div>
            <h4>Game</h4>
            <a href="#features">Features</a>
            <a href="#classes">Classes</a>
            <a href="#sets">Item Sets</a>
            <a href="#world">World</a>
            <a href="#roadmap">Roadmap</a>
          </div>
          <div>
            <h4>Account</h4>
            <Link to="/register">Sign Up</Link>
            <Link to="/login">Sign In</Link>
            <a href="#features">How to Play</a>
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

/* ===== Components ===== */

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
    <div className="feature-card">
      <div className="feature-icon">{icon}</div>
      <h3 className="feature-title">{title}</h3>
      <p className="feature-desc">{children}</p>
    </div>
  );
}

function ClassCard({
  sprite, name, tagline, stats,
}: {
  sprite: React.ReactElement;
  name: string;
  tagline: string;
  stats: [string, number][];
}) {
  return (
    <div className="class-card">
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

function SetCard({
  rarity, name, tier, icon, lore, bonuses,
}: {
  rarity: string;
  name: string;
  tier: string;
  icon: string;
  lore: string;
  bonuses: [string, string][];
}) {
  return (
    <div className="set-card" data-rarity={rarity}>
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

function RegionCard({
  color, flavor, name, range, children,
}: {
  color: string;
  flavor: string;
  name: string;
  range: string;
  children: React.ReactNode;
}) {
  return (
    <div className="feature-card" style={{ borderColor: color }}>
      <div
        className="feature-icon"
        style={{ background: `linear-gradient(135deg, ${color}33, ${color}11)`, borderColor: `${color}55` }}
      >
        <span style={{ fontSize: 28 }}>{flavor}</span>
      </div>
      <h3 className="feature-title">{name}</h3>
      <div className="tag" style={{ marginBottom: 10 }}>{range}</div>
      <p className="feature-desc">{children}</p>
    </div>
  );
}

function RoadmapStop({
  state, when, what, children,
}: {
  state: 'shipped' | 'now' | 'soon' | 'later';
  when: string;
  what: string;
  children: React.ReactNode;
}) {
  return (
    <div className="roadmap-stop" data-state={state}>
      <div className="when">{when}</div>
      <div className="what">{what}</div>
      <div className="detail">{children}</div>
    </div>
  );
}
