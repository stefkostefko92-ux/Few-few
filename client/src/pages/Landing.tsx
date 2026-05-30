import React from 'react';
import { Link } from 'react-router-dom';
import { WarriorSprite, RangerSprite, MageSprite, RogueSprite } from '../combat/sprites';
import '../styles/landing.css';

export default function Landing(): React.ReactElement {
  return (
    <div className="landing">
      {/* Top nav */}
      <header className="landing-nav">
        <div className="landing-nav-brand">
          <div className="mark" />
          <span>Nexus Dominion</span>
        </div>
        <nav className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#classes">Classes</a>
          <a href="#world">World</a>
          <a href="#engage">Daily Life</a>
        </nav>
        <div className="landing-nav-cta">
          <Link to="/login" className="btn btn-ghost">Sign In</Link>
          <Link to="/register" className="btn btn-primary">Play Free</Link>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="hero-eyebrow">A Browser MMORPG · Free to Play · No Download</div>
        <h1 className="hero-title">The Realm of Nexus Dominion Awakens.</h1>
        <p className="hero-subtitle">
          Forge a hero. Hunt monsters across five regions. Conquer dungeons, climb the arena, and
          unravel the kingdom's last great threat — the Shadow Lord himself. Cinematic turn-based
          combat, hundreds of items, and a saga that grows every day you log in.
        </p>
        <div className="hero-cta">
          <Link to="/register" className="btn btn-primary btn-hero">Begin Your Saga</Link>
          <a href="#features" className="btn btn-hero">See How It Plays</a>
        </div>

        {/* Floating fighters */}
        <div className="hero-fighters">
          <div className="hero-fighter left"><WarriorSprite /></div>
          <div className="hero-fighter center"><MageSprite /></div>
          <div className="hero-fighter right" style={{ transform: 'scaleX(-1)' }}><RangerSprite /></div>
        </div>

        <div className="hero-stats">
          <div className="hero-stat"><div className="num">4</div><div className="label">Classes</div></div>
          <div className="hero-stat"><div className="num">37+</div><div className="label">Items</div></div>
          <div className="hero-stat"><div className="num">17</div><div className="label">Monsters</div></div>
          <div className="hero-stat"><div className="num">16+</div><div className="label">Quests</div></div>
          <div className="hero-stat"><div className="num">5</div><div className="label">Regions</div></div>
          <div className="hero-stat"><div className="num">∞</div><div className="label">Hours</div></div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="section">
        <div className="section-eyebrow">What Awaits</div>
        <h2 className="section-title">A World Made for the Long Haul.</h2>
        <p className="section-lead">
          Every hour you spend in Nexus Dominion makes your hero stronger and your story richer.
          From your first cellar rat to the final stand against the Shadow Lord —
          there's always one more thing to do.
        </p>
        <div className="feature-grid">
          <FeatureCard icon="⚔️" title="Cinematic Combat">
            Every fight plays out as a fully animated duel — class-specific impact effects, floating
            damage, critical screen shakes, dodge fades. Pause, slow down, speed up, replay any battle later.
          </FeatureCard>
          <FeatureCard icon="🗡" title="Quests & Story">
            16 hand-written quests across 5 regions tell the story of Nexus Dominion's slow decay and your
            hero's rising legend. Choose your path on the world map.
          </FeatureCard>
          <FeatureCard icon="🏰" title="Multi-Stage Dungeons">
            Four chained dungeon runs, from the Forgotten Crypt to the Pilgrimage of Ash.
            Survive every stage to claim a sack of loot and a legendary item.
          </FeatureCard>
          <FeatureCard icon="🎯" title="Hunting Grounds">
            Need XP fast? Pick a region, spend 2 energy, get a random fight. Endlessly repeatable —
            and every kill goes into your bestiary.
          </FeatureCard>
          <FeatureCard icon="🏆" title="ELO Arena">
            Real-time matchmaking against 15 training dummies and a growing roster of player heroes.
            Climb the rating. Claim your title.
          </FeatureCard>
          <FeatureCard icon="📖" title="Bestiary & Codex">
            17 unique monsters to discover, each with their own art, stats, and lore. Track your kill
            counts and your first encounter dates.
          </FeatureCard>
          <FeatureCard icon="🔥" title="Daily Tribute & Streaks">
            Log in 7 days in a row, earn a Royal Cycle reward. Hit 14 and 30 for legendary streak
            milestones. Daily quests give 2× rewards on rotating contracts.
          </FeatureCard>
          <FeatureCard icon="🎁" title="Wheel of Fortune">
            One free spin every day. Gold, XP, potions, rings — or the royal jackpot. Built-in luck
            for the patient.
          </FeatureCard>
          <FeatureCard icon="⭐" title="25+ Achievements">
            Earn titles like "the Worldslayer", "Hero of the Realm", and "Loremaster". Wear them in your
            profile. Stack the rewards.
          </FeatureCard>
          <FeatureCard icon="💍" title="Loot & Rarity">
            37 items across common, uncommon, rare, epic, and legendary tiers. Drops from quests and
            dungeons; auction with the merchant; equip eight slots.
          </FeatureCard>
          <FeatureCard icon="📈" title="Stat & Skill Trees">
            Every level grants stat and skill points. Train Sword, Bow, Staff, or Stealth. Build your
            hero exactly the way you want.
          </FeatureCard>
          <FeatureCard icon="📊" title="Lifetime Statistics">
            Every battle, kill, quest, gold piece, and arena win — tracked forever and shown on your
            personal stats page.
          </FeatureCard>
        </div>
      </section>

      {/* Classes */}
      <section id="classes" className="section">
        <div className="section-eyebrow">Choose Your Path</div>
        <h2 className="section-title">Four Classes. Four Stories.</h2>
        <p className="section-lead">
          Each class has its own stat curve, weapon skills, sprite, and combat animations.
          Switch up your build with every level-up.
        </p>
        <div className="class-grid">
          <ClassCard sprite={<WarriorSprite />} name="Warrior" tagline="Steel and oath. The shield of the realm." />
          <ClassCard sprite={<RangerSprite />} name="Ranger" tagline="The arrow finds what the eye sees." />
          <ClassCard sprite={<MageSprite />} name="Mage" tagline="The world bends to the disciplined mind." />
          <ClassCard sprite={<RogueSprite />} name="Rogue" tagline="The unseen blade. The patient hand." />
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
        <div className="feature-grid">
          <RegionCard color="#3f6a2c" flavor="🌲" name="Whispering Woods" range="Levels 1 – 5">
            A green wood near Oaken Hollow. Goblins, wolves, and the cellar rats no one else will hunt.
          </RegionCard>
          <RegionCard color="#6e7a5c" flavor="⛰" name="Mistmoor Hills" range="Levels 6 – 10">
            Fog-laced highlands stalked by orc raiders, hill trolls, and the witch of Mistmoor.
          </RegionCard>
          <RegionCard color="#6aa7ff" flavor="💎" name="Crystal Caverns" range="Levels 10 – 15">
            Glittering tunnels beneath the mountains. Stone golems, crystal serpents, and the Overlord himself.
          </RegionCard>
          <RegionCard color="#c7641a" flavor="🔥" name="Ashen Wastes" range="Levels 15 – 22">
            Burned plains roamed by drakes, lava titans, and the revenant dead.
          </RegionCard>
          <RegionCard color="#6f3fb6" flavor="☠" name="The Shadowfell" range="Level 24+">
            The Shadow Lord's domain. The kingdom's last and greatest test. Bring everything.
          </RegionCard>
        </div>
      </section>

      {/* Daily / engagement */}
      <section id="engage" className="section">
        <div className="section-eyebrow">Every Day, Something New</div>
        <h2 className="section-title">A Realm That Rewards You for Coming Back.</h2>
        <p className="section-lead">
          Nexus Dominion isn't a grind — it's a rhythm. Log in, claim your tribute, finish the day's quests,
          spin the wheel, take a single dungeon run. Bigger triumphs every week, every month.
        </p>
        <div className="feature-grid">
          <FeatureCard icon="🌅" title="Daily Tribute">
            Climb the 7-day cycle for stacking gold, XP, and milestone potions. 14-day and 30-day rewards are royal.
          </FeatureCard>
          <FeatureCard icon="📜" title="Daily Quests">
            Three quests rotate every morning. Complete them as part of your normal play to earn 2× rewards.
          </FeatureCard>
          <FeatureCard icon="🎰" title="Wheel of Fortune">
            One spin every 24 hours. Coin, XP, rings, potions, energy — or the 500-gold royal jackpot.
          </FeatureCard>
        </div>
      </section>

      {/* Final CTA */}
      <div className="final-cta">
        <h2>The Realm Awaits.</h2>
        <p>
          No download. No paywall. Sign up in 30 seconds and your hero will be standing at the gates
          of Oaken Hollow before the kettle has whistled.
        </p>
        <div className="hero-cta">
          <Link to="/register" className="btn btn-primary btn-hero">Create Your Hero</Link>
          <Link to="/login" className="btn btn-hero">I Already Play</Link>
        </div>
      </div>

      <footer className="landing-footer">
        Nexus Dominion · A modern tribute to the classic browser MMORPG ·
        <a href="https://github.com" style={{ marginLeft: 8 }}>Open Source</a>
      </footer>
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

function ClassCard({ sprite, name, tagline }: { sprite: React.ReactElement; name: string; tagline: string }) {
  return (
    <div className="class-card">
      <div className="sprite">{sprite}</div>
      <h3>{name}</h3>
      <div className="tagline">{tagline}</div>
    </div>
  );
}

function RegionCard({ color, flavor, name, range, children }: { color: string; flavor: string; name: string; range: string; children: React.ReactNode }) {
  return (
    <div className="feature-card" style={{ borderColor: color }}>
      <div className="feature-icon" style={{ background: `linear-gradient(135deg, ${color}33, ${color}11)`, borderColor: `${color}55` }}>
        <span style={{ fontSize: 28 }}>{flavor}</span>
      </div>
      <h3 className="feature-title">{name}</h3>
      <div className="tag" style={{ marginBottom: 10 }}>{range}</div>
      <p className="feature-desc">{children}</p>
    </div>
  );
}
